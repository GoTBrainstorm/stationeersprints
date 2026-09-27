# AGENTS.md

Guidance for AI agents working in this repo. For what the app *is* and how to use it, read
[README.md](README.md) first; this file covers how it's built and what will break if you're careless.

## Commands

```sh
npm run dev      # vite dev server on http://localhost:5173
npm run dev:api  # wrangler dev on :8787 — needed for anything under /api or /b/:id. Build first.
npm test         # vitest run — 10 files, ~115 tests, <1s. Run this after any model change.
npm run lint     # oxlint
npm run build    # tsc -b && vite build → dist/
npm run check    # the full gate: vitest && oxlint && tsc -b
npm run deploy   # build, then wrangler deploy
npm run extract  # regenerate public/data/ from a Stationeers install (rarely needed)
```

There is no CI. `npm run check` is the full gate — it runs all three because each catches things
the others don't.

**`npm run dev:api` serves a build, not your source.** `wrangler.toml` points `[assets] directory`
at `./dist`, so `wrangler dev` hands out whatever `npm run build` last wrote — it doesn't compile,
watch, or notice that `src/` has moved on. Edit against `npm run dev`, which is the one with HMR,
and rebuild before going back to `:8787` or you'll debug a stale bundle. The same applies to
`public/data/`: a re-extract is invisible to `dev:api` until the next build copies it into `dist/`.

**`tsc -b` does not typecheck `src/**/*.test.ts` or `worker/**/*.test.ts`.** `tsconfig.app.json`
and `tsconfig.worker.json` exclude them, and `tsconfig.node.json` only covers `vite.config.ts` +
`tools/**`. Test files are checked by Vitest's transform alone, which is why `model.test.ts` can
get away with `as never` for a stub catalog. Don't assume a green `tsc -b` means the tests
typecheck.

## The three representations

Data moves through three shapes. Most bugs come from confusing them.

| | What | Lives in | Persisted? |
|---|---|---|---|
| **Catalog** | The game's devices: ports, logic types, slots, modes, icons, build costs | `public/data/catalog.json`, typed by `src/model/catalogTypes.ts` | committed, **generated** |
| **Blueprint** | The saved document: nodes, edges, metadata | `src/model/blueprint.ts` | JSON files, share links, autosave |
| **Store** | The live React Flow graph + undo history | `src/store.ts` | no |

`toBlueprint()` / `fromBlueprint()` in `src/store.ts` are the only conversions between the last two.
If you add a field to a node, you must touch **both**, plus `validateNode()` in `serialize.ts`, or it
will silently vanish on save or fail to load.

## Invariants

These are load-bearing. Breaking one usually doesn't fail a test — it corrupts user documents.

**The blueprint format is a public contract.** Blueprints live in URLs (`#bp=…`, lz-string
compressed) that users have already shared and that you can never recall. Every file carries
`format: 'stationeersprints'` and `version: 1`, validated in `src/model/serialize.ts:44-45`.
Adding optional fields is safe. Renaming or repurposing an existing one is not.

> **Known gap:** `validate()` checks `version !== 1` with exact equality and hardcodes `version: 1`
> in its return. There is no migration path, so the day the version is bumped to 2, every existing
> v1 blueprint stops loading. Before making the first format change, turn that gate into a range
> check plus a stepwise upgrade chain. This is known and deliberate — don't bump the version
> without doing it.

**Port ids are stable identifiers, not display details.** `<NetworkType>-<Role>-<n>` (e.g.
`Pipe-Input-0`), built by `buildPorts()` in `tools/extract/build.ts`, used verbatim as React Flow
handle ids and stored in every edge's `sourceHandle`/`targetHandle`. Changing how they're generated
invalidates the edges of every saved blueprint. The `label` field is the part that's safe to change.

**`public/data/` is generated output.** Never hand-edit `catalog.json` or the icons. It's committed
so the app works without a game install, but it's rebuilt wholesale by `npm run extract`. To change
categorization or hide a device, edit `tools/extract/overrides.json`.

**Logic links are derived, never stored.** `deriveLogicLinks()` in `src/model/settings.ts` computes
the dashed arrows from device settings on every render (`App.tsx:53`). They're deliberately inert on
the canvas — `selectable: false`, `deletable: false` — because deleting one would be undone by the
next render. The inspector's settings are the source of truth; the arrows just visualize them.

**The shopping list is derived too.** `shoppingList()` in `src/model/shoppingList.ts` tallies device
nodes against `CatalogDevice.build` on demand. Nothing is cached in the blueprint: a stored bill of
materials could disagree with the drawing, and it would need a format version to fix. It takes a
`string[]` of prefabs rather than nodes so the store selector feeding it can stay shallow-comparable
— a selector minting an object per node never compares equal and re-renders forever.

