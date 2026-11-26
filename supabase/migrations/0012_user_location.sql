-- ============================================================================
-- TICX migration 0012: per-user city (location-based discovery).
-- Additive and reversible (see supabase/rollback/0012_user_location_down.sql).
-- Supabase Auth remains the identity provider: profiles.id == auth user id.
-- Location is written ONLY through POST /api/profile/location (validated,
-- rate-limited, city-level precision). No existing rows/columns are altered.
-- ============================================================================
alter table profiles
  add column if not exists email text,
  add column if not exists country text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists latitude double precision check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude is null or longitude between -180 and 180),
  add column if not exists location_permission text not null default 'unset'
    check (location_permission in ('unset','granted','denied','manual','skipped')),
  add column if not exists location_updated_at timestamptz;

-- Case-insensitive city matching for discovery queries.
create index if not exists idx_profiles_city on profiles (lower(city));
create index if not exists idx_events_city_lower on events (lower(city));
create index if not exists idx_locations_city_lower on locations (lower(city));

-- Backfill email for existing users (read-only copy from auth.users).
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
