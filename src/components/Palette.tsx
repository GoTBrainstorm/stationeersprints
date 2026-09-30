import { useMemo, useState } from 'react'
import { BUILTINS, iconUrl, searchDevices } from '../model/catalog'
import type { CatalogDevice } from '../model/catalogTypes'
import { useStore } from '../store'

export const DRAG_MIME = 'application/x-stationeersprints'

export type PaletteItem = { kind: 'device'; prefab: string } | { kind: 'note' } | { kind: 'zone' }

function DeviceEntry({ device, onAdd, tapToAdd }: { device: CatalogDevice; onAdd: (item: PaletteItem) => void; tapToAdd: boolean }) {
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
      onClick={tapToAdd ? () => onAdd(item) : undefined}
      onDoubleClick={() => onAdd(item)}
      title={`${device.description}\n\n${device.prefab} — ${tapToAdd ? 'tap to add' : 'drag onto the canvas or double-click to add'}`}
    >
      {icon ? <img src={icon} alt="" draggable={false} /> : <span className="palette-icon-placeholder" />}
      <span>{device.name}</span>
    </li>
  )
}

function ToolEntry({ item, label, onAdd, tapToAdd }: { item: PaletteItem; label: string; onAdd: (item: PaletteItem) => void; tapToAdd: boolean }) {
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
      onClick={tapToAdd ? () => onAdd(item) : undefined}
      onDoubleClick={() => onAdd(item)}
    >
      <span className={`palette-tool-swatch ${swatch}`} />
      <span>{label}</span>
    </li>
  )
}

/**
 * `narrow` turns a single tap into an add. On a desktop that would be a
 * regression — you click a row to read its tooltip — but touch never fires the
 * HTML5 drag this panel is otherwise built around, and a double-tap is not
 * something anyone discovers.
 */
export default function Palette({ onAdd, narrow, open }: { onAdd: (item: PaletteItem) => void; narrow: boolean; open: boolean }) {
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
    <aside className={`palette drawer drawer-left${open ? ' drawer-open' : ''}`}>
      <input className="palette-search" placeholder="Search devices…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="palette-scroll">
        {!query && (
          <details open>
            <summary>Schematic</summary>
            <ul>
              {Object.values(BUILTINS).map((b) => (
                <ToolEntry key={b.prefab} item={{ kind: 'device', prefab: b.prefab }} label={b.name} onAdd={onAdd} tapToAdd={narrow} />
              ))}
              <ToolEntry item={{ kind: 'note' }} label="Note / step" onAdd={onAdd} tapToAdd={narrow} />
              <ToolEntry item={{ kind: 'zone' }} label="Zone (room, outside…)" onAdd={onAdd} tapToAdd={narrow} />
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
                <DeviceEntry key={d.prefab} device={d} onAdd={onAdd} tapToAdd={narrow} />
              ))}
            </ul>
          </details>
        ))}
        {catalog && grouped.length === 0 && <p className="muted">No devices match “{query}”.</p>}
      </div>
    </aside>
  )
}
