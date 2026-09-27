import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

export const greenhouse: Example = {
  id: 'greenhouse',
  stage: 'Mid',
  title: 'Greenhouse: lights, water and CO₂',
  summary: 'Grow lights follow the day/night cycle via a batch writer, hydroponics get piped water, and CO₂ is topped up automatically.',
  description:
    'Plants need light, water, CO₂ and a comfortable temperature.\n\n' +
    '• Light: a Daylight Sensor outside measures solar irradiance. When it is dark, a Batch Writer switches every Grow Light on.\n' +
    '• Water: hydroponics devices share a liquid pipe network fed from a water tank.\n' +
    '• CO₂: a Gas Sensor watches the CO₂ ratio. An Active Vent from a CO₂ tank tops it up.\n' +
    '• Temperature: combine with the room temperature example.\n\n' +
    'Needs: hydroponics devices, Grow Lights, Daylight Sensor, Gas Sensor, Active Vent, CO₂ tank, liquid tank, logic chips, pipes, cable.',
  nodes: [
    zone('z-out', 'Outside', -60, -60, 320, 240, '#c9803a'),
    zone('z-gh', 'Greenhouse', 300, -60, 1620, 1120, '#5f9a63'),
    dev('day', 'StructureDaylightSensor', 0, 20, { note: 'Needs a clear view of the sky.' }),
    // Light band
    dev('readSun', 'StructureLogicReader', 340, 20, { label: 'Sunlight', settings: { device: ref('day'), variable: 'SolarIrradiance' } }),
    dev('dark', 'StructureLogicMemory', 340, 180, { label: 'Dark below 100', settings: { value: 100 } }),
    dev('isDark', 'StructureLogicCompare', 660, 100, { label: 'Is it dark?', settings: { a: ref('readSun'), b: ref('dark') }, values: { Mode: 'Less' } }),
    dev('lights', 'StructureLogicBatchWriter', 980, 100, {
      label: 'All grow lights',
      settings: { input: ref('isDark'), prefab: 'StructureGrowLight', variable: 'On' },
    }),
    dev('light1', 'StructureGrowLight', 1300, 20),
    dev('light2', 'StructureGrowLight', 1300, 180),
    // Water band — every liquid port sits on the underside of its device, so the network hub
    // goes below the row it serves.
    dev('water', 'StructureCapsuleTankLiquid', 340, 380, { label: 'Water tank' }),
    dev('tray1', 'StructureHydroponicsTrayData', 980, 380, { label: 'Hydroponics 1' }),
    dev('tray2', 'StructureHydroponicsTrayData', 1300, 380, { label: 'Hydroponics 2' }),
    net('liquid', '@LiquidNetwork', 'Water supply', 660, 560),
    // CO₂ band
    dev('gas', 'StructureGasSensor', 340, 700),
    dev('readCO2', 'StructureLogicReader', 660, 700, { label: 'CO₂ ratio', settings: { device: ref('gas'), variable: 'RatioCarbonDioxide' } }),
    dev('minCO2', 'StructureLogicMemory', 660, 860, { label: 'Min 3 % CO₂', settings: { value: 0.03 } }),
    dev('lowCO2', 'StructureLogicCompare', 980, 780, { label: 'CO₂ low?', settings: { a: ref('readCO2'), b: ref('minCO2') }, values: { Mode: 'Less' } }),
    dev('wCO2', 'StructureLogicWriter', 1300, 780, { label: 'CO₂ vent on/off', settings: { input: ref('lowCO2'), device: ref('co2vent'), variable: 'On' } }),
    dev('co2vent', 'StructureActiveVent', 1620, 700, { label: 'CO₂ vent', values: { Mode: 'Outward' } }),
    dev('co2tank', 'StructureCapsuleTankGas', 1620, 880, { label: 'CO₂ tank' }),
    net('net', '@CableNetwork', 'Power + data', 980, 1000, 'top', true),
    ...steps(0, 1240, [
      'Mount the Daylight Sensor outside with a clear view of the sky. Adjust the "dark" threshold until the lights switch at dusk.',
      'Hydroponics devices take water from the liquid network. Keep the water above freezing: insulate the pipes or heat the room.',
      'Plants breathe CO₂ and release O₂. Topping up to ~3 % CO₂ speeds up growth. Scrub the extra O₂ with the room pressure setup.',
    ]),
  ],
  links: [
    ...cable('day', 'net'),
    ...cable('readSun', 'net'),
    ...cable('dark', 'net'),
    ...cable('isDark', 'net'),
    ...cable('lights', 'net'),
    ...cable('light1', 'net'),
    ...cable('light2', 'net'),
    ...cable('tray1', 'net'),
    ...cable('tray2', 'net'),
    ...cable('gas', 'net'),
    ...cable('readCO2', 'net'),
    ...cable('minCO2', 'net'),
    ...cable('lowCO2', 'net'),
    ...cable('wCO2', 'net'),
    ...cable('co2vent', 'net'),
    link('water', 'PipeLiquid', 'liquid', 'PipeLiquid'),
    link('tray1', 'PipeLiquid', 'liquid', 'PipeLiquid'),
    link('tray2', 'PipeLiquid', 'liquid', 'PipeLiquid'),
    link('co2vent', 'Pipe', 'co2tank', 'Pipe'),
  ],
}
