// Per-device configuration schema and the logic links derived from it.
import type { Catalog, CatalogDevice } from './catalogTypes'
import { isRef, type SettingValue } from './blueprint'
import { lookupDevice } from './catalog'

export type FieldType =
  | 'device' // reference to another device node on the canvas
  | 'input' // reference to another logic node (its output) or a constant number
  | 'prefab' // a device type, used by batch readers/writers
  | 'var' // a LogicType of the device/prefab named by `of`
  | 'slot' // a slot index of the device/prefab named by `of`
  | 'slotVar' // a LogicSlotType of the device/prefab named by `of`
  | 'batch' // batch method
  | 'number'
  | 'text'
  | 'code' // IC10 source

export interface Field {
  key: string
  label: string
  type: FieldType
  of?: string
  access?: 'r' | 'w'
}

export const BATCH_METHODS = ['Average', 'Sum', 'Minimum', 'Maximum']

const f = (key: string, label: string, type: FieldType, extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra })

const reader = [f('device', 'Device', 'device'), f('variable', 'Variable', 'var', { of: 'device', access: 'r' })]
const writer = [f('input', 'Input', 'input'), f('device', 'Device', 'device'), f('variable', 'Variable', 'var', { of: 'device', access: 'w' })]
const twoInputs = [f('a', 'Input 1', 'input'), f('b', 'Input 2', 'input')]

/** Logic chips whose configuration lives in their in-game screen rather than in logic types. */
const LOGIC_SCHEMAS: Record<string, Field[]> = {
  StructureLogicReader: reader,
  StructureLogicWriter: writer,
  StructureLogicWriterSwitch: writer,
  StructureLogicBatchReader: [
    f('prefab', 'Device type', 'prefab'),
    f('variable', 'Variable', 'var', { of: 'prefab', access: 'r' }),
    f('method', 'Batch method', 'batch'),
  ],
  StructureLogicBatchWriter: [
    f('input', 'Input', 'input'),
    f('prefab', 'Device type', 'prefab'),
    f('variable', 'Variable', 'var', { of: 'prefab', access: 'w' }),
  ],
  StructureLogicSlotReader: [
    f('device', 'Device', 'device'),
    f('slot', 'Slot', 'slot', { of: 'device' }),
    f('slotVariable', 'Slot variable', 'slotVar', { of: 'device', access: 'r' }),
  ],
  StructureLogicBatchSlotReader: [
    f('prefab', 'Device type', 'prefab'),
    f('slot', 'Slot', 'slot', { of: 'prefab' }),
    f('slotVariable', 'Slot variable', 'slotVar', { of: 'prefab', access: 'r' }),
    f('method', 'Batch method', 'batch'),
  ],
  StructureLogicMath: twoInputs,
  StructureLogicCompare: twoInputs,
  StructureLogicMinMax: twoInputs,
  StructureLogicGate: twoInputs,
  StructureLogicSelect: [f('condition', 'Condition', 'input'), f('a', 'If true', 'input'), f('b', 'If false', 'input')],
  StructureLogicMathUnary: [f('a', 'Input', 'input')],
  StructureLogicMemory: [f('value', 'Stored value', 'number')],
  StructureLogicMirror: [f('device', 'Mirrored device', 'device')],
  StructureLogicHashGen: [f('text', 'Prefab / name', 'text')],
}

export function schemaFor(device: CatalogDevice): Field[] {
  const fields = [...(LOGIC_SCHEMAS[device.prefab] ?? [])]
  if (device.devicePins) {
    for (let i = 0; i < device.devicePins; i++) fields.push(f(`d${i}`, `d${i}`, 'device'))
    fields.push(f('code', 'IC10 code', 'code'))
  }
  return fields
}

/** Logic types a user may want to set on a device directly (not through logic). */
export function settableVars(device: CatalogDevice): string[] {
  return Object.entries(device.logic)
    .filter(([, a]) => a.includes('w'))
    .map(([k]) => k)
    .sort()
}