**Unknown prefabs must degrade, not crash.** A blueprint can reference a device from a newer or
older game version. `lookupDevice()` (`src/model/catalog.ts:40`) always returns a device, synthesizing
a placeholder with ports rebuilt from the handle ids actually used by edges. Never index
`catalog.devices[prefab]` directly in editor code. `lookupItem()` does the same for the items in a
device's `build`.

**`@`-prefixed prefabs are schematic-only.** `@CableNetwork`, `@PipeNetwork`, `@LiquidNetwork` in
`BUILTINS` are not real game devices; the `@` guarantees no collision with game prefabs. They have a
single role-less port whose side the user chooses (`portSide`), unlike real devices which use the
input-left/output-right layout.

**Read-only mode is enforced in the store, not the UI.** `onNodesChange`/`onEdgesChange` filter
changes down to `select`/`dimensions` when `readOnly` is set (`store.ts:232`). Hiding a button is not
enough — anything that can mutate the document has to go through the store.

**`catalogTypes.ts` must stay free of runtime imports.** It's shared between the browser app and the
Node extractor under `tools/`. Types only.

**`serialize.ts` and `src/api/types.ts` must stay free of runtime imports too.** Both are compiled
under `tsconfig.worker.json` as well as `tsconfig.app.json`: the Worker validates uploads with the
editor's own `validate()`, so the two can never drift. `npx tsc -b` is what catches a violation.
Share-link helpers live in `src/model/shareLink.ts` for exactly this reason — they need lz-string.

**Published blueprints are immutable.** Only `visibility` ever changes after a publish. Links people
have shared must keep meaning what they meant; "editing" means publishing a new one. The runbook in
[`worker/README.md`](worker/README.md) covers the rest of the backend's invariants.

**The document's `source` is not part of the blueprint.** `DocSource` in `store.ts` records where
the open document came from (`local` / `shareLink` / `published` / `copy`). It lives outside
`Snapshot`, so undo can't restore a stale one, and outside `toBlueprint()`, because a published id
describes where a copy happens to be hosted — not the drawing — and would become a lie the moment
anyone edited it. Same reasoning as `zonesLocked`.

**Routing is real paths, not hash routes.** `src/routes.ts` is a hand-rolled router over
`useSyncExternalStore`; its snapshot must stay a primitive (`location.pathname`) or React
re-renders forever. `vite.config.ts` therefore sets `base: '/'` — `loadCatalog()` and `iconUrl()`
build URLs from `import.meta.env.BASE_URL`, and a relative base would resolve them to
`/b/data/catalog.json` and 404 on every route but `/`. The build can no longer be served from an
arbitrary subpath.

**The help text exists once.** `HelpContent` in `src/pages/HelpPage.tsx` is rendered both by the
`/help` page and by `HelpDialog`, which is what the editor's Help button opens — navigating away
from the editor unmounts it, clearing undo history and dropping any edit the autosave debounce
hasn't flushed. It quotes its limits from `GET /api/config` rather than hardcoding them, which is
why `ConfigResponse` carries `publishesPerHour`.

## Undo history

`checkpoint()` must be called *before* a mutation, capturing the pre-change state. Every action in
the store already does this; follow the pattern if you add one.

Pass a `coalesceKey` for anything that fires per keystroke or per animation frame — repeats under the
same key within 1s fold into the entry already pushed, so one gesture costs one undo step
(`store.ts:200-211`). Existing keys: `data:<id>`, `resize:<id>`, `meta`. `load()` resets the key so an
edit after a load can't merge with one from before it. `store.test.ts` covers exactly these cases;
extend it if you add history behaviour.

`zonesLocked` is a workspace preference, not document state: it lives in `localStorage`, outside the
undo history and outside `toBlueprint()`. Anything similarly "about the workspace, not the drawing"
belongs there too.

`docEpoch` is bumped by `load()` and by nothing else. The canvas uses it to fit the view once per
document, gated on `useNodesInitialized()` — fitting before React Flow has measured the new nodes
computes a viewport from zero-sized boxes and lands in the top-left corner. It is deliberately
outside `Snapshot`, so undo and redo don't move the viewport.

## Tests

