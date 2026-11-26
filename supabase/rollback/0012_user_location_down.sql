-- Reverts migration 0012. Only drops what 0012 added.
drop index if exists idx_profiles_city;
drop index if exists idx_events_city_lower;
drop index if exists idx_locations_city_lower;
alter table profiles
  drop column if exists email,
  drop column if exists country,
  drop column if exists state,
  drop column if exists city,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists location_permission,
  drop column if exists location_updated_at;
