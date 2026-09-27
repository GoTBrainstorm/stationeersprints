import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

export const waterFromIce: Example = {
  id: 'water-from-ice',
  stage: 'Early–mid',
  title: 'Water from ice',
  summary: 'An Ice Crusher melts ice into a liquid tank; a liquid volume pump distributes water; logic stops crushing when the tank is full.',
  description:
    'Ice (water ice, or other ices for their gases) goes into an Ice Crusher through a chute. The crusher outputs liquid water into a liquid pipe network and tank, and any gases trapped in the ice into a separate gas pipe. ' +
    'A Liquid Volume Pump moves water to consumers such as hydroponics or a water bottle filler.\n\n' +
    'Logic reads the tank pressure and switches the crusher off when the tank is full.\n\n' +
    'Needs: Chute Import Bin, Ice Crusher, liquid tank, Liquid Volume Pump, liquid pipes, Logic Reader/Memory/Compare/Writer, cable.',
  nodes: [
    zone('z-in', 'Heated room (above 273 K)', -60, -60, 1600, 1020, '#5f9a63'),
    dev('bin', 'StructureChuteBin', 0, 60, { label: 'Ice in' }),
    dev('crusher', 'StructureIceCrusher', 320, 60),
    net('gases', '@PipeNetwork', 'Gases released from ice', 660, 20, 'left'),
    dev('pump', 'StructureLiquidVolumePump', 980, 60, { label: 'Water pump', values: { Setting: '10', On: '1' } }),
    net('supply', '@LiquidNetwork', 'Water to hydroponics / filler', 1300, 80, 'left'),
    // Off the reader's column on purpose: directly above it, the "Pressure" logic arrow is so
    // short that its label lands on the tank's own subtitle.
    dev('tank', 'StructureCapsuleTankLiquid', 1300, 300, { label: 'Water tank' }),
    net('raw', '@LiquidNetwork', 'Crusher output', 660, 420),
    // Feedback row, read right to left: the pressure comes from the tank on the right, the
    // switch lands on the crusher on the left, so no arrow has to cross the pipe run.
    dev('readP', 'StructureLogicReader', 980, 560, { label: 'Tank pressure', settings: { device: ref('tank'), variable: 'Pressure' } }),
    dev('cmp', 'StructureLogicCompare', 660, 560, { label: 'Room left?', settings: { a: ref('readP'), b: ref('full') }, values: { Mode: 'Less' } }),
    dev('w', 'StructureLogicWriter', 320, 560, { label: 'Crusher on/off', settings: { input: ref('cmp'), device: ref('crusher'), variable: 'On' } }),
    // The limit sits under the writer rather than under the compare: directly below, both of the
    // compare's inputs arrive from the same side and the "Input 2" arrow lands on its own title.
    dev('full', 'StructureLogicMemory', 320, 780, { label: 'Full at 3000 kPa', settings: { value: 3000 } }),
    net('net', '@CableNetwork', 'Power + data', 660, 900, 'top', true),
    ...steps(0, 1040, [
      'Mine ice (or pick up ice chunks) and drop it in the bin. The crusher melts one piece at a time.',
      'Liquid pipes are separate from gas pipes. Keep water above 273 K or it freezes and can burst pipes. Insulated liquid pipes help outside.',
      'The pump Setting is litres per tick. Adjust the "full" limit to your tank\'s maximum pressure.',
    ]),
  ],
  links: [
    link('bin', 'Chute:Output', 'crusher', 'Chute:Input'),
    link('crusher', 'PipeLiquid:Output2', 'raw', 'PipeLiquid'),
    link('crusher', 'Pipe:Output', 'gases', 'Pipe'),
    link('tank', 'PipeLiquid', 'raw', 'PipeLiquid'),
    link('pump', 'PipeLiquid:Input', 'raw', 'PipeLiquid'),
    link('pump', 'PipeLiquid:Output', 'supply', 'PipeLiquid'),
    ...cable('bin', 'net'),
    ...cable('crusher', 'net'),
    ...cable('pump', 'net'),
    ...cable('tank', 'net'),
    ...cable('readP', 'net'),
    ...cable('full', 'net'),
    ...cable('cmp', 'net'),
    ...cable('w', 'net'),
  ],
}