- `src/model/model.test.ts` — serialization round-trips, rejection of broken input, connection rules, logic-link derivation, shopping-list tallying.
- `src/store.test.ts` — undo/redo and coalescing semantics, read-only enforcement, document source.
- `src/routes.test.ts` — path parsing, and the `/b/:id` reference parser behind the management-key form.
- `src/api/managementTokens.test.ts` — the localStorage record of what this browser published.
- `src/examples/examples.test.ts` — validates all 10 bundled examples against the committed catalog: every prefab, port spec, setting, logic type, access mode and device mode must exist. This is the regression net for catalog updates.
- `worker/*.test.ts` — id generation, token hashing, PNG header parsing, upload validation, cursors, OpenGraph escaping, the route table.
- `tools/extract/build.test.ts` — the pure transform from raw game data to catalog.

No component/DOM tests, no test runner for the browser layer, and **no Workers runtime in the test
pool** — `@cloudflare/vitest-pool-workers` peers on vitest 4 and this repo is on 5. Everything in
`worker/` that deserves a test is therefore a pure function in its own module, kept out of the
handlers. The handlers are covered by the smoke checklist in `worker/README.md`, not by unit tests.
`localStorage` is stubbed with `vi.stubGlobal` where needed rather than pulling in jsdom.

Logic that deserves testing belongs in `src/model/`, `src/store.ts`, or a leaf module under
`worker/` — not in a component or a request handler.

## Adding an example blueprint

Write it in `src/examples/<name>.ts` using the helpers in `template.ts`, then register it in
`src/examples/index.ts`. **Don't hard-code port ids** — name ports by spec (`Power`, `Pipe:Output`,
`PipeLiquid:Output#1`) and let `resolvePort()` match them against the catalog, so examples survive
port layout changes between game versions. Use `cable(device, network)` for power/data hookups: it
emits a grouped pair of alternatives where at least one must resolve, which handles devices that
expose a combined `PowerAndData` port instead of two separate ones.

Pass `dim` to `net()` for the `@CableNetwork` hub every device hangs off: its cables are plumbing,
not the point of the diagram, and fading them leaves the pipes and logic arrows readable. The pipe
and liquid networks stay undimmed — they *are* the process being drawn. `generatorBackup` is the
exception: its cable networks are the subject, so neither is dimmed.

`npm test` will tell you precisely what doesn't match the catalog.

## Conventions

- **Import extensions**: none in `src/` (bundler resolution), explicit `.ts` in `tools/` (nodenext — `npm run extract` runs Node directly on the TypeScript).
- **Styling**: one plain stylesheet, `src/styles.css`, with `className` strings. No CSS modules, no Tailwind, no styled-components. Port colors are driven by `port-<PortKind>` classes shared between nodes and the footer legend.
- **Store access**: `useStore((s) => …)` selectors for reactive reads; `useStore.getState()` for actions and one-off reads. Keep selectors returning primitives or stable references — see the `.join('|')` trick at `DeviceNode.tsx:22`.
- **Comments explain *why*, not *what*.** The existing ones document non-obvious decisions (why logic arrows point the way they do, why frozen zones need `draggable: false`, why `Other` ports never connect to each other). Match that; don't narrate the code.
- **Storage is best-effort.** Every `localStorage` access is wrapped in `try/catch` because private mode and blocked cookies must not break editing. Keep that.

## File map

```
src/
  App.tsx              canvas wiring, initial load (/b/:id > share link > autosave > first example), PNG export
  store.ts             zustand store, undo history, blueprint <-> graph conversion
  routes.ts            path router (no JSX, so it tests in the node pool)
  exportPng.ts         canvas -> PNG, shared by the download button and publishing
  download.ts          blob download + filename slug
  model/
    blueprint.ts       serialized format types  ← the contract
    serialize.ts       JSON (de)serialization and validation  ← shared with worker/
    shareLink.ts       `#bp=…` share links (lz-string lives here, not in serialize.ts)
    catalogTypes.ts    shape of catalog.json (shared with tools/, types only)
    catalog.ts         catalog access, `@` builtins, unknown-device fallback
    settings.ts        per-device config schema, derived logic links, node summaries
    rules.ts           which ports may connect
    shoppingList.ts    derived bill of materials (devices + kits/materials)
  api/
    types.ts           the editor <-> Worker wire format  ← shared with worker/
    client.ts          every call to /api
    managementTokens.ts  localStorage record of what this browser published
  components/          DeviceNode, NoteNode/ZoneNode, Palette, Inspector, Toolbar, dialogs, Link
  pages/               GalleryPage, HelpPage, AdminPage (lazy), NotFound
  examples/            10 bundled blueprints + template.ts helpers
worker/                publishing backend (see its own README.md)
tools/extract/         game → catalog.json pipeline (see its own README.md)
public/data/           GENERATED: catalog.json + 338 icons
wrangler.toml          Worker, D1, R2 and asset config
```
