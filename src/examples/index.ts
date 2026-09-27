import { airlock } from './airlock'
import { alloySmelting } from './alloySmelting'
import { arcFurnace } from './arcFurnace'
import { gasFiltering } from './gasFiltering'
import { generatorBackup } from './generatorBackup'
import { greenhouse } from './greenhouse'
import { roomCooling } from './roomCooling'
import { roomPressure } from './roomPressure'
import { solarTracker } from './solarTracker'
import type { Example } from './template'
import { waterFromIce } from './waterFromIce'

export const EXAMPLES: Example[] = [
  solarTracker,
  generatorBackup,
  arcFurnace,
  alloySmelting,
  roomCooling,
  gasFiltering,
  roomPressure,
  airlock,
  greenhouse,
  waterFromIce,
]

export { instantiate } from './template'
