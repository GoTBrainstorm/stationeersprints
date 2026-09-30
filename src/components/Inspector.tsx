import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { iconUrl, isBuiltin, lookupDevice } from '../model/catalog'
import type { Catalog, CatalogDevice } from '../model/catalogTypes'
import { isRef, PORT_SIDES, type PortSide, type SettingValue } from '../model/blueprint'
import { BATCH_METHODS, nodeTitle, schemaFor, settableVars, slotVarsOf, varsOf, type Field } from '../model/settings'
import { edgesUsingNode, useStore, zonesFrozen, type AppNode, type DeviceNodeType, type NoteNodeType, type ZoneNodeType } from '../store'

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="row" title={hint}>
      <span className="row-label">{label}</span>
      {children}
    </label>
  )
}

type DeviceRef = { id: string; prefab: string; label?: string }

function deviceNodes(nodes: AppNode[]): DeviceRef[] {
  return nodes.flatMap((n) => (n.type === 'device' ? [{ id: n.id, prefab: n.data.prefab, label: n.data.label }] : []))
}

/** The device (or device type) a `var`/`slot`/`slotVar` field refers to. */
function targetOf(field: Field, settings: Record<string, SettingValue>, nodes: DeviceRef[], catalog: Catalog | null): CatalogDevice | null {
  if (!field.of) return null
  const v = settings[field.of]
  if (isRef(v)) {
    const n = nodes.find((x) => x.id === v.ref)
    return n ? lookupDevice(catalog, n.prefab) : null
  }
  if (typeof v === 'string' && v) return lookupDevice(catalog, v)
  return null
}

function VarSelect({ value, options, descriptions, onChange }: { value: string; options: string[]; descriptions?: Record<string, { description: string }>; onChange: (v: string) => void }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title={descriptions?.[value]?.description}>
      <option value="">—</option>
      {opts.map((o) => (
        <option key={o} value={o} title={descriptions?.[o]?.description}>
          {o}
        </option>
      ))}
    </select>
  )
}

