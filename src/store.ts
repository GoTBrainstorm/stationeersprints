// Editor state: the React Flow graph, its undo history, and the conversion
// to and from the serializable blueprint format.
import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import type { Catalog, PortKind } from './model/catalogTypes'
import { emptyBlueprint, isPortSide, type Blueprint, type BpNode, type PortSide, type SettingValue } from './model/blueprint'
import { lookupDevice } from './model/catalog'
import { compatible, edgeKind } from './model/rules'

export type DeviceData = {
  prefab: string
  label?: string
  settings: Record<string, SettingValue>
  values: Record<string, string>
  portSide?: PortSide
  dim?: boolean
  insulated?: boolean
  note?: string
}
export type NoteData = { text: string; step?: number }
export type ZoneData = { title: string; color?: string }

export type DeviceNodeType = Node<DeviceData, 'device'>
export type NoteNodeType = Node<NoteData, 'note'>
export type ZoneNodeType = Node<ZoneData, 'zone'>
export type AppNode = DeviceNodeType | NoteNodeType | ZoneNodeType
export type AppEdge = Edge<{ kind: PortKind }>

export interface Meta {
  title: string
  author: string
  description: string
}

/**
 * Where the open document came from. Deliberately *not* part of the blueprint
 * format: a published id describes where a copy happens to be hosted, not the
 * drawing, and it would become a lie the moment anyone edited the document.
 * Same reasoning as `zonesLocked` — about the workspace, not the drawing.
 *
 * Also deliberately outside `Snapshot`, so undo can't restore a stale source.
 */
export type DocSource =
  | { kind: 'local' }
  | { kind: 'shareLink' }
  | { kind: 'published'; id: string }
  | { kind: 'copy'; from: string }

interface Snapshot {
  nodes: AppNode[]
  edges: AppEdge[]
  meta: Meta
}

interface State extends Snapshot {
  catalog: Catalog | null
  readOnly: boolean
  source: DocSource
  /**
   * Bumped by every `load()`. The canvas watches it to know a different document
   * is on screen and re-fits the view — undo and redo deliberately don't, because
   * having the viewport jump on every ctrl-Z would be worse than a stale one.
   */
  docEpoch: number
  zonesLocked: boolean
  past: Snapshot[]
  future: Snapshot[]
  lastCoalesceKey: string | null
  lastCoalesceAt: number

  setCatalog(c: Catalog): void
  onNodesChange(changes: NodeChange<AppNode>[]): void
  onEdgesChange(changes: EdgeChange<AppEdge>[]): void
  onConnect(c: Connection): void
  isValidConnection(c: Connection | AppEdge): boolean
  addNode(node: AppNode): void
  updateData(id: string, patch: Partial<DeviceData> | Partial<NoteData> | Partial<ZoneData>): void
  deleteSelection(): void
  setMeta(patch: Partial<Meta>): void
  load(bp: Blueprint, opts?: { readOnly?: boolean; source?: DocSource }): void
  setReadOnly(v: boolean): void
  setSource(s: DocSource): void
  setZonesLocked(v: boolean): void
  checkpoint(coalesceKey?: string): void
  undo(): void
  redo(): void
}

const HISTORY_LIMIT = 100

// Freezing zones is a workspace preference, not part of the blueprint, so it
// lives outside the undo history and outside toBlueprint() — but it should
// survive a reload, or you'd re-enable it every session.
const ZONES_LOCKED_KEY = 'stationeersprints:zoneslocked'

