import { describe, expect, it } from 'vitest'
import { emptyBlueprint, type Blueprint } from './blueprint'
import { BlueprintError, fromJson, toJson } from './serialize'
import { fromHash, hashFromLocation, shareUrl, toHash } from './shareLink'
import { compatible, edgeKind } from './rules'
import { deriveLogicLinks, summarize, type LogicNode } from './settings'
import { shoppingList, toText } from './shoppingList'
import type { Catalog } from './catalogTypes'

const bp: Blueprint = {
  ...emptyBlueprint(),
  title: 'Test',
  nodes: [
    { id: 'a', type: 'device', x: 0, y: 0, prefab: 'StructureDaylightSensor' },
    { id: 'b', type: 'device', x: 100, y: 0, prefab: 'StructureLogicReader', settings: { device: { ref: 'a' }, variable: 'Horizontal' } },
    { id: 'c', type: 'device', x: 200, y: 0, prefab: '@CableNetwork', label: 'Power + data', portSide: 'top', dim: true },
    { id: 'n', type: 'note', x: 0, y: 100, text: 'Hello ☀', step: 1 },
    { id: 'z', type: 'zone', x: -10, y: -10, width: 400, height: 300, title: 'Outside' },
  ],
  edges: [{ id: 'e1', source: 'a', sourceHandle: 'PowerAndData-None-0', target: 'b', targetHandle: 'Data-Input-0' }],
}

describe('serialize', () => {
  it('round-trips through JSON', () => {
    expect(fromJson(toJson(bp))).toEqual(bp)
  })

  it('round-trips through a share link', () => {
    const url = shareUrl(bp, 'https://example.com/app/#old')
    expect(url.startsWith('https://example.com/app/#bp=')).toBe(true)
    expect(fromHash(hashFromLocation(new URL(url).hash)!)).toEqual(bp)
  })

  it('rejects foreign or broken data', () => {
    expect(() => fromJson('{')).toThrow(BlueprintError)
    expect(() => fromJson('{"format":"other"}')).toThrow(BlueprintError)
    expect(() => fromJson(JSON.stringify({ ...bp, version: 2 }))).toThrow(/version/)
    expect(() => fromJson(JSON.stringify({ ...bp, nodes: [{ id: 'x', type: 'device', x: 'a', y: 0, prefab: 'P' }] }))).toThrow(/x must be a number/)
    expect(() => fromHash('not-a-valid-hash')).toThrow(BlueprintError)
  })

  it('drops edges pointing at missing nodes', () => {
    const broken = { ...bp, edges: [...bp.edges, { id: 'e2', source: 'a', sourceHandle: 'x', target: 'gone', targetHandle: 'y' }] }
    expect(fromJson(JSON.stringify(broken)).edges).toHaveLength(1)
  })

  it('rejects duplicate node ids, which edges and device refs could not resolve', () => {
    const dupe = { ...bp, nodes: [...bp.nodes, { id: 'a', type: 'note', x: 0, y: 0, text: 'clash' }] }
    expect(() => fromJson(JSON.stringify(dupe))).toThrow(/Duplicate node id "a"/)
  })

  it('produces compact hashes', () => {
    expect(toHash(bp).length).toBeLessThan(toJson(bp).length)
  })
})

describe('rules', () => {
  it('connects matching kinds and power+data to either', () => {
    expect(compatible('Pipe', 'Pipe')).toBe(true)
    expect(compatible('Pipe', 'PipeLiquid')).toBe(false)
    expect(compatible('PowerAndData', 'Power')).toBe(true)
    expect(compatible('Data', 'PowerAndData')).toBe(true)
    expect(compatible('Power', 'Data')).toBe(false)
    expect(compatible('Other', 'Other')).toBe(false)
    expect(edgeKind('PowerAndData', 'Data')).toBe('Data')
  })
})

describe('logic links', () => {
  const nodes: LogicNode[] = [
    { id: 'sensor', prefab: 'StructureDaylightSensor' },
    { id: 'reader', prefab: 'StructureLogicReader', settings: { device: { ref: 'sensor' }, variable: 'Horizontal' } },
    { id: 'writer', prefab: 'StructureLogicBatchWriter', settings: { input: { ref: 'reader' }, prefab: 'StructureSolarPanel', variable: 'Horizontal' } },
    { id: 'p1', prefab: 'StructureSolarPanel' },
    { id: 'p2', prefab: 'StructureSolarPanel' },
    { id: 'ic', prefab: 'StructureCircuitHousing', settings: { d0: { ref: 'p1' }, d1: { ref: 'missing' } } },
  ]
  const catalog = {
    devices: { StructureCircuitHousing: { prefab: 'StructureCircuitHousing', devicePins: 6 } },
  } as never

  it('derives readers, inputs, batch targets and pins', () => {
    const links = deriveLogicLinks(nodes, catalog).map((l) => `${l.source}->${l.target}:${l.label}`)
    expect(links).toEqual([
      'sensor->reader:Horizontal',
      'reader->writer:Input',
      'writer->p1:Horizontal',
      'writer->p2:Horizontal',
      'ic->p1:d0',
    ])
  })

  it('summarizes configuration for display', () => {
    expect(summarize({ ...nodes[1], values: { On: '1' } }, nodes, null)).toEqual(['Device: StructureDaylightSensor → Horizontal', 'On = 1'])
  })
})

