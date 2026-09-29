# The publishing Worker

Everything behind `/api`, plus OpenGraph injection for `/b/:id`. The editor itself is a static
build served from Cloudflare's asset hosting; this Worker only wakes for the paths listed under
`run_worker_first` in [`wrangler.toml`](../wrangler.toml).

See [AGENTS.md](../AGENTS.md) for how the repo is built. This file is the provisioning runbook and
the local-development loop.

## Shape

```
index.ts          fetch handler: one switch over the route table, one try/catch
router.ts         the route table and its matcher (pure)
db.ts             every D1 query
present.ts        row -> wire. The one place that decides what a client may see
validatePublish.ts  upload validation, on top of src/model/serialize.ts
png.ts  ids.ts  tokens.ts  cursor.ts  ip.ts     small pure modules, all tested
og.ts             OpenGraph tags + HTMLRewriter injection
turnstile.ts  ratelimit.ts   abuse controls
routes/           one file per group of handlers
migrations/       D1 migrations, applied with `npm run db:migrate`
```

`validatePublish.ts` imports `src/model/serialize.ts` directly, so an upload the Worker accepts is
by construction one the editor can open. That import is why `serialize.ts` must stay free of
runtime imports — `npx tsc -b` builds it under `tsconfig.worker.json` and will fail if it grows
one.

**`tsc -b` does not typecheck `worker/**/*.test.ts`**, for the same reason it skips the app's tests:
`tsconfig.worker.json` excludes them. Vitest's transform is the only thing that sees them.

## Local development

Two servers. Vite serves the app and proxies `/api` and `/storage` to wrangler (see
`vite.config.ts`), so the browser only ever talks to `localhost:5173`.

```sh
cp .dev.vars.example .dev.vars     # then edit
npm run db:migrate:local           # miniflare's local D1
npm run dev:api                    # wrangler dev, port 8787
npm run dev                        # vite, port 5173
```

`.dev.vars` is gitignored. It needs at least:

```
SITE_ORIGIN=http://localhost:5173
R2_PUBLIC_ORIGIN=
IP_PEPPER=anything-local
ADMIN_TOKEN=local-admin
```

`R2_PUBLIC_ORIGIN` must be **empty** locally. There is no CDN subdomain in front of miniflare's
bucket, so the Worker serves `/storage/*` from it instead — that route exists only for this.

### Smoke checklist

Against `npm run dev` + `npm run dev:api`:

1. `curl localhost:8787/api/health` → `{"ok":true}`
2. `curl localhost:8787/api/config` → JSON with `requireTurnstile: false`
3. Draw something, **Publish**, leave the gallery box unchecked. The dialog shows a link and a
   management key.
4. Open the link in a new tab → read-only, toolbar says "Published blueprint".
5. **Edit a copy** → editable, URL becomes `/`, and a reload does not restore the published copy.
6. `curl -I localhost:8787/b/<id>` → `X-Robots-Tag: noindex, nofollow`.
7. `curl -s localhost:8787/b/<id> | grep og:title` → the blueprint's title, HTML-escaped.
8. **Mine** → the list shows it. Delete it. The link now shows "Blueprint unavailable".
9. Publish again with the gallery box checked, then `/admin` with the local `ADMIN_TOKEN` →
   it is in the queue. Approve it → it appears at `/gallery`, and **Mine** now says "in the
   gallery" rather than "awaiting review".
10. Clear `localStorage` (or use another browser), then **Mine → Have a management key?** with the
    link and the key from step 3 → the blueprint is manageable again. A wrong key answers 404.

## Releasing

Merging to `main` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml):

1. **`build`** runs the checks, builds, and `wrangler versions upload`s the result. Cloudflare
   stores that exact artifact as a Worker *version* at **0% traffic**. Production is unchanged;
   `npx wrangler versions list` shows it, the live deployment still points at the old one.
2. **`promote`** waits on the `production` environment until someone clicks approve, then applies
   D1 migrations, promotes *that same version id* to 100%, and verifies `/api/health` and
   `/api/config` against the real domain.

What goes live is byte-for-byte what was tested — promotion deploys a version id, it does not
rebuild. To undo, run the **Rollback** workflow with an id from `npx wrangler versions list`.

There is no staging and, with `preview_urls = false`, no preview URL — so nothing can be clicked
through before approval. That is deliberate: a version URL would be a public `*.workers.dev` host
bound to the production D1 and R2 that routes around both Turnstile and the Access rule on
`/admin`. The post-promotion assertions plus one-command rollback are the trade. If that proves too
thin, the next step is a canary (`versions deploy "$VID@10"`, check, then `@100`), not preview URLs.

**Migrations must be safe for the *previous* version of the Worker.** CI applies them before the new
version takes traffic, so the old code briefly serves against the new schema — and a rollback moves
the code back but never the schema. Therefore: add columns only as nullable or `DEFAULT`-ed; never
add a `NOT NULL` column without a default, since the insert at `db.ts:50` names every column
explicitly and would start failing; and never drop or rename a column, index or table in the same
release that stops using it — expand first, contract two releases later. Today's migrations are
already safe, being nothing but `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

**`npm run deploy` bypasses all of this.** No approval, no migrations, no verification. After the
bootstrap in step 7 it is an emergency tool.

**`wrangler secret put` also deploys.** It creates a new version and ships it immediately, outside
the gate — though only when the live version is already the latest, so it cannot smuggle out a
release you haven't approved. If one is pending, the command refuses; use `wrangler versions secret
put` to change the secret without deploying. See step 8.

## Operational notes

**Published blueprints are immutable.** Only `visibility` ever changes after a publish. Links people
have shared must keep meaning what they meant; "editing" is publishing a new one.

**A publish claims its id in D1 before it writes to R2.** If the upload fails partway, the row stays
`ready = 0` and is invisible to every read path. The failure mode is a wasted row, never a live row
pointing at a missing object.

**Deletion goes the other way**: row first, then objects. The worst case is an unreferenced object
in R2, which costs a fraction of a cent, rather than a live link to a 404.

**Rate limit quota is consumed before the work, not after.** A failed publish still counts. That's
deliberate: a failing publish is indistinguishable from a probe, and refunding it would hand an
attacker unlimited retries.

**Wrong management token and missing blueprint both answer 404.** A 403 would confirm that an id
exists, which is exactly what an unlisted blueprint is trying not to do. `GET /api/blueprints/:id`
follows the same rule when a key is offered: without one it is the public lookup, with a matching
one it adds `owner: true` and `Cache-Control: no-store`, and with a wrong one it 404s. That is what
makes checking a management key possible without a write.

### Finding an abuser's other uploads

```sh
npx wrangler d1 execute stationeersprints --remote \
  --command "SELECT id, title, created_at FROM blueprints WHERE ip_hash = (SELECT ip_hash FROM blueprints WHERE id = 'BAD_ID')"
```

`ip_hash` is SHA-256 of the address plus `IP_PEPPER`; it groups uploads without storing anything
that identifies a person.

### Sweeping abandoned reservations

Rows left at `ready = 0` by a failed upload are invisible but not free:

```sh
npx wrangler d1 execute stationeersprints --remote \
  --command "DELETE FROM blueprints WHERE ready = 0 AND created_at < strftime('%s','now','-1 day') * 1000"
```
