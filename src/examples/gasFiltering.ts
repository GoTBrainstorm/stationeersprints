import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

export const gasFiltering: Example = {
  id: 'gas-filtering',
  stage: 'Early–mid',
  title: 'Atmosphere harvesting & gas filtering',
  summary: 'An Active Vent pulls in the outside air; Filtration units split out CO₂ and N₂ into tanks; logic stops filtering when a tank is full.',
  description:
    'On planets with an atmosphere (Mars, Vulcan, Venus…) the air outside is a free source of gases. An Active Vent in Inward mode pulls it into a pipe. ' +
    'A chain of Filtration units, each with a gas filter in its slot, splits it up. Filtered gas leaves through the output. Everything else leaves through the waste port and goes to the next unit.\n\n' +
    'A Logic Reader watches the CO₂ tank pressure and turns the first filter off when the tank is full. Copy that pattern for every tank.\n\n' +
    'Needs: Active Vent, 2× Filtration, gas filters (CO₂, N₂), 2× tanks, a Passive Vent for leftovers, Logic Reader/Memory/Compare/Writer, pipes, cable.',
  nodes: [
    zone('z-out', 'Outside', -60, -60, 320, 260, '#c9803a'),
    dev('vent', 'StructureActiveVent', 0, 40, { label: 'Intake vent', values: { Mode: 'Inward', On: '1' } }),
    dev('f1', 'StructureFiltration', 320, 40, { label: 'CO₂ filtration', note: 'Filter slot: Carbon Dioxide filter. Left off here — the logic below switches it.' }),
    dev('co2', 'StructureCapsuleTankGas', 660, -140, { label: 'CO₂ tank' }),
    dev('f2', 'StructureFiltration', 660, 180, { label: 'N₂ filtration', values: { On: '1' }, note: 'Filter slot: Nitrogen filter. Nothing limits this one, so it just runs.' }),
    dev('n2tank', 'StructureCapsuleTankGas', 980, 40, { label: 'N₂ tank' }),
    net('rest', '@PipeNetwork', 'Leftover gas → passive vent', 980, 320, 'left'),
    // The feedback row reads right to left: the pressure it samples is at the far end of the
    // chain, the filter it switches is at the near end, so the arrows stay short and uncrossed.
    dev('readP', 'StructureLogicReader', 980, 500, { label: 'CO₂ tank pressure', settings: { device: ref('co2'), variable: 'Pressure' } }),
    dev('cmp', 'StructureLogicCompare', 660, 500, { label: 'Room left?', settings: { a: ref('readP'), b: ref('limit') }, values: { Mode: 'Less' } }),
    dev('w', 'StructureLogicWriter', 320, 500, { label: 'CO₂ filter on/off', settings: { input: ref('cmp'), device: ref('f1'), variable: 'On' } }),
    // The limit sits under the writer rather than under the compare: directly below, both of the
    // compare's inputs arrive from the same side and the "Input 2" arrow lands on its own title.
    dev('limit', 'StructureLogicMemory', 320, 720, { label: 'Limit 5000 kPa', settings: { value: 5000 } }),
    net('net', '@CableNetwork', 'Power + data', 660, 880, 'top', true),
    ...steps(0, 1020, [
      'Put the Active Vent outside and set Mode to Inward. It pulls outside air into the intake pipe.',
      'Filtration units: filtered gas leaves through the output, the rest through the waste port. Chain waste → next unit\'s input, and vent the final leftovers outside.',
      'Keep tank pressure below its limit — here the CO₂ filter switches off above 5000 kPa. Copy this reader/compare/writer set for the N₂ tank. Filters wear out, so keep spares.',
    ]),
  ],
  links: [
    link('vent', 'Pipe', 'f1', 'Pipe:Input'),
    link('f1', 'Pipe:Output', 'co2', 'Pipe'),
    link('f1', 'Pipe:Waste', 'f2', 'Pipe:Input'),
    link('f2', 'Pipe:Output', 'n2tank', 'Pipe'),
    link('f2', 'Pipe:Waste', 'rest', 'Pipe'),
    ...cable('vent', 'net'),
    ...cable('f1', 'net'),
    ...cable('f2', 'net'),
    ...cable('co2', 'net'),
    ...cable('n2tank', 'net'),
    ...cable('readP', 'net'),
    ...cable('limit', 'net'),
    ...cable('cmp', 'net'),
    ...cable('w', 'net'),
  ],
}
