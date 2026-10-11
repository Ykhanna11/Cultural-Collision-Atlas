# Cultural Collision Atlas

An evidence-aware cultural intelligence workspace for finding bridges between interests and planning real-world activations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Optional secret: `QLOO_API_KEY` — server-side Qloo API access for live search, insights, and heatmaps
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cultural-collision-atlas` — React/Vite frontend
- `artifacts/api-server/src/lib/qloo` — server-only Qloo requests and response adapters
- `artifacts/api-server/src/routes` — HTTP handlers
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema` — persistent saved-discovery and activation-plan data

## Architecture decisions

- Qloo credentials stay server-side; the browser only receives connection state and normalized evidence.
- A connection is not considered verified until an authenticated Qloo request succeeds.
- No venue provider is configured, so map/venue screens must show an unavailable or empty state rather than generated real-world place data.
- Bridge scores are explicitly derived from documented Qloo result ranks and joint-list presence; they are not probabilities.

## Product

- Discovery Studio and Cultural Bridge Explorer
- Opportunity Atlas with Qloo heatmap support and explicit venue-source availability
- Activation Planner with save/export support
- Saved Discoveries and Settings

## User preferences

- Preserve the distinction between observed API evidence, external data, derived calculations, and hypotheses.
- Do not invent venues, addresses, capacities, ratings, or geographic statistics.
- Do not imply that cultural affinity proves shared individual interests or campaign success.

## Gotchas

- If the OpenAPI contract changes, run API codegen before using the generated client or schemas.
- Qloo's documented request construction lives in one server module and must be checked against the official API reference before endpoint changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
