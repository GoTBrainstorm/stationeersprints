import { cable, dev, link, net, note, ref, steps, zone, type Example } from './template'

const CODE = `# Furnace temperature/pressure controller
# d0 = Furnace, d1 = fuel Volume Pump, d2 = exhaust Volume Pump
alias Furnace d0
alias FuelPump d1
alias ExhaustPump d2
# Invar: 1200-1500 K, 18000-20000 kPa (see Furnace recipes)
define TARGET_T 1300
define TARGET_P 19000

loop:
yield
l r0 Furnace Temperature
l r1 Furnace Pressure
# Too cold and room to add gas: pump in fuel and ignite it
slt r2 r0 TARGET_T
slt r3 r1 TARGET_P
and r2 r2 r3
s FuelPump On r2
s Furnace Activate r2
# Above target pressure: pump exhaust out
sgt r4 r1 TARGET_P
s ExhaustPump On r4
j loop
`

export const alloySmelting: Example = {
  id: 'alloy-smelting',
  stage: 'Mid',
  title: 'Furnace alloy smelting (Steel, Invar, Constantan…)',
  summary: 'Fuel mix of volatiles and oxygen, pumps and an IC10 controller hold the furnace in an alloy\'s temperature/pressure window.',
  description:
    'Alloys only form inside a temperature and pressure window. For example Steel needs ≥ 900 K and ≥ 1000 kPa, Electrum 600+ K at 800–2400 kPa, Invar 1200–1500 K at 18000–20000 kPa, ' +
    'Constantan ≥ 1000 K at ≥ 20000 kPa, and Solder 350–550 K at ≥ 1000 kPa. Select the Furnace to see the full recipe table from the game data.\n\n' +
    'A Gas Mixer blends Volatiles and Oxygen 2:1. A Volume Pump feeds the mix into the Furnace, where Activate ignites it. ' +
    'A second pump removes exhaust when pressure gets too high. An IC10 chip runs both pumps.\n\n' +
    'Needs: Furnace, Gas Mixer, 2× Volume Pump, gas tanks/canisters of Volatiles and Oxygen, IC Housing + IC10, pipes, chutes, cable.',
  nodes: [
    zone('z-gas', 'Fuel supply', -60, -60, 620, 460, '#5a7da8'),
    // Oxygen sits above Volatiles because the mixer draws input 2 on its upper row.
    dev('o2', 'StructureCapsuleTankGas', 0, 0, { label: 'Oxygen tank' }),
    dev('vol', 'StructureCapsuleTankGas', 0, 260, { label: 'Volatiles tank' }),
    dev('mixer', 'StructureGasMixer', 320, 120, {
      label: 'Fuel mixer',
      values: { Setting: '67', On: '1' },
      note: 'Setting = share of input 1 (volatiles) in %. 67 % gives 2:1 volatiles:oxygen.',
    }),
    dev('oreIn', 'StructureChuteBin', 640, -160, { label: 'Ore in' }),
    dev('fuelPump', 'StructureVolumePump', 640, 160, { label: 'Fuel pump' }),
    dev('furnace', 'StructureFurnace', 960, 40, { note: 'Ore goes in through the chute; alloy ingots come out once the window is reached.' }),
    dev('ingotsOut', 'StructureChuteExportBin', 1280, -160, { label: 'Ingots out' }),
    dev('exhaustPump', 'StructureVolumePump', 1280, 160, { label: 'Exhaust pump' }),
    net('exhaust', '@PipeNetwork', 'Exhaust → waste tank / outside', 1600, 180, 'left'),
    dev('ic', 'StructureCircuitHousing', 960, 380, {
      label: 'Furnace controller',
      settings: { d0: ref('furnace'), d1: ref('fuelPump'), d2: ref('exhaustPump'), code: CODE },
    }),
    net('net', '@CableNetwork', 'Power + data', 960, 620, 'top', true),
    ...steps(0, 780, [
      'Fill one tank with Volatiles (H₂) and one with Oxygen. Set the Gas Mixer to 67 % input 1 so the fuel mix burns cleanly (2:1).',
      'Put the fuel pump between the mixer and the furnace\'s gas input, and the exhaust pump on the furnace\'s gas output.',
      'Set TARGET_T / TARGET_P in the IC10 code to the middle of your alloy\'s window. Load both ores in the right ratio (e.g. 1 iron : 1 nickel for Invar).',
    ]),
    note(
      'n4',
      undefined,
      'High-pressure alloys (Invar, Constantan) need a lot of gas in the furnace. A Turbo Volume Pump or pre-pressurised fuel helps. Watch the furnace\'s max pressure.',
      960,
      780,
      300,
      140,
    ),
  ],
  links: [
    link('vol', 'Pipe', 'mixer', 'Pipe:Input'),
    link('o2', 'Pipe', 'mixer', 'Pipe:Input2'),
    link('mixer', 'Pipe:Output', 'fuelPump', 'Pipe:Input'),
    link('fuelPump', 'Pipe:Output', 'furnace', 'Pipe:Input'),
    link('furnace', 'Pipe:Output', 'exhaustPump', 'Pipe:Input'),
    link('exhaustPump', 'Pipe:Output', 'exhaust', 'Pipe'),
    link('oreIn', 'Chute:Output', 'furnace', 'Chute:Input'),
    link('furnace', 'Chute:Output', 'ingotsOut', 'Chute:Input'),
    ...cable('mixer', 'net'),
    ...cable('oreIn', 'net'),
    ...cable('ingotsOut', 'net'),
    ...cable('fuelPump', 'net'),
    ...cable('exhaustPump', 'net'),
    ...cable('furnace', 'net'),
    ...cable('ic', 'net'),
  ],
}
