import { useMemo, useState } from 'react'
import { BUILTINS, iconUrl, searchDevices } from '../model/catalog'
import type { CatalogDevice } from '../model/catalogTypes'
import { useStore } from '../store'

export const DRAG_MIME = 'application/x-stationeersprints'

export type PaletteItem = { kind: 'device'; prefab: string } | { kind: 'note' } | { kind: 'zone' }

function DeviceEntry({ device, onAdd }: { device: CatalogDevice; onAdd: (item: PaletteItem) => void }) {
  const item: PaletteItem = { kind: 'device', prefab: device.prefab }
  const icon = iconUrl(device)
  return (
    <li
      className="palette-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDoubleClick={() => onAdd(item)}
      title={`${device.description}\n\n${device.prefab} — drag onto the canvas or double-click to add`}
    >
      {icon ? <img src={icon} alt="" draggable={false} /> : <span className="palette-icon-placeholder" />}
      <span>{device.name}</span>
    </li>
  )
}

function ToolEntry({ item, label, onAdd }: { item: PaletteItem; label: string; onAdd: (item: PaletteItem) => void }) {
  // Swatch colour comes from a class per tool; for the `@`-prefixed network nodes
  // that is the prefab without its `@`, which is not a valid class name.
  const swatch = item.kind === 'device' ? item.prefab.slice(1) : item.kind
  return (
    <li
      className="palette-item tool"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDoubleClick={() => onAdd(item)}
    >
      <span className={`palette-tool-swatch ${swatch}`} />
      <span>{label}</span>
    </li>
  )
}

export default function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  const catalog = useStore((s) => s.catalog)
  const readOnly = useStore((s) => s.readOnly)
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    if (!catalog) return []
    const results = searchDevices(catalog, query)
    return catalog.categories
      .map((c) => ({ category: c, devices: results.filter((d) => d.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.devices.length > 0)
  }, [catalog, query])

  if (readOnly) return null

  return (
    <aside className="palette">
      <input className="palette-search" placeholder="Search devices…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="palette-scroll">
        {!query && (
          <details open>
            <summary>Schematic</summary>
            <ul>
              {Object.values(BUILTINS).map((b) => (
                <ToolEntry key={b.prefab} item={{ kind: 'device', prefab: b.prefab }} label={b.name} onAdd={onAdd} />
              ))}
              <ToolEntry item={{ kind: 'note' }} label="Note / step" onAdd={onAdd} />
              <ToolEntry item={{ kind: 'zone' }} label="Zone (room, outside…)" onAdd={onAdd} />
            </ul>
          </details>
        )}
        {grouped.map((g) => (
          <details key={g.category} open={query !== ''}>
            <summary>
              {g.category} <span className="count">{g.devices.length}</span>
            </summary>
            <ul>
              {g.devices.map((d) => (
                <DeviceEntry key={d.prefab} device={d} onAdd={onAdd} />
              ))}
            </ul>
          </details>
        ))}
        {catalog && grouped.length === 0 && <p className="muted">No devices match “{query}”.</p>}
      </div>
    </aside>
  )
}
