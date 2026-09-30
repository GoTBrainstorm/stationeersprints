import { useSyncExternalStore } from 'react'

/**
 * Phones and portrait tablets. Above this the three-column editor shell still
 * leaves the canvas a usable width; below it the fixed 250px palette and 330px
 * inspector squeeze it to nothing, so they have to become drawers instead.
 */
const NARROW = '(max-width: 820px)'

// Created lazily rather than at module scope: this module is pulled in by the
// components, and `window` isn't there in the node test pool.
let mql: MediaQueryList | null = null
function query(): MediaQueryList {
  mql ??= window.matchMedia(NARROW)
  return mql
}

function subscribe(onChange: () => void): () => void {
  const m = query()
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

// The snapshot has to be a primitive, for the same reason routes.ts returns a
// bare pathname: anything freshly allocated here re-renders forever.
function getIsNarrow(): boolean {
  return query().matches
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, getIsNarrow)
}
