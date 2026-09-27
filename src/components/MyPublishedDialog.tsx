import { useEffect, useState } from 'react'
import { ApiError, deletePublished, getPublished, getPublishedBatch, setPublishedVisibility } from '../api/client'
import {
  forgetPublished,
  loadPublished,
  rememberPublished,
  updatePublished,
  type PublishedRecord,
} from '../api/managementTokens'
import { parseBlueprintRef } from '../routes'
import Link from './Link'

/**
 * Everything this browser has published, from localStorage.
 *
 * Not a server-side list — there is no account to list against. A blueprint
 * published from another browser is not here unless its management key is
 * pasted in below, and the dialog says so rather than pretending otherwise.
 */
export default function MyPublishedDialog({ onClose, notify }: { onClose: () => void; notify: (msg: string) => void }) {
  const [records, setRecords] = useState<PublishedRecord[]>(() => loadPublished())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Ids the server no longer knows: deleted from another browser, or by a
  // moderator. Kept as state rather than dropped outright so the row can say so.
  const [missing, setMissing] = useState<string[]>([])

  // Visibility is the one thing about a published blueprint that changes after
  // the fact, and it changes on the server — a moderator approving a submission
  // never touches this browser. One batch request re-reads the whole list.
  useEffect(() => {
    const ids = loadPublished().map((r) => r.id)
    if (!ids.length) return
    let cancelled = false
    getPublishedBatch(ids)
      .then((page) => {
        if (cancelled) return
        for (const bp of page.items) updatePublished(bp.id, { visibility: bp.visibility, title: bp.title })
        const known = new Set(page.items.map((bp) => bp.id))
        setMissing(ids.filter((id) => !known.has(id)))
        setRecords(loadPublished())
      })
      .catch(() => {
        // Offline or a failing API: the stored list is still worth showing, and
        // every action below re-checks with the server anyway.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id)
    setError(null)
    try {
      await action()
    } catch (e) {
      // A 404 means it is already gone — from someone else's browser, or a
      // moderator. Drop the local record so the list stops lying.
      if (e instanceof ApiError && e.status === 404) {
        forgetPublished(id)
        setRecords(loadPublished())
        notify('That blueprint was already removed')
      } else {
        setError(e instanceof ApiError ? e.message : String(e))
      }
    } finally {
      setBusy(null)
    }
  }

  const unlist = (r: PublishedRecord) =>
    run(r.id, async () => {
      await setPublishedVisibility(r.id, r.token, 'UNLISTED')
      updatePublished(r.id, { visibility: 'UNLISTED' })
      setRecords(loadPublished())
      notify('Removed from the gallery')
    })

  const submitToGallery = (r: PublishedRecord) =>
    run(r.id, async () => {
      const bp = await setPublishedVisibility(r.id, r.token, 'PENDING')
      updatePublished(r.id, { visibility: bp.visibility })
      setRecords(loadPublished())
      notify('Submitted for review')
    })

  const remove = (r: PublishedRecord) => {
    if (!confirm(`Delete “${r.title}” permanently? Anyone with the link will stop being able to open it.`)) return
    return run(r.id, async () => {
      await deletePublished(r.id, r.token)
      forgetPublished(r.id)
      setRecords(loadPublished())
      notify('Blueprint deleted')
    })
  }

  const forget = (id: string) => {
    forgetPublished(id)
    setRecords(loadPublished())
    setMissing((m) => m.filter((x) => x !== id))
  }

  const restored = (record: PublishedRecord) => {
    rememberPublished(record)
    setRecords(loadPublished())
    setMissing((m) => m.filter((x) => x !== record.id))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Blueprints you published</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted small">
          Tracked in this browser only. Anything published elsewhere can be managed here by pasting its management key
          below.
        </p>
        {error && <p className="error">{error}</p>}
        {!records.length && <p className="muted">Nothing published from this browser yet.</p>}
        {records.map((r) => {
          const gone = missing.includes(r.id)
          return (
            <div className="published-row" key={r.id}>
              <div className="published-row-body">
                {gone ? <span>{r.title}</span> : <Link to={`/b/${r.id}`}>{r.title}</Link>}
                <span className="muted small">
                  {new Date(r.publishedAt).toLocaleDateString()} ·{' '}
                  {gone
                    ? 'no longer available'
                    : r.visibility === 'LISTED'
                      ? 'in the gallery'
                      : r.visibility === 'PENDING'
                        ? 'awaiting review'
                        : 'link only'}
                </span>
              </div>
              <div className="published-row-actions">
                {gone ? (
                  <button onClick={() => forget(r.id)}>Forget</button>
                ) : (
                  <>
                    {r.visibility === 'UNLISTED' ? (
                      <button disabled={busy === r.id} onClick={() => submitToGallery(r)}>
                        Submit to gallery
                      </button>
                    ) : (
                      <button disabled={busy === r.id} onClick={() => unlist(r)}>
                        Remove from gallery
                      </button>
                    )}
                    <button disabled={busy === r.id} onClick={() => remove(r)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        <RestoreForm onRestored={restored} notify={notify} />
      </div>
    </div>
  )
}

/**
 * The other half of the management key. Without this the key printed at publish
 * time is unusable anywhere but the browser that already has it — which is most
 * of the reason to write it down in the first place.
 */
function RestoreForm({
  onRestored,
  notify,
}: {
  onRestored: (r: PublishedRecord) => void
  notify: (msg: string) => void
}) {
  const [ref, setRef] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const id = parseBlueprintRef(ref)
    if (!id) {
      setError('That does not look like a blueprint link or id.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The server answers 404 for a key that doesn't match, exactly as it does
      // for an id that doesn't exist — so this can't be used to probe for ids.
      const bp = await getPublished(id, key.trim())
      onRestored({
        id: bp.id,
        token: key.trim(),
        title: bp.title,
        publishedAt: bp.createdAt,
        visibility: bp.visibility,
      })
      setRef('')
      setKey('')
      notify('Blueprint added to this browser')
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'No blueprint matched that link and key.'
          : e instanceof ApiError
            ? e.message
            : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="restore">
      <summary>Have a management key?</summary>
      <p className="muted small">
        Paste the link and the key you were given when publishing to manage that blueprint from this browser.
      </p>
      <div className="row">
        <label className="row-label" htmlFor="restore-ref">
          Link or id
        </label>
        <input id="restore-ref" value={ref} placeholder="https://…/b/xxxxxxxx" onChange={(e) => setRef(e.target.value)} />
      </div>
      <div className="row">
        <label className="row-label" htmlFor="restore-key">
          Key
        </label>
        <input id="restore-key" value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={busy || !ref.trim() || !key.trim()} onClick={submit}>
          {busy ? 'Checking…' : 'Add'}
        </button>
      </div>
    </details>
  )
}
