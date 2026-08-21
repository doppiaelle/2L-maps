# 2L Maps Flutter application

This directory is the application foundation for the Flutter client.

The bootstrap reads only build-time values:

- `HERE_ACCESS_KEY_ID`
- `HERE_ACCESS_KEY_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

REST keys for HERE and ORS are never read by Flutter. They remain protected inside
Supabase Edge Functions.

The current shell exposes Planner, History, Settings and Navigation destinations.
The planner, HERE search, route orchestration, persistence and turn-by-turn behavior
are added incrementally in the following PRs.
