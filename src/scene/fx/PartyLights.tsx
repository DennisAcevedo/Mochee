import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { usePlay } from '../../play/playStore'
import { FLOOR_Y, PLATFORM, ROOM } from '../layout3d'
import { PARTY } from './config'

// Level-5 unlock: while a dance party runs, coloured beams sweep down from a
// light truss just above the frame and pools of colour slide across the
// platform. No real lights (adding lights recompiles every material); just
// transparent cones and discs, with normal blending because additive colour
// vanishes against the pale stage.

const CEILING_Y = FLOOR_Y + ROOM.height
const BEAM_Z = 0.6 // beams hang just in front of the tutor's spots

// Pools stay on the platform's top: their centres clamp to the ellipse's
// chord at BEAM_Z less a pool radius, and a pool whose beam points past that
// fades out over one more radius instead of piling up at the edge.
const dz = (BEAM_Z - PLATFORM.z) / PLATFORM.rz
const POOL_LIMIT = Math.max(0, PLATFORM.rx * Math.sqrt(Math.max(0, 1 - dz * dz)) - PARTY.spotRadius)

const TEX_PX = 64

function gradientTexture(make: (ctx: CanvasRenderingContext2D) => CanvasGradient) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEX_PX
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = make(ctx)
    ctx.fillRect(0, 0, TEX_PX, TEX_PX)
  }
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

// Bright centre fading to the rim, so floor pools have soft edges.
const poolTexture = () =>
  gradientTexture((ctx) => {
    const c = TEX_PX / 2
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    return g
  })

// Alpha along the beam: solid at the ceiling (canvas top = cone apex), gone at the floor end.
const beamFade = () =>
  gradientTexture((ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, TEX_PX)
    g.addColorStop(0, '#fff')
    g.addColorStop(1, '#000')
    return g
  })

export function PartyLights() {
  const group = useRef<Group>(null)
  const beams = useRef<(Group | null)[]>([])
  const pools = useRef<(Mesh | null)[]>([])
  const level = useRef(0) // 0 = off, 1 = full
  const map = useMemo(poolTexture, [])
  const fade = useMemo(beamFade, [])
  const n = PARTY.colors.length

  useFrame((state, delta) => {
    const on = performance.now() < usePlay.getState().partyUntil
    const rate = 1 / (on ? PARTY.fadeIn : PARTY.fadeOut)
    level.current = Math.min(1, Math.max(0, level.current + (on ? 1 : -1) * rate * Math.min(delta, 0.05)))
    const k = level.current
    if (group.current) group.current.visible = k > 0
    if (k <= 0) return

    const t = state.clock.elapsedTime
    for (let i = 0; i < n; i++) {
      const swing = Math.sin(t * PARTY.sweepSpeed + i * 1.7) * PARTY.sweep
      const beam = beams.current[i]
      if (beam) {
        beam.rotation.z = swing
        const cone = beam.children[0] as Mesh
        ;(cone.material as MeshBasicMaterial).opacity = PARTY.beamOpacity * k
      }
      const pool = pools.current[i]
      if (pool && beam) {
        // Where the beam meets the floor, kept on the platform.
        const x = beam.position.x + Math.sin(swing) * PARTY.beamLength
        const over = Math.max(0, Math.abs(x) - POOL_LIMIT) / PARTY.spotRadius
        pool.position.x = Math.min(POOL_LIMIT, Math.max(-POOL_LIMIT, x))
        ;(pool.material as MeshBasicMaterial).opacity = PARTY.spotOpacity * k * Math.max(0, 1 - over)
      }
    }
  })

  return (
    <group ref={group} visible={false}>
      {PARTY.colors.map((color, i) => {
        const x = -PARTY.spread / 2 + (PARTY.spread * i) / (n - 1)
        return (
          <group key={color + i}>
            {/* Pivot at the ceiling; the cone hangs down from it. */}
            <group
              ref={(el) => {
                beams.current[i] = el
              }}
              position={[x, CEILING_Y, BEAM_Z]}
            >
              <mesh position={[0, -PARTY.beamLength / 2, 0]} renderOrder={1}>
                <coneGeometry args={[PARTY.beamRadius, PARTY.beamLength, 32, 1, true]} />
                <meshBasicMaterial
                  color={color}
                  alphaMap={fade}
                  transparent
                  opacity={0}
                  depthWrite={false}
                  side={DoubleSide}
                  toneMapped={false}
                />
              </mesh>
            </group>
            <mesh
              ref={(el) => {
                pools.current[i] = el
              }}
              position={[x, FLOOR_Y + 0.01, BEAM_Z]}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={1}
            >
              <circleGeometry args={[PARTY.spotRadius, 40]} />
              <meshBasicMaterial color={color} map={map} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
