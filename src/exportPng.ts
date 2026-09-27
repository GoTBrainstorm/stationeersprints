// Rendering the canvas to a PNG, for both "Export PNG" and the publish preview.
//
// Captures the live `.react-flow__viewport` element, so it needs a mounted,
// visible canvas — anything calling this must render over the canvas, not
// replace it.
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react'
import { toBlob } from 'html-to-image'
import { inlineSvgPaint } from './model/inlineSvgPaint'

export interface RenderPngOptions {
  maxWidth?: number
  maxHeight?: number
  /**
   * Device pixels per CSS pixel. Left undefined, html-to-image uses
   * `window.devicePixelRatio`, so a 4096-wide capture becomes 8192 actual pixels
   * on a HiDPI display. The publish path pins this to 1 to stay inside the
   * upload limits; the download path keeps the sharper default.
   */
  pixelRatio?: number
}

export interface RenderedPng {
  blob: Blob
  /** Actual pixel dimensions, i.e. already multiplied by the pixel ratio. */
  width: number
  height: number
}

/** What "Export PNG" has always produced: large, and sharp on HiDPI displays. */
export const DOWNLOAD_PNG: RenderPngOptions = { maxWidth: 4096, maxHeight: 4096 }

/**
 * Preview previews are capped well below the server's limits. Discord and
 * friends render cards at roughly 600px wide, so 1600 is already generous, and
 * at pixelRatio 1 on a flat dark background the 2 MB ceiling is never in danger.
 */
export const PUBLISH_PNG: RenderPngOptions = { maxWidth: 1600, maxHeight: 1200, pixelRatio: 1 }

const PADDING = 160
const MIN_WIDTH = 800
const MIN_HEIGHT = 600

/**
 * Wait for the things html-to-image will otherwise capture mid-flight: webfonts,
 * and device icons that haven't decoded yet (which would render blank).
 */
async function settle(root: HTMLElement): Promise<void> {
  try {
    await document.fonts?.ready
  } catch {
    // Font loading API unavailable or rejected; the capture is still worth doing.
  }
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => img.decode().catch(() => {})))
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
}

export async function renderPng(nodes: Node[], opts: RenderPngOptions = {}): Promise<RenderedPng | null> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!nodes.length || !viewport) return null

  const bounds = getNodesBounds(nodes)
  const width = Math.min(opts.maxWidth ?? 4096, Math.max(MIN_WIDTH, Math.round(bounds.width + PADDING)))
  const height = Math.min(opts.maxHeight ?? 4096, Math.max(MIN_HEIGHT, Math.round(bounds.height + PADDING)))
  const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.05)

  await settle(viewport)

  // Without this the export has no edges at all — see inlineSvgPaint's header.
  const restoreSvgPaint = inlineSvgPaint(viewport)
  let blob: Blob | null
  try {
    blob = await toBlob(viewport, {
      backgroundColor: '#15171b',
      width,
      height,
      ...(opts.pixelRatio ? { pixelRatio: opts.pixelRatio } : {}),
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    })
  } finally {
    restoreSvgPaint()
  }
  if (!blob) return null

  const ratio = opts.pixelRatio ?? window.devicePixelRatio ?? 1
  return { blob, width: Math.round(width * ratio), height: Math.round(height * ratio) }
}
