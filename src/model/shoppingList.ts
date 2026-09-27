// The bill of materials for a blueprint: what's on the canvas, and what you have to bring to build it.
//
// Derived on demand and never stored, like the logic links in settings.ts — a cached shopping list
// would be one more thing that can disagree with the drawing, and it would need a format version.
import { isBuiltin, lookupDevice, lookupItem } from './catalog'
import type { Catalog } from './catalogTypes'

export interface ListEntry {
  prefab: string
  name: string
  icon?: string
  count: number
  /** Catalog category, on device rows only. */
  category?: string
}

export interface ShoppingList {
  devices: ListEntry[]
  materials: ListEntry[]
  /** Prefabs missing from the catalog: counted as devices, but their build cost is unknowable. */
  unknown: string[]
  /** Catalog devices the game lists no consumables for, e.g. StructureRocketEngineTiny. */
  noCost: string[]
  totalDevices: number
}

/**
 * Cable, pipe and chute *runs* never appear: the editor draws those as `@`-prefixed network nodes,
 * which are schematic helpers rather than things you buy. Cable coil and pipe kits do appear when a
 * device's own build states consume them — an Air Conditioner really does cost two of each.
 */
export function shoppingList(prefabs: string[], catalog: Catalog | null): ShoppingList {
  const deviceCounts = new Map<string, number>()
  for (const prefab of prefabs) {
    if (isBuiltin(prefab)) continue
    deviceCounts.set(prefab, (deviceCounts.get(prefab) ?? 0) + 1)
  }

  const devices: ListEntry[] = []
  const materialCounts = new Map<string, number>()
  const unknown: string[] = []
  const noCost: string[] = []

  for (const [prefab, count] of deviceCounts) {
    const device = lookupDevice(catalog, prefab)
    devices.push({ prefab, name: device.name, icon: device.icon, count, category: device.category })
    if (!catalog?.devices[prefab]) {
      unknown.push(prefab)
      continue
    }
    if (!device.build?.length) {
      noCost.push(prefab)
      continue
    }
    for (const m of device.build) {
      materialCounts.set(m.item, (materialCounts.get(m.item) ?? 0) + m.quantity * count)
    }
  }

  // Catalog order groups the device list the way the palette presents it; unknown devices have no
  // category of their own and sort last.
  const rank = new Map((catalog?.categories ?? []).map((c, i) => [c, i]))
  devices.sort(
    (a, b) =>
      (rank.get(a.category!) ?? Infinity) - (rank.get(b.category!) ?? Infinity) ||
      a.name.localeCompare(b.name),
  )

  // By name alone: every kit is named "Kit (…)", so they cluster without needing to be classified.
  const materials = [...materialCounts]
    .map(([prefab, count]) => {
      const item = lookupItem(catalog, prefab)
      return { prefab, name: item.name, icon: item.icon, count }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { devices, materials, unknown, noCost, totalDevices: [...deviceCounts.values()].reduce((a, b) => a + b, 0) }
}

/** The plain-text rendering shared by the copy and download buttons. */
export function toText(list: ShoppingList, title: string): string {
  const lines = [title, '='.repeat(title.length), '']
  const section = (heading: string, entries: ListEntry[]) => {
    lines.push(heading)
    for (const e of entries) lines.push(`  ${e.count} x ${e.name}`)
    lines.push('')
  }
  if (list.devices.length) section(`Devices (${list.totalDevices})`, list.devices)
  if (list.materials.length) section('To procure', list.materials)
  if (list.unknown.length) lines.push(`Not in the catalog, build cost unknown: ${list.unknown.join(', ')}`)
  if (list.noCost.length) lines.push(`No known build cost: ${list.noCost.join(', ')}`)
  return lines.join('\n').trimEnd() + '\n'
}
