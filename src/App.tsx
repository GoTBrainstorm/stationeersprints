import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './styles.css'
import DeviceNode from './components/DeviceNode'
import { NoteNode, ZoneNode } from './components/NoteNode'
import Palette, { DRAG_MIME, type PaletteItem } from './components/Palette'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import ExamplesDialog from './components/ExamplesDialog'
import PublishDialog from './components/PublishDialog'
import MyPublishedDialog from './components/MyPublishedDialog'
import HelpDialog from './components/HelpDialog'
import ShoppingListDialog from './components/ShoppingListDialog'
import Link from './components/Link'
import { ApiError, fetchBlueprintJson, getPublished } from './api/client'
import { loadCatalog } from './model/catalog'
import type { Catalog } from './model/catalogTypes'
import type { Blueprint } from './model/blueprint'
import { deriveLogicLinks } from './model/settings'
import { DOWNLOAD_PNG, renderPng } from './exportPng'
import { downloadBlob, slug } from './download'
import { validate } from './model/serialize'
import { fromHash, hashFromLocation } from './model/shareLink'
import { EXAMPLES, instantiate } from './examples'
import { navigate, useRoute } from './routes'
import GalleryPage from './pages/GalleryPage'
import HelpPage from './pages/HelpPage'
import NotFound from './pages/NotFound'
import { newId, toBlueprint, useStore, zonesFrozen, type AppEdge, type AppNode } from './store'

const AdminPage = lazy(() => import('./pages/AdminPage'))

const nodeTypes = { device: DeviceNode, note: NoteNode, zone: ZoneNode }
const AUTOSAVE_KEY = 'stationeersprints:autosave'

function Canvas() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const catalog = useStore((s) => s.catalog)
  const readOnly = useStore((s) => s.readOnly)
  const zonesLocked = useStore(zonesFrozen)
  const docEpoch = useStore((s) => s.docEpoch)
  const { onNodesChange, onEdgesChange, onConnect, isValidConnection, addNode, checkpoint } = useStore.getState()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const fittedEpoch = useRef(-1)

  // Fit the view once per loaded document, and only once React Flow has measured
  // the new nodes: fitting before that computes a viewport from zero-sized nodes
  // and lands in the top-left corner. `nodesInitialized` also flips while editing
  // (any new node is briefly unmeasured), which is what the epoch guard is for.
  useEffect(() => {
    if (!nodesInitialized || fittedEpoch.current === docEpoch) return
    fittedEpoch.current = docEpoch
    fitView({ padding: 0.15 })
  }, [nodesInitialized, docEpoch, fitView])

  // Frozen zones drop out of interaction entirely: React Flow must refuse the
  // drag itself (or a click-drag on a zone would pan the whole selection) and
  // refuse the click, so they can't be selected, edited or deleted by accident.
  // Read-only viewers always see them this way, so the drawing stays the subject.
  const flowNodes = useMemo(
    () => (zonesLocked ? nodes.map((n) => (n.type === 'zone' ? { ...n, draggable: false, selectable: false } : n)) : nodes),
    [nodes, zonesLocked],
  )

  // Logic links are derived from device settings on every render, never stored.
  // They are therefore inert on the canvas — deleting or reconnecting one would be
  // undone by the next render; the settings in the inspector are what to edit.
  const logicEdges = useMemo<AppEdge[]>(() => {
    const devices = nodes.flatMap((n) => (n.type === 'device' ? [{ id: n.id, ...n.data }] : []))
    return deriveLogicLinks(devices, catalog).map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      sourceHandle: 'logic-out',
      targetHandle: 'logic-in',
      label: l.label,
      className: 'edge-logic',
      animated: true,
      selectable: false,
      deletable: false,
      focusable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      zIndex: 1,
    }))
  }, [nodes, catalog])

  // Nodes the author has asked to fade. Selected as a joined string rather than an
  // array so dragging a node — which rebuilds `nodes` every frame — can't invalidate
  // the edge memo below and re-mint every edge object mid-drag.
  const dimmedKey = useStore((s) => s.nodes.flatMap((n) => (n.type === 'device' && n.data.dim ? [n.id] : [])).join('|'))
  const dimmed = useMemo(() => new Set(dimmedKey ? dimmedKey.split('|') : []), [dimmedKey])

  const allEdges = useMemo(
    () => [
      ...edges.map((e) => {
        const faded = dimmed.has(e.source) || dimmed.has(e.target)
        return { ...e, className: `edge-${e.data?.kind ?? 'Other'}${faded ? ' edge-dim' : ''}` }
      }),
      ...logicEdges,
    ],
    [edges, logicEdges, dimmed],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      addItem(JSON.parse(raw) as PaletteItem, screenToFlowPosition({ x: e.clientX, y: e.clientY }), addNode)
    },
    [screenToFlowPosition, addNode],
  )

  return (
    <div className="canvas" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={flowNodes}
        edges={allEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStart={() => checkpoint()}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        minZoom={0.1}
        colorMode="dark"
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </div>
  )
}

