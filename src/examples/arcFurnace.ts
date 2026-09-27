import { cable, dev, link, net, note, steps, type Example } from './template'

export const arcFurnace: Example = {
  id: 'arc-furnace',
  stage: 'Early',
  title: 'Arc furnace ore processing line',
  summary: 'Dump ore into a bin; a sorter routes it through an Arc Furnace and ingots come out stacked.',
  description:
    'A simple chute line for early smelting. Ore goes into a Chute Import Bin. A Sorter sends smeltable ore into the Arc Furnace and everything else to a reject bin. ' +
    'Ingots from the furnace are stacked and collected in an export bin.\n\n' +
    'Needs: Chute Import Bin, Sorter, Arc Furnace, Stacker, 2× Chute Export Bin, chutes, cable. The Arc Furnace needs plenty of power.',
  nodes: [
    dev('reject', 'StructureChuteExportBin', 640, -200, { label: 'Rejects' }),
    dev('in', 'StructureChuteBin', 0, 60, { label: 'Ore in' }),
    dev('sorter', 'StructureSorter', 320, 20, {
      values: { Mode: 'Filter' },
      note: 'Output 1 feeds the furnace, Output 2 the reject bin. Mode Filter uses the sorter\'s own filter list; Mode Logic lets an IC10 pick per item.',
    }),
    dev('arc', 'StructureArcFurnace', 760, 60),
    dev('stacker', 'StructureStacker', 1080, 60, { note: 'Collects single ingots into stacks.' }),
    dev('out', 'StructureChuteExportBin', 1400, 60, { label: 'Ingots out' }),
    net('net', '@CableNetwork', 'Power + data', 640, 420, 'top', true),
    ...steps(0, 600, [
      'Lay chutes: bin → sorter → arc furnace → stacker → export bin, and a second branch from the sorter to the reject bin. Chute arrows set the flow direction.',
      'Power the sorter, both bins, the furnace and the stacker. The Arc Furnace draws a lot of power while smelting; add batteries or a generator if your solar can\'t keep up.',
    ]),
    note(
      'n3',
      undefined,
      'The Arc Furnace only makes pure ingots (iron, copper, gold, silver, lead, nickel, silicon…). Alloys need the Furnace — see the alloy smelting example.',
      640,
      600,
      300,
      140,
    ),
  ],
  links: [
    link('in', 'Chute:Output', 'sorter', 'Chute:Input'),
    link('sorter', 'Chute:Output', 'arc', 'Chute:Input'),
    link('sorter', 'Chute:Output2', 'reject', 'Chute:Input'),
    link('arc', 'Chute:Output', 'stacker', 'Chute:Input'),
    link('stacker', 'Chute:Output', 'out', 'Chute:Input'),
    ...cable('in', 'net'),
    ...cable('sorter', 'net'),
    ...cable('reject', 'net'),
    ...cable('arc', 'net'),
    ...cable('stacker', 'net'),
    ...cable('out', 'net'),
  ],
}
