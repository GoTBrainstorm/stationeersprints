// What to bring to build the blueprint. Derived from the canvas on open — see model/shoppingList.ts.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { iconUrl } from '../model/catalog'
import { shoppingList, toText, type ListEntry } from '../model/shoppingList'
import { downloadBlob, slug } from '../download'

function Rows({ entries, showCategory }: { entries: ListEntry[]; showCategory?: boolean }) {
  return (
    <tbody>
      {entries.map((e) => {
        const icon = iconUrl(e)
        return (
          <tr key={e.prefab}>
            <td className="shopping-icon">{icon ? <img src={icon} alt="" /> : <span className="palette-icon-placeholder" />}</td>
            <td className="shopping-qty">{e.count} ×</td>
            <td title={e.prefab}>{e.name}</td>
            {showCategory && <td className="muted">{e.category}</td>}
          </tr>
        )
      })}
    </tbody>
  )
}

export default function ShoppingListDialog({ onClose, notify }: { onClose: () => void; notify: (msg: string) => void }) {
  // Prefab strings, not node objects: useShallow compares elements with Object.is, and a selector
  // that minted a fresh object per node would never compare equal and would re-render forever.
  const prefabs = useStore(useShallow((s) => s.nodes.flatMap((n) => (n.type === 'device' ? [n.data.prefab] : []))))
  const catalog = useStore((s) => s.catalog)
  const title = useStore((s) => s.meta.title)
  const list = useMemo(() => shoppingList(prefabs, catalog), [prefabs, catalog])

  const text = () => toText(list, title || 'Blueprint')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text())
      notify('Shopping list copied')
    } catch {
      window.prompt('Copy this shopping list:', text())
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-narrow shopping" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shopping list</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>

        {list.devices.length === 0 ? (
          <p className="muted">Nothing on the canvas yet.</p>
        ) : (
          <>
            <section>
              <h3>
                Devices <span className="muted">({list.totalDevices})</span>
              </h3>
              <table className="shopping-table">
                <Rows entries={list.devices} showCategory />
              </table>
            </section>

            {list.materials.length > 0 && (
              <section>
                <h3>To procure</h3>
                <table className="shopping-table">
                  <Rows entries={list.materials} />
                </table>
              </section>
            )}

            {(list.unknown.length > 0 || list.noCost.length > 0) && (
              <p className="muted small shopping-caveat">
                {list.unknown.length > 0 &&
                  `${list.unknown.length} device${list.unknown.length === 1 ? ' is' : 's are'} not in the current catalog, so ${list.unknown.length === 1 ? 'its' : 'their'} cost is unknown. `}
                {list.noCost.length > 0 &&
                  `The game lists no build materials for ${list.noCost.length} device${list.noCost.length === 1 ? '' : 's'}. `}
                Cable, pipe and chute runs are never counted — only what each device itself is built from.
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button onClick={copy} disabled={list.devices.length === 0}>
            Copy
          </button>
          <button
            onClick={() => downloadBlob(`${slug(title)}-shopping-list.txt`, new Blob([text()], { type: 'text/plain' }))}
            disabled={list.devices.length === 0}
          >
            Download .txt
          </button>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
