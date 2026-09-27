// Bindings, the row shape, and where an object lives.
import type { Visibility } from '../src/api/types'

export type { Visibility }

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  BUCKET: R2Bucket
  PUBLISH_BURST?: RateLimit

  /** Absolute origin of the site itself, e.g. https://stationeersprints.com */
  SITE_ORIGIN: string
  /**
   * Absolute origin serving R2 objects directly, e.g. https://cdn.stationeersprints.com.
   * Left unset in local dev, where there is no such domain — the Worker then serves
   * /storage/* from the bucket itself so `wrangler dev` stays fully offline.
   */
  R2_PUBLIC_ORIGIN?: string
  /** Public Turnstile key, handed to the client by GET /api/config. */
  TURNSTILE_SITE_KEY?: string
  REQUIRE_TURNSTILE?: string

  TURNSTILE_SECRET?: string
  ADMIN_TOKEN?: string
  IP_PEPPER?: string
}

/** A row of the `blueprints` table, as D1 returns it. */
export interface BlueprintRow {
  id: string
  created_at: number
  title: string
  description: string
  author_name: string
  visibility: Visibility
  json_key: string
  image_key: string | null
  image_width: number | null
  image_height: number | null
  game_version: string | null
  size_bytes: number
  node_count: number
  edge_count: number
  derived_from: string | null
}

/**
 * Where clients should fetch an object from. In production this is the R2
 * subdomain, which never touches the Worker; in dev it falls back to a Worker
 * route over the same bucket.
 */
export function storageUrl(env: Env, key: string): string {
  return env.R2_PUBLIC_ORIGIN ? `${env.R2_PUBLIC_ORIGIN}/${key}` : `/storage/${key}`
}

/** The same, but always absolute — OpenGraph consumers will not resolve a path. */
export function absoluteStorageUrl(env: Env, key: string): string {
  return env.R2_PUBLIC_ORIGIN ? `${env.R2_PUBLIC_ORIGIN}/${key}` : `${env.SITE_ORIGIN}/storage/${key}`
}

export const jsonKey = (id: string) => `blueprints/${id}/blueprint.json`
export const imageKey = (id: string) => `blueprints/${id}/preview.png`