function addItem(item: PaletteItem, position: { x: number; y: number }, addNode: (n: AppNode) => void) {
  if (item.kind === 'device') {
    addNode({ id: newId(), type: 'device', position, data: { prefab: item.prefab, settings: {}, values: {} } })
  } else if (item.kind === 'note') {
    addNode({ id: newId(), type: 'note', position, width: 220, height: 120, data: { text: 'Describe this step…' } })
  } else {
    addNode({ id: newId(), type: 'zone', position, width: 500, height: 320, zIndex: -1, data: { title: 'Room' } })
  }
}

/**
 * The document `/` shows: whatever was last being edited, or an example to start
 * from. Used both on a cold start and when returning to the editor from a
 * published view, so the two can't drift apart.
 */
function localDocument(catalog: Catalog): Blueprint {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(AUTOSAVE_KEY)
  } catch {
    // Storage blocked (private mode, denied cookies): start as if there were no autosave.
  }
  if (saved) {
    try {
      return validate(JSON.parse(saved))
    } catch {
      try {
        localStorage.removeItem(AUTOSAVE_KEY)
      } catch {
        /* Best-effort: an unreadable autosave we also can't delete is still ignorable. */
      }
    }
  }
  return instantiate(EXAMPLES[0], catalog)
}

function Editor({ publishedId }: { publishedId: string | null }) {
  const [showExamples, setShowExamples] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showShopping, setShowShopping] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const catalog = useStore((s) => s.catalog)
  const { getNodes, screenToFlowPosition } = useReactFlow()

  const notify = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500)
  }, [])

  // Initial load: catalog, then published id > share link > autosave > first example.
  // A /b/:id document is fetched by its own effect below, so this one only picks a
  // starting document when there is no published id to honour.
  useEffect(() => {
    loadCatalog()
      .then((c) => {
        const { setCatalog, load } = useStore.getState()
        setCatalog(c)
        if (publishedId) return
        const hash = hashFromLocation(window.location.hash)
        if (hash) {
          try {
            load(fromHash(hash), { readOnly: true, source: { kind: 'shareLink' } })
          } catch (e) {
            notify(String(e instanceof Error ? e.message : e))
          }
        } else {
          load(localDocument(c))
        }
        useStore.setState({ past: [], future: [] })
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
    // publishedId is read once on mount; navigating to a different one is the
    // published-document effect's job, not a reason to redo the initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify])

  // The published document at /b/:id, and what happens when you leave it.
  //
  // Two fetches, not one: the metadata comes from the API, the document itself
  // from object storage, which in production is a different origin that never
  // wakes the Worker. Waits for the catalog, because loading a blueprint before
  // it lands would render every device as an unknown placeholder.
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    setLoadError(null)

    if (!publishedId) {
      // Left /b/:id — by the toolbar's button, or the browser's Back. The
      // published document is still in the store and read-only, so put the
      // document that was being edited back. Anything else (a copy forked from
      // it, a share link) is the user's current work and must not be replaced.
      if (useStore.getState().source.kind === 'published') {
        useStore.getState().load(localDocument(catalog))
        useStore.setState({ past: [], future: [] })
      }
      return
    }

    const run = async () => {
      try {
        const published = await getPublished(publishedId)
        const text = await fetchBlueprintJson(published.jsonUrl)
        if (cancelled) return
        useStore.getState().load(validate(JSON.parse(text)), {
          readOnly: true,
          source: { kind: 'published', id: published.id },
        })
        useStore.setState({ past: [], future: [] })
      } catch (e) {
        if (cancelled) return
        // A deleted blueprint is the expected failure here, not an exceptional
        // one — links outlive what they point at.
        setLoadError(
          e instanceof ApiError && e.status === 404
            ? 'That blueprint is no longer available. It may have been deleted by its author.'
            : e instanceof Error
              ? e.message
              : String(e),
        )
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [publishedId, catalog])

  // Opening another share link in the same tab.
  useEffect(() => {
    const onHash = () => {
      const hash = hashFromLocation(window.location.hash)
      if (!hash) return
      try {
        useStore.getState().load(fromHash(hash), { readOnly: true, source: { kind: 'shareLink' } })
      } catch (e) {
        notify(String(e instanceof Error ? e.message : e))
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [notify])

  // Autosave (editable blueprints only).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((s, prev) => {
      if (s.readOnly || !s.catalog || (s.nodes === prev.nodes && s.edges === prev.edges && s.meta === prev.meta)) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(toBlueprint(useStore.getState())))
        } catch {
          // Storage blocked or full: autosave is best-effort, editing continues.
        }
      }, 400)
    })
  }, [])

  // Keyboard undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select') || !(e.ctrlKey || e.metaKey)) return
      const { undo, redo, readOnly } = useStore.getState()
      if (readOnly) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportPng = useCallback(async () => {
    const rendered = await renderPng(getNodes(), DOWNLOAD_PNG)
    if (!rendered) return
    downloadBlob(`${slug(useStore.getState().meta.title)}.png`, rendered.blob)
  }, [getNodes])

  const editCopy = () => {
    const { setReadOnly, setSource, source } = useStore.getState()
    setReadOnly(false)
    // Record what this was forked from, so publishing it can fill in `derived_from`.
    if (source.kind === 'published') setSource({ kind: 'copy', from: source.id })
    else setSource({ kind: 'local' })
    // Leave /b/:id entirely, not just the fragment. Staying on that path would let
    // a reload re-fetch the published blueprint over the copy being edited, and
    // autosave (which resumes the moment readOnly clears) would be writing it.
    navigate('/', { replace: true })
    notify('You are now editing your own copy')
  }

  /**
   * Back to whatever was being edited, discarding nothing: the published
   * document was never editable, and the local one is still in autosave.
   */
  const backToEditor = () => {
    const { source, catalog: c } = useStore.getState()
    if (source.kind === 'published') {
      // A real navigation, so Back still works — the route effect restores the
      // local document once the path changes.
      navigate('/')
      return
    }
    // A share link: the path is already `/`, so nothing would change. Drop the
    // `#bp=…` fragment instead, or a reload would just reopen the shared copy.
    navigate('/', { replace: true })
    if (c) {
      useStore.getState().load(localDocument(c))
      useStore.setState({ past: [], future: [] })
    }
  }

  const onPaletteAdd = (item: PaletteItem) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    addItem(item, center, useStore.getState().addNode)
  }

  if (error) {
    return (
      <div className="fatal">
        <h1>Could not start</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="fatal">
        <h1>Blueprint unavailable</h1>
        <p>{loadError}</p>
        <p>
          <Link className="button primary" to="/">
            Open the editor
          </Link>{' '}
          <Link className="button" to="/gallery">
            Browse the gallery
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar
        onExamples={() => setShowExamples(true)}
        onExportPng={exportPng}
        onShoppingList={() => setShowShopping(true)}
        onEditCopy={editCopy}
        onBackToEditor={backToEditor}
        onPublish={() => setShowPublish(true)}
        onMyPublished={() => setShowMine(true)}
        onHelp={() => setShowHelp(true)}
        notify={notify}
      />
      <div className="main">
        <Palette onAdd={onPaletteAdd} />
        <Canvas />
        <Inspector />
      </div>
      <footer className="footer">
        <span>
          <span className="legend port-Power" /> Power <span className="legend port-Data" /> Data <span className="legend port-PowerAndData" /> Power+Data{' '}
          <span className="legend port-Pipe" /> Pipe <span className="legend port-PipeLiquid" /> Liquid <span className="legend port-Chute" /> Chute{' '}
          <span className="legend logic" /> Logic link
        </span>
        <span className="muted">{catalog ? `Stationeers ${catalog.gameVersion}` : 'Loading catalog…'} · Fan-made, not affiliated with RocketWerkz</span>
      </footer>
      {showExamples && <ExamplesDialog onClose={() => setShowExamples(false)} />}
      {showPublish && <PublishDialog onClose={() => setShowPublish(false)} notify={notify} />}
      {showMine && <MyPublishedDialog onClose={() => setShowMine(false)} notify={notify} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showShopping && <ShoppingListDialog onClose={() => setShowShopping(false)} notify={notify} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default function App() {
  const route = useRoute()
  if (route.name === 'gallery') return <GalleryPage />
  if (route.name === 'help') return <HelpPage />
  if (route.name === 'admin') {
    return (
      <Suspense fallback={<div className="fatal">Loading…</div>}>
        <AdminPage />
      </Suspense>
    )
  }
  if (route.name === 'notFound') return <NotFound />
  return (
    <ReactFlowProvider>
      <Editor publishedId={route.name === 'published' ? route.id : null} />
    </ReactFlowProvider>
  )
}
