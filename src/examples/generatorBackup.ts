import { cable, dev, link, net, ref, steps, zone, type Example } from './template'

const CODE = `# Backup generator with hysteresis
# d0 = Station Battery, d1 = Solid Fuel Generator
alias Battery d0
alias Generator d1
define LOW 0.2    # start below 20 %
define HIGH 0.95  # stop above 95 %

loop:
yield
l r0 Battery Ratio
l r1 Generator On
slt r2 r0 LOW      # r2 = battery low
sgt r3 r0 HIGH     # r3 = battery full
or r1 r1 r2        # low -> switch on
select r1 r3 0 r1  # full -> switch off
s Generator On r1
j loop
`

export const generatorBackup: Example = {
  id: 'generator-backup',
  stage: 'Early',
  title: 'Backup generator auto-start',
  summary: 'IC10 chip starts a solid fuel generator when batteries drop below 20 % and stops it at 95 %.',
  description:
    'Solar is not enough at night or during storms. This IC10 controller watches the station battery and runs a Solid Fuel Generator only when needed, ' +
    'with hysteresis (on below 20 %, off above 95 %) so it does not flicker on and off.\n\n' +
    'Needs: IC Housing + Integrated Circuit (IC10), Solid Fuel Generator, Station Battery, cable. Fuel: coal or other solid fuel.',
  nodes: [
    zone('z-gen', 'Generation', -60, -60, 760, 620, '#c9803a'),
    zone('z-base', 'Base', 720, -60, 520, 620, '#5f9a63'),
    dev('gen', 'StructureSolidFuelGenerator', 0, 0, { note: 'Keep it stocked with coal (a chute feed or manual).' }),
    dev('battery', 'StructureBattery', 400, 0),
    dev('ic', 'StructureCircuitHousing', 0, 250, {
      label: 'Generator controller',
      settings: { d0: ref('battery'), d1: ref('gen'), code: CODE },
    }),
    net('genNet', '@CableNetwork', 'Generation network', 200, 460),
    dev('apc', 'StructureAreaPowerControl', 800, 60, { note: 'Base consumers hang off the APC.' }),
    net('baseNet', '@CableNetwork', 'Base network', 780, 460),
    ...steps(0, 700, [
      'Put the generator, the battery input and the IC Housing on one cable network. The housing only needs data access to the other two devices.',
      'Set the housing screws: d0 = Station Battery, d1 = Generator. Insert a chip programmed with the code (open the IC Housing inspector to copy it).',
      'Change LOW / HIGH to taste. The battery Ratio goes from 0 (empty) to 1 (full); keeping the two apart is what stops the generator flickering.',
    ]),
  ],
  links: [
    link('gen', 'Power', 'genNet', 'Power'),
    link('gen', 'Data', 'genNet', 'Data'),
    link('battery', 'Power:Input', 'genNet', 'Power'),
    link('battery', 'Data', 'genNet', 'Data'),
    link('battery', 'Power:Output', 'baseNet', 'Power'),
    ...cable('ic', 'genNet'),
    link('apc', 'Power:Input', 'baseNet', 'Power'),
  ],
}
