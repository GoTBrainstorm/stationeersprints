// Checks every bundled example against the committed catalog (public/data/catalog.json).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../model/catalogTypes'
import { isRef } from '../model/blueprint'
import { lookupDevice } from '../model/catalog'
import { schemaFor, slotVarsOf, varsOf } from '../model/settings'
import { validate } from '../model/serialize'
import { EXAMPLES, instantiate } from '.'
import type { Example } from './template'

const catalog: Catalog = JSON.parse(readFileSync(join(import.meta.dirname, '../../public/data/catalog.json'), 'utf8'))

/** All problems with an example, so a single test run shows everything that needs fixing. */
function problems(ex: Example): string[] {
  const out: string[] = []
  const bp = instantiate(ex, catalog, (m) => out.push(m))
  const devices = bp.nodes.flatMap((n) => (n.type === 'device' ? [n] : []))
  const byId = new Map(devices.map((d) => [d.id, d]))

  if (new Set(bp.nodes.map((n) => n.id)).size !== bp.nodes.length) out.push('duplicate node ids')
  try {
    validate(JSON.parse(JSON.stringify(bp)))
  } catch (e) {
    out.push(`invalid blueprint: ${e}`)
  }

  for (const d of devices) {
    if (!d.prefab.startsWith('@') && !(d.prefab in catalog.devices)) {
      out.push(`${d.id}: ${d.prefab} is not in the catalog`)
      continue
    }
    const device = lookupDevice(catalog, d.prefab)
    const fields = schemaFor(device)
    const s = d.settings ?? {}
    for (const [key, value] of Object.entries(s)) {
      const field = fields.find((f) => f.key === key)
      if (!field) {
        out.push(`${d.id}: unknown setting ${key}`)
        continue
      }
      if (isRef(value) && !byId.has(value.ref)) out.push(`${d.id}.${key} -> missing node ${value.ref}`)
      if (field.type === 'prefab' && !catalog.devices[value as string]) out.push(`${d.id}.${key}: ${value} is not in the catalog`)
      if (field.type === 'var' || field.type === 'slotVar') {
        const of = s[field.of!]
        const targetPrefab = isRef(of) ? byId.get(of.ref)?.prefab : (of as string)
        if (!targetPrefab) continue
        const target = lookupDevice(catalog, targetPrefab)
        const options = field.type === 'var' ? varsOf(target, field.access) : slotVarsOf(target)
        if (!options.includes(value as string)) {
          out.push(`${d.id}.${key}: ${target.prefab} cannot ${field.access ?? 'use'} ${value} (has: ${options.join(', ')})`)
        }
      }
    }
    for (const [key, value] of Object.entries(d.values ?? {})) {
      if (!device.logic[key]) out.push(`${d.id}: ${d.prefab} has no logic type ${key}`)
      else if (!device.logic[key].includes('w')) out.push(`${d.id}: ${d.prefab}.${key} is read-only`)
      if (key === 'Mode' && Object.keys(device.modes).length && !Object.values(device.modes).includes(value)) {
        out.push(`${d.id}: ${d.prefab} has no mode "${value}" (has: ${Object.values(device.modes).join(', ')})`)
      }
    }
  }
  return out
}

describe('bundled examples', () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s matches the catalog', (_, ex) => {
    expect(problems(ex)).toEqual([])
  })
})
