// Turnstile verification.
//
// A CAPTCHA is the only thing here that distinguishes a person from a script,
// since there are no accounts. It is enforcement against volume, not against a
// determined individual — the rate limit does that.
import type { Env } from './env'
import { badRequest, serverError } from './errors'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileRequired(env: Env): boolean {
  return env.REQUIRE_TURNSTILE === 'true' && !!env.TURNSTILE_SECRET
}

export async function verifyTurnstile(env: Env, token: unknown, request: Request): Promise<void> {
  if (!turnstileRequired(env)) return
  if (typeof token !== 'string' || !token) {
    throw badRequest('Please complete the verification challenge', 'turnstile_required')
  }
  const body = new FormData()
  body.append('secret', env.TURNSTILE_SECRET as string)
  body.append('response', token)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) body.append('remoteip', ip)

  let outcome: { success?: boolean }
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body })
    outcome = await res.json()
  } catch {
    // Fail closed. An outage that let every publish through unverified would be
    // discovered by whoever noticed it first, and they would not be a friend.
    throw serverError('Could not verify the challenge, please try again')
  }
  if (!outcome.success) throw badRequest('Verification failed, please try again', 'turnstile_failed')
}
