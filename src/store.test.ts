// History behaviour of the editor store: what does and does not become an undo step.
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyBlueprint, type Blueprint, type BpDeviceNode } from './model/blueprint'
import { toBlueprint, useStore } from './store'

const withNote = (id: string, text = ''): Blueprint => ({
  ...emptyBlueprint(),
  nodes: [{ id, type: 'note', x: 0, y: 0, text }],
  edges: [],
})

const withZone = (id: string): Blueprint => ({
  ...emptyBlueprint(),
  nodes: [{ id, type: 'zone', x: 0, y: 0, width: 200, height: 200, title: 'Zone' }],
  edges: [],
})

/** Load a document and start from an empty history, as the initial load does in App. */
function start(bp: Blueprint) {
  useStore.getState().load(bp)
  useStore.setState({ past: [], future: [] })
}

describe('store history', () => {
  beforeEach(() => start(withNote('n1')))

  it('coalesces rapid edits to one node into a single undo step', () => {
    const { updateData } = useStore.getState()
    updateData('n1', { text: 'a' })
    updateData('n1', { text: 'ab' })
    expect(useStore.getState().past).toHaveLength(1)
  })

  it('does not coalesce an edit with one made before a load', () => {
    const { updateData, load } = useStore.getState()
    updateData('n1', { text: 'a' })
    load(withNote('n1', 'loaded'))
    updateData('n1', { text: 'b' })
    // The edit before the load, the load itself, and the edit after it.
    expect(useStore.getState().past).toHaveLength(3)
    useStore.getState().undo()
    expect(useStore.getState().nodes[0].data.text).toBe('loaded')
  })

  it('makes a resizer drag undoable as one step, ignoring the first measurement', () => {
    const { onNodesChange } = useStore.getState()
    // React Flow's own first measure: no `resizing`, and it only fills in `measured`.
    onNodesChange([{ id: 'n1', type: 'dimensions', dimensions: { width: 200, height: 100 } }])
    expect(useStore.getState().past).toHaveLength(0)

    // What NodeResizer emits while dragging: `resizing`, and `setAttributes` to write width/height.
    const drag = (width: number) =>
      onNodesChange([{ id: 'n1', type: 'dimensions', resizing: true, setAttributes: true, dimensions: { width, height: 100 } }])
    drag(210)
    drag(260)
    expect(useStore.getState().past).toHaveLength(1)
    expect(useStore.getState().nodes[0].width).toBe(260)

    useStore.getState().undo()
    expect(useStore.getState().nodes[0].width).toBeUndefined()
  })
})

describe('read-only enforcement', () => {
  beforeEach(() => {
    useStore.getState().load(withNote('n1', 'original'), { readOnly: true })
    useStore.setState({ past: [], future: [] })
  })

  // Read-only is enforced here rather than by hiding controls, because published
  // blueprints are public and linkable — every mutator is a potential entry point.
  it('refuses document mutations and records no history', () => {
    const { updateData, setMeta, addNode } = useStore.getState()
    updateData('n1', { text: 'changed' })
    setMeta({ title: 'changed' })
    addNode({ id: 'n2', type: 'note', position: { x: 0, y: 0 }, data: { text: 'new' } })

    const s = useStore.getState()
    expect(s.nodes).toHaveLength(1)
    expect(s.nodes[0].data.text).toBe('original')
    expect(s.meta.title).toBe('Untitled blueprint')
    expect(s.past).toHaveLength(0)
  })

  it('allows the same mutations once the user edits a copy', () => {
    useStore.getState().setReadOnly(false)
    useStore.getState().updateData('n1', { text: 'changed' })
    expect(useStore.getState().nodes[0].data.text).toBe('changed')
  })

  // A reader can't move a zone in any case; refusing the selection too keeps a
  // click meant for a device from landing on the backdrop drawn behind it.
  it('freezes zones regardless of the workspace preference', () => {
    useStore.setState({ zonesLocked: false })
    useStore.getState().load(withZone('z1'), { readOnly: true })
    useStore.getState().onNodesChange([{ id: 'z1', type: 'select', selected: true }])
    expect(useStore.getState().nodes[0].selected).toBeFalsy()

    // …and unfreezes once the document is the reader's own copy.
    useStore.getState().setReadOnly(false)
    useStore.getState().onNodesChange([{ id: 'z1', type: 'select', selected: true }])
    expect(useStore.getState().nodes[0].selected).toBe(true)
  })
})

describe('document source', () => {
  it('defaults to local and resets on every load that does not set one', () => {
    useStore.getState().load(withNote('n1'), { source: { kind: 'published', id: 'A7xm2KpQ' } })
    expect(useStore.getState().source).toEqual({ kind: 'published', id: 'A7xm2KpQ' })

    useStore.getState().load(withNote('n1'))
    expect(useStore.getState().source).toEqual({ kind: 'local' })
  })

  // It lives outside Snapshot on purpose: undoing past a load must not resurrect
  // a source that claims the document is a published one it no longer matches.
  it('is not restored by undo', () => {
    useStore.getState().load(withNote('n1'), { source: { kind: 'published', id: 'A7xm2KpQ' } })
    useStore.getState().setSource({ kind: 'copy', from: 'A7xm2KpQ' })
    useStore.getState().undo()
    expect(useStore.getState().source).toEqual({ kind: 'copy', from: 'A7xm2KpQ' })
  })
})

