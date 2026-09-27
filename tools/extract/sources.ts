// Readers that normalize the different data sources into RawPrefab records.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type { BuildMaterial, EnumValue, Recipe, RecipeRange } from '../../src/model/catalogTypes.ts'

export type RawAccess = 'Read' | 'Write' | 'ReadWrite'

export interface RawPrefab {
  prefab: string
  hash: number
  name: string
  description: string
  isDevice: boolean
  connections: { network: string; role: string }[]
  logic: Record<string, RawAccess>
  slotLogic: Record<string, Record<string, RawAccess>>
  slots: { name: string; type: string }[]
  modes: Record<string, string>
  devicePins?: number
  /** Consumables from every build state, flattened but not yet summed. */
  buildStates: BuildMaterial[]
}

export interface RawEnums {
  logicTypes: Record<string, EnumValue>
  slotLogicTypes: Record<string, EnumValue>
}

export function streamingAssets(gameDir: string): string {
  return join(gameDir, 'rocketstation_Data', 'StreamingAssets')
}

// ---------------------------------------------------------------------------
// Stationpedia.json / Enums.json written by the StationeersStationpediaExtractor mod
// ---------------------------------------------------------------------------

/**
 * A structure is built up through a sequence of states, each consuming some items. `IsTool` entries
 * are the tool held to make the change, not a material, and `ToolExit` is the deconstruction tool —
 * neither is something you have to bring.
 */
function readBuildStates(structure: any): BuildMaterial[] {
  return (structure?.BuildStates ?? []).flatMap((state: any) =>
    (state.Tool ?? [])
      .filter((t: any) => !t.IsTool && t.Quantity != null)
      .map((t: any): BuildMaterial => ({ item: t.PrefabName, quantity: Number(t.Quantity) })),
  )
}

export function readStationpediaExport(dir: string): RawPrefab[] {
  const file = join(dir, 'Stationpedia.json')
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(data?.pages)) {
    throw new Error(`${file}: expected an object with a "pages" array`)
  }
  return data.pages
    .filter((p: any) => typeof p.PrefabName === 'string' && p.PrefabName !== '')
    .map((p: any): RawPrefab => {
      const modes: Record<string, string> = {}
      ;(p.ModeInsert ?? []).forEach((m: any, i: number) => {
        // LogicAccessTypes holds the mode's numeric value for most prefabs, but some
        // export a name there instead; those modes are numbered by position, which is
        // the order the game lists them in.
        const key = /^\d+$/.test(String(m.LogicAccessTypes)) ? String(m.LogicAccessTypes) : String(i)
        modes[key] = m.LogicName
      })
      return {
        prefab: p.PrefabName,
        hash: p.PrefabHash,
        name: p.Title ?? p.PrefabName,
        description: p.Description ?? '',
        isDevice: p.Device != null,
        connections: (p.Device?.ConnectionList ?? []).map(([network, role]: [string, string]) => ({ network, role })),
        logic: p.LogicInfo?.LogicTypes ?? {},
        slotLogic: p.LogicInfo?.LogicSlotTypes ?? {},
        slots: (p.Slots ?? []).map((s: any) => ({ name: s.SlotName, type: s.SlotClass })),
        modes,
        devicePins: p.Device?.DevicesLength,
        buildStates: readBuildStates(p.Structure),
      }
    })
}

function enumValues(listing: any): Record<string, EnumValue> {
  const out: Record<string, EnumValue> = {}
  for (const [name, v] of Object.entries<any>(listing?.values ?? {})) {
    if (v.deprecated) continue
    out[name] = { value: v.value, description: v.description ?? '' }
  }
  return out
}

export function readEnums(enums: any): RawEnums {
  const script = enums?.scriptEnums ?? {}
  return { logicTypes: enumValues(script.LogicType), slotLogicTypes: enumValues(script.LogicSlotType) }
}

export function readEnumsFile(dir: string): RawEnums {
  return readEnums(JSON.parse(readFileSync(join(dir, 'Enums.json'), 'utf8')))
}

// ---------------------------------------------------------------------------
// Plain game files in StreamingAssets
// ---------------------------------------------------------------------------

export function readGameVersion(gameDir: string): string {
  const file = join(streamingAssets(gameDir), 'version.ini')
  if (!existsSync(file)) return 'unknown'
  const m = readFileSync(file, 'utf8').match(/^UPDATEVERSION=(?:Update )?(.+)$/m)
  return m ? m[1].trim() : 'unknown'
}

/** Current localized names/descriptions from Language/english.xml. */
export function readEnglishThings(gameDir: string): Map<string, { name: string; description: string }> {
  const file = join(streamingAssets(gameDir), 'Language', 'english.xml')
  const out = new Map<string, { name: string; description: string }>()
  if (!existsSync(file)) return out
  const xml = new XMLParser({ isArray: (name) => name === 'RecordThing' }).parse(readFileSync(file, 'utf8'))
  for (const r of xml?.Language?.Things?.RecordThing ?? []) {
    if (typeof r.Key !== 'string') continue
    out.set(r.Key, { name: String(r.Value ?? r.Key), description: typeof r.Description === 'string' ? r.Description : '' })
  }
  return out
}

const RECIPE_FILES: Record<string, string> = {
  'advancedfurnace.xml': 'StructureAdvancedFurnace',
  'furnace.xml': 'StructureFurnace',
  'arcfurnace.xml': 'StructureArcFurnace',
}

function range(r: any): RecipeRange | undefined {
  if (r == null || r.Start == null || r.Stop == null) return undefined
  return { start: Number(r.Start), stop: Number(r.Stop) }
}

/** Smelting recipes (with temperature/pressure windows where the game defines them). */
export function readRecipes(gameDir: string, names: (prefab: string) => string): Record<string, Recipe[]> {
  const dataDir = join(streamingAssets(gameDir), 'Data')
  const out: Record<string, Recipe[]> = {}
  if (!existsSync(dataDir)) return out
  const parser = new XMLParser({ isArray: (name) => name === 'RecipeData' })
  const present = new Set(readdirSync(dataDir).map((f) => f.toLowerCase()))
  for (const [file, machine] of Object.entries(RECIPE_FILES)) {
    if (!present.has(file)) continue
    const xml = parser.parse(readFileSync(join(dataDir, file), 'utf8'))
    const root = Object.values<any>(xml?.GameData ?? {})[0]
    const recipes: Recipe[] = []
    for (const r of root?.RecipeData ?? []) {
      // A recipe lists its ingredients as arbitrary <Ore>quantity</Ore> style keys
      // alongside a few fixed ones, so the named fields are peeled off and whatever
      // numeric keys remain are the ingredients.
      const { Temperature, Pressure, Time: _time, Energy: _energy, ...rest } = r.Recipe ?? {}
      const ingredients: Record<string, number> = {}
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))) {
          ingredients[k] = Number(v)
        }
      }
      recipes.push({
        output: r.PrefabName,
        outputName: names(r.PrefabName),
        ingredients,
        temperature: range(Temperature),
        pressure: range(Pressure),
      })
    }
    out[machine] = recipes
  }
  return out
}
