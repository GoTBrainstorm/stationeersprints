// Moderation UI. Lazy-loaded from App so its code never ships to the ~100% of
// visitors who are not moderators.
//
// The admin token is held in component state only, never in localStorage: a
// moderation credential that survives a tab close is one that survives a stolen
// laptop, and typing it once per session is a small price.
import { useState } from 'react'
import Link from '../components/Link'
import type { PublishedBlueprint } from '../api/types'

async function adminFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(response.status === 403 ? 'Not authorized' : `Request failed (${response.status})`)
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [items, setItems] = useState<PublishedBlueprint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = async (withToken = token) => {
    setError(null)
    try {
      const data = await adminFetch<{ items: PublishedBlueprint[] }>('/api/admin/queue', withToken)
      setItems(data.items)
    } catch (e) {
      setItems(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const moderate = async (id: string, action: 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm('Delete this blueprint permanently? Its link will stop working.')) return
    setBusy(id)
    try {
      await adminFetch(`/api/admin/blueprints/${id}`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      // Whatever the action, the item leaves the pending queue.
      setItems((prev) => prev?.filter((b) => b.id !== id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <header className="toolbar">
        <div className="brand">
          Stationeers<span>prints</span>
        </div>
        <div className="toolbar-title">Moderation</div>
        <div className="toolbar-group">
          <Link to="/gallery" className="button">
            Gallery
          </Link>
          <Link to="/" className="button">
            Open the editor
          </Link>
        </div>
      </header>
      <div className="page-body">
        <form
          className="input-field"
          onSubmit={(e) => {
            e.preventDefault()
            refresh()
          }}
        >
          <input
            type="password"
            value={token}
            placeholder="Admin token"
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="primary" type="submit" disabled={!token}>
            Load queue
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {items && !items.length && <p className="muted">Nothing waiting for review.</p>}
        {items?.map((bp) => (
          <div className="admin-row" key={bp.id}>
            {bp.imageUrl && <img src={bp.imageUrl} alt="" loading="lazy" />}
            <div className="admin-row-body">
              <strong>{bp.title}</strong>
              <span className="muted small">
                {bp.author || 'anonymous'} · {bp.nodeCount} devices · {new Date(bp.createdAt).toLocaleString()}
              </span>
              {bp.description && <p className="small">{bp.description}</p>}
              <Link to={`/b/${bp.id}`} className="button">
                Open
              </Link>
            </div>
            <div className="admin-row-actions">
              <button className="primary" disabled={busy === bp.id} onClick={() => moderate(bp.id, 'approve')}>
                Approve
              </button>
              <button disabled={busy === bp.id} onClick={() => moderate(bp.id, 'reject')}>
                Reject
              </button>
              <button disabled={busy === bp.id} onClick={() => moderate(bp.id, 'delete')}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
