import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { AppEdge } from '../store'

/**
 * A pipe run wrapped in lagging: a wide rung-dashed jacket under the normal coloured core.
 * Two real paths rather than a CSS effect, because the PNG export only carries the paint
 * properties in inlineSvgPaint's allowlist — a `filter` or `mask` would vanish from the image.
 * The core goes through BaseEdge and not a second raw path because BaseEdge is what draws the
 * invisible fat interaction target; without it the run is only as clickable as it is wide.
 */
export default function InsulatedEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerStart,
  markerEnd,
  style,
}: EdgeProps<AppEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <>
      {/* First child, so it paints beneath the core. */}
      <path d={path} className="edge-jacket" fill="none" />
      <BaseEdge path={path} markerStart={markerStart} markerEnd={markerEnd} style={style} />
    </>
  )
}
