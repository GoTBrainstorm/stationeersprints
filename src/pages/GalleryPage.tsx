// Public gallery of published blueprints. Renders outside ReactFlowProvider —
// there is no canvas here, and mounting one would load the whole catalog for a
// page that only shows thumbnails.
import { useCallback, useEffect, useState } from 'react'
import Link from '../components/Link'
import { ApiError, getGallery } from '../api/client'
import type { PublishedBlueprint } from '../api/types'

export default function GalleryPage() {
  const [items, setItems] = useState<PublishedBlueprint[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Distinguishes "still loading the first page" from "there is nothing here",
  // which would otherwise both render as an empty grid.
  const [loadedOnce, setLoadedOnce] = useState(false)

  const loadPage = useCallback(async (after: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const page = await getGallery(after)
      // Append rather than replace: `after` is the cursor for the *next* page,
      // so this is always a continuation, never a refresh.
      setItems((prev) => (after ? [...prev, ...page.items] : page.items))
      setCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [])

  useEffect(() => {
    // Fetching the first page is exactly the "synchronizing with an external
    // system" the rule carves out; the synchronous setState it sees is the
    // shared loading flag, which is already true on the first pass.
    // oxlint-disable-next-line set-state-in-effect
    loadPage(null)
  }, [loadPage])

  return (
    <div className="page">
      <header className="toolbar">
        <div className="brand">
          Stationeers<span>prints</span>
        </div>
        <div className="toolbar-title">Gallery</div>
        <div className="toolbar-group">
          <Link to="/help" className="button">
            Help
          </Link>
          <Link to="/" className="button primary">
            Open the editor
          </Link>
        </div>
      </header>
      <div className="page-body">
        {error && <p className="error">{error}</p>}
        {loadedOnce && !items.length && !error && (
          <p className="muted">Nothing here yet. Publish a blueprint and submit it to the gallery.</p>
        )}
        <div className="gallery-grid">
          {items.map((bp) => (
            <Card key={bp.id} bp={bp} />
          ))}
        </div>
        {cursor && (
          <div className="gallery-more">
            <button onClick={() => loadPage(cursor)} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ bp }: { bp: PublishedBlueprint }) {
  return (
    <Link to={`/b/${bp.id}`} className="gallery-card" title={bp.description || bp.title}>
      {bp.imageUrl ? (
        <img
          src={bp.imageUrl}
          alt=""
          // Intrinsic size from the database, so the grid does not reflow as
          // images arrive; `loading="lazy"` keeps a long list to a few requests.
          width={bp.imageWidth ?? undefined}
          height={bp.imageHeight ?? undefined}
          loading="lazy"
        />
      ) : (
        <div className="gallery-thumb-empty" />
      )}
      <strong>{bp.title}</strong>
      <span className="muted small">
        {bp.author ? `${bp.author} · ` : ''}
        {bp.nodeCount} device{bp.nodeCount === 1 ? '' : 's'}
      </span>
    </Link>
  )
}
