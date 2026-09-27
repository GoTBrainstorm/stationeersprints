import { memo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import type { CatalogPort } from '../model/catalogTypes'
import { PORT_SIDES, type PortSide } from '../model/blueprint'
import { iconUrl, lookupDevice } from '../model/catalog'
import { summarize } from '../model/settings'
import { edgesUsingNode, useStore, type DeviceNodeType } from '../store'

type Side = PortSide

function sideOf(port: CatalogPort): Side {
  if (port.role.startsWith('Input')) return 'left'
  if (port.role.startsWith('Output') || port.role === 'Waste') return 'right'
  return 'bottom'
}

const POSITIONS: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }

function DeviceNodeView({ id, data, selected }: NodeProps<DeviceNodeType>) {
  const catalog = useStore((s) => s.catalog)
  // Only the handle ids matter for devices missing from the catalog; join to keep the selector stable.
  const usedHandles = useStore((s) => edgesUsingNode(s.edges, id).join('|'))
  const summary = useStore((s) =>
    summarize({ id, ...data }, s.nodes.flatMap((n) => (n.type === 'device' ? [{ id: n.id, ...n.data }] : [])), s.catalog).join('\n'),
  )
  const device = lookupDevice(catalog, data.prefab, usedHandles ? usedHandles.split('|') : [])
  const icon = iconUrl(device)
  const builtin = device.category === 'Schematic'

  // Network nodes have a single unroled port, so the user picks its side; real
  // devices keep the input-left / output-right layout that mirrors the game.
  const override = builtin ? data.portSide : undefined
  const bySide: Record<Side, CatalogPort[]> = { top: [], right: [], bottom: [], left: [] }
  for (const p of device.ports) bySide[override ?? sideOf(p)].push(p)
  const sideRows = Math.max(bySide.left.length, bySide.right.length)

  // React Flow caches handle positions per node; moving one has to invalidate that
  // or edges keep pointing at where the connector used to be.
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => updateNodeInternals(id), [id, override, updateNodeInternals])

  return (
    <div
      className={`device-node${selected ? ' selected' : ''}${builtin ? ' builtin' : ''}${device.category === 'Unknown' ? ' unknown' : ''}`}
      style={{ minHeight: Math.max(builtin ? 40 : 70, 26 + sideRows * 22), paddingBottom: bySide.bottom.length && !builtin ? 20 : undefined }}
    >
      <Handle type="target" id="logic-in" position={Position.Top} className="logic-handle" isConnectable={false} style={{ left: 16 }} />
      <Handle type="source" id="logic-out" position={Position.Top} className="logic-handle" isConnectable={false} style={{ left: 'auto', right: 16 }} />
      <div className="device-header">
        {icon ? <img src={icon} alt="" className="device-icon" draggable={false} /> : <div className="device-icon placeholder" />}
        <div className="device-titles">
          <div className="device-title">{data.label || device.name}</div>
          {data.label && <div className="device-subtitle">{device.name}</div>}
        </div>
      </div>
      {summary && (
        <div className="device-summary">
          {summary.split('\n').map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {data.note && <div className="device-note">{data.note}</div>}
      {PORT_SIDES.map((side) =>
        bySide[side].map((p, i, arr) => {
          const pct = `${((i + 1) / (arr.length + 1)) * 100}%`
          const style = side === 'top' || side === 'bottom' ? { left: pct } : { top: pct }
          return (
            <Handle
              key={p.id}
              id={p.id}
              type="source"
              position={POSITIONS[side]}
              className={`port port-${p.kind}`}
              style={style}
              title={p.label}
            >
              {!builtin && <span className={`port-label port-label-${side}`}>{p.label}</span>}
            </Handle>
          )
        }),
      )}
    </div>
  )
}

export default memo(DeviceNodeView)
