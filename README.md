# Cultural Collision Atlas

Cultural Collision Atlas is a cultural-intelligence workspace for comparing two interests, exploring evidence-backed bridges, and drafting activation plans. It separates live API evidence from derived ranking and planning hypotheses.

## Render staging deployment

The intended deployment is one Render Node.js Web Service from the repository root. In production, Express serves the built frontend from `artifacts/cultural-collision-atlas/dist/public` and mounts the API at `/api`, so browser requests remain same-origin. The API returns JSON 404 responses for unknown `/api` routes; only non-API HTML requests receive the SPA entry point.

### Local preparation

The repository pins Node 24 and pnpm 12.3.4 in the root `package.json`. From the repository root, install and build with:

```sh
pnpm install --frozen-lockfile
pnpm run build
```

The root build supplies safe defaults `PORT=10000` and `BASE_PATH=/` for Vite. These are build settings only; no server secrets are passed to the browser. The API start command, from the repository root, is:

```sh
pnpm --filter @workspace/api-server run start
```

The API binds to the runtime `PORT` supplied by the host. In production it expects the frontend build to exist at the path above.

### Future Render dashboard setup

Create one **Web Service** from the repository root. A suitable build command is `pnpm install --frozen-lockfile && pnpm run build`; use `pnpm --filter @workspace/api-server run start` as the start command. Set `NODE_ENV=production`; allow Render to provide the runtime `PORT`. `AUTH_BASE_URL` must be set to the service's actual public HTTPS origin without a path. Configure a health check at `/api/healthz`.

Store `DATABASE_URL`, `GOOGLE_OIDC_CLIENT_SECRET`, `AUTH_SESSION_SECRET`, and (if used) `QLOO_API_KEY` as server-side secrets. Set `GOOGLE_OIDC_CLIENT_ID`, `AUTH_BASE_URL`, and `AUTH_ALLOWED_EMAILS` as API runtime environment values, not Vite/browser variables. `AUTH_SESSION_SECRET` must contain at least 32 bytes and remain stable across restarts. The API fails startup if required auth configuration or `DATABASE_URL` is missing.

Register the Google Web application redirect URI exactly as `${AUTH_BASE_URL}/api/auth/callback` after the actual Render service URL is assigned. The app requires HTTPS in production and configures Secure, HttpOnly, SameSite=Lax session cookies. Express trusts one proxy hop; verify in staging that Render's forwarded protocol and proxy topology support secure cookie issuance before opening access.

### Staging database and migration

Provision a separate staging PostgreSQL database, verify a restorable backup, and confirm the pre-existing `saved_discoveries` and `activation_plans` tables before applying [`lib/db/migrations/0001_auth_workspaces.sql`](./lib/db/migrations/0001_auth_workspaces.sql) once through a controlled process. The migration is transactional but not idempotent, is not run automatically, and requires the existing tables. Verify the users, workspaces, sessions, foreign keys, and indexes before starting the service; the session store uses `createTableIfMissing: false`.

Existing saved rows remain unassigned (`workspace_id` is null) and quarantined from authenticated workspace lists, counts, and deletes. Do not backfill ownership without a separate review. Do not point an old unauthenticated API at the migrated database. Prefer restoring the staging backup for a full rollback; otherwise retain the additive schema and roll forward with a reviewed fix rather than dropping ownership data.

Render dashboard configuration and migration are future staging steps; no hostnames, secrets, or database are configured by this repository.

To check the TypeScript workspace:

```sh
pnpm run typecheck
```

To regenerate the typed API client after editing `lib/api-spec/openapi.yaml`:

```sh
pnpm --filter @workspace/api-spec run codegen
```

## Qloo setup

Live entity search, discovery, and heatmap requests require a Qloo API key:

1. Add `QLOO_API_KEY` to the API server's server-side environment/secret store.
2. Restart the API server.
3. Open **Settings** in Cultural Collision Atlas and run the connection test.

The key is read only by the API server and is never sent to the browser. The connection is labeled unverified until a real authenticated request succeeds. The API client isolates Qloo endpoint paths and request construction in `artifacts/api-server/src/lib/qloo/` so they can be updated against Qloo's current reference.

## Authentication and database migration

Configure these values on the **API server** before starting the authentication-enabled application:

- `AUTH_BASE_URL`: the public application origin, without a path; production must use HTTPS.
- `GOOGLE_OIDC_CLIENT_ID`: the OAuth client ID for a Google **Web application** OAuth client.
- `GOOGLE_OIDC_CLIENT_SECRET`: that same OAuth client's server-side secret.
- `AUTH_SESSION_SECRET`: at least 32 bytes of random data; keep it stable across API instances and restarts.
- `AUTH_ALLOWED_EMAILS`: comma-separated exact email addresses allowed to sign in; Google must report each email as verified.
- `DATABASE_URL`: connection string for the staging PostgreSQL database. The database package requires it at startup, and sessions/users/workspaces use it.
- `PORT`: valid positive port for the API server.
- `NODE_ENV=production`: use this for production-mode staging over HTTPS; it enables Secure session cookies and the `__Host-` cookie name.
- `QLOO_API_KEY` is optional for auth/session-only checks, but must be configured on the API server to test live Qloo discovery and heatmap integrations.

