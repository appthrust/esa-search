# esa-search

A normal Next.js web app for searching esa articles indexed by the AppThrust
Knowledge addon. It is **not an addon**. Connect this app to the Knowledge addon
in the same AppThrust Project using an app → addon `ComponentConnection` with
Access Keys. The esa connector and its collections are configured in Knowledge;
this app does not connect to esa directly.

The browser calls this app's `/api/*` routes. Only the server exchanges the
connection's Access Key for a short-lived Knowledge bearer token and calls the
addon. Tokens are cached until 30 seconds before expiry, concurrent exchanges
share one request, and an addon 401 triggers exactly one refresh and retry.
Requests time out after 10 seconds and never follow redirects. No Access Key or
bearer token is returned to the browser or logged.

## Runtime configuration

AppThrust supplies these variables through the app → Knowledge connection:

| Variable | Purpose |
| --- | --- |
| `KNOWLEDGE_URL` | Internal HTTP(S) origin of the Knowledge addon; API calls go here. |
| `KNOWLEDGE_API_KEY` | Opaque `apk_knowl_…` Access Key; server-only secret. |
| `KNOWLEDGE_ACCESS_URL` | Dashboard HTTP(S) origin, with no path, credentials, query, or fragment. The server posts `{key}` to `/api/v1/access/token` on this origin only. |
| `KNOWLEDGE_PUBLIC_URL` | Optional public Knowledge URL used for browser links. |

Optional runtime variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL supplied by a database `ComponentConnection`; enables shared recent-search history. |
| `VERSION` | Version shown by `/api/status`. Falls back to `APTH_COMPONENT_VERSION`, then `unset`. |

Never prefix secrets with `NEXT_PUBLIC_`, commit connection values, or put them
in browser code. The app exposes searches permitted by its connection key to
visitors who can access the app; use the deployment's access controls for a
private team deployment.

If any of `KNOWLEDGE_URL`, `KNOWLEDGE_API_KEY`, or `KNOWLEDGE_ACCESS_URL` is absent,
the UI can show the not-configured state. No network connection or database is
required at build time. A configured but failing exchange or collections request
is reported as unavailable instead of crashing the app.

## Local development

Requires Node.js 24 and npm, matching the deployment image.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. With no environment variables, `/api/status` reports
`knowledge: "not-configured"` and `database: "missing-url"`, searches return 503
`knowledge_not_configured`, and `/api/history` returns `{ "items": [] }`.
For real local searches, supply the connection variables in the process
environment or an untracked `.env.local`; the internal addon URL must be
reachable from the development machine. Do not use a public Knowledge URL as a
replacement for the Access Token exchange origin.

The optional database schema is in `db/migrations/0001_init.sql` and can be
applied through AppThrust `DatabaseChange`, or locally with:

```bash
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
```

History also lazily runs `CREATE TABLE IF NOT EXISTS search_history` once per
server process, sharing concurrent initialization, so it works when the
migration has not run (the database user then needs table-creation permission).
Successful searches upsert the trimmed query, increment its count, and update
its timestamp. Database errors are logged without credentials and never fail a
search; missing or unavailable history returns an empty list. History is shared
by this app's users, not scoped to individual browser sessions.

## App API

Every response is JSON with `Cache-Control: no-store`.

- `GET /api/status` — 200 with `{knowledge, publicUrl, database, version}`. Knowledge
  readiness checks the real exchange and collections path; database readiness
  uses `SELECT 1`.
- `GET /api/collections` — 200 `{collections: [{name, description, visibility}]}`;
  503 `knowledge_not_configured` or 502 `knowledge_unavailable` on failure.
- `GET /api/search?q=…&collection=…&mode=hybrid&topK=8` — 200
  `{query, mode, hits, tookMs}`. `collection` is repeatable; hits and esa metadata
  pass through unchanged. The trimmed UTF-8 query must be nonblank and at most
  16,384 bytes. `topK` is an integer from 1 to 50 (default 8); `mode` is `hybrid`,
  `lexical`, or `vector` (default `hybrid`). Invalid inputs return 400 with
  `query_required`, `query_too_long`, `invalid_top_k`, or `invalid_mode`.
  Missing configuration returns 503 `knowledge_not_configured`; failures return
  502 `knowledge_unavailable`. An addon 403 `key_not_permitted` passes through
  as 403 with the same code.
- `GET /api/history?limit=10` — always 200 `{items: [{query, count,
  lastSearchedAt}]}`, newest first with ISO timestamps. An absent or invalid
  positive integer limit defaults to 10; no database means an empty list.

Client-safe response types live in `lib/search-types.ts`. Credentials, token
exchange, and database access live in server-only modules.
