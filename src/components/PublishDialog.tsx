import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useStore, toBlueprint } from '../store'
import { toJson } from '../model/serialize'
import { PUBLISH_PNG, renderPng } from '../exportPng'
import { ApiError, getConfig, publish } from '../api/client'
import { rememberPublished } from '../api/managementTokens'
import type { ConfigResponse, PublishResponse, Visibility } from '../api/types'
import { useTurnstile } from './useTurnstile'

type Phase = 'form' | 'working' | 'done'

export default function PublishDialog({ onClose, notify }: { onClose: () => void; notify: (msg: string) => void }) {
  const meta = useStore((s) => s.meta)
  const source = useStore((s) => s.source)
  const { getNodes } = useReactFlow()
  const { setMeta } = useStore.getState()

  const [phase, setPhase] = useState<Phase>('form')
  const [gallery, setGallery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PublishResponse | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstile = useTurnstile(config?.requireTurnstile ? config.turnstileSiteKey : null, turnstileRef)

  useEffect(() => {
    getConfig().then(setConfig, (e: ApiError) => setError(e.message))
  }, [])

  const blocked = !!config?.requireTurnstile && !turnstile.token

  const onPublish = async () => {
    setPhase('working')
    setError(null)
    try {
      const bp = toBlueprint(useStore.getState())
      // Rendered from the live canvas, so the preview is what the author sees —
      // capped well below the server's limits rather than at them.
      const rendered = await renderPng(getNodes(), PUBLISH_PNG)
      const visibility: Visibility = gallery ? 'PENDING' : 'UNLISTED'
      const response = await publish({
        json: toJson(bp),
        preview: rendered?.blob ?? null,
        visibility,
        turnstileToken: turnstile.token ?? undefined,
        derivedFrom: source.kind === 'copy' ? source.from : null,
      })
      // Store the token before anything else can fail: without it the publisher
      // can never take this down, and it is never shown again.
      rememberPublished({
        id: response.blueprint.id,
        token: response.managementToken,
        title: response.blueprint.title,
        publishedAt: response.blueprint.createdAt,
        visibility: response.blueprint.visibility,
      })
      useStore.getState().setSource({ kind: 'published', id: response.blueprint.id })
      setResult(response)
      setPhase('done')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setPhase('form')
    }
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(`${what} copied`)
    } catch {
      window.prompt(`Copy this ${what.toLowerCase()}:`, text)
    }
  }

  return (
    <div className="modal-backdrop" onClick={phase === 'working' ? undefined : onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{phase === 'done' ? 'Published' : 'Publish blueprint'}</h2>
          <button className="icon-button" onClick={onClose} disabled={phase === 'working'}>
            ×
          </button>
        </div>

        {phase === 'done' && result ? (
          <Published result={result} onCopy={copy} onClose={onClose} />
        ) : (
          <>
            <p className="muted">
              Publishing uploads a copy of this blueprint and gives you a short link. Published blueprints cannot be
              edited — republish to change one.
            </p>
            <div className="row">
              <label className="row-label" htmlFor="pub-title">
                Title
              </label>
              <input
                id="pub-title"
                value={meta.title}
                maxLength={120}
                onChange={(e) => setMeta({ title: e.target.value })}
              />
            </div>
            <div className="row">
              <label className="row-label" htmlFor="pub-author">
                Author
              </label>
              <input
                id="pub-author"
                value={meta.author}
                maxLength={60}
                placeholder="Optional"
                onChange={(e) => setMeta({ author: e.target.value })}
              />
            </div>
            <div className="row">
              <label className="row-label" htmlFor="pub-description">
                Description
              </label>
              <textarea
                id="pub-description"
                value={meta.description}
                maxLength={2000}
                rows={4}
                placeholder="Optional. Shown on the gallery card and in link previews."
                onChange={(e) => setMeta({ description: e.target.value })}
              />
            </div>

            <label className="checkbox">
              <input type="checkbox" checked={gallery} onChange={(e) => setGallery(e.target.checked)} />
              <span>
                Submit to the public gallery
                <small className="muted">
                  Reviewed before it appears. Either way you get a link you can share right away.
                </small>
              </span>
            </label>

            <p className="muted small">
              Don’t publish anything you wouldn’t put on a public web page — the title, description, author name and
              every note in the drawing become public.
            </p>

            {config?.requireTurnstile && <div className="turnstile" ref={turnstileRef} />}
            {(error || turnstile.error) && <p className="error">{error ?? turnstile.error}</p>}

            <div className="modal-actions">
              <button onClick={onClose} disabled={phase === 'working'}>
                Cancel
              </button>
              <button className="primary" onClick={onPublish} disabled={phase === 'working' || blocked}>
                {phase === 'working' ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Published({
  result,
  onCopy,
  onClose,
}: {
  result: PublishResponse
  onCopy: (text: string, what: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="row">
        <span className="row-label">Link</span>
        <div className="input-field">
          <input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="primary" onClick={() => onCopy(result.url, 'Link')}>
            Copy
          </button>
        </div>
      </div>

      {result.blueprint.visibility === 'PENDING' && (
        <p className="muted">
          Submitted to the gallery. It will appear there once it has been reviewed; the link above works now.
        </p>
      )}

      {/*
        The only copy of this token outside localStorage is the one the user
        takes now. Saying so plainly is the whole mitigation for having no
        accounts — there is no reset, no email, no support channel.
      */}
      <div className="notice">
        <strong>Keep this management key</strong>
        <p className="muted">
          It is the only way to unlist or delete this blueprint. It is saved in this browser, so you don’t need it
          here — keep it to manage this blueprint from another browser, under <em>Mine → Have a management key?</em>.
          It cannot be recovered if it is lost.
        </p>
        <div className="input-field">
          <input readOnly value={result.managementToken} onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => onCopy(result.managementToken, 'Management key')}>Copy</button>
        </div>
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}