describe('shopping list', () => {
  const catalog = {
    categories: ['Power', 'Logic'],
    devices: {
      StructureSolarPanel: {
        prefab: 'StructureSolarPanel',
        name: 'Solar Panel',
        category: 'Power',
        icon: 'data/icons/StructureSolarPanel.webp',
        build: [
          { item: 'ItemGlassSheets', quantity: 1 },
          { item: 'ItemKitSolarPanel', quantity: 1 },
        ],
      },
      StructureSolarPanelDual: {
        prefab: 'StructureSolarPanelDual',
        name: 'Solar Panel (Dual)',
        category: 'Power',
        build: [{ item: 'ItemKitSolarPanel', quantity: 1 }],
      },
      StructureLogicReader: {
        prefab: 'StructureLogicReader',
        name: 'Logic Reader',
        category: 'Logic',
        build: [{ item: 'ItemKitLogicProcessor', quantity: 1 }],
      },
      StructureRocketEngineTiny: { prefab: 'StructureRocketEngineTiny', name: 'Rocket Engine (Tiny)', category: 'Power' },
    },
    items: {
      ItemGlassSheets: { prefab: 'ItemGlassSheets', name: 'Glass Sheets' },
      ItemKitSolarPanel: { prefab: 'ItemKitSolarPanel', name: 'Kit (Solar Panel)', icon: 'data/icons/ItemKitSolarPanel.webp' },
      ItemKitLogicProcessor: { prefab: 'ItemKitLogicProcessor', name: 'Kit (Logic Processor)' },
    },
  } as unknown as Catalog

  it('counts devices and sums the kits they share', () => {
    const list = shoppingList(
      ['StructureSolarPanel', 'StructureSolarPanel', 'StructureSolarPanelDual', 'StructureLogicReader'],
      catalog,
    )
    expect(list.totalDevices).toBe(4)
    expect(list.devices.map((d) => `${d.count} ${d.name}`)).toEqual(['2 Solar Panel', '1 Solar Panel (Dual)', '1 Logic Reader'])
    // Three panels share one kit; glass is per solar panel only.
    expect(list.materials.map((m) => `${m.count} ${m.name}`)).toEqual(['2 Glass Sheets', '1 Kit (Logic Processor)', '3 Kit (Solar Panel)'])
  })

  it('orders devices by catalog category then name, and materials by name', () => {
    const list = shoppingList(['StructureLogicReader', 'StructureSolarPanelDual', 'StructureSolarPanel'], catalog)
    expect(list.devices.map((d) => d.category)).toEqual(['Power', 'Power', 'Logic'])
    expect(list.materials.map((m) => m.name)).toEqual(['Glass Sheets', 'Kit (Logic Processor)', 'Kit (Solar Panel)'])
  })

  it('never counts the @ network helpers, which stand in for cable and pipe runs', () => {
    const list = shoppingList(['@CableNetwork', '@PipeNetwork', '@LiquidNetwork', 'StructureSolarPanel'], catalog)
    expect(list.totalDevices).toBe(1)
    expect(list.devices.map((d) => d.prefab)).toEqual(['StructureSolarPanel'])
  })

  it('counts devices whose cost is unknowable, and flags them', () => {
    const list = shoppingList(['StructureFromTheFuture', 'StructureRocketEngineTiny', 'StructureSolarPanel'], catalog)
    expect(list.totalDevices).toBe(3)
    expect(list.unknown).toEqual(['StructureFromTheFuture'])
    expect(list.noCost).toEqual(['StructureRocketEngineTiny'])
    expect(list.materials.map((m) => m.name)).toEqual(['Glass Sheets', 'Kit (Solar Panel)'])
  })

  it('carries icons through for devices and items that have them', () => {
    const list = shoppingList(['StructureSolarPanel'], catalog)
    expect(list.devices[0].icon).toBe('data/icons/StructureSolarPanel.webp')
    expect(list.materials.find((m) => m.prefab === 'ItemKitSolarPanel')?.icon).toBe('data/icons/ItemKitSolarPanel.webp')
    expect(list.materials.find((m) => m.prefab === 'ItemGlassSheets')?.icon).toBeUndefined()
  })

  it('survives an empty canvas and a missing catalog', () => {
    expect(shoppingList([], catalog)).toEqual({ devices: [], materials: [], unknown: [], noCost: [], totalDevices: 0 })
    const noCatalog = shoppingList(['StructureSolarPanel'], null)
    expect(noCatalog.devices.map((d) => d.name)).toEqual(['StructureSolarPanel'])
    expect(noCatalog.unknown).toEqual(['StructureSolarPanel'])
    expect(noCatalog.materials).toEqual([])
  })

  it('renders plain text for the copy and download buttons', () => {
    const list = shoppingList(['StructureSolarPanel', 'StructureSolarPanel'], catalog)
    expect(toText(list, 'Solar array')).toBe(
      ['Solar array', '===========', '', 'Devices (2)', '  2 x Solar Panel', '', 'To procure', '  2 x Glass Sheets', '  2 x Kit (Solar Panel)', ''].join('\n').trimEnd() + '\n',
    )
  })
})
