# MyTICX upgrade: city onboarding, OMDb browse, location-based discovery

Auth stays on **Supabase Auth** (Clerk was NOT added: it would require rewriting ~34 RLS policies, 24 server files and the
payment/organizer auth, and could not be tested without Clerk keys). See "Clerk" below.

## New files
- supabase/migrations/0012_user_location.sql  (+ supabase/rollback/0012_user_location_down.sql)
- lib/geo/cities.ts, lib/geo/location.ts, lib/omdb.ts, lib/discover.ts, lib/discover-dates.ts, lib/client-ip.ts
- app/api/profile/location/route.ts, app/api/geo/reverse/route.ts, app/api/omdb/search/route.ts, app/api/omdb/detail/route.ts, app/api/discover/route.ts
- app/onboarding/location/{page,layout}.tsx, components/LocationPicker.tsx, components/home/LocationDiscovery.tsx
- tests/geo.test.ts, tests/omdb.test.ts

## Modified files
- app/home/page.tsx (adds <LocationDiscovery/>; nothing removed), app/profile/page.tsx (adds Location card),
  app/suggestions/page.tsx (Movie picks: OMDb search/year/type filters, details, load more; featured picks kept),
  middleware.ts (/onboarding protected), next.config.js (geolocation=(self), OMDb poster host in img-src), .env.example

## Setup
1. Run supabase/migrations/0012_user_location.sql in Supabase SQL editor (additive; rollback file provided).
2. Env: OMDB_API_KEY, OMDB_API_BASE_URL=https://www.omdbapi.com/ (server-only).
3. Existing users: on next visit to /home they are sent once to /onboarding/location (or can skip).

## Behaviour
- Signup -> verify email -> login -> /home -> one-time city step. Saved city loads on every login; edit it in Profile or via "Change city" on home.
- GPS is optional; coordinates only stored if permission was granted, rounded to ~1 km. Reverse geocoding = server-side OpenStreetMap Nominatim.
- Tickets: marketplace_listings_view filtered by city (Bengaluru/Bangalore etc. treated as the same), future shows only, filters Today/Tomorrow/Weekend/price/venue/genre.
- Events: existing events table filtered by city. Hackathons: events whose type or title contains "hackathon/hack fest/codeathon/ideathon"
  (there is no separate hackathon table; prize pool/team size are not in the schema so are not shown). Empty states, no fake data.
- OMDb only through /api/omdb/* (key never in browser), 1h search / 24h detail cache, in-flight de-dup, 60 req/min/IP, rate-limit + not-configured handling.

## Not done / limitations
- Clerk: not implemented (see above). Recommended later as a separate branch via Clerk's Supabase third-party-auth integration.
- Rate limiter for the new routes is in-memory (per instance), like the existing generic limiter.
- Genre filter depends on movies.genre being filled in your DB. Ticket "quantity" is always 1 (one ticket per listing in this schema).
- CSP is still report-only (CSP_ENFORCE=false). Flip it after checking the console, per your checklist.
- Not tested live: Supabase queries, Nominatim, OMDb with a real key, browser GPS prompt (no credentials/network here).