function storedZonesLocked(): boolean {
  try {
    return localStorage.getItem(ZONES_LOCKED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Whether zones behave as frozen backdrops right now. Read-only documents always
 * freeze them, whatever the workspace preference says: a reader can't move a zone
 * anyway, and letting them click one only swaps the device they were aiming at for
 * a backdrop in the inspector. Every consumer of `zonesLocked` goes through this —
 * reading the flag directly re-opens that hole.
 */
export function zonesFrozen(s: Pick<State, 'readOnly' | 'zonesLocked'>): boolean {
  return s.readOnly || s.zonesLocked
}

export function newId(prefix = 'n'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`
}

function portKind(catalog: Catalog | null, nodes: AppNode[], nodeId: string, handle: string | null | undefined): PortKind | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node || node.type !== 'device' || !handle) return null
  const port = lookupDevice(catalog, node.data.prefab, [handle]).ports.find((p) => p.id === handle)
  return port?.kind ?? null
}

export function edgesUsingNode(edges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[], id: string): string[] {
  const out: string[] = []
  for (const e of edges) {
    if (e.source === id && e.sourceHandle) out.push(e.sourceHandle)
    if (e.target === id && e.targetHandle) out.push(e.targetHandle)
  }
  return out
}

export function toBlueprint(s: Pick<State, 'nodes' | 'edges' | 'meta' | 'catalog'>): Blueprint {
  const nodes: BpNode[] = s.nodes.map((n): BpNode => {
    const x = Math.round(n.position.x)
    const y = Math.round(n.position.y)
    if (n.type === 'device') {
      const d = n.data
      return {
        id: n.id,
        type: 'device',
        x,
        y,
        prefab: d.prefab,
        ...(d.label ? { label: d.label } : {}),
        ...(Object.keys(d.settings).length ? { settings: d.settings } : {}),
        ...(Object.keys(d.values).length ? { values: d.values } : {}),
        ...(d.portSide ? { portSide: d.portSide } : {}),
        ...(d.dim ? { dim: true } : {}),
        ...(d.insulated ? { insulated: true } : {}),
        ...(d.note ? { note: d.note } : {}),
      }
    }
    if (n.type === 'note') {
      return {
        id: n.id,
        type: 'note',
        x,
        y,
        text: n.data.text,
        ...(n.data.step ? { step: n.data.step } : {}),
        ...(n.width ? { width: Math.round(n.width) } : {}),
        ...(n.height ? { height: Math.round(n.height) } : {}),
      }
    }
    return {
      id: n.id,
      type: 'zone',
      x,
      y,
      width: Math.round(n.width ?? 400),
      height: Math.round(n.height ?? 300),
      title: n.data.title,
      ...(n.data.color ? { color: n.data.color } : {}),
    }
  })
  return {
    format: 'stationeersprints',
    version: 1,
    ...s.meta,
    gameVersion: s.catalog?.gameVersion,
    nodes,
    edges: s.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? '', target: e.target, targetHandle: e.targetHandle ?? '' })),
  }
}

export function fromBlueprint(bp: Blueprint, catalog: Catalog | null): Snapshot {
  const nodes: AppNode[] = bp.nodes.map((n): AppNode => {
    const position = { x: n.x, y: n.y }
    if (n.type === 'device') {
      return {
        id: n.id,
        type: 'device',
        position,
        data: {
          prefab: n.prefab,
          label: n.label,
          settings: n.settings ?? {},
          values: n.values ?? {},
          portSide: isPortSide(n.portSide) ? n.portSide : undefined,
          dim: n.dim === true ? true : undefined,
          insulated: n.insulated === true ? true : undefined,
          note: n.note,
        },
      }
    }
    if (n.type === 'note') {
      return { id: n.id, type: 'note', position, data: { text: n.text, step: n.step }, ...(n.width ? { width: n.width } : {}), ...(n.height ? { height: n.height } : {}) }
    }
    return { id: n.id, type: 'zone', position, width: n.width, height: n.height, zIndex: -1, data: { title: n.title, color: n.color } }
  })
  const edges: AppEdge[] = bp.edges.map((e) => {
    const a = portKind(catalog, nodes, e.source, e.sourceHandle) ?? 'Other'
    const b = portKind(catalog, nodes, e.target, e.targetHandle) ?? a
    return { ...e, type: 'default', data: { kind: edgeKind(a, b) } }
  })
  return { nodes, edges, meta: { title: bp.title, author: bp.author, description: bp.description } }
}

function snapshot(s: Snapshot): Snapshot {
  return { nodes: s.nodes, edges: s.edges, meta: s.meta }
}

export const useStore = create<State>((set, get) => ({
  ...fromBlueprint(emptyBlueprint(), null),
  catalog: null,
  readOnly: false,
  source: { kind: 'local' },
  docEpoch: 0,
  zonesLocked: storedZonesLocked(),
  past: [],
  future: [],
  lastCoalesceKey: null,
  lastCoalesceAt: 0,

  setCatalog: (catalog) => set({ catalog }),

  checkpoint(coalesceKey) {
    const s = get()
    const now = Date.now()
    // Typing in a field or dragging a resizer fires a change per keystroke/frame.
    // Repeats under the same key within a second fold into the entry already pushed,
    // so one gesture costs one undo step.
    if (coalesceKey && coalesceKey === s.lastCoalesceKey && now - s.lastCoalesceAt < 1000) {
      set({ lastCoalesceAt: now })
      return
    }
    set({ past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [], lastCoalesceKey: coalesceKey ?? null, lastCoalesceAt: now })
  },

  undo() {
    const s = get()
    const prev = s.past.at(-1)
    if (!prev) return
    set({ ...prev, past: s.past.slice(0, -1), future: [snapshot(s), ...s.future], lastCoalesceKey: null })
  },

  redo() {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ ...next, past: [...s.past, snapshot(s)], future: s.future.slice(1), lastCoalesceKey: null })
  },

  onNodesChange(changes) {
    const s = get()
    // A shared blueprint still has to be inspectable and measurable: selection drives
    // the inspector, and React Flow reports its own measurements as `dimensions`.
    // Everything that would alter the document is dropped.
    let relevant = s.readOnly ? changes.filter((c) => c.type === 'select' || c.type === 'dimensions') : changes
    if (zonesFrozen(s)) {
      const zones = new Set(s.nodes.flatMap((n) => (n.type === 'zone' ? [n.id] : [])))
      relevant = relevant.filter((c) => !((c.type === 'position' || c.type === 'select') && zones.has(c.id)))
    }
    if (relevant.some((c) => c.type === 'remove')) get().checkpoint()
    else {
      // React Flow also emits `dimensions` on first measure; only a resizer drag sets `resizing`.
      // The coalesce key keeps one whole drag to a single history entry.
      for (const c of relevant) {
        if (c.type !== 'dimensions' || !c.resizing) continue
        get().checkpoint(`resize:${c.id}`)
        break
      }
    }
    set({ nodes: applyNodeChanges(relevant, get().nodes) })
  },

  onEdgesChange(changes) {
    const s = get()
    const relevant = s.readOnly ? changes.filter((c) => c.type === 'select') : changes
    if (relevant.some((c) => c.type === 'remove')) get().checkpoint()
    set({ edges: applyEdgeChanges(relevant, get().edges) })
  },

  isValidConnection(c) {
    const s = get()
    if (s.readOnly || c.source === c.target) return false
    const a = portKind(s.catalog, s.nodes, c.source, c.sourceHandle)
    const b = portKind(s.catalog, s.nodes, c.target, c.targetHandle)
    return a !== null && b !== null && compatible(a, b)
  },

  onConnect(c) {
    const s = get()
    if (!s.isValidConnection(c)) return
    const a = portKind(s.catalog, s.nodes, c.source, c.sourceHandle)!
    const b = portKind(s.catalog, s.nodes, c.target, c.targetHandle)!
    get().checkpoint()
    set({ edges: addEdge({ ...c, id: newId('e'), data: { kind: edgeKind(a, b) } }, get().edges) })
  },

  // The three mutators below re-check `readOnly` themselves rather than trusting
  // callers. Read-only documents are public and linkable, so hiding the controls
  // is not enough — anything that can change the document goes through here.
  addNode(node) {
    if (get().readOnly) return
    get().checkpoint()
    set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), { ...node, selected: true } as AppNode] })
  },

  updateData(id, patch) {
    if (get().readOnly) return
    get().checkpoint(`data:${id}`)
    set({ nodes: get().nodes.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n)) })
  },

  setMeta(patch) {
    if (get().readOnly) return
    get().checkpoint('meta')
    set({ meta: { ...get().meta, ...patch } })
  },

  /**
   * Delete the current selection. Pressing Delete goes through React Flow, which
   * drops the edges of a removed node for us; a button has to do that cleanup
   * itself or the graph keeps edges pointing at nodes that no longer exist.
   *
   * Frozen zones are skipped to match what the inspector considers selected —
   * they can still carry a stale `selected` flag from before they were frozen.
   */
  deleteSelection() {
    const s = get()
    if (s.readOnly) return
    const frozen = zonesFrozen(s)
    const doomed = new Set(s.nodes.flatMap((n) => (n.selected && !(frozen && n.type === 'zone') ? [n.id] : [])))
    const edges = s.edges.filter((e) => !e.selected && !doomed.has(e.source) && !doomed.has(e.target))
    // Nothing selected: don't spend an undo step on a no-op.
    if (!doomed.size && edges.length === s.edges.length) return
    get().checkpoint()
    set({ nodes: s.nodes.filter((n) => !doomed.has(n.id)), edges })
  },

  load(bp, opts) {
    const s = get()
    const loaded = fromBlueprint(bp, s.catalog)
    set({
      ...loaded,
      readOnly: opts?.readOnly ?? false,
      source: opts?.source ?? { kind: 'local' },
      docEpoch: s.docEpoch + 1,
      past: s.nodes.length ? [...s.past, snapshot(s)].slice(-HISTORY_LIMIT) : s.past,
      future: [],
      // A fresh document: never coalesce an edit here with one made before the load.
      lastCoalesceKey: null,
      lastCoalesceAt: 0,
    })
  },

  setReadOnly: (readOnly) => set({ readOnly }),

  setSource: (source) => set({ source }),

  setZonesLocked(zonesLocked) {
    try {
      localStorage.setItem(ZONES_LOCKED_KEY, zonesLocked ? '1' : '0')
    } catch {
      // Storage blocked: the toggle still works, it just won't be remembered.
    }
    // Drop any zone that is selected right now, so freezing can't leave one
    // behind in the inspector still accepting edits.
    const nodes = zonesLocked
      ? get().nodes.map((n) => (n.type === 'zone' && n.selected ? { ...n, selected: false } : n))
      : get().nodes
    set({ zonesLocked, nodes })
  },
}))
