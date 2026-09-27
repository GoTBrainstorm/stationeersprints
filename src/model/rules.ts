import type { PortKind } from './catalogTypes'

/** Whether two ports may be joined by a cable/pipe/chute. */
export function compatible(a: PortKind, b: PortKind): boolean {
  // `Other` is the catch-all for networks the editor does not model (landing pads,
  // rovers…), so two of them are not known to be the same thing and never connect.
  if (a === b) return a !== 'Other'
  const cable = (k: PortKind) => k === 'Power' || k === 'Data'
  return (a === 'PowerAndData' && cable(b)) || (b === 'PowerAndData' && cable(a))
}

/** Edge kind used for styling a connection between two ports. */
export function edgeKind(a: PortKind, b: PortKind): PortKind {
  if (a === b) return a
  return a === 'PowerAndData' ? b : a
}
