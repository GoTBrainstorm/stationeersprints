// html-to-image deep-clones <svg> subtrees verbatim: it never walks into them,
// so it never inlines computed styles on the <g>/<path>/<text> inside. Anything
// the stylesheet paints is therefore lost in the export — React Flow's edges get
// their stroke from CSS classes, so they come out with `stroke: none` and the
// PNG has no lines at all.
//
// Copy the painted properties onto the elements themselves for the duration of
// the capture. Inline styles are attributes, so they survive the verbatim clone.
const PAINTED = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'opacity',
  'marker-start',
  'marker-end',
  'font-family',
  'font-size',
  'font-weight',
]

/**
 * Inlines computed SVG paint properties under `root`.
 * Returns a function that restores the previous inline styles.
 */
export function inlineSvgPaint(root: HTMLElement): () => void {
  const restore: (() => void)[] = []
  for (const el of root.querySelectorAll<SVGElement>('svg *')) {
    if (!el.style) continue
    const previous = el.getAttribute('style')
    const computed = getComputedStyle(el)
    for (const property of PAINTED) {
      const value = computed.getPropertyValue(property)
      if (value) el.style.setProperty(property, value)
    }
    restore.push(() => {
      if (previous === null) el.removeAttribute('style')
      else el.setAttribute('style', previous)
    })
  }
  return () => restore.forEach((f) => f())
}
