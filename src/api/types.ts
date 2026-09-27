// The wire format between the editor and the publishing Worker.
//
// Imported by both sides — `npx tsc -b` builds this file under the app project
// and the worker project, so a change that breaks one breaks the build rather
// than a request at runtime. Types only, no runtime imports.

export type Visibility = 'UNLISTED' | 'PENDING' | 'LISTED'

/** A published blueprint as the API describes it. Never includes secrets. */
export interface PublishedBlueprint {
  id: string
  createdAt: number
  title: string
  description: string
  author: string
  gameVersion: string | null
  visibility: Visibility
  /** Absolute or site-relative URL of the blueprint JSON in object storage. */
  jsonUrl: string
  /** Same, for the preview PNG. Null when publishing produced no image. */
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  nodeCount: number
  edgeCount: number
  sizeBytes: number
  /** Id of the published blueprint this one was copied from, if any. */
  derivedFrom: string | null
  /**
   * Set only on a lookup that carried a management key and it matched. Absent
   * on every public response — this is an echo of what the caller proved, not
   * a fact about the blueprint.
   */
  owner?: boolean
}

/** `GET /api/blueprints?ids=…` — the batch refresh for a remembered list. */
export interface BlueprintsResponse {
  /** Ids that no longer exist are absent rather than null. */
  items: PublishedBlueprint[]
}

/** The one-time response to a successful publish. */
export interface PublishResponse {
  blueprint: PublishedBlueprint
  url: string
  /**
   * Returned exactly once and never recoverable. The client stores it in
   * localStorage; losing it means losing the ability to delete or unlist.
   */
  managementToken: string
}

export interface GalleryResponse {
  items: PublishedBlueprint[]
  /** Opaque; pass back as `?cursor=` for the next page. Null at the end. */
  nextCursor: string | null
}

/** Public runtime configuration, fetched once on demand. */
export interface ConfigResponse {
  turnstileSiteKey: string | null
  requireTurnstile: boolean
  galleryEnabled: boolean
  maxJsonBytes: number
  maxImageBytes: number
  /** How many publishes one address gets per hour; quoted on the help page. */
  publishesPerHour: number
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
