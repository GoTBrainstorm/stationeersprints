import { useEffect, useRef, useState } from 'react'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      theme?: 'light' | 'dark' | 'auto'
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

/**
 * Loaded on demand, not from index.html: nobody who never publishes should pay
 * for a third-party script, and the site works with no site key configured.
 */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      scriptPromise = null
      reject(new Error('Could not load the verification challenge'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

export interface TurnstileState {
  token: string | null
  error: string | null
}

/**
 * Renders a Turnstile widget into `ref` and reports its token.
 *
 * Passing a null site key renders nothing and reports a null token — which is
 * the correct state, because the Worker only requires a token when it has a
 * secret configured.
 */
export function useTurnstile(siteKey: string | null, ref: React.RefObject<HTMLDivElement | null>): TurnstileState {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (t) => setToken(t),
          // A token is single-use and short-lived. Clearing it on expiry means
          // the publish button disables itself instead of failing at the server.
          'expired-callback': () => setToken(null),
          'error-callback': () => setError('Verification failed. Reload and try again.'),
        })
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey, ref])

  return { token, error }
}
