# Venue discovery

The Opportunity Atlas uses Leaflet with OpenStreetMap tiles for interactive maps. Venue facts are discovered through Overpass and normalized in the Express API. Map and provider data are free for the initial experience, but remain subject to provider usage policies.

## Provider behavior

- The map uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and displays the required OpenStreetMap attribution.
- Overpass requests are bounded, cached for 10 minutes, throttled to at least 1.5 seconds, limited to 50 venues, and time out after 15 seconds.
- Searches require a bounded map area of at most 2 latitude degrees and 3 longitude degrees.
- The application does not use public Nominatim autocomplete or bulk geocoding.
- Provider facts do not invent ratings, reviews, photos, opening hours, audience demographics, or campaign-success probabilities.

## Local development

No paid API key is required for the default OpenStreetMap provider. An optional `OVERPASS_URL` environment variable may point to a compliant Overpass-compatible endpoint. The API contract is generated from `lib/api-spec/openapi.yaml`; do not hand-edit generated React or Zod clients.

## Limitations and future providers

Overpass coverage depends on OpenStreetMap contributors and may be incomplete. Some named places have sparse address, website, opening-hours, or contact tags. Google Places and Foursquare provider adapters can be added behind the existing normalized provider interface when explicitly configured by an operator; they are not required for Phase 1.