describe('document epoch', () => {
  it('advances on every load, so the canvas can tell a new document from an edit', () => {
    const start = useStore.getState().docEpoch
    useStore.getState().load(withNote('n1'))
    expect(useStore.getState().docEpoch).toBe(start + 1)
    useStore.getState().load(withNote('n2'))
    expect(useStore.getState().docEpoch).toBe(start + 2)
  })

  // Re-fitting the view on every ctrl-Z would be worse than leaving it alone.
  it('does not advance on undo, redo or an edit', () => {
    useStore.getState().load(withNote('n1'))
    const epoch = useStore.getState().docEpoch
    useStore.getState().updateData('n1', { text: 'changed' })
    useStore.getState().undo()
    useStore.getState().redo()
    expect(useStore.getState().docEpoch).toBe(epoch)
  })
})

// toBlueprint/fromBlueprint is the seam where a node field added to only one side
// vanishes on save, without failing anything else. `dim` is the newest such field.
describe('device node round-trip through the store', () => {
  const withNet = (dim?: boolean): Blueprint => ({
    ...emptyBlueprint(),
    nodes: [{ id: 'c', type: 'device', x: 0, y: 0, prefab: '@CableNetwork', portSide: 'top', ...(dim ? { dim: true } : {}) }],
    edges: [],
  })

  it('preserves a dimmed network node', () => {
    start(withNet(true))
    const out = toBlueprint(useStore.getState()).nodes[0] as BpDeviceNode
    expect(out.dim).toBe(true)
    expect(out.portSide).toBe('top')
  })

  // Absent, not `false`: the format omits falsey optionals so a share link stays short
  // and an untouched document serializes byte-identically.
  it('emits no dim key when the node is not dimmed', () => {
    start(withNet())
    expect('dim' in (toBlueprint(useStore.getState()).nodes[0] as BpDeviceNode)).toBe(false)
  })

  it('makes dimming undoable', () => {
    start(withNet())
    useStore.getState().updateData('c', { dim: true })
    expect((useStore.getState().nodes[0].data as { dim?: boolean }).dim).toBe(true)
    useStore.getState().undo()
    expect((useStore.getState().nodes[0].data as { dim?: boolean }).dim).toBeUndefined()
  })
})

describe('deleteSelection', () => {
  // Two devices with a cable between them, so the orphaned-edge cleanup has
  // something to clean up.
  const wired = (): Blueprint => ({
    ...emptyBlueprint(),
    nodes: [
      { id: 'a', type: 'device', x: 0, y: 0, prefab: '@CableNetwork', portSide: 'top' },
      { id: 'b', type: 'device', x: 100, y: 0, prefab: '@CableNetwork', portSide: 'top' },
    ],
    edges: [{ id: 'e1', source: 'a', sourceHandle: 'Cable-None-0', target: 'b', targetHandle: 'Cable-None-0' }],
  })

  const select = (id: string) => useStore.getState().onNodesChange([{ id, type: 'select', selected: true }])

  it('drops the edges of a deleted node, not just the node', () => {
    start(wired())
    select('a')
    useStore.getState().deleteSelection()

    const s = useStore.getState()
    expect(s.nodes.map((n) => n.id)).toEqual(['b'])
    // An edge pointing at a node that no longer exists would render as a stray line.
    expect(s.edges).toHaveLength(0)
  })

  it('restores the node and its edges in a single undo step', () => {
    start(wired())
    select('a')
    useStore.getState().deleteSelection()
    expect(useStore.getState().past).toHaveLength(1)

    useStore.getState().undo()
    const s = useStore.getState()
    expect(s.nodes).toHaveLength(2)
    expect(s.edges).toHaveLength(1)
  })

  it('leaves unrelated nodes and edges alone', () => {
    start(wired())
    select('b')
    useStore.getState().deleteSelection()
    expect(useStore.getState().nodes.map((n) => n.id)).toEqual(['a'])
  })

  // Same reasoning as every other mutator: a published document is public and
  // linkable, so hiding the button is not the enforcement.
  it('is a no-op on a read-only document', () => {
    useStore.getState().load(wired(), { readOnly: true })
    useStore.setState({ past: [], future: [] })
    useStore.setState({ nodes: useStore.getState().nodes.map((n) => ({ ...n, selected: true })) })

    useStore.getState().deleteSelection()
    const s = useStore.getState()
    expect(s.nodes).toHaveLength(2)
    expect(s.past).toHaveLength(0)
  })

  it('spends no undo step when nothing is selected', () => {
    start(wired())
    useStore.getState().deleteSelection()
    expect(useStore.getState().past).toHaveLength(0)
    expect(useStore.getState().nodes).toHaveLength(2)
  })

  // A frozen zone isn't selectable, but it can still carry a `selected` flag set
  // before it was frozen — deleting it would be a click the user never made.
  it('skips frozen zones', () => {
    start(withZone('z1'))
    select('z1')
    useStore.setState({ zonesLocked: true })
    useStore.getState().deleteSelection()
    expect(useStore.getState().nodes).toHaveLength(1)
  })
})
