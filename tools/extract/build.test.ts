import { describe, expect, it } from 'vitest'
import { buildCatalog, buildMaterials, buildPorts, isSchematicDevice, resolvePorts, stripMarkup, type Overrides } from './build.ts'
import type { RawPrefab } from './sources.ts'

const overrides: Overrides = {
  categories: [
    { name: 'Logic', match: ['StructureLogic'] },
    { name: 'Atmospherics', match: ['Filtration', 'Vent'] },
  ],
  hidden: ['StructureHiddenThing'],
}

function raw(p: Partial<RawPrefab> & { prefab: string }): RawPrefab {
  return { hash: 1, name: p.prefab, description: '', isDevice: true, connections: [], connectionCount: 0, logic: {}, slotLogic: {}, slots: [], modes: {}, buildStates: [], ...p }
}

describe('buildPorts', () => {
  it('assigns stable ids and labels, numbering duplicates', () => {
    const ports = buildPorts([
      { network: 'Pipe', role: 'Input' },
      { network: 'Pipe', role: 'Output' },
      { network: 'Pipe', role: 'Waste' },
      { network: 'Data', role: 'None' },
      { network: 'Data', role: 'None' },
      { network: 'LandingPad', role: 'None' },
    ])
    expect(ports.map((p) => p.id)).toEqual(['Pipe-Input-0', 'Pipe-Output-0', 'Pipe-Waste-0', 'Data-None-0', 'Data-None-1', 'LandingPad-None-0'])
    expect(ports.map((p) => p.label)).toEqual(['Pipe in', 'Pipe out', 'Pipe waste', 'Data 1', 'Data 2', 'LandingPad'])
    expect(ports[5].kind).toBe('Other')
  })
})

describe('resolvePorts', () => {
  const withOverride: Overrides = { ...overrides, ports: { StructurePipeRadiator: [{ network: 'Pipe', role: 'None' }] } }

  it('gives pipe-mounted devices the port the game does not report', () => {
    const ports = resolvePorts(raw({ prefab: 'StructurePipeRadiator', connections: [] }), withOverride)
    expect(ports).toEqual([{ id: 'Pipe-None-0', kind: 'Pipe', network: 'Pipe', role: 'None', label: 'Pipe' }])
  })

  it('prefers real connections, so a fixed game version supersedes the override', () => {
    const fixed = raw({ prefab: 'StructurePipeRadiator', connections: [{ network: 'Pipe', role: 'Input' }] })
    expect(resolvePorts(fixed, withOverride).map((p) => p.id)).toEqual(['Pipe-Input-0'])
  })

  it('leaves unlisted portless devices alone', () => {
    expect(resolvePorts(raw({ prefab: 'StructureChair', connections: [] }), withOverride)).toEqual([])
    expect(resolvePorts(raw({ prefab: 'StructurePipeRadiator', connections: [] }), overrides)).toEqual([])
  })
})

describe('isSchematicDevice', () => {
  it('admits a passive structure that a port override names', () => {
    // A passive vent has no `Device` block at all, so it has no logic either — the override is the
    // only thing keeping it in the catalog.
    const vent = raw({ prefab: 'StructurePassiveVent', isDevice: false, logic: {}, connectionCount: 1 })
    expect(isSchematicDevice(vent, overrides)).toBe(false)
    expect(isSchematicDevice(vent, { ...overrides, ports: { StructurePassiveVent: [{ network: 'Pipe', role: 'None' }] } })).toBe(true)
  })

  it('still excludes passive structures and keeps hidden winning over an override', () => {
    expect(isSchematicDevice(raw({ prefab: 'StructurePipeStraight', isDevice: false }), overrides)).toBe(false)
    expect(isSchematicDevice(raw({ prefab: 'ItemTablet', isDevice: false }), { ...overrides, ports: { ItemTablet: [{ network: 'Data', role: 'None' }] } })).toBe(false)
    const hidden = { ...overrides, ports: { StructureHiddenThing: [{ network: 'Power', role: 'None' }] } }
    expect(isSchematicDevice(raw({ prefab: 'StructureHiddenThing', isDevice: false }), hidden)).toBe(false)
  })

  it('keeps admitting devices on their own connections or logic', () => {
    expect(isSchematicDevice(raw({ prefab: 'StructureX', connections: [{ network: 'Pipe', role: 'Input' }] }), overrides)).toBe(true)
    expect(isSchematicDevice(raw({ prefab: 'StructureY', logic: { On: 'ReadWrite' } }), overrides)).toBe(true)
    expect(isSchematicDevice(raw({ prefab: 'StructureZ' }), overrides)).toBe(false)
  })
})

describe('stripMarkup', () => {
  it('removes rich text and resolves thing links', () => {
    const names = (p: string) => (p === 'StructureSolarPanel' ? 'Solar Panel' : p)
    expect(stripMarkup('Use a <link=ThingX><color=green>Logic Reader</color></link> with {THING:StructureSolarPanel} and {LINK:LogicPage;Logic}.', names)).toBe(
      'Use a Logic Reader with Solar Panel and Logic.',
    )
  })
})

