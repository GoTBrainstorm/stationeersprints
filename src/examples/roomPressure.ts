import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

export const roomPressure: Example = {
  id: 'room-pressure',
  stage: 'Early',
  title: 'Room pressure & oxygen regulation',
  summary: 'Two Active Vents with pressure settings keep a room near 100 kPa; logic scrubs CO₂ when it builds up.',
  description:
    'Two Active Vents do most of the work without any logic. The supply vent (Outward) pushes air from the air tank into the room until the room reaches its PressureExternal setting. ' +
    'The scrub vent (Inward) pulls room air into a waste tank. It runs when a Gas Sensor sees too much CO₂.\n\n' +
    'Needs: 2× Active Vent, Gas Sensor, air tank (O₂/N₂ mix) and a waste tank, Logic Reader, Logic Memory, Logic Compare, Logic Writer, pipes, cable.',
  nodes: [
    zone('z-room', 'Room', -60, -60, 1500, 640, '#5f9a63'),
    zone('z-store', 'Tank storage', 1460, -60, 400, 640, '#5a7da8'),
    dev('sensor', 'StructureGasSensor', 0, 200),
    dev('readCO2', 'StructureLogicReader', 320, 120, { label: 'CO₂ ratio', settings: { device: ref('sensor'), variable: 'RatioCarbonDioxide' } }),
    dev('max', 'StructureLogicMemory', 320, 300, { label: 'Max 1 % CO₂', settings: { value: 0.01 } }),
    dev('cmp', 'StructureLogicCompare', 640, 200, { label: 'Too much CO₂?', settings: { a: ref('readCO2'), b: ref('max') }, values: { Mode: 'Greater' } }),
    dev('w', 'StructureLogicWriter', 960, 200, { label: 'Scrub on/off', settings: { input: ref('cmp'), device: ref('scrub'), variable: 'On' } }),
    dev('supply', 'StructureActiveVent', 1180, 0, {
      label: 'Supply vent',
      values: { Mode: 'Outward', PressureExternal: '100', On: '1' },
      note: 'Stops pushing once the room reaches 100 kPa — no logic needed.',
    }),
    dev('scrub', 'StructureActiveVent', 1180, 340, { label: 'Scrub vent', values: { Mode: 'Inward' } }),
    dev('air', 'StructureCapsuleTankGas', 1520, 0, { label: 'Air tank (O₂ + N₂)' }),
    dev('waste', 'StructureCapsuleTankGas', 1520, 340, { label: 'Waste tank' }),
    net('net', '@CableNetwork', 'Power + data', 640, 500, 'top', true),
    ...steps(0, 760, [
      'Fill the air tank with breathable air, about 1 part O₂ to 3–4 parts N₂. Pure O₂ works but is a fire hazard.',
      'Supply vent: Mode Outward, PressureExternal 100 (kPa). It keeps refilling the room as air is lost through doors or scrubbing.',
      'Scrub vent: Mode Inward. The logic chips turn it on above 1 % CO₂. Filter the waste tank later to recover O₂/N₂ — see the gas filtering example.',
    ]),
  ],
  links: [
    link('supply', 'Pipe', 'air', 'Pipe'),
    link('scrub', 'Pipe', 'waste', 'Pipe'),
    ...cable('sensor', 'net'),
    ...cable('supply', 'net'),
    ...cable('scrub', 'net'),
    ...cable('readCO2', 'net'),
    ...cable('max', 'net'),
    ...cable('cmp', 'net'),
    ...cable('w', 'net'),
  ],
}
