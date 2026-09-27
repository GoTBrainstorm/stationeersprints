// Preview image validation. The client claims to send a PNG; this decides
// whether to believe it before anything reaches R2.
import { badRequest, tooLarge } from './errors'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 4096

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface PngInfo {
  width: number
  height: number
}

/**
 * Parse the IHDR chunk, which a valid PNG is required to place first, at a
 * fixed offset: 8 bytes of signature, 4 of length, 4 of type, then width and
 * height as big-endian uint32s.
 *
 * This is a sanity check, not a decoder — it only proves the bytes start like a
 * PNG and declare plausible dimensions. R2 is served with an explicit
 * `image/png` content type and `nosniff`, which is what actually keeps a
 * mislabelled payload from being interpreted as something else.
 */
export function parsePng(bytes: Uint8Array): PngInfo {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw tooLarge(`Preview image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
  }
  // 8 signature + 8 chunk header + 8 dimensions.
  if (bytes.byteLength < 24) throw badRequest('Preview image is not a PNG', 'bad_image')
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw badRequest('Preview image is not a PNG', 'bad_image')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(12) !== 0x49484452) {
    throw badRequest('Preview image is not a PNG', 'bad_image') // 'IHDR'
  }
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width === 0 || height === 0) throw badRequest('Preview image has no size', 'bad_image')
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw badRequest(`Preview image must be at most ${MAX_IMAGE_DIMENSION}px on each side`, 'bad_image')
  }
  return { width, height }
}
