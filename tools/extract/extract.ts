// Builds public/data/catalog.json (+ icons) from the game.
//
//   npm run extract                      # reads <game>/Stationpedia, written by the export mod
//   npm run extract -- --game <dir>      # Stationeers install dir
//   npm run extract -- --export <dir>    # dir containing Stationpedia.json/Enums.json/Textures
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { buildCatalog, type Overrides } from './build.ts'
import { readEnglishThings, readEnumsFile, readGameVersion, readRecipes, readStationpediaExport } from './sources.ts'

const { values: args } = parseArgs({
  options: {
    game: { type: 'string', default: process.env.STATIONEERS_DIR ?? join(homedir(), '.local/share/Steam/steamapps/common/Stationeers') },
    export: { type: 'string' },
    out: { type: 'string', default: join(import.meta.dirname, '../../public/data') },
  },
})

const gameDir = args.game!
const exportDir = args.export ?? join(gameDir, 'Stationpedia')

for (const f of ['Stationpedia.json', 'Enums.json']) {
  if (existsSync(join(exportDir, f))) continue
  console.error(`No ${f} in ${exportDir}.`)
  console.error('Load the game and run `stationpedia_export` in the F3 console first;')
  console.error('see tools/extract/README.md for the one-time mod setup.')
  process.exit(1)
}

console.log(`Using Stationpedia export: ${exportDir}`)
const prefabs = readStationpediaExport(exportDir)
const enums = readEnumsFile(exportDir)
const iconSource = (p: string): string | undefined => {
  const f = join(exportDir, 'Textures', `${p}.png`)
  return existsSync(f) ? f : undefined
}

if (!existsSync(gameDir)) console.warn(`! Game dir not found (${gameDir}); names, recipes and version will be missing`)
const english = readEnglishThings(gameDir)
const nameOf = (p: string) => english.get(p)?.name ?? p
const overrides: Overrides = JSON.parse(readFileSync(join(import.meta.dirname, 'overrides.json'), 'utf8'))

const catalog = buildCatalog({
  prefabs,
  enums,
  english,
  recipes: readRecipes(gameDir, nameOf),
  overrides,
  gameVersion: readGameVersion(gameDir),
  extractedAt: new Date().toISOString(),
  hasIcon: (p) => iconSource(p) !== undefined,
})

const outDir = args.out!
const iconOut = join(outDir, 'icons')
if (existsSync(iconOut)) rmSync(iconOut, { recursive: true })
mkdirSync(iconOut, { recursive: true })
let icons = 0
// Items share the icon directory with devices; `Item*` and `Structure*` prefabs cannot collide.
for (const t of [...Object.values(catalog.devices), ...Object.values(catalog.items)]) {
  const src = iconSource(t.prefab)
  if (!src) continue
  await sharp(src).resize(64, 64).webp({ quality: 80 }).toFile(join(iconOut, `${t.prefab}.webp`))
  icons++
}
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')

// Report
const perCategory = new Map<string, number>()
for (const d of Object.values(catalog.devices)) perCategory.set(d.category, (perCategory.get(d.category) ?? 0) + 1)
console.log(`\nGame version: ${catalog.gameVersion}`)
console.log(`Devices: ${Object.keys(catalog.devices).length}, icons: ${icons}, logic types: ${Object.keys(catalog.logicTypes).length}`)
for (const c of catalog.categories) console.log(`  ${c.padEnd(18)} ${perCategory.get(c)}`)
const noBuild = Object.values(catalog.devices).filter((d) => !d.build).length
console.log(`Build items: ${Object.keys(catalog.items).length}${noBuild ? `, devices with no known build cost: ${noBuild}` : ''}`)
console.log(`Recipes: ${Object.entries(catalog.recipes).map(([m, r]) => `${nameOf(m)} ${r.length}`).join(', ')}`)

// Guards the hand-written port table in overrides.json against a game update moving under it.
// `ConnectionInsert` is Stationpedia's display copy of the connection list: it names no networks, so
// it cannot generate the ports, but its length says how many the structure really has. A count of 0
// means the port is deliberately synthetic — pipe-mounted devices join a network without owning an
// endpoint — so only a structure the game does count is worth disagreeing with.
const byPrefab = new Map(prefabs.map((p) => [p.prefab, p]))
for (const [prefab, ports] of Object.entries(overrides.ports ?? {})) {
  const p = byPrefab.get(prefab)
  if (!p) console.warn(`! Port override for unknown prefab: ${prefab}`)
  else if (p.connections.length > 0) console.warn(`! Stale port override (${prefab} now reports its own connections)`)
  else if (p.connectionCount > 0 && p.connectionCount !== ports.length) console.warn(`! Port override for ${prefab} declares ${ports.length}, game says ${p.connectionCount}`)
}

console.log(`\nWrote ${join(outDir, 'catalog.json')}`)
