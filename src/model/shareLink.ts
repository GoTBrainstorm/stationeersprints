// Share links: the whole blueprint compressed into the URL fragment.
//
// Kept apart from serialize.ts on purpose. serialize.ts is imported by the
// publishing Worker, which has no use for lz-string and no URL fragment to read;
// keeping that file free of runtime imports is what makes the cross-project
// import cheap and safe.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Blueprint } from './blueprint'
import { BlueprintError, fromJson } from './serialize'

export function toHash(bp: Blueprint): string {
  return compressToEncodedURIComponent(JSON.stringify(bp))
}

export function fromHash(hash: string): Blueprint {
  const json = decompressFromEncodedURIComponent(hash)
  if (!json) throw new BlueprintError('Share link is damaged or incomplete')
  return fromJson(json)
}

export function shareUrl(bp: Blueprint, base: string): string {
  return `${base.split('#')[0]}#bp=${toHash(bp)}`
}

// Tolerates the parameter appearing after other fragment params (`#foo&bp=…`),
// and is deliberately pathname-independent: share links predate path routing and
// must keep working from /b/:id, /gallery, or anywhere else.
export function hashFromLocation(hash: string): string | null {
  const m = hash.match(/[#&]bp=([^&]+)/)
  return m ? m[1] : null
}
