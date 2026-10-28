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

### Render dashboard setup

Create one **Web Service** from the repository root. A suitable build command is `pnpm install --frozen-lockfile && pnpm run build`; use `pnpm --filter @workspace/api-server run start` as the start command. Set `NODE_ENV=production`; allow Render to provide the runtime `PORT`. Configure a health check at `/api/healthz`.

Keep `DATABASE_URL` as a server-side secret. `QLOO_API_KEY` enables live Qloo search, discovery, and heatmaps; `OPENAI_API_KEY` and `OPENAI_MODEL` enable AI-assisted planning. Keep these integration values server-side, not in Vite/browser variables. `DATABASE_URL` and Render's runtime `PORT` are required. No OAuth, session, or authentication configuration is required.

The app and API are public. Express trusts one proxy hop for rate-limit client IPs; confirm the Render proxy topology is compatible with that setting.

### Existing PostgreSQL database

Keep the existing Render PostgreSQL database and all its data. This release does not run schema migrations or drop/alter tables. Before deploying, verify that the existing `users`, `workspaces`, `saved_discoveries`, and `activation_plans` schema from [`lib/db/migrations/0001_auth_workspaces.sql`](./lib/db/migrations/0001_auth_workspaces.sql) is present; do not rerun this non-idempotent migration if it has already been applied.

On first use of saved data, the API idempotently creates a dedicated public-demo identity and workspace in the existing identity tables. Saved discoveries, activation plans, and overview counts all use that workspace. Every visitor can see, create, and delete records in this shared demo workspace. Existing records assigned to other workspaces and legacy rows with a null `workspace_id` remain untouched and are excluded from public lists, counts, and deletes. Do not backfill or reassign those rows.

This repository does not configure Render environment variables or deploy the service.

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

The key is read only by the API server and is never sent to the browser. The connection is labeled unverified until a real credentialed Qloo request succeeds. The API client isolates Qloo endpoint paths and request construction in `artifacts/api-server/src/lib/qloo/` so they can be updated against Qloo's current reference.

## Public-demo access and limits

The app opens directly without accounts, sign-in screens, cookies, or session state. All visitors share the dedicated public-demo saved-data workspace; do not store personal or confidential information there. Mutating saved discoveries/plans is limited to 60 requests per IP per 15 minutes. Provider-backed requests remain limited to 30 per IP per 15 minutes in each API process. Use a shared rate-limit store if the API is horizontally scaled.

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
