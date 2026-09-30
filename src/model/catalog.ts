// Catalog access: loaded game devices plus built-in schematic helpers.
import type { Catalog, CatalogDevice, CatalogItem, CatalogPort, PortKind } from './catalogTypes'

/** Schematic-only pseudo devices, prefixed with `@` so they never clash with game prefabs. */
export const BUILTINS: Record<string, CatalogDevice> = {
  '@CableNetwork': builtin('@CableNetwork', 'Cable network', 'A shared power/data cable network. Everything connected here is on the same network.', [
    { id: 'PowerAndData-None-0', kind: 'PowerAndData', network: 'PowerAndData', role: 'None', label: 'Cable' },
  ]),
  '@PipeNetwork': builtin('@PipeNetwork', 'Pipe network', 'A shared gas pipe network.', [
    { id: 'Pipe-None-0', kind: 'Pipe', network: 'Pipe', role: 'None', label: 'Pipe' },
  ]),
  '@LiquidNetwork': builtin('@LiquidNetwork', 'Liquid pipe network', 'A shared liquid pipe network.', [
    { id: 'PipeLiquid-None-0', kind: 'PipeLiquid', network: 'PipeLiquid', role: 'None', label: 'Liquid pipe' },
  ]),
}

function builtin(prefab: string, name: string, description: string, ports: CatalogPort[]): CatalogDevice {
  return { prefab, hash: 0, name, description, category: 'Schematic', ports, logic: {}, slotLogic: {}, slots: [], modes: {} }
}

export function isBuiltin(prefab: string): boolean {
  return prefab.startsWith('@')
}

/** Insulation is a property of a gas or liquid pipe run; a cable network has no equivalent. */
export function isPipeNetwork(device: CatalogDevice): boolean {
  return isBuiltin(device.prefab) && device.ports.some((p) => p.kind === 'Pipe' || p.kind === 'PipeLiquid')
}

const KIND_BY_NETWORK: Record<string, PortKind> = {
  Power: 'Power',
  Data: 'Data',
  PowerAndData: 'PowerAndData',
  Pipe: 'Pipe',
  PipeLiquid: 'PipeLiquid',
  Chute: 'Chute',
}

/** Rebuilds a port from its stable id (`<network>-<role>-<n>`), used for devices missing from the catalog. */
export function portFromId(id: string): CatalogPort {
  const [network = 'Other', role = 'None'] = id.split('-')
  return { id, kind: KIND_BY_NETWORK[network] ?? 'Other', network, role, label: id }
}

export function lookupDevice(catalog: Catalog | null, prefab: string, usedHandles: string[] = []): CatalogDevice {
  const found = BUILTINS[prefab] ?? catalog?.devices[prefab]
  if (found) return found
  return {
    prefab,
    hash: 0,
    name: prefab,
    description: 'This device is not in the current catalog (it may be from a different game version).',
    category: 'Unknown',
    ports: [...new Set(usedHandles)].map(portFromId),
    logic: {},
    slotLogic: {},
    slots: [],
    modes: {},
  }
}

/** Like `lookupDevice`, an item from a different game version degrades to its bare prefab. */
export function lookupItem(catalog: Catalog | null, prefab: string): CatalogItem {
  return catalog?.items?.[prefab] ?? { prefab, name: prefab }
}

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`)
  if (!res.ok) throw new Error(`Could not load catalog (${res.status}). Run \`npm run extract\`.`)
  return res.json()
}

export function iconUrl(thing: { icon?: string }): string | undefined {
  return thing.icon ? `${import.meta.env.BASE_URL}${thing.icon}` : undefined
}

export function searchDevices(catalog: Catalog, query: string): CatalogDevice[] {
  const q = query.trim().toLowerCase()
  const all = Object.values(catalog.devices)
  if (!q) return all
  return all.filter((d) => d.name.toLowerCase().includes(q) || d.prefab.toLowerCase().includes(q))
}