describe('buildCatalog', () => {
  const catalog = buildCatalog({
    prefabs: [
      raw({
        prefab: 'StructureFiltration',
        name: 'Old name',
        connections: [
          { network: 'Pipe', role: 'Input' },
          { network: 'PowerAndData', role: 'None' },
        ],
        logic: { On: 'ReadWrite', Pressure: 'Read', ClearMemory: 'Write' },
        slotLogic: { '0': { Quantity: 'Read' }, '1': {} },
        modes: { '0': 'Idle', '1': 'Active' },
        buildStates: [
          { item: 'ItemKitAtmospherics', quantity: 1 },
          { item: 'ItemSteelSheets', quantity: 3 },
          { item: 'ItemSteelSheets', quantity: 2 },
        ],
      }),
      raw({ prefab: 'StructureLogicReader', connections: [{ network: 'Data', role: 'Input' }], devicePins: undefined }),
      raw({ prefab: 'StructureHiddenThing', connections: [{ network: 'Power', role: 'None' }], buildStates: [{ item: 'ItemNeverReferenced', quantity: 9 }] }),
      raw({ prefab: 'StructurePipeStraight', isDevice: false }),
      raw({ prefab: 'ItemTablet', connections: [{ network: 'Data', role: 'None' }] }),
      raw({ prefab: 'StructureFrame', connections: [] }),
    ],
    enums: { logicTypes: { On: { value: 28, description: 'on/off' } }, slotLogicTypes: {} },
    english: new Map([
      ['StructureFiltration', { name: 'Filtration', description: 'Filters {THING:StructureLogicReader} gas' }],
      ['ItemKitAtmospherics', { name: 'Kit (Atmospherics)', description: '' }],
    ]),
    recipes: {},
    overrides,
    gameVersion: '0.2.1',
    extractedAt: '2026-01-01T00:00:00Z',
    hasIcon: (p) => p === 'StructureFiltration' || p === 'ItemKitAtmospherics',
  })

  it('keeps only structures that are devices with connections or logic', () => {
    expect(Object.keys(catalog.devices)).toEqual(['StructureFiltration', 'StructureLogicReader'])
  })

  it('uses current english names and maps access flags', () => {
    const f = catalog.devices.StructureFiltration
    expect(f.name).toBe('Filtration')
    expect(f.description).toBe('Filters StructureLogicReader gas')
    expect(f.logic).toEqual({ On: 'rw', Pressure: 'r', ClearMemory: 'w' })
    expect(f.slotLogic).toEqual({ '0': { Quantity: 'r' } })
    expect(f.modes).toEqual({ '0': 'Idle', '1': 'Active' })
    expect(f.icon).toBe('data/icons/StructureFiltration.webp')
    expect(f.category).toBe('Atmospherics')
    expect(catalog.devices.StructureLogicReader.icon).toBeUndefined()
  })

  it('lists only used categories, in override order', () => {
    expect(catalog.categories).toEqual(['Logic', 'Atmospherics'])
  })

  it('sorts map keys by code point so re-extractions diff cleanly', () => {
    const isSorted = (keys: string[]) => expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    isSorted(Object.keys(catalog.devices))
    isSorted(Object.keys(catalog.logicTypes))
    isSorted(Object.keys(catalog.devices.StructureFiltration.logic))
    isSorted(Object.keys(catalog.items))
  })

  it('sums build materials and omits build entirely when there are none', () => {
    expect(catalog.devices.StructureFiltration.build).toEqual([
      { item: 'ItemKitAtmospherics', quantity: 1 },
      { item: 'ItemSteelSheets', quantity: 5 },
    ])
    expect(catalog.devices.StructureLogicReader.build).toBeUndefined()
    expect('build' in catalog.devices.StructureLogicReader).toBe(false)
  })

  it('lists only items some kept device is built from, with names and icons resolved', () => {
    // StructureHiddenThing is dropped by `hidden`, so ItemNeverReferenced never reaches the items table.
    expect(Object.keys(catalog.items)).toEqual(['ItemKitAtmospherics', 'ItemSteelSheets'])
    expect(catalog.items.ItemKitAtmospherics).toEqual({
      prefab: 'ItemKitAtmospherics',
      name: 'Kit (Atmospherics)',
      icon: 'data/icons/ItemKitAtmospherics.webp',
    })
    // Falls back to the prefab when english.xml has no entry, and carries no icon.
    expect(catalog.items.ItemSteelSheets).toEqual({ prefab: 'ItemSteelSheets', name: 'ItemSteelSheets', icon: undefined })
  })
})

describe('buildMaterials', () => {
  it('sums per item and orders by item prefab', () => {
    expect(
      buildMaterials([
        { item: 'ItemSteelSheets', quantity: 5 },
        { item: 'ItemCableCoil', quantity: 2 },
        { item: 'ItemSteelSheets', quantity: 1 },
      ]),
    ).toEqual([
      { item: 'ItemCableCoil', quantity: 2 },
      { item: 'ItemSteelSheets', quantity: 6 },
    ])
  })

  it('is empty for a structure the game lists no consumables for', () => {
    expect(buildMaterials([])).toEqual([])
  })
})
