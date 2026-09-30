import { useRef } from 'react'
import { useStore, toBlueprint } from '../store'
import { fromJson, toJson, BlueprintError } from '../model/serialize'
import { shareUrl } from '../model/shareLink'
import { downloadBlob, slug } from '../download'
import { emptyBlueprint } from '../model/blueprint'
import Link from './Link'

export default function Toolbar({
  onExamples,
  onExportPng,
  onShoppingList,
  onEditCopy,
  onBackToEditor,
  onPublish,
  onMyPublished,
  onHelp,
  notify,
  narrow,
  drawer,
  onToggleDrawer,
}: {
  onExamples: () => void
  onExportPng: () => void
  onShoppingList: () => void
  onEditCopy: () => void
  onBackToEditor: () => void
  onPublish: () => void
  onMyPublished: () => void
  onHelp: () => void
  notify: (msg: string) => void
  narrow: boolean
  drawer: 'palette' | 'inspector' | null
  onToggleDrawer: (which: 'palette' | 'inspector') => void
}) {
  const title = useStore((s) => s.meta.title)
  const readOnly = useStore((s) => s.readOnly)
  const source = useStore((s) => s.source)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const zonesLocked = useStore((s) => s.zonesLocked)
  const { load, undo, redo, setZonesLocked } = useStore.getState()
  const fileInput = useRef<HTMLInputElement>(null)

  const current = () => toBlueprint(useStore.getState())

  const exportJson = () => {
    const bp = current()
    downloadBlob(`${slug(bp.title)}.json`, new Blob([toJson(bp)], { type: 'application/json' }))
  }

  const importJson = async (file: File) => {
    try {
      load(fromJson(await file.text()))
      notify(`Loaded “${file.name}”`)
    } catch (e) {
      notify(e instanceof BlueprintError ? e.message : `Could not load file: ${e}`)
    }
  }

  const copyLink = async () => {
    // Always anchor the share link to the site root. Building it from the current
    // URL would produce `/b/<id>#bp=…` while viewing a published blueprint — a link
    // whose path and fragment claim two different documents.
    const url = shareUrl(current(), window.location.origin + '/')
    try {
      await navigator.clipboard.writeText(url)
      notify(`Share link copied (${Math.round(url.length / 1024)} KB)`)
    } catch {
      window.prompt('Copy this share link:', url)
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">
        Stationeers<span>prints</span>
      </div>
      <div className="toolbar-title" title={title}>
        {title}
      </div>
      {/*
        Pinned outside .toolbar-group, which scrolls horizontally on a narrow
        screen — the two ways to reach a sidebar must not be able to scroll away.
      */}
      {narrow && (
        <div className="toolbar-drawers">
          {!readOnly && (
            <button className={drawer === 'palette' ? 'active' : undefined} aria-pressed={drawer === 'palette'} onClick={() => onToggleDrawer('palette')}>
              + Add
            </button>
          )}
          <button className={drawer === 'inspector' ? 'active' : undefined} aria-pressed={drawer === 'inspector'} onClick={() => onToggleDrawer('inspector')}>
            Info
          </button>
        </div>
      )}
      {readOnly ? (
        <div className="toolbar-group">
          <span className="badge">
            {narrow ? 'Read-only' : source.kind === 'published' ? 'Published blueprint (read-only)' : 'Shared blueprint (read-only)'}
          </span>
          <button className="primary" onClick={onEditCopy}>
            Edit a copy
          </button>
          <button onClick={exportJson}>Download JSON</button>
          <button onClick={onExportPng}>Export PNG</button>
          <button onClick={onShoppingList} title="What you need to build this">
            Shopping list
          </button>
          <span className="sep" />
          {/*
            A read-only view is a dead end without these: the document on screen
            isn't yours, and there is no other way back to the one that is.
          */}
          <button onClick={onBackToEditor}>Back to editor</button>
          <Link to="/gallery" className="button">
            Gallery
          </Link>
          {/*
            The dialog, not a link to /help: navigating away unmounts the editor,
            and the answer someone came for shouldn't cost them their undo history.
          */}
          <button onClick={onHelp} title="How this works">
            Help
          </button>
        </div>
      ) : (
        <div className="toolbar-group">
          <button onClick={() => confirm('Start a new, empty blueprint? The current one stays in undo history.') && load(emptyBlueprint())}>New</button>
          <button onClick={onExamples}>Examples</button>
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <button onClick={exportJson}>Export JSON</button>
          <button onClick={onExportPng}>Export PNG</button>
          <button onClick={onShoppingList} title="What you need to build this">
            Shopping list
          </button>
          <button onClick={copyLink}>Copy share link</button>
          <button className="primary" onClick={onPublish}>
            Publish
          </button>
          <span className="sep" />
          <Link to="/gallery" className="button">
            Gallery
          </Link>
          <button onClick={onMyPublished}>Mine</button>
          <button onClick={onHelp} title="How this works">
            Help
          </button>
          <span className="sep" />
          <button
            className={zonesLocked ? 'active' : undefined}
            aria-pressed={zonesLocked}
            onClick={() => setZonesLocked(!zonesLocked)}
            title={zonesLocked ? 'Zones are frozen — click to unfreeze' : 'Freeze zones so they cannot be dragged or resized'}
          >
            {zonesLocked ? '🔒' : '🔓'} Zones
          </button>
          <span className="sep" />
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importJson(f)
          e.target.value = ''
        }}
      />
    </header>
  )
}
