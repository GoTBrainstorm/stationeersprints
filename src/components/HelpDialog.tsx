// The help page, shown over the canvas instead of navigating to /help — leaving
// the editor unmounts it, which drops undo history and any edit the autosave
// debounce hasn't flushed yet. Same content either way; see pages/HelpPage.tsx.
import Link from './Link'
import { HelpContent } from '../pages/HelpPage'

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>How this works</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <HelpContent />
        <div className="modal-actions">
          <Link to="/help" className="button">
            Open as a page
          </Link>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
