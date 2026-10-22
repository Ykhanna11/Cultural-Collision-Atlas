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
