import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

const CODE = `# Airlock cycler
# d0 inner door, d1 outer door, d2 active vent,
# d3 gas sensor (inside the airlock), d4 button "to base", d5 button "to outside"
alias InnerDoor d0
alias OuterDoor d1
alias Vent d2
alias Sensor d3
alias BtnIn d4
alias BtnOut d5
define BASE_P 100  # kPa before opening to the base
define OUT_P 1     # kPa before opening outside (set to outside pressure on planets with air)

idle:
yield
l r0 BtnIn Activate
bgtz r0 toBase
l r0 BtnOut Activate
bgtz r0 toOutside
j idle

toOutside:
jal closeDoors
s Vent Mode 1      # Inward: pump airlock air into the buffer tank
s Vent On 1
drain:
yield
l r0 Sensor Pressure
bgt r0 OUT_P drain
s Vent On 0
s OuterDoor Open 1
j idle

toBase:
jal closeDoors
s Vent Mode 0      # Outward: refill from the buffer tank
s Vent On 1
fill:
yield
l r0 Sensor Pressure
blt r0 BASE_P fill
s Vent On 0
s InnerDoor Open 1
j idle

closeDoors:
s InnerDoor Open 0
s OuterDoor Open 0
sleep 1
j ra
`

export const airlock: Example = {
  id: 'airlock',
  stage: 'Early–mid',
  title: 'Automated airlock',
  summary: 'IC10 airlock: one button drains the chamber into a buffer tank and opens outside; the other refills and opens to the base.',
  description:
    'A small chamber between two doors. Press "to outside" and the chip closes both doors, pumps the chamber air into a buffer tank, then opens the outer door. ' +
    'Press "to base" and it closes the doors, refills from the buffer tank, then opens the inner door. The air is reused, not lost.\n\n' +
    'Needs: 2× Airlock door, Active Vent, Gas Sensor, 2× Button, small tank, IC Housing + IC10, pipe, cable.',
  nodes: [
    zone('z-base', 'Base', -60, -60, 340, 500, '#5f9a63'),
    zone('z-lock', 'Airlock chamber', 300, -60, 660, 500, '#5a7da8'),
    zone('z-out', 'Outside', 1000, -60, 340, 500, '#c9803a'),
    // Both doors must be in Logic mode, or they ignore the chip and only answer the door panel.
    dev('inner', 'StructureAirlock', 0, 200, { label: 'Inner door', values: { Mode: 'Logic' } }),
    dev('outer', 'StructureAirlock', 1040, 200, { label: 'Outer door', values: { Mode: 'Logic' } }),
    dev('sensor', 'StructureGasSensor', 340, 40, { label: 'Airlock sensor' }),
    dev('btnIn', 'StructureLogicButton', 660, 40, { label: 'Button: to base' }),
    dev('vent', 'StructureActiveVent', 340, 340, { label: 'Airlock vent' }),
    dev('btnOut', 'StructureLogicButton', 660, 340, { label: 'Button: to outside' }),
    dev('tank', 'StructureCapsuleTankGas', 560, 620, { label: 'Buffer tank' }),
    dev('ic', 'StructureCircuitHousing', 920, 620, {
      label: 'Airlock controller',
      settings: { d0: ref('inner'), d1: ref('outer'), d2: ref('vent'), d3: ref('sensor'), d4: ref('btnIn'), d5: ref('btnOut'), code: CODE },
    }),
    net('net', '@CableNetwork', 'Power + data', 700, 860, 'top', true),
    ...steps(0, 1000, [
      'Keep the chamber small (1×1 or 1×2): less air to pump means faster cycles.',
      'The vent pipe goes to the buffer tank. Its Mode flips between Inward (drain) and Outward (refill), so don\'t set it by hand.',
      'On planets with an atmosphere, set OUT_P to the outside pressure. Otherwise the vent keeps pumping and never gets there.',
    ]),
  ],
  links: [
    link('vent', 'Pipe', 'tank', 'Pipe'),
    ...cable('inner', 'net'),
    ...cable('outer', 'net'),
    ...cable('vent', 'net'),
    ...cable('sensor', 'net'),
    ...cable('btnIn', 'net'),
    ...cable('btnOut', 'net'),
    ...cable('ic', 'net'),
  ],
}