Google Cloud setup: configure the OAuth consent screen and (while in testing mode) add the intended test accounts. Create an OAuth client of type **Web application** and register this Authorized redirect URI exactly: `${AUTH_BASE_URL}/api/auth/callback` (the code appends the fixed path `/api/auth/callback` to the configured origin). Add the resulting client ID/secret to the API server configuration, then set `AUTH_ALLOWED_EMAILS` to the exact approved account addresses. The client secret and session secret must never be included in the web app or browser storage.

Staging sequence:

1. Provision a separate staging PostgreSQL database and take a restorable snapshot/backup before changing its schema.
2. Apply [`lib/db/migrations/0001_auth_workspaces.sql`](./lib/db/migrations/0001_auth_workspaces.sql) once through the approved migration process. It is transactional but intentionally not idempotent. Verify the identity, workspace, session tables, constraints, and indexes before starting the new API.
3. Configure the server-side variables above, the Google callback URI, and the allowlisted staging accounts. Run the API behind the intended HTTPS proxy, with `NODE_ENV=production`; confirm the proxy topology matches the configured one-hop `trust proxy` setting.
4. Start the API and then the web app; test health, allowed/denied login, session persistence/logout, and two-user workspace isolation. The app does not automatically apply the migration or test database connectivity at startup. The session store is configured with `createTableIfMissing: false`, so its table must already exist.

The migration adds nullable workspace foreign keys and does not assign existing records. Those rows remain preserved but quarantined (not listed, counted, or deletable by authenticated workspaces) until a separately reviewed ownership decision. The `sessions` table in the migration matches the Drizzle declaration in `lib/db/src/schema/identity.ts` and the PostgreSQL session-store configuration. Do not use schema push as a substitute for the reviewed migration.

Rollback precautions: if staging validation fails after the new API has accepted data, take the app offline or keep it behind the staging access gate while diagnosing. Do **not** point the old unauthenticated API at a database containing workspace-owned records; its global queries could expose them. Prefer restoring the pre-migration staging snapshot for a full rollback. Otherwise leave the additive schema in place and roll forward with a reviewed fix; do not drop tables/columns or remove workspace ownership data as an ad hoc rollback.

The browser uses a server-managed, HttpOnly, Secure-in-production, SameSite=Lax session cookie and a session-bound CSRF token. Provider-backed requests are limited to 30 per IP per 15-minute window in each API process; use a shared rate-limit store if the API is horizontally scaled.

Each allowlisted Google identity receives a private workspace on first sign-in. The application scopes saved-discovery and activation-plan reads, counts, inserts, and deletes to that workspace. The migration is not run automatically by the server.

Official references used for the current request shape:

- [Qloo API overview](https://docs.qloo.com/reference/api-overview)
- [Insights API Deep Dive](https://docs.qloo.com/reference/insights-api-deep-dive)
- [Basic Insights use case](https://docs.qloo.com/reference/basic-insights-use-case)
- [Search Entities](https://docs.qloo.com/reference/get-search)
- [Heatmaps use case](https://docs.qloo.com/reference/heatmaps-use-case)

## Data and evidence notes

- Saved discoveries and activation plans persist in the project's PostgreSQL database.
- No venue provider is configured. The Opportunity Atlas will not invent venue names, addresses, capacities, ratings, or map points.
- Discovery optionally requests Qloo Taste Analysis tags for each input with `filter.type=urn:tag`. Exact tag-ID overlap with the returned candidate `tags` list is displayed separately for each input as supplementary derived evidence; it does not affect ranking or confidence. Taste Analysis subtype metadata is cross-checked against candidate-tag type metadata; selected known taxonomy subtypes are conservatively labeled as cultural/domain or generic operational attributes. Unknown, missing, or conflicting metadata is labeled unclassified. Operational attributes (such as payment method, price, hotel rating, inclusivity, and general place category) are not presented as cultural/domain evidence. A tag overlap is not proof of a cultural relationship or a shared audience. Missing, malformed, or unavailable tags are not treated as negative matches.
- The dedicated tag-search integration remains disabled; it is separate from Insights API Taste Analysis.
- Bridge scores are derived rankings, not probabilities. Aggregate cultural affinity does not prove that the same people share two interests or guarantee campaign success.
- Planning content is labeled as hypotheses where it has not been validated. Budget estimates are withheld until sourced quotes exist.
