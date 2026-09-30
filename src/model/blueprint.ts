// Serializable blueprint format (what goes into JSON files and share links).

export type SettingValue = string | number | { ref: string }

export const PORT_SIDES = ['top', 'right', 'bottom', 'left'] as const
export type PortSide = (typeof PORT_SIDES)[number]

export function isPortSide(v: unknown): v is PortSide {
  return PORT_SIDES.includes(v as PortSide)
}

export interface BpDeviceNode {
  id: string
  type: 'device'
  x: number
  y: number
  prefab: string
  label?: string
  /** Values of the device's schema fields (see settings.ts), e.g. { device: {ref:'n1'}, variable: 'Horizontal' } */
  settings?: Record<string, SettingValue>
  /** Logic values set on the device itself, e.g. { Mode: 'Inward', On: '1' } */
  values?: Record<string, string>
  /** Which edge the connector sits on, for the single-port `@` network nodes. Defaults to the role-derived side. */
  portSide?: PortSide
  /** Draw this node's connections faded, so a busy power/data hub recedes behind the logic. */
  dim?: boolean
  /**
   * Draw this pipe network's runs as insulated pipe. Annotation only: insulated and bare pipe join
   * the same network in game, so it never affects which ports may connect.
   */
  insulated?: boolean
  note?: string
}

export interface BpNoteNode {
  id: string
  type: 'note'
  x: number
  y: number
  text: string
  step?: number
  width?: number
  height?: number
}

export interface BpZoneNode {
  id: string
  type: 'zone'
  x: number
  y: number
  width: number
  height: number
  title: string
  color?: string
}

export type BpNode = BpDeviceNode | BpNoteNode | BpZoneNode

export interface BpEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Blueprint {
  format: 'stationeersprints'
  version: 1
  title: string
  author: string
  description: string
  gameVersion?: string
  nodes: BpNode[]
  edges: BpEdge[]
}

export function emptyBlueprint(): Blueprint {
  return { format: 'stationeersprints', version: 1, title: 'Untitled blueprint', author: '', description: '', nodes: [], edges: [] }
}

export function isRef(v: SettingValue | undefined): v is { ref: string } {
  return typeof v === 'object' && v !== null && typeof v.ref === 'string'
}
