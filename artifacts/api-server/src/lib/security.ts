import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    workspaceId?: string;
    email?: string;
    csrfToken?: string;
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
  }
}

export type AuthenticatedRequest = Request & {
  session: Request["session"] & {
    userId: string;
    workspaceId: string;
    email: string;
  };
};

export function isEmailAllowlisted(email: string | undefined): boolean {
  if (!email) return false;
  const allowlist = new Set(
    (process.env.AUTH_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowlist.has(email.toLowerCase());
}

export function requireAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !req.session.userId ||
    !req.session.workspaceId ||
    !isEmailAllowlisted(req.session.email)
  ) {
    res.status(401).json({ error: "Sign in to access this resource." });
    return;
  }
  next();
}

export function isValidCsrfRequest(
  expectedToken: string | undefined,
  suppliedToken: string | undefined,
  origin: string | undefined,
  expectedOrigin: string,
): boolean {
  if (!expectedToken || !suppliedToken || !origin) return false;
  if (origin !== expectedOrigin) return false;
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  let expectedOrigin: string;
  try {
    const configuredBaseUrl = process.env.AUTH_BASE_URL;
    if (!configuredBaseUrl) throw new Error("Missing auth base URL");
    expectedOrigin = new URL(configuredBaseUrl).origin;
  } catch {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }

  if (
    !isValidCsrfRequest(
      req.session.csrfToken,
      req.get("x-csrf-token"),
      req.get("origin"),
      expectedOrigin,
    )
  ) {
    res
      .status(403)
      .json({ error: "CSRF validation failed. Reload and retry." });
    return;
  }
  next();
}