function FieldEditor({ field, node, nodes, catalog, set }: { field: Field; node: DeviceNodeType; nodes: DeviceRef[]; catalog: Catalog | null; set: (key: string, v: SettingValue | undefined) => void }) {
  const value = node.data.settings[field.key]
  const others = nodes.filter((n) => n.id !== node.id)
  const title = (n: DeviceRef) => nodeTitle(n, catalog)

  switch (field.type) {
    case 'device':
      return (
        <select value={isRef(value) ? value.ref : ''} onChange={(e) => set(field.key, e.target.value ? { ref: e.target.value } : undefined)}>
          <option value="">— none —</option>
          {others.map((n) => (
            <option key={n.id} value={n.id}>
              {title(n)}
            </option>
          ))}
        </select>
      )
    case 'input': {
      // One select covers both kinds of input a logic chip accepts: another node
      // (option value = its id) or a fixed number. `__const` is the sentinel for
      // the latter — node ids are generated with an alphanumeric suffix, so it
      // cannot collide with one.
      const mode = isRef(value) ? value.ref : value === undefined || value === '' ? '' : '__const'
      return (
        <div className="input-field">
          <select
            value={mode}
            onChange={(e) => {
              const v = e.target.value
              set(field.key, v === '' ? undefined : v === '__const' ? 0 : { ref: v })
            }}
          >
            <option value="">— none —</option>
            <option value="__const">Constant value…</option>
            {others.map((n) => (
              <option key={n.id} value={n.id}>
                {title(n)}
              </option>
            ))}
          </select>
          {mode === '__const' && <input type="number" value={String(value)} onChange={(e) => set(field.key, Number(e.target.value))} />}
        </div>
      )
    }
    case 'prefab': {
      const onCanvas = [...new Set(nodes.map((n) => n.prefab))].filter((p) => !p.startsWith('@'))
      const all = catalog ? Object.values(catalog.devices).sort((a, b) => a.name.localeCompare(b.name)) : []
      return (
        <select value={typeof value === 'string' ? value : ''} onChange={(e) => set(field.key, e.target.value || undefined)}>
          <option value="">—</option>
          <optgroup label="On this blueprint">
            {onCanvas.map((p) => (
              <option key={p} value={p}>
                {lookupDevice(catalog, p).name}
              </option>
            ))}
          </optgroup>
          <optgroup label="All devices">
            {all.map((d) => (
              <option key={d.prefab} value={d.prefab}>
                {d.name}
              </option>
            ))}
          </optgroup>
        </select>
      )
    }
    case 'var': {
      const target = targetOf(field, node.data.settings, nodes, catalog)
      return (
        <VarSelect
          value={typeof value === 'string' ? value : ''}
          options={target ? varsOf(target, field.access) : []}
          descriptions={catalog?.logicTypes}
          onChange={(v) => set(field.key, v || undefined)}
        />
      )
    }
    case 'slotVar': {
      const target = targetOf(field, node.data.settings, nodes, catalog)
      return (
        <VarSelect
          value={typeof value === 'string' ? value : ''}
          options={target ? slotVarsOf(target) : []}
          descriptions={catalog?.slotLogicTypes}
          onChange={(v) => set(field.key, v || undefined)}
        />
      )
    }
    case 'slot': {
      const target = targetOf(field, node.data.settings, nodes, catalog)
      return (
        <select value={value === undefined ? '' : String(value)} onChange={(e) => set(field.key, e.target.value === '' ? undefined : Number(e.target.value))}>
          <option value="">—</option>
          {(target?.slots ?? []).map((s, i) => (
            <option key={i} value={i}>
              {i}: {s.name || s.type}
            </option>
          ))}
        </select>
      )
    }
    case 'batch':
      return (
        <select value={typeof value === 'string' ? value : ''} onChange={(e) => set(field.key, e.target.value || undefined)}>
          <option value="">—</option>
          {BATCH_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      )
    case 'number':
      return <input type="number" value={value === undefined ? '' : String(value)} onChange={(e) => set(field.key, e.target.value === '' ? undefined : Number(e.target.value))} />
    case 'text':
      return <input value={typeof value === 'string' ? value : ''} onChange={(e) => set(field.key, e.target.value || undefined)} />
    case 'code':
      return <textarea className="code" rows={10} spellCheck={false} value={typeof value === 'string' ? value : ''} onChange={(e) => set(field.key, e.target.value || undefined)} />
  }
}

function DeviceInspector({ node }: { node: DeviceNodeType }) {
  const catalog = useStore((s) => s.catalog)
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const updateData = useStore((s) => s.updateData)
  const device = lookupDevice(catalog, node.data.prefab, edgesUsingNode(edges, node.id))
  const fields = schemaFor(device)
  const refs = deviceNodes(nodes)
  const icon = iconUrl(device)
  const recipes = catalog?.recipes[device.prefab] ?? []
  const modes = Object.entries(device.modes)
  const values = node.data.values

  const setSetting = (key: string, v: SettingValue | undefined) => {
    const settings = { ...node.data.settings }
    if (v === undefined) delete settings[key]
    else settings[key] = v
    updateData(node.id, { settings })
  }
  const setValue = (key: string, v: string | undefined) => {
    const next = { ...values }
    if (v === undefined) delete next[key]
    else next[key] = v
    updateData(node.id, { values: next })
  }
  const available = settableVars(device).filter((v) => !(v in values))

  return (
    <>
      <div className="inspector-device">
        {icon && <img src={icon} alt="" />}
        <div>
          <h2>{device.name}</h2>
          <div className="muted mono">{device.prefab}</div>
        </div>
      </div>
      {device.description && <p className="description">{device.description}</p>}

      <section>
        <Row label="Label">
          <input value={node.data.label ?? ''} placeholder={device.name} onChange={(e) => updateData(node.id, { label: e.target.value || undefined })} />
        </Row>
        {isBuiltin(node.data.prefab) && (
          <>
            <Row label="Connector" hint="Which edge of the block the connection point sits on. Handy when the network node sits above or beside what it feeds.">
              <select value={node.data.portSide ?? 'bottom'} onChange={(e) => updateData(node.id, { portSide: e.target.value as PortSide })}>
                {PORT_SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Dim links" hint="Fade this network's connections so the logic and pipe runs read first. They stay visible, and a line comes back to full strength when you select it.">
              <input type="checkbox" checked={node.data.dim ?? false} onChange={(e) => updateData(node.id, { dim: e.target.checked || undefined })} />
            </Row>
          </>
        )}
      </section>

      {fields.length > 0 && (
        <section>
          <h3>Configuration</h3>
          {fields.map((field) => (
            <Row key={field.key} label={field.label}>
              <FieldEditor field={field} node={node} nodes={refs} catalog={catalog} set={setSetting} />
            </Row>
          ))}
        </section>
      )}

      {(available.length > 0 || Object.keys(values).length > 0) && (
        <section>
          <h3>Device settings</h3>
          <details className="help">
            <summary>What are these for?</summary>
            <p>
              These record how the device has to be configured once it is built — the values you would dial in on its own screen, or write to it from a logic chip. They are
              saved with the blueprint and shown on the node, so whoever rebuilds this knows the vent goes to <em>Outward</em> at 100&nbsp;kPa rather than just “there is a
              vent here”.
            </p>
            <p>
              Nothing is simulated: they are instructions for the builder, not a running system. The list offers only the values this device actually accepts. Most are free
              text because the game does not publish units or ranges — hover a setting’s name for its in-game description.
            </p>
          </details>
          {Object.entries(values).map(([k, v]) => (
            <Row key={k} label={k} hint={catalog?.logicTypes[k]?.description}>
              <div className="input-field">
                {k === 'Mode' && modes.length > 0 ? (
                  <select value={v} onChange={(e) => setValue(k, e.target.value)}>
                    <option value="">—</option>
                    {modes.map(([n, name]) => (
                      <option key={n} value={name}>
                        {n}: {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={v} onChange={(e) => setValue(k, e.target.value)} />
                )}
                <button className="icon-button" title="Remove" onClick={() => setValue(k, undefined)}>
                  ×
                </button>
              </div>
            </Row>
          ))}
          {available.length > 0 && (
            <select className="add-value" value="" onChange={(e) => e.target.value && setValue(e.target.value, '')}>
              <option value="">+ Add setting…</option>
              {available.map((v) => (
                <option key={v} value={v} title={catalog?.logicTypes[v]?.description}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </section>
      )}

      <section>
        <h3>Notes</h3>
        <textarea rows={3} value={node.data.note ?? ''} placeholder="Placement, orientation, gotchas…" onChange={(e) => updateData(node.id, { note: e.target.value || undefined })} />
      </section>

      {device.ports.length > 0 && (
        <section>
          <h3>Connections</h3>
          <ul className="port-list">
            {device.ports.map((p) => (
              <li key={p.id}>
                <span className={`port-dot port-${p.kind}`} /> {p.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipes.some((r) => r.temperature || r.pressure) && (
        <section>
          <h3>Recipes</h3>
          <table className="recipes">
            <thead>
              <tr>
                <th>Output</th>
                <th>Ingredients</th>
                <th>Temp (K)</th>
                <th>Pressure (kPa)</th>
              </tr>
            </thead>
            <tbody>
              {recipes
                .filter((r) => r.temperature || r.pressure)
                .map((r, i) => (
                  <tr key={i}>
                    <td>{r.outputName}</td>
                    <td>{Object.entries(r.ingredients).map(([k, v]) => `${k} ${v}`).join(', ')}</td>
                    <td>{r.temperature ? `${r.temperature.start}–${r.temperature.stop}` : ''}</td>
                    <td>{r.pressure ? `${r.pressure.start}–${r.pressure.stop}` : ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

function NoteInspector({ node }: { node: NoteNodeType }) {
  const updateData = useStore((s) => s.updateData)
  return (
    <>
      <h2>Note</h2>
      <section>
        <Row label="Step number">
          <input type="number" value={node.data.step ?? ''} onChange={(e) => updateData(node.id, { step: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Row>
        <textarea rows={10} value={node.data.text} onChange={(e) => updateData(node.id, { text: e.target.value })} />
      </section>
    </>
  )
}

const ZONE_COLORS: Record<string, string> = { Blue: '#5a7da8', Green: '#5f9a63', Orange: '#c9803a', Red: '#b35656', Grey: '#7a7f88' }

function ZoneInspector({ node }: { node: ZoneNodeType }) {
  const updateData = useStore((s) => s.updateData)
  return (
    <>
      <h2>Zone</h2>
      <section>
        <Row label="Title">
          <input value={node.data.title} onChange={(e) => updateData(node.id, { title: e.target.value })} />
        </Row>
        <Row label="Color">
          <select value={node.data.color ?? '#5a7da8'} onChange={(e) => updateData(node.id, { color: e.target.value })}>
            {Object.entries(ZONE_COLORS).map(([name, c]) => (
              <option key={c} value={c}>
                {name}
              </option>
            ))}
          </select>
        </Row>
      </section>
    </>
  )
}

function BlueprintInspector() {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)
  const catalog = useStore((s) => s.catalog)
  const readOnly = useStore((s) => s.readOnly)
  if (readOnly) {
    return (
      <>
        <h2>{meta.title}</h2>
        {meta.author && <p className="muted">by {meta.author}</p>}
        <p className="description pre">{meta.description}</p>
        <p className="muted">Select a device to see how it is configured.</p>
      </>
    )
  }
  return (
    <>
      <h2>Blueprint</h2>
      <section>
        <Row label="Title">
          <input value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} />
        </Row>
        <Row label="Author">
          <input value={meta.author} onChange={(e) => setMeta({ author: e.target.value })} />
        </Row>
        <h3>Description</h3>
        <textarea rows={8} value={meta.description} placeholder="What does this system do? What do you need before building it?" onChange={(e) => setMeta({ description: e.target.value })} />
      </section>
      <section className="help">
        <h3>How to use</h3>
        <ul>
          <li>Drag devices from the left onto the canvas.</li>
          <li>Drag between matching ports to connect cables, pipes and chutes. Use network nodes for shared networks.</li>
          <li>Configure logic chips here. Logic links (dashed arrows) are drawn from that configuration.</li>
          <li>Add numbered notes to explain the build step by step.</li>
          <li>Select and press Delete to remove. Ctrl+Z / Ctrl+Shift+Z to undo / redo.</li>
        </ul>
        {catalog && (
          <p className="muted">
            Catalog: game version {catalog.gameVersion}, {Object.keys(catalog.devices).length} devices.
          </p>
        )}
      </section>
    </>
  )
}

export default function Inspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const selected = useStore(useShallow((s) => s.nodes.filter((n) => n.selected && !(zonesFrozen(s) && n.type === 'zone'))))
  const readOnly = useStore((s) => s.readOnly)
  const deleteSelection = useStore((s) => s.deleteSelection)
  const node = selected.length === 1 ? selected[0] : null
  return (
    <aside className={`inspector drawer drawer-right${open ? ' drawer-open' : ''}`}>
      {/* Only ever visible in the drawer layout; the desktop sidebar can't be closed. */}
      <button className="icon-button drawer-close" onClick={onClose} aria-label="Close panel">
        ×
      </button>
      <fieldset disabled={readOnly}>
        {node?.type === 'device' ? (
          <DeviceInspector node={node} />
        ) : node?.type === 'note' ? (
          <NoteInspector node={node} />
        ) : node?.type === 'zone' ? (
          <ZoneInspector node={node} />
        ) : (
          <BlueprintInspector />
        )}
        {/*
          Delete is otherwise bound to a hardware key with no on-screen equivalent.
          Inside the fieldset so a read-only document can't fire it, and gated on
          `readOnly` as well: a reader can't delete, so offering the button is noise.
        */}
        {!readOnly && selected.length > 0 && (
          <section className="inspector-actions">
            <button onClick={deleteSelection}>Delete {selected.length > 1 ? `${selected.length} selected` : 'selected'}</button>
          </section>
        )}
      </fieldset>
    </aside>
  )
}
