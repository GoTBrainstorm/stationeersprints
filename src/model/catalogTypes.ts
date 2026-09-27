// Shape of public/data/catalog.json, produced by tools/extract and consumed by the editor.
// This file must stay free of runtime imports: it is shared with the Node extractor.

export type PortKind = 'Power' | 'Data' | 'PowerAndData' | 'Pipe' | 'PipeLiquid' | 'Chute' | 'Other'

export type Access = 'r' | 'w' | 'rw'

export interface CatalogPort {
  /** Stable id `<network>-<role>-<n>`, e.g. `Pipe-Input-0`. Used as React Flow handle id. */
  id: string
  kind: PortKind
  /** Raw game NetworkType, e.g. `PipeLiquid`, `Chute`, `LandingPad`. */
  network: string
  /** Raw game ConnectionRole: None, Input, Output, Input2, Output2, Waste, ... */
  role: string
  label: string
}

export interface CatalogSlot {
  name: string
  type: string
}

/** One consumable a device's build states require. Tools you hold are not consumed and are not listed. */
export interface BuildMaterial {
  /** Item prefab, e.g. `ItemKitSolarPanel`. Look it up in `Catalog.items`. */
  item: string
  quantity: number
}

/** An item that appears in some device's build cost. Not a device: it has no ports or logic. */
export interface CatalogItem {
  prefab: string
  name: string
  /** Relative to the site root, e.g. `data/icons/ItemKitSolarPanel.webp`. */
  icon?: string
}

export interface CatalogDevice {
  prefab: string
  hash: number
  name: string
  description: string
  category: string
  /** Relative to the site root, e.g. `data/icons/StructureSolarPanel.webp`. */
  icon?: string
  ports: CatalogPort[]
  logic: Record<string, Access>
  slotLogic: Record<string, Record<string, Access>>
  slots: CatalogSlot[]
  /** Mode value -> name, e.g. { "0": "Outward", "1": "Inward" } */
  modes: Record<string, string>
  /** Number of device pins (d0..dN) for circuit holders. */
  devicePins?: number
  /**
   * What it costs to build, summed over every build state. Absent when the game lists no
   * consumables for the structure at all, which is not the same as costing nothing.
   */
  build?: BuildMaterial[]
}

export interface EnumValue {
  value: number
  description: string
}

export interface RecipeRange {
  start: number
  stop: number
}

export interface Recipe {
  output: string
  outputName: string
  ingredients: Record<string, number>
  /** Kelvin */
  temperature?: RecipeRange
  /** kPa */
  pressure?: RecipeRange
}

export interface Catalog {
  schema: 1
  gameVersion: string
  extractedAt: string
  categories: string[]
  logicTypes: Record<string, EnumValue>
  slotLogicTypes: Record<string, EnumValue>
  devices: Record<string, CatalogDevice>
  /** Every item referenced by some device's `build`, keyed by item prefab. */
  items: Record<string, CatalogItem>
  /** Machine prefab -> recipes, e.g. StructureAdvancedFurnace -> [...] */
  recipes: Record<string, Recipe[]>
}
