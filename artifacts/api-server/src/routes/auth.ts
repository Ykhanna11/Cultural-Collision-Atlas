import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import * as oidc from "openid-client";
import { eq } from "drizzle-orm";
import { db, pool, usersTable, workspacesTable } from "@workspace/db";
import {
  isEmailAllowlisted,
  requireAuthentication,
  requireCsrf,
} from "../lib/security";

const env = process.env;
const authBaseUrl = env.AUTH_BASE_URL?.trim();
const clientId = env.GOOGLE_OIDC_CLIENT_ID?.trim();
const clientSecret = env.GOOGLE_OIDC_CLIENT_SECRET?.trim();
const sessionSecret = env.AUTH_SESSION_SECRET;
const allowedEmails = new Set(
  (env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const isProduction = env.NODE_ENV === "production";

if (
  !authBaseUrl ||
  !clientId ||
  !clientSecret ||
  !sessionSecret ||
  allowedEmails.size === 0
) {
  throw new Error(
    "Authentication requires AUTH_BASE_URL, GOOGLE_OIDC_CLIENT_ID, GOOGLE_OIDC_CLIENT_SECRET, AUTH_SESSION_SECRET, and AUTH_ALLOWED_EMAILS.",
  );
}
if (Buffer.byteLength(sessionSecret) < 32) {
  throw new Error("AUTH_SESSION_SECRET must be at least 32 bytes.");
}

const parsedBaseUrl = new URL(authBaseUrl);
if (
  parsedBaseUrl.pathname !== "/" ||
  parsedBaseUrl.search ||
  parsedBaseUrl.hash ||
  (isProduction && parsedBaseUrl.protocol !== "https:")
) {
  throw new Error(
    "AUTH_BASE_URL must be a bare origin and use HTTPS in production.",
  );
}
const origin = parsedBaseUrl.origin;
const callbackUrl = new URL("/api/auth/callback", origin);
const cookieName = isProduction ? "__Host-cca.sid" : "cca.sid";
const PgSessionStore = connectPgSimple(session);
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please retry later." },
});
const sessionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many session requests. Please retry later." },
});

export const sessionMiddleware = session({
  name: cookieName,
  secret: sessionSecret,
  store: new PgSessionStore({
    pool,
    tableName: "sessions",
    createTableIfMissing: false,
    pruneSessionInterval: 900,
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  },
});

let oidcConfiguration: Promise<oidc.Configuration> | undefined;
function getOidcConfiguration(): Promise<oidc.Configuration> {
  oidcConfiguration ??= oidc.discovery(
    new URL("https://accounts.google.com"),
    clientId!,
    { redirect_uris: [callbackUrl.href], response_types: ["code"] },
    oidc.ClientSecretPost(clientSecret!),
  );
  return oidcConfiguration;
}

function persistSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function failAuthentication(res: Response): void {
  res.redirect("/?authError=sign_in_failed");
}

const router: IRouter = Router();

router.get("/auth/session", sessionRateLimit, (req, res): void => {
  req.session.csrfToken ??= randomBytes(32).toString("base64url");
  const authenticated = Boolean(
    req.session.userId &&
    req.session.workspaceId &&
    isEmailAllowlisted(req.session.email),
  );
  res.json({
    authenticated,
    user: authenticated ? { email: req.session.email } : null,
    csrfToken: req.session.csrfToken,
  });
});

router.get("/auth/login", loginRateLimit, async (req, res): Promise<void> => {
  try {
    const config = await getOidcConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    req.session.oidcState = state;
    req.session.oidcNonce = nonce;
    req.session.oidcCodeVerifier = codeVerifier;
    await persistSession(req);

    res.redirect(
      oidc.buildAuthorizationUrl(config, {
        redirect_uri: callbackUrl.href,
        scope: "openid email profile",
        response_type: "code",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      }).href,
    );
  } catch {
    req.log.error("Unable to start OIDC login");
    failAuthentication(res);
  }
});

router.get("/auth/callback", async (req, res): Promise<void> => {
  const { oidcState, oidcNonce, oidcCodeVerifier } = req.session;
  if (!oidcState || !oidcNonce || !oidcCodeVerifier) {
    failAuthentication(res);
    return;
  }

  try {
    const config = await getOidcConfiguration();
    const currentUrl = new URL(req.originalUrl, origin);
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      expectedState: oidcState,
      expectedNonce: oidcNonce,
      pkceCodeVerifier: oidcCodeVerifier,
    });
    const claims = tokens.claims();
    const subject = claims?.sub;
    const email =
      typeof claims?.email === "string"
        ? claims.email.trim().toLowerCase()
        : "";
    if (
      !subject ||
      claims?.email_verified !== true ||
      !allowedEmails.has(email)
    ) {
      await destroySession(req);
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
      });
      failAuthentication(res);
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({ oidcSubject: subject, email })
      .onConflictDoUpdate({
        target: usersTable.oidcSubject,
        set: { email, updatedAt: new Date() },
      })
      .returning({ id: usersTable.id });
    const [createdWorkspace] = await db
      .insert(workspacesTable)
      .values({ ownerUserId: user.id })
      .onConflictDoNothing({ target: workspacesTable.ownerUserId })
      .returning({ id: workspacesTable.id });
    const [workspace] = createdWorkspace
      ? [createdWorkspace]
      : await db
          .select({ id: workspacesTable.id })
          .from(workspacesTable)
          .where(eq(workspacesTable.ownerUserId, user.id))
          .limit(1);
    if (!workspace) throw new Error("Workspace provisioning failed");

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.workspaceId = workspace.id;
    req.session.email = email;
    req.session.csrfToken = randomBytes(32).toString("base64url");
    await persistSession(req);
    res.redirect("/");
  } catch {
    req.log.error("OIDC callback validation or account provisioning failed");
    failAuthentication(res);
  }
});

router.post(
  "/auth/logout",
  requireAuthentication,
  requireCsrf,
  async (req, res): Promise<void> => {
    try {
      await destroySession(req);
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
      });
      res.sendStatus(204);
    } catch {
      req.log.error("Unable to destroy authenticated session");
      res.status(500).json({ error: "Unable to sign out. Please retry." });
    }
  },
);

export default router;
