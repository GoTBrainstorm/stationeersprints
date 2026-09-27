import { cable, dev, link, net, note, ref, steps, zone, type Example } from './template'

export const solarTracker: Example = {
  id: 'solar-tracker',
  stage: 'Early',
  title: 'Solar panel sun tracking',
  summary: 'Daylight Sensor + Logic Readers, Math and Batch Writers keep every solar panel pointed at the sun.',
  description:
    'Keeps all solar panels aimed at the sun using logic chips only (no IC10).\n\n' +
    'A Daylight Sensor reports the sun angle. Two Logic Readers read its Horizontal and Vertical angles. ' +
    'Horizontal goes straight to the panels via a Batch Writer. Vertical is converted with 90 − Vertical (Logic Memory + Math unit) and written by a second Batch Writer.\n\n' +
    'Needs: Daylight Sensor, 2× Logic Reader, Logic Memory, Logic Math, 2× Batch Writer, cable. Early game on the Moon this roughly doubles solar output.',
  nodes: [
    zone('z-out', 'Outside', -60, -60, 1690, 660, '#c9803a'),
    zone('z-base', 'Base', 900, 640, 730, 220, '#5f9a63'),
    dev('sensor', 'StructureDaylightSensor', 0, 120, {
      note: 'Mount flat, facing up, with its data port pointing North.',
    }),
    dev('readH', 'StructureLogicReader', 320, 0, { label: 'Read Horizontal', settings: { device: ref('sensor'), variable: 'Horizontal' } }),
    dev('readV', 'StructureLogicReader', 320, 180, { label: 'Read Vertical', settings: { device: ref('sensor'), variable: 'Vertical' } }),
    dev('mem90', 'StructureLogicMemory', 320, 360, { label: 'Constant 90', settings: { value: 90 } }),
    dev('math', 'StructureLogicMath', 640, 250, {
      label: '90 − Vertical',
      settings: { a: ref('mem90'), b: ref('readV') },
      values: { Mode: 'Subtract' },
    }),
    dev('writeH', 'StructureLogicBatchWriter', 960, 0, {
      label: 'Write Horizontal',
      settings: { input: ref('readH'), prefab: 'StructureSolarPanel', variable: 'Horizontal' },
    }),
    dev('writeV', 'StructureLogicBatchWriter', 960, 250, {
      label: 'Write Vertical',
      settings: { input: ref('math'), prefab: 'StructureSolarPanel', variable: 'Vertical' },
    }),
    // Spread wide: a batch writer targets a *type*, so all six dashed arrows land on this column
    // and their "Horizontal"/"Vertical" labels pile up on each other if the panels sit close.
    dev('panel1', 'StructureSolarPanel', 1360, 0, { note: 'Data port pointing East.' }),
    dev('panel2', 'StructureSolarPanel', 1360, 220),
    dev('panel3', 'StructureSolarPanel', 1360, 440),
    net('net', '@CableNetwork', 'Solar cable network', 640, 480, 'top', true),
    dev('battery', 'StructureBattery', 960, 700, { note: 'Input on the solar network, output feeds the base.' }),
    net('base', '@CableNetwork', 'Base network', 1400, 720, 'left'),
    ...steps(0, 920, [
      'Place the Daylight Sensor flat (facing up) with its data port pointing North. Place all solar panels with their data ports pointing East. With this orientation, Horizontal needs no correction.',
      'Put the sensor, logic chips and panels on one cable network. Configure each chip with a screwdriver: the readers read the sensor; the batch writers target the "Solar Panel" type.',
      'Vertical: with the sensor facing up, its Vertical angle uses a different reference than the panels. Logic Memory (90) − sensor Vertical converts it. Using Heavy or Dual panels? Point the batch writers at that type instead.',
    ]),
    note(
      'n4',
      undefined,
      'The Daylight Sensor also has a Mode (Default / Horizontal / Vertical) that changes the frame its angles are reported in — worth trying if your panels end up 90° or 180° off. Otherwise check the data-port directions first.',
      960,
      920,
      300,
      140,
    ),
  ],
  links: [
    ...cable('sensor', 'net'),
    ...cable('readH', 'net'),
    ...cable('readV', 'net'),
    ...cable('mem90', 'net'),
    ...cable('math', 'net'),
    ...cable('writeH', 'net'),
    ...cable('writeV', 'net'),
    ...cable('panel1', 'net'),
    ...cable('panel2', 'net'),
    ...cable('panel3', 'net'),
    link('battery', 'Power:Input', 'net', 'Power'),
    link('battery', 'Power:Output', 'base', 'Power'),
  ],
}
