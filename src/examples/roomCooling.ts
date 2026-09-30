import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

export const roomCooling: Example = {
  id: 'room-cooling',
  stage: 'Early–mid',
  title: 'Room temperature control (cooler + heater)',
  summary: 'Gas Sensor readings switch a Wall Cooler (with radiators outside) and a Wall Heater to keep a room between 20 °C and 25 °C.',
  description:
    'A Wall Cooler moves heat from the room into a gas-filled pipe loop. Radiators outside dump that heat. A Wall Heater covers cold nights.\n\n' +
    'Logic: a Gas Sensor measures room temperature. Two Logic Compare chips check it against constants in Logic Memory: above 298 K (25 °C) switches the cooler on, below 293 K (20 °C) switches the heater on.\n\n' +
    'Needs: Gas Sensor, Logic Reader, 2× Logic Memory, 2× Logic Compare, 2× Logic Writer, Wall Cooler, Wall Heater, pipe radiators, and a pipe loop filled with coolant gas (e.g. CO₂ or N₂).',
  nodes: [
    zone('z-in', 'Inside (room)', -60, -60, 1600, 700, '#5f9a63'),
    zone('z-out', 'Outside', 1560, -60, 340, 200, '#c9803a'),
    dev('sensor', 'StructureGasSensor', 0, 180),
    dev('hot', 'StructureLogicMemory', 320, 0, { label: '298 K (25 °C)', settings: { value: 298 } }),
    dev('readT', 'StructureLogicReader', 320, 180, { label: 'Room temperature', settings: { device: ref('sensor'), variable: 'Temperature' } }),
    dev('cold', 'StructureLogicMemory', 320, 360, { label: '293 K (20 °C)', settings: { value: 293 } }),
    dev('cmpHot', 'StructureLogicCompare', 640, 60, { label: 'Too hot?', settings: { a: ref('readT'), b: ref('hot') }, values: { Mode: 'Greater' } }),
    dev('cmpCold', 'StructureLogicCompare', 640, 300, { label: 'Too cold?', settings: { a: ref('readT'), b: ref('cold') }, values: { Mode: 'Less' } }),
    dev('wCool', 'StructureLogicWriter', 960, 60, { label: 'Cooler on/off', settings: { input: ref('cmpHot'), device: ref('cooler'), variable: 'On' } }),
    dev('wHeat', 'StructureLogicWriter', 960, 300, { label: 'Heater on/off', settings: { input: ref('cmpCold'), device: ref('heater'), variable: 'On' } }),
    dev('cooler', 'StructureWallCooler', 1280, 20),
    dev('heater', 'StructureWallHeater', 1280, 400),
    { ...net('loop', '@PipeNetwork', 'Coolant loop → radiators', 1600, 20, 'left'), insulated: true },
    net('net', '@CableNetwork', 'Power + data', 640, 560, 'top', true),
    ...steps(0, 780, [
      'Mount the Wall Cooler on an inside wall. Run its pipe to radiators outside and fill the loop with a gas (CO₂ or N₂ works). No gas = no cooling.',
      'Radiators work best in shade or at night. On hot planets you may need many of them, or an Air Conditioner instead.',
      'The two Memory chips hold the band edges. Between 20 and 25 °C both devices stay off, which saves power and avoids fighting each other.',
    ]),
  ],
  links: [
    ...cable('sensor', 'net'),
    ...cable('readT', 'net'),
    ...cable('hot', 'net'),
    ...cable('cold', 'net'),
    ...cable('cmpHot', 'net'),
    ...cable('cmpCold', 'net'),
    ...cable('wCool', 'net'),
    ...cable('wHeat', 'net'),
    ...cable('cooler', 'net'),
    ...cable('heater', 'net'),
    link('cooler', 'Pipe', 'loop', 'Pipe'),
  ],
}
