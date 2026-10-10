import { BallRack, CourtLines, Dashes, GymHoop, Scoreboard } from './gymProps'
import { useOwned } from './parts'
import { RoomShell, ShadowCatcher } from './RoomShell'
import { plankTexture } from './textures'
import { WORLD, type Band, type HoopDraw } from './worldConfig'

// Play: a loud, sunny gym. Orange, sky and purple stripes over a warm yellow
// wall, a wooden court with white lines, the hoop on the right wall (where
// the toy hoop's rim is), a SHOTS scoreboard and a ball rack. The tutor's and
// the toys' shadows land on the court through a shadow catcher.

const G = WORLD.play
const BANDS: Band[] = [{ from: 0, to: G.skirting.height, color: G.skirting.color }, ...G.stripes]

export interface PlayWorldProps {
  hoop?: HoopDraw // 'mount' (default): the toy hoop draws board, rim and net; 'full': the gym draws them too
}

export function PlayWorld({ hoop = G.hoop.draw }: PlayWorldProps) {
  const planks = useOwned(plankTexture)
  return (
    <group name="world-play">
      <RoomShell wall={G.wall} bands={BANDS} floor={G.floor} floorMap={planks} />
      <Dashes />
      <CourtLines />
      <GymHoop draw={hoop} />
      <Scoreboard />
      <BallRack />
      <ShadowCatcher opacity={G.shadow.opacity} lift={G.shadow.lift} />
    </group>
  )
}
