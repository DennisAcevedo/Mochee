import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace, type Material, type Mesh, type MeshBasicMaterial, type Object3D } from 'three'
import { useGym } from '../worlds/gymStore'
import { useMode } from '../../state/mode'
import { FLOOR_Y } from '../layout3d'

// Ronil's Blender Study and Play rooms, furnished inside the white box. The
// GLBs are the rooms without their own walls and floor (BLENDER/rooms/build_props.py),
// in the same room frame as the full rooms: mounted at [0, FLOOR_Y, 0], so the
// hoop's rim sits on PHYSICS.hoop.rim and the rack balls on the ball's radius.
// Study furniture shows in study mode, the court, hoop, rack and scoreboard in
// play (and the mastery celebration's free play).

export const ROOM_PROPS = {
  study: '/models/rooms/study_props.glb',
  play: '/models/rooms/play_props.glb',
} as const

// The play room's SHOTS board, drawn live from the gym tally (as lab/rooms.tsx previews it).
const SCORE = { bg: '#262A44', ink: '#FFCE4A', width: 512, fill: 0.48, span: 0.86, font: 'Figtree, system-ui, sans-serif' } as const

// Unlit, palette colours as baked: the room keeps its exact tones under any tone mapping.
function useRoom(url: string): Object3D {
  const gltf = useGLTF(url)
  return useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) m.toneMapped = false
    })
    return scene
  }, [gltf.scene])
}

function scoreTexture(): { tex: CanvasTexture; draw: (makes: number, attempts: number) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = SCORE.width
  canvas.height = Math.round((SCORE.width * 1.08) / 1.54) // scoreboard_screen is 1.54 x 1.08
  const ctx = canvas.getContext('2d')!
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.flipY = false // glTF UVs
  const draw = (makes: number, attempts: number) => {
    const { width: w, height: h } = canvas
    ctx.fillStyle = SCORE.bg
    ctx.fillRect(0, 0, w, h)
    const text = `SHOTS ${makes} / ${attempts}`
    let size = h * SCORE.fill
    ctx.font = `800 ${size}px ${SCORE.font}`
    const span = ctx.measureText(text).width
    if (span > w * SCORE.span) {
      size *= (w * SCORE.span) / span
      ctx.font = `800 ${size}px ${SCORE.font}`
    }
    ctx.fillStyle = SCORE.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2)
    tex.needsUpdate = true
  }
  return { tex, draw }
}

function PlayRoomProps({ visible }: { visible: boolean }) {
  const scene = useRoom(ROOM_PROPS.play)
  const board = useMemo(scoreTexture, [])
  const makes = useGym((s) => s.makes)
  const attempts = useGym((s) => s.attempts)

  useEffect(() => {
    const screen = scene.getObjectByName('scoreboard_screen') as Mesh | undefined
    const digits = scene.getObjectByName('scoreboard_digits')
    if (screen) {
      const mat = (screen.material as MeshBasicMaterial).clone()
      mat.map = board.tex
      mat.color.set('#ffffff')
      mat.toneMapped = false
      screen.material = mat
      if (digits) digits.visible = false // the live screen replaces the baked digits
    }
    // The physics ball is the court's ball while the room shows; the baked one would be a twin.
    const loose = scene.getObjectByName('loose_ball')
    if (loose) loose.visible = false
    return () => board.tex.dispose()
  }, [scene, board])

  useEffect(() => board.draw(makes, attempts), [board, makes, attempts])

  return <primitive object={scene} visible={visible} />
}

function StudyRoomProps({ visible }: { visible: boolean }) {
  const scene = useRoom(ROOM_PROPS.study)
  return <primitive object={scene} visible={visible} />
}

export function RoomProps() {
  const play = useMode((s) => s.mode !== 'study')
  return (
    <group name="room-props" position={[0, FLOOR_Y, 0]}>
      <StudyRoomProps visible={!play} />
      <PlayRoomProps visible={play} />
    </group>
  )
}
