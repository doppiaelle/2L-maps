-- PostgREST checks SQL privileges before RLS policies can decide whether a row
-- belongs to the signed-in user. Keep these grants as narrow as the client
-- surface: writable personal tables, readable shared/reference tables.

grant usage on schema public to authenticated;

grant select on table public.places_cache to authenticated;

grant select, insert, update, delete on table public.routes to authenticated;
grant select, insert, update, delete on table public.stops to authenticated;
grant select, insert, update, delete on table public.favourites to authenticated;

grant select on table public.user_entitlements to authenticated;
grant select on table public.usage_events to authenticated;
grant select on table public.optimization_jobs to authenticated;

grant usage, select on sequence public.usage_events_id_seq to authenticated;
