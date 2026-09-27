import { useReactFlow } from '@xyflow/react'
import { EXAMPLES, instantiate } from '../examples'
import { useStore } from '../store'

export default function ExamplesDialog({ onClose }: { onClose: () => void }) {
  const load = useStore((s) => s.load)
  const catalog = useStore((s) => s.catalog)
  const { fitView } = useReactFlow()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Example blueprints</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">Common systems from the early and mid game. Loading one replaces the canvas; undo brings your work back.</p>
        <div className="example-grid">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              className="example-card"
              onClick={() => {
                load(instantiate(ex, catalog))
                onClose()
                requestAnimationFrame(() => fitView({ padding: 0.15 }))
              }}
            >
              <span className={`stage stage-${ex.stage.toLowerCase().replace(/[^a-z]/g, '')}`}>{ex.stage}</span>
              <strong>{ex.title}</strong>
              <span>{ex.summary}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
