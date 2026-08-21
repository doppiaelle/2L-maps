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


## Autenticazione

Supabase Auth conserva e rinnova la sessione localmente tramite `supabase_flutter`.
L’app ripristina la sessione all’avvio, mostra il login quando non esiste un JWT e
propaga automaticamente il JWT alle chiamate Supabase/Edge Functions. Sono supportati
email/password e Google OAuth.

Il callback mobile è:

`com.doppiaelle.twolmaps://login-callback/`

Va registrato nei Redirect URLs di Supabase e nei client OAuth Google. Google resta
solo un provider di autenticazione: Google Maps e servizi geografici Google non sono
utilizzati.
