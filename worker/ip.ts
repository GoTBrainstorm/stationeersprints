// Client identity, to the limited extent this service has one.
import type { Env } from './env'

/**
 * A stable, non-reversible handle for the client address.
 *
 * Peppered so the hashes are useless outside this deployment: the address space
 * is small enough that an unsalted SHA-256 of an IP is trivially brute-forced,
 * which would make the column personal data in everything but name. Without
 * IP_PEPPER set there is no hash at all — a predictable one is worse than none.
 */
export async function hashIp(env: Env, request: Request): Promise<string | null> {
  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip || !env.IP_PEPPER) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_PEPPER}:${ip}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
