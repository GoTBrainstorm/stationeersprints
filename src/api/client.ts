// The one place the editor talks to the publishing Worker.
import type {
  ApiErrorBody,
  BlueprintsResponse,
  ConfigResponse,
  GalleryResponse,
  PublishedBlueprint,
  PublishResponse,
  Visibility,
} from './types'

/** A failed request, carrying the server's code so callers can branch on it. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    // Offline, blocked, or DNS — never the server's fault, and worth saying so
    // rather than showing a generic failure.
    throw new ApiError(0, 'offline', 'Could not reach the server. Check your connection.')
  }
  if (!response.ok) {
    let body: Partial<ApiErrorBody> = {}
    try {
      body = await response.json()
    } catch {
      /* A non-JSON error page is still an error; fall through to the default. */
    }
    throw new ApiError(
      response.status,
      body.error?.code ?? 'error',
      body.error?.message ?? `Request failed (${response.status})`,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getConfig(): Promise<ConfigResponse> {
  return request<ConfigResponse>('/api/config')
}

export interface PublishInput {
  /** The serialized blueprint, exactly as `toJson()` produces it. */
  json: string
  preview: Blob | null
  visibility: Visibility
  turnstileToken?: string
  /** Set when this started life as a copy of another published blueprint. */
  derivedFrom?: string | null
}

export function publish(input: PublishInput): Promise<PublishResponse> {
  const form = new FormData()
  form.append('blueprint', input.json)
  if (input.preview) form.append('preview', input.preview, 'preview.png')
  form.append('visibility', input.visibility)
  if (input.turnstileToken) form.append('turnstileToken', input.turnstileToken)
  if (input.derivedFrom) form.append('derivedFrom', input.derivedFrom)
  return request<PublishResponse>('/api/publish', { method: 'POST', body: form })
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

/**
 * Public metadata for one blueprint. Passing a management key asks the server
 * to check it too: the response then carries `owner: true`, and a key that does
 * not match answers 404 — which is how "restore access" verifies a pasted key
 * without changing anything.
 */
export function getPublished(id: string, token?: string): Promise<PublishedBlueprint> {
  return request<PublishedBlueprint>(`/api/blueprints/${encodeURIComponent(id)}`, {
    headers: token ? auth(token) : undefined,
  })
}

/** Current state of several blueprints at once. Ids that are gone come back absent. */
export function getPublishedBatch(ids: string[]): Promise<BlueprintsResponse> {
  return request<BlueprintsResponse>(`/api/blueprints?ids=${encodeURIComponent(ids.join(','))}`)
}

export function setPublishedVisibility(
  id: string,
  token: string,
  visibility: Visibility,
): Promise<PublishedBlueprint> {
  return request<PublishedBlueprint>(`/api/blueprints/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  })
}

export function deletePublished(id: string, token: string): Promise<void> {
  return request<void>(`/api/blueprints/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: auth(token),
  })
}

export function getGallery(cursor?: string | null): Promise<GalleryResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return request<GalleryResponse>(`/api/gallery${query}`)
}

/**
 * Blueprint JSON is fetched from object storage directly, not through the API —
 * in production that origin bypasses the Worker entirely.
 */
export async function fetchBlueprintJson(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new ApiError(response.status, 'fetch_failed', 'Could not load the blueprint')
  return response.text()
}
