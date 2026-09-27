// Management tokens: the only thing standing between a publisher and someone
// else deleting their blueprint, in a system with no accounts.
const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 bytes of entropy; returned to the client exactly once, never stored. */
export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compare two hex digests without an early return. The inputs are already
 * hashes of attacker-controlled data so the timing signal is close to
 * worthless — but constant-time comparison costs five lines, so there is no
 * reason to reason about it at all.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function tokenMatches(token: string, storedHash: string): Promise<boolean> {
  return safeEqual(await hashToken(token), storedHash)
}

/** Pull a bearer token out of an Authorization header. */
export function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}
