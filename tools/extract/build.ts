// Pure transformation from normalized raw data to the editor catalog.
import type { Access, BuildMaterial, Catalog, CatalogDevice, CatalogItem, CatalogPort, PortKind, Recipe } from '../../src/model/catalogTypes.ts'
import type { RawAccess, RawEnums, RawPrefab } from './sources.ts'

export interface Overrides {
  /** First matching category wins; `match` entries are substrings of the prefab name. */
  categories: { name: string; match: string[] }[]
  /** Prefabs to leave out of the catalog. */
  hidden: string[]
}

export interface BuildInput {
  prefabs: RawPrefab[]
  enums: RawEnums
  english: Map<string, { name: string; description: string }>
  recipes: Record<string, Recipe[]>
  overrides: Overrides
  gameVersion: string
  extractedAt: string
  hasIcon: (prefab: string) => boolean
}

const KINDS: Record<string, PortKind> = {
  Power: 'Power',
  Data: 'Data',
  PowerAndData: 'PowerAndData',
  Pipe: 'Pipe',
  PipeLiquid: 'PipeLiquid',
  Chute: 'Chute',
}

const NETWORK_LABELS: Record<string, string> = {
  Power: 'Power',
  Data: 'Data',
  PowerAndData: 'Power+Data',
  Pipe: 'Pipe',
  PipeLiquid: 'Liquid',
  Chute: 'Chute',
}

const ROLE_LABELS: Record<string, string> = {
  None: '',
  Input: 'in',
  Input2: 'in 2',
  Output: 'out',
  Output2: 'out 2',
  Waste: 'waste',
}

const ACCESS: Record<RawAccess, Access> = { Read: 'r', Write: 'w', ReadWrite: 'rw' }

/** Removes Stationpedia rich text: <link=..><color=..>X</color></link>, {THING:Prefab}, {LINK:Page;Text}. */
export function stripMarkup(text: string, names: (prefab: string) => string): string {
  return text
    .replace(/\{THING:([^}]+)\}/g, (_, p) => names(p))
    .replace(/\{LINK:[^;}]*;([^}]*)\}/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export function buildPorts(connections: RawPrefab['connections']): CatalogPort[] {
  const counts = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const c of connections) totals.set(`${c.network}-${c.role}`, (totals.get(`${c.network}-${c.role}`) ?? 0) + 1)
  return connections.map((c) => {
    const key = `${c.network}-${c.role}`
    const n = counts.get(key) ?? 0
    counts.set(key, n + 1)
    const role = ROLE_LABELS[c.role] ?? c.role.toLowerCase()
    let label = [NETWORK_LABELS[c.network] ?? c.network, role].filter(Boolean).join(' ')
    if ((totals.get(key) ?? 0) > 1) label += ` ${n + 1}`
    return { id: `${key}-${n}`, kind: KINDS[c.network] ?? 'Other', network: c.network, role: c.role, label }
  })
}

export function categorize(prefab: string, overrides: Overrides): string {
  for (const c of overrides.categories) {
    if (c.match.some((m) => prefab.includes(m))) return c.name
  }
  return 'Other'
}

/** Code-point key order: deterministic across machines, unlike localeCompare's ICU locale. */
function sortKeys<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** Sums a structure's build states into one entry per item, ordered like `sortKeys` so re-extractions diff cleanly. */
export function buildMaterials(states: BuildMaterial[]): BuildMaterial[] {
  const totals: Record<string, number> = {}
  for (const m of states) totals[m.item] = (totals[m.item] ?? 0) + m.quantity
  return Object.entries(sortKeys(totals)).map(([item, quantity]) => ({ item, quantity }))
}

function mapAccess(rec: Record<string, RawAccess>): Record<string, Access> {
  const out: Record<string, Access> = {}
  for (const [k, v] of Object.entries(rec)) if (ACCESS[v]) out[k] = ACCESS[v]
  return sortKeys(out)
}

export function isSchematicDevice(p: RawPrefab, overrides: Overrides): boolean {
  if (!p.isDevice || !p.prefab.startsWith('Structure')) return false
  if (overrides.hidden.includes(p.prefab)) return false
  return p.connections.length > 0 || Object.keys(p.logic).length > 0
}

export function buildCatalog(input: BuildInput): Catalog {
  const { english, overrides } = input
  const rawNames = new Map(input.prefabs.map((p) => [p.prefab, p.name]))
  const nameOf = (prefab: string) => english.get(prefab)?.name ?? rawNames.get(prefab) ?? prefab

  const devices: Record<string, CatalogDevice> = {}
  for (const p of input.prefabs) {
    if (!isSchematicDevice(p, overrides)) continue
    const desc = english.get(p.prefab)?.description || p.description
    const slotLogic: Record<string, Record<string, Access>> = {}
    for (const [slot, rec] of Object.entries(p.slotLogic)) {
      const mapped = mapAccess(rec)
      if (Object.keys(mapped).length) slotLogic[slot] = mapped
    }
    const build = buildMaterials(p.buildStates)
    devices[p.prefab] = {
      prefab: p.prefab,
      hash: p.hash,
      name: stripMarkup(nameOf(p.prefab), nameOf),
      description: stripMarkup(desc, nameOf),
      category: categorize(p.prefab, overrides),
      icon: input.hasIcon(p.prefab) ? `data/icons/${p.prefab}.webp` : undefined,
      ports: buildPorts(p.connections),
      logic: mapAccess(p.logic),
      slotLogic,
      slots: p.slots,
      modes: p.modes,
      ...(p.devicePins ? { devicePins: p.devicePins } : {}),
      ...(build.length ? { build } : {}),
    }
  }

  // Only the items some device is actually built from; the rest of the game's item list is noise here.
  const items: Record<string, CatalogItem> = {}
  for (const d of Object.values(devices)) {
    for (const m of d.build ?? []) {
      items[m.item] ??= {
        prefab: m.item,
        name: stripMarkup(nameOf(m.item), nameOf),
        icon: input.hasIcon(m.item) ? `data/icons/${m.item}.webp` : undefined,
      }
    }
  }

  const sorted = sortKeys(devices)
  const used = new Set(Object.values(devices).map((d) => d.category))
  const categories = [...overrides.categories.map((c) => c.name), 'Other'].filter((c) => used.has(c))

  return {
    schema: 1,
    gameVersion: input.gameVersion,
    extractedAt: input.extractedAt,
    categories,
    logicTypes: sortKeys(input.enums.logicTypes),
    slotLogicTypes: sortKeys(input.enums.slotLogicTypes),
    devices: sorted,
    items: sortKeys(items),
    recipes: sortKeys(input.recipes),
  }
}
