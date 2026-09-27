// Helpers for writing example blueprints that don't hard-code port ids.
// Ports are named by spec (`Power`, `Data`, `Pipe:Output`, `Chute:Input`, `PipeLiquid:Output#1`)
// and resolved against the loaded catalog, so examples survive port layout changes between game versions.
import type { Blueprint, BpDeviceNode, BpEdge, BpNode, BpNoteNode, BpZoneNode, PortSide, SettingValue } from '../model/blueprint'
import type { Catalog, CatalogDevice, CatalogPort } from '../model/catalogTypes'
import { lookupDevice } from '../model/catalog'

export interface Link {
  a: string
  aPort: string
  b: string
  bPort: string
  /** Links sharing a group are alternatives: at least one must resolve. */
  group?: string
}

export interface Example {
  id: string
  stage: 'Early' | 'Early–mid' | 'Mid'
  summary: string
  title: string
  description: string
  nodes: BpNode[]
  links: Link[]
}

export const ref = (id: string): { ref: string } => ({ ref: id })

export function dev(
  id: string,
  prefab: string,
  x: number,
  y: number,
  opts: {
    label?: string
    settings?: Record<string, SettingValue>
    values?: Record<string, string>
    note?: string
    /** `@` network nodes only: which edge their single connector sits on. */
    portSide?: PortSide
    /** Fade this node's connections, so a hub with a lot of them recedes behind the logic. */
    dim?: boolean
  } = {},
): BpDeviceNode {
  return { id, type: 'device', prefab, x, y, ...opts }
}

/** A `@` network node. Its connector faces `side`, so edges meet it head-on instead of
 *  looping around the node: a hub drawn below its devices wants `top`. */
export function net(id: string, prefab: string, label: string, x: number, y: number, side: PortSide = 'top', dim = false): BpDeviceNode {
  return dev(id, prefab, x, y, { label, portSide: side, ...(dim ? { dim: true } : {}) })
}

export function note(id: string, step: number | undefined, text: string, x: number, y: number, width = 260, height = 130): BpNoteNode {
  return { id, type: 'note', x, y, text, width, height, ...(step !== undefined ? { step } : {}) }
}

/** The numbered how-to-build notes, laid out as one row on a shared baseline.
 *  Every example uses this so the notes always read left to right under the diagram. */
export function steps(x: number, y: number, texts: string[], opts: { width?: number; height?: number; gap?: number } = {}): BpNoteNode[] {
  const { width = 300, height = 140, gap = 20 } = opts
  return texts.map((text, i) => note(`n${i + 1}`, i + 1, text, x + i * (width + gap), y, width, height))
}

export function zone(id: string, title: string, x: number, y: number, width: number, height: number, color?: string): BpZoneNode {
  return { id, type: 'zone', title, x, y, width, height, ...(color ? { color } : {}) }
}

export function link(a: string, aPort: string, b: string, bPort: string): Link {
  return { a, aPort, b, bPort }
}

/** Power and data cable from a device to a cable network node. Devices without a power
 *  (or data) port just get the other one; Power+Data ports get a single edge. */
export function cable(device: string, network: string): Link[] {
  const group = `cable:${device}:${network}`
  return [
    { ...link(device, 'Power', network, 'Power'), group },
    { ...link(device, 'Data', network, 'Data'), group },
  ]
}

export class PortError extends Error {}

export function resolvePort(device: CatalogDevice, spec: string): CatalogPort {
  const m = spec.match(/^([A-Za-z]+)(?::([A-Za-z0-9]+))?(?:#(\d+))?$/)
  if (!m) throw new PortError(`Bad port spec "${spec}"`)
  const [, network, role, nth] = m
  const index = nth ? Number(nth) : 0
  const networkMatch = (p: CatalogPort) => p.network === network || (p.network === 'PowerAndData' && (network === 'Power' || network === 'Data'))

  let candidates = device.ports.filter(networkMatch)
  if (role) {
    const exact = candidates.filter((p) => p.role === role)
    // Some devices expose a single role-less port where a role was expected.
    candidates = exact.length ? exact : candidates.filter((p) => p.role === 'None')
  } else {
    const order = (p: CatalogPort) => (p.role === 'None' ? 0 : p.role.startsWith('Input') ? 1 : 2)
    candidates = [...candidates].sort((x, y) => order(x) - order(y))
  }
  const port = candidates[Math.min(index, candidates.length - 1)]
  if (!port) {
    throw new PortError(`${device.prefab} has no port matching "${spec}" (has: ${device.ports.map((p) => p.id).join(', ') || 'none'})`)
  }
  return port
}

/** Turns an example into a concrete blueprint for the given catalog. Unresolvable links are skipped and reported. */
export function instantiate(ex: Example, catalog: Catalog | null, onError: (message: string) => void = (m) => console.warn(`[example ${ex.id}] ${m}`)): Blueprint {
  const prefabs = new Map(ex.nodes.flatMap((n) => (n.type === 'device' ? [[n.id, n.prefab] as const] : [])))
  const edges: BpEdge[] = []
  const seen = new Set<string>()
  const groups = new Map<string, { resolved: boolean; errors: string[] }>()
  const fail = (e: unknown) => onError(e instanceof Error ? e.message : String(e))
  for (const l of ex.links) {
    try {
      const pa = prefabs.get(l.a)
      const pb = prefabs.get(l.b)
      if (!pa || !pb) throw new PortError(`Link references unknown node ${pa ? l.b : l.a}`)
      const a = resolvePort(lookupDevice(catalog, pa), l.aPort)
      const b = resolvePort(lookupDevice(catalog, pb), l.bPort)
      if (l.group) groups.set(l.group, { resolved: true, errors: [] })
      const key = [`${l.a}/${a.id}`, `${l.b}/${b.id}`].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ id: `e${edges.length + 1}`, source: l.a, sourceHandle: a.id, target: l.b, targetHandle: b.id })
    } catch (e) {
      if (!l.group) {
        fail(e)
        continue
      }
      const g = groups.get(l.group) ?? { resolved: false, errors: [] }
      g.errors.push(e instanceof Error ? e.message : String(e))
      groups.set(l.group, g)
    }
  }
  for (const [name, g] of groups) {
    if (!g.resolved) fail(new PortError(`${name}: nothing could be connected (${g.errors.join('; ')})`))
  }
  return {
    format: 'stationeersprints',
    version: 1,
    title: ex.title,
    author: 'Stationeersprints examples',
    description: ex.description,
    gameVersion: catalog?.gameVersion,
    nodes: ex.nodes,
    edges,
  }
}
