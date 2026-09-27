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

## Provisioning

Nothing below is done automatically. Run it once, in order.

### 1. Domain

Register `stationeersprints.com` and add it to the Cloudflare account. Wait for the nameservers to
come active.

### 2. D1

```sh
npx wrangler d1 create stationeersprints
```

Copy the printed `database_id` into `wrangler.toml` (it replaces `REPLACE_ME`). Then:

```sh
npm run db:migrate          # --remote
```

### 3. R2

```sh
npx wrangler r2 bucket create stationeersprints
```

In the dashboard, under **R2 → stationeersprints → Settings**:

- **Custom domain**: `cdn.stationeersprints.com`. This is what makes the bucket public — do *not*
  enable the `r2.dev` public URL, which is rate-limited and not meant for production.
- **CORS**: allow `GET` from `https://stationeersprints.com`. The editor fetches blueprint JSON
  from this origin with `fetch()`, which is a cross-origin request. Previews are `<img>` tags and
  do not need it, but the JSON does.

Having the bucket on its own hostname is the whole cost story: a gallery page of 24 cards costs
**two** Worker invocations (the HTML and `/api/gallery`) instead of twenty-six, because every
preview is served straight from R2.

### 4. Turnstile

Create a widget for `stationeersprints.com` (Managed mode). Put the **site key** in
`wrangler.toml` under `[vars] TURNSTILE_SITE_KEY`, set `REQUIRE_TURNSTILE = "true"`, and the
secret:

```sh
npx wrangler secret put TURNSTILE_SECRET
```

Leave `REQUIRE_TURNSTILE` false until the secret is set — `turnstileRequired()` needs both, and the
Worker fails closed if verification is on and the API is unreachable.

### 5. Secrets

```sh
npx wrangler secret put IP_PEPPER      # e.g. `openssl rand -hex 32`
npx wrangler secret put ADMIN_TOKEN    # e.g. `openssl rand -hex 32`
```

`IP_PEPPER` must never change casually: rotating it resets every rate-limit bucket and orphans the
`ip_hash` trail used to find an abuser's other uploads. `ADMIN_TOKEN` can be rotated freely.

### 6. Rate-limit binding (optional)

The burst layer. Add to `wrangler.toml` and redeploy:

```toml
[[unsafe.bindings]]
name = "PUBLISH_BURST"
type = "ratelimit"
namespace_id = "1"
simple = { limit = 3, period = 60 }
```

Without it, `checkBurst()` is a no-op and only the hourly D1 limit applies. The binding cannot
express the hourly limit itself — its `period` accepts only 10 or 60 seconds, which is why
`publish_events` exists.

### 7. Deploy

```sh
npm run deploy      # vite build && wrangler deploy
```

Then in the dashboard, **Workers → stationeersprints → Domains & Routes**, add
`stationeersprints.com` and `www.stationeersprints.com`. `workers_dev = false` is already set:
Turnstile is bound to the real hostname, and a live `*.workers.dev` alias would route around it.

### 8. Lock down /admin

Cloudflare Access (Zero Trust → Applications) on `stationeersprints.com/admin`, restricted to your
own email. The Worker checks `ADMIN_TOKEN` on the API regardless — Access is defence in depth, not
the only gate, because it protects the *path* and the API lives at `/api/admin/*`.

### 9. Abuse contact

Put a real address in the site footer or a `/legal` page before the gallery opens. Publishing is
anonymous, so a takedown request has nowhere else to go.

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
