// Public blueprint ids.
//
// Random rather than sequential: sequential ids would leak how many blueprints
// exist and let anyone enumerate every UNLISTED one.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const ID_LENGTH = 8

// 256 is not a multiple of 62, so taking `byte % 62` would make the first four
// letters of the alphabet measurably more likely. Discard the tail instead.
const LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length // 248

export function generateId(length = ID_LENGTH): string {
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= LIMIT) continue
      out += ALPHABET[b % ALPHABET.length]
    }
  }
  return out
}

// Deliberately wider than what generateId() produces, and kept in sync with
// BLUEPRINT_ID_RE in src/routes.ts. Its job is to reject path junk before it
// reaches D1 or R2, not to re-assert the current length: if ID_LENGTH ever
// changes, every id handed out under the old one must keep resolving.
const ID_RE = /^[A-Za-z0-9]{6,16}$/

export function isValidId(id: string): boolean {
  return ID_RE.test(id)
}
