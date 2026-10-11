# Cultural Collision Atlas

Cultural Collision Atlas is a cultural-intelligence workspace for comparing two interests, exploring evidence-backed bridges, and drafting activation plans. It separates live API evidence from derived ranking and planning hypotheses.

## Run in Replit

Use the configured Replit workflows to run the web app and API server. The web app is served at the project preview; API requests use `/api`.

To check the TypeScript workspace:

```sh
pnpm run typecheck
```

To regenerate the typed API client after editing `lib/api-spec/openapi.yaml`:

```sh
pnpm --filter @workspace/api-spec run codegen
```

## Qloo setup

Qloo is optional for the application shell, saved discoveries, and activation plans. Live entity search, discovery, and heatmap requests require a Qloo API key:

1. Open the Replit project's **Tools → Secrets**.
2. Add a secret named `QLOO_API_KEY` with the key issued by Qloo.
3. Restart the API Server workflow.
4. Open **Settings** in Cultural Collision Atlas and run the connection test.

The key is read only by the API server and is never sent to the browser. The connection is labeled unverified until a real authenticated request succeeds. The API client isolates Qloo endpoint paths and request construction in `artifacts/api-server/src/lib/qloo/` so they can be updated against Qloo's current reference.

Official references used for the current request shape:

- [Qloo API overview](https://docs.qloo.com/reference/api-overview)
- [Basic Insights use case](https://docs.qloo.com/reference/basic-insights-use-case)
- [Search Entities](https://docs.qloo.com/reference/get-search)
- [Heatmaps use case](https://docs.qloo.com/reference/heatmaps-use-case)

## Data and evidence notes

- Saved discoveries and activation plans persist in the project's PostgreSQL database.
- No venue provider is configured. The Opportunity Atlas will not invent venue names, addresses, capacities, ratings, or map points.
- Qloo's public overview mentions tag search, but its current reference did not provide a verifiable request path and response schema; tag lookup is therefore disabled rather than guessed.
- Bridge scores are derived rankings, not probabilities. Aggregate cultural affinity does not prove that the same people share two interests or guarantee campaign success.
- Planning content is labeled as hypotheses where it has not been validated. Budget estimates are withheld until sourced quotes exist.