export function varsOf(device: CatalogDevice, access: 'r' | 'w' | undefined): string[] {
  return Object.entries(device.logic)
    .filter(([, a]) => !access || a.includes(access))
    .map(([k]) => k)
    .sort()
}

export function slotVarsOf(device: CatalogDevice): string[] {
  const all = new Set<string>()
  for (const rec of Object.values(device.slotLogic)) for (const k of Object.keys(rec)) all.add(k)
  return [...all].sort()
}

// ---------------------------------------------------------------------------
// Derived logic links
// ---------------------------------------------------------------------------

export interface LogicNode {
  id: string
  prefab: string
  label?: string
  settings?: Record<string, SettingValue>
}

export interface LogicLink {
  id: string
  source: string
  target: string
  label: string
}

/** Logic links implied by node settings; these are drawn as dashed arrows and never stored. */
export function deriveLogicLinks(nodes: LogicNode[], catalog: Catalog | null): LogicLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links: LogicLink[] = []
  for (const node of nodes) {
    const device = lookupDevice(catalog, node.prefab)
    const fields = schemaFor(device)
    const s = node.settings ?? {}
    const text = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '')
    for (const field of fields) {
      const value = s[field.key]
      const varField = fields.find((x) => x.type === 'var' && x.of === field.key)
      const slotVarField = fields.find((x) => x.type === 'slotVar' && x.of === field.key)
      const label = varField ? text(varField.key) : slotVarField ? text(slotVarField.key) : field.label
      const writes = varField?.access === 'w'
      const add = (from: string, to: string, lbl: string) => {
        if (!byId.has(from) || !byId.has(to) || from === to) return
        links.push({ id: `logic:${node.id}:${field.key}:${from}:${to}`, source: from, target: to, label: lbl })
      }
      if (field.type === 'device' && isRef(value)) {
        // Arrows follow the data, so the direction depends on what the chip does with
        // the device it names: a writer pushes to it, a reader pulls from it. An IC
        // housing's pins (d0..dN) can do either, so they are drawn pointing outwards.
        if (writes || /^d\d+$/.test(field.key)) add(node.id, value.ref, label)
        else add(value.ref, node.id, label)
      } else if (field.type === 'input' && isRef(value)) {
        add(value.ref, node.id, field.label)
      } else if (field.type === 'prefab' && typeof value === 'string' && value) {
        for (const other of nodes) {
          if (other.prefab !== value) continue
          if (writes) add(node.id, other.id, label)
          else add(other.id, node.id, label)
        }
      }
    }
  }
  return links
}

// ---------------------------------------------------------------------------
// Human readable summaries (shown on nodes)
// ---------------------------------------------------------------------------

export function nodeTitle(node: LogicNode, catalog: Catalog | null): string {
  return node.label || lookupDevice(catalog, node.prefab).name
}

export function formatValue(value: SettingValue | undefined, nodes: LogicNode[], catalog: Catalog | null): string {
  if (value === undefined || value === '') return '—'
  if (isRef(value)) {
    const target = nodes.find((n) => n.id === value.ref)
    return target ? nodeTitle(target, catalog) : '(missing)'
  }
  if (typeof value === 'string' && catalog?.devices[value]) return catalog.devices[value].name
  return String(value)
}

export function summarize(node: LogicNode & { values?: Record<string, string> }, nodes: LogicNode[], catalog: Catalog | null): string[] {
  const device = lookupDevice(catalog, node.prefab)
  const s = node.settings ?? {}
  const lines: string[] = []
  for (const field of schemaFor(device)) {
    if (field.type === 'code' || field.type === 'var' || field.type === 'slotVar' || field.type === 'slot') continue
    const value = s[field.key]
    if (value === undefined || value === '') continue
    const varField = schemaFor(device).find((x) => (x.type === 'var' || x.type === 'slotVar') && x.of === field.key)
    let text = formatValue(value, nodes, catalog)
    if (varField && s[varField.key]) text += ` → ${s[varField.key]}`
    lines.push(`${field.label}: ${text}`)
  }
  for (const [k, v] of Object.entries(node.values ?? {})) {
    if (v !== '') lines.push(`${k} = ${v}`)
  }
  return lines
}
