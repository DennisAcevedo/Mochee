import { Vector3 } from 'three'
import { newBossPose, newGuyPose } from './timeline'

// This frame's fight, worked out once (BossArena, before anyone reads it) and
// shared by the boss, the effects, the tutor layer and the HUD variables.
export const arenaFrame = {
  now: 0, // performance.now()
  k: 0, // takeover blend: 0 = lesson, 1 = fight
  room: 0, // the room's pop-away progress, 0..1 (linear in time)
  motion: 1, // idle amplitude: lower while he walks, and under reduced motion
  boss: newBossPose(),
  guy: newGuyPose(),
  bossAt: new Vector3(), // the boss's root (world), hit jitter included
  guyAt: new Vector3(), // his feet before the fight layer (world)
  shake: { x: 0, y: 0 }, // px
}
