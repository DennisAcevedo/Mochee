import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  RingGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { anchors } from '../anchors'
import { FLOOR_Y, PLATFORM } from '../layout3d'
import { blobTexture } from './bakedTextures'
import { STAGE_STYLE, type GradientStop } from './stageStyle'

// The sparkle stage (design/sparkle-stage/Main.dc.html): no walls, just the
// white platform with the rainbow rim the tutor stands on (the mock's
// floating sparkles were removed at RON2K's ask). The pastel sky behind it is
// the stage's CSS background (the canvas is transparent). Every surface is unlit, so the stage keeps the
// mock's exact colours under any light rig; only the tutor's shadow comes
// from the key light, through a transparent catcher on the platform's top.

const P = STAGE_STYLE.platform
const HALF_PI = Math.PI / 2

const srgb = { r: 0, g: 0, b: 0 }
const ca = new Color()
const cb = new Color()

// Colour at t along the stops, blended in sRGB like the CSS/SVG gradient.
function gradientAt(stops: readonly GradientStop[], t: number, out: Color): Color {
  let i = 1
  while (i < stops.length - 1 && t > stops[i][0]) i++
  const [a0, a] = stops[i - 1]
  const [b0, b] = stops[i]
  const k = Math.min(1, Math.max(0, (t - a0) / (b0 - a0 || 1)))
  ca.set(a).getRGB(srgb, SRGBColorSpace)
  const r = srgb.r
  const g = srgb.g
  const bl = srgb.b
  cb.set(b).getRGB(srgb, SRGBColorSpace)
  return out.setRGB(r + (srgb.r - r) * k, g + (srgb.g - g) * k, bl + (srgb.b - bl) * k, SRGBColorSpace)
}

// Paint vertex colours from a 0..1 coordinate picked per vertex.
function paint(geo: BufferGeometry, at: (x: number, y: number) => number, stops: readonly GradientStop[]) {
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    gradientAt(stops, at(pos.getX(i), pos.getY(i)), c).toArray(colors, i * 3)
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  return geo
}

// Unit-radius pieces; the platform group scales them to the ellipse.
function platformGeometry() {
  const { rim, groove, side, segments, thickness } = { ...P, thickness: PLATFORM.thickness }
  const across = (x: number) => (x + 1) / 2
  const bodyH = thickness - rim.band
  return {
    top: new CircleGeometry(1 - rim.width, segments),
    groove: new RingGeometry(groove.at - groove.width / 2, groove.at + groove.width / 2, segments),
    rim: paint(new RingGeometry(1 - rim.width, 1, segments, 1), across, rim.stops),
    band: paint(new CylinderGeometry(1, 1, rim.band, segments, 1, true), across, rim.stops),
    body: paint(
      new CylinderGeometry(1, side.taper, bodyH, segments, 1, true),
      (_x, y) => 0.5 - y / bodyH,
      [
        [0, side.top],
        [1, side.bottom],
      ],
    ),
    catcher: new CircleGeometry(1, segments),
    bodyH,
  }
}

function Platform() {
  const geo = useMemo(platformGeometry, [])
  useEffect(
    () => () =>
      Object.values(geo).forEach((g) => {
        if (typeof g !== 'number') g.dispose()
      }),
    [geo],
  )
  const { lift, rim } = P
  return (
    <group name="stage-platform" position={[PLATFORM.x, FLOOR_Y, PLATFORM.z]} scale={[PLATFORM.rx, 1, PLATFORM.rz]}>
      <group rotation={[-HALF_PI, 0, 0]}>
        <mesh geometry={geo.rim} position={[0, 0, lift]}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
        <mesh geometry={geo.top} position={[0, 0, lift]}>
          <meshBasicMaterial color={P.top} toneMapped={false} />
        </mesh>
        <mesh geometry={geo.groove} position={[0, 0, lift * 2]}>
          <meshBasicMaterial color={P.groove.color} toneMapped={false} />
        </mesh>
        <mesh geometry={geo.catcher} position={[0, 0, lift * 3]} receiveShadow renderOrder={2}>
          <shadowMaterial transparent opacity={P.shadowOpacity} depthWrite={false} />
        </mesh>
      </group>
      <mesh geometry={geo.band} position={[0, -rim.band / 2, 0]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={geo.body} position={[0, -rim.band - geo.bodyH / 2, 0]}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
    </group>
  )
}

// The blob on the "floor" below the floating platform, and the contact blob
// that follows the tutor across its top.
function Shadows() {
  const blob = useMemo(blobTexture, [])
  useEffect(() => () => blob.dispose(), [blob])
  const contact = useRef<Mesh>(null)
  const { under, contact: C, lift } = P

  useFrame(() => {
    const m = contact.current
    if (!m) return
    const x = anchors.tutor.x
    const z = anchors.tutor.z
    m.position.x = x
    m.position.z = z
    // Elliptical distance from the platform's centre, 1 at the rim.
    const dx = (x - PLATFORM.x) / PLATFORM.rx
    const dz = (z - PLATFORM.z) / PLATFORM.rz
    const d = Math.sqrt(dx * dx + dz * dz)
    const k = Math.min(1, Math.max(0, (C.fade[1] - d) / (C.fade[1] - C.fade[0])))
    ;(m.material as MeshBasicMaterial).opacity = C.opacity * k
    m.visible = k > 0
  })

  return (
    <>
      <mesh
        position={[PLATFORM.x, FLOOR_Y - PLATFORM.thickness - under.drop, PLATFORM.z]}
        rotation={[-HALF_PI, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[PLATFORM.rx * 2 * under.scale, PLATFORM.rz * 2 * under.scale]} />
        <meshBasicMaterial map={blob} color={under.color} transparent opacity={under.opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={contact} position={[0, FLOOR_Y + lift * 4, 0]} rotation={[-HALF_PI, 0, 0]} renderOrder={3}>
        <planeGeometry args={[C.width, C.depth]} />
        <meshBasicMaterial map={blob} color={C.color} transparent opacity={C.opacity} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

export function SparkleStage() {
  return (
    <group name="sparkle-stage">
      <Shadows />
      <Platform />
    </group>
  )
}
