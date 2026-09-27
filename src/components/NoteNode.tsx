import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { useStore, zonesFrozen, type NoteNodeType, type ZoneNodeType } from '../store'

function NoteNodeView({ data, selected }: NodeProps<NoteNodeType>) {
  const readOnly = useStore((s) => s.readOnly)
  return (
    <div className={`note-node${selected ? ' selected' : ''}`}>
      <NodeResizer isVisible={selected && !readOnly} minWidth={140} minHeight={60} />
      {data.step !== undefined && <div className="note-step">{data.step}</div>}
      <div className="note-text">{data.text || <em>Empty note</em>}</div>
    </div>
  )
}

export const NoteNode = memo(NoteNodeView)

function ZoneNodeView({ data, selected }: NodeProps<ZoneNodeType>) {
  const frozen = useStore(zonesFrozen)
  // The padlock advertises the toolbar toggle, so it only makes sense to an editor;
  // a read-only viewer has no toggle to reconcile it with.
  const showLock = useStore((s) => s.zonesLocked && !s.readOnly)
  return (
    <div className={`zone-node${selected ? ' selected' : ''}${frozen ? ' locked' : ''}`} style={{ ['--zone-color' as string]: data.color ?? '#5a7da8' }}>
      <NodeResizer isVisible={selected && !frozen} minWidth={160} minHeight={100} />
      <div className="zone-title">
        {data.title}
        {showLock && (
          <span className="zone-lock" title="Zones are frozen">
            🔒
          </span>
        )}
      </div>
    </div>
  )
}

export const ZoneNode = memo(ZoneNodeView)
