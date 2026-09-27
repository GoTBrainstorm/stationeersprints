// JSON (de)serialization with validation.
//
// Shared with the publishing Worker under worker/ — it validates uploads with the
// same rules the editor uses, so the two can never drift. Keep this file free of
// runtime imports and of anything DOM-shaped; `npx tsc -b` builds it under the
// worker's project too, which is what catches a violation. Share-link helpers
// live in shareLink.ts for the same reason.
import type { Blueprint, BpNode } from './blueprint'

export class BlueprintError extends Error {}

export function toJson(bp: Blueprint): string {
  return JSON.stringify(bp, null, 2)
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !isFinite(v)) throw new BlueprintError(`${what} must be a number`)
  return v
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new BlueprintError(`${what} must be a string`)
  return v
}

function validateNode(n: any, i: number): BpNode {
  const where = `nodes[${i}]`
  if (!n || typeof n !== 'object') throw new BlueprintError(`${where} must be an object`)
  str(n.id, `${where}.id`)
  num(n.x, `${where}.x`)
  num(n.y, `${where}.y`)
  switch (n.type) {
    case 'device':
      str(n.prefab, `${where}.prefab`)
      return n
    case 'note':
      str(n.text, `${where}.text`)
      return n
    case 'zone':
      num(n.width, `${where}.width`)
      num(n.height, `${where}.height`)
      return n
    default:
      throw new BlueprintError(`${where}.type "${n.type}" is not supported`)
  }
}

export function validate(data: any): Blueprint {
  if (!data || data.format !== 'stationeersprints') throw new BlueprintError('Not a Stationeersprints blueprint')
  if (data.version !== 1) throw new BlueprintError(`Unsupported blueprint version ${data.version}`)
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new BlueprintError('Blueprint must have nodes and edges')
  const nodes = data.nodes.map(validateNode)
  const ids = new Set<string>()
  for (const n of nodes as BpNode[]) {
    if (ids.has(n.id)) throw new BlueprintError(`Duplicate node id "${n.id}"`)
    ids.add(n.id)
  }
  // A dangling edge is repairable damage, not a reason to reject the whole file:
  // drop it and keep the rest. Nodes are stricter because everything else refers to them.
  const edges = data.edges.filter((e: any) => e && ids.has(e.source) && ids.has(e.target))
  return {
    format: 'stationeersprints',
    version: 1,
    title: typeof data.title === 'string' ? data.title : 'Untitled blueprint',
    author: typeof data.author === 'string' ? data.author : '',
    description: typeof data.description === 'string' ? data.description : '',
    gameVersion: typeof data.gameVersion === 'string' ? data.gameVersion : undefined,
    nodes,
    edges,
  }
}

export function fromJson(text: string): Blueprint {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BlueprintError('File is not valid JSON')
  }
  return validate(data)
}
