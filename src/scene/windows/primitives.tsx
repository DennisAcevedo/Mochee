import { Text, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState, type ReactNode } from 'react'
import { MathUtils, type Group } from 'three'
import { PALETTE } from '../layout3d'
import { roundedRect, type Radii } from './shapes'
import { FONTS } from './windowStyle'

// Small building blocks for the 3D windows: flat rounded panels, text
// labels with exact (un-tone-mapped) colours, chrome glyphs, and a spring
// that pops board parts in.

type Vec3 = [number, number, number]

interface FlatProps {
  w: number
  h: number
  r?: Radii
  color: string
  position?: Vec3
  opacity?: number
  renderOrder?: number
}

// A flat rounded rectangle, unlit so UI colours stay exact. Flipping
// `transparent` needs a new shader program (three's OPAQUE define), so the
// material remounts when the panel turns see-through or solid.
export function Flat({ w, h, r = 0, color, position, opacity = 1, renderOrder }: FlatProps) {
  const see = opacity < 1
  return (
    <mesh geometry={roundedRect(w, h, r)} position={position} renderOrder={renderOrder}>
      <meshBasicMaterial key={see ? 'see' : 'solid'} color={color} toneMapped={false} transparent={see} opacity={opacity} />
    </mesh>
  )
}

// What troika reports after laying text out (the parts the windows use).
export interface TextSync {
  textRenderInfo?: { blockBounds: number[]; caretPositions?: Float32Array }
}

export interface LabelProps {
  children: ReactNode
  size: number
  color?: string
  font?: string
  position?: Vec3
  anchorX?: 'left' | 'center' | 'right'
  anchorY?: 'top' | 'middle' | 'bottom' | 'top-baseline' | 'bottom-baseline'
  maxWidth?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  colorRanges?: Record<number, string>
  clipRect?: [number, number, number, number]
  onSync?: (mesh: TextSync) => void
}

// drei Text with the local woff fonts and an un-tone-mapped material.
export function Label({ children, size, color = PALETTE.ink, font = FONTS.bold, anchorX = 'left', anchorY = 'middle', ...rest }: LabelProps) {
  return (
    <Text fontSize={size} color={color} font={font} anchorX={anchorX} anchorY={anchorY} {...rest}>
      {children}
      <meshBasicMaterial toneMapped={false} />
    </Text>
  )
}

// Two crossed bars (tab close, 'x').
export function CrossGlyph({ size, stroke, color, position }: { size: number; stroke: number; color: string; position?: Vec3 }) {
  return (
    <group position={position}>
      {[Math.PI / 4, -Math.PI / 4].map((a) => (
        <group key={a} rotation={[0, 0, a]}>
          <Flat w={size} h={stroke} r={stroke / 2} color={color} />
        </group>
      ))}
    </group>
  )
}

export function PlusGlyph({ size, stroke, color, position }: { size: number; stroke: number; color: string; position?: Vec3 }) {
  return (
    <group position={position}>
      <Flat w={size} h={stroke} r={stroke / 2} color={color} />
      <Flat w={stroke} h={size} r={stroke / 2} color={color} />
    </group>
  )
}

// Back (dir -1) or forward (dir 1) arrow: a shaft and a two-bar head.
export function ArrowGlyph({ size, stroke, color, dir, position }: { size: number; stroke: number; color: string; dir: 1 | -1; position?: Vec3 }) {
  const head = size * 0.5
  const tip = (dir * size) / 2
  return (
    <group position={position}>
      <Flat w={size} h={stroke} r={stroke / 2} color={color} />
      {[1, -1].map((s) => (
        <group key={s} position={[tip - dir * (head / 2) * Math.SQRT1_2, (s * head * Math.SQRT1_2) / 2, 0]} rotation={[0, 0, (-s * dir * Math.PI) / 4]}>
          <Flat w={head} h={stroke} r={stroke / 2} color={color} />
        </group>
      ))}
    </group>
  )
}

// Reload: an open ring with a small arrow head.
export function ReloadGlyph({ size, stroke, color, position }: { size: number; stroke: number; color: string; position?: Vec3 }) {
  const r = size / 2
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI * 0.2]}>
        <ringGeometry args={[r - stroke, r, 24, 1, 0, Math.PI * 1.55]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[r * 0.78, r * 0.62, 0]} rotation={[0, 0, -0.35]}>
        <circleGeometry args={[stroke * 1.9, 3]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

// A spring toward `on` (1) or off (0) that drives a group's scale, so the
// board's parts pop in with a little overshoot. Hidden while fully off.
export function usePop(on: boolean, stiffness: number, damping: number, axis: 'xy' | 'x' = 'xy') {
  const ref = useRef<Group>(null)
  const st = useRef({ v: on ? 1 : 0, vel: 0 })
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const s = st.current
    const target = on ? 1 : 0
    const step = Math.min(dt, 1 / 30)
    s.vel += (target - s.v) * stiffness * step
    s.vel *= Math.exp(-damping * step)
    s.v += s.vel * step
    if (!on && s.v < 0.01) s.v = 0
    const k = Math.max(s.v, 0.0001)
    if (axis === 'x') g.scale.set(k, 1, 1)
    else g.scale.set(k, k, 1)
    g.visible = s.v > 0.001
  })
  return ref
}

// Exponential damping helper for per-frame tweens.
export const damp = MathUtils.damp

const HIT = { hoverScale: 1.18, damp: 16, pad: 0.05 } // chrome buttons: grow on hover

// A small clickable chrome button (glyph or dot): pointer cursor and a little
// grow on hover, an invisible pad so it is easy to hit. Disabled = no-op.
export function Hit({ size, onClick, disabled = false, position, children }: { size: number; onClick: () => void; disabled?: boolean; position?: Vec3; children: ReactNode }) {
  const [hover, setHover] = useState(false)
  const ref = useRef<Group>(null)
  useCursor(hover && !disabled)
  useFrame((_, dt) => {
    const g = ref.current
    if (g) g.scale.setScalar(damp(g.scale.x, hover && !disabled ? HIT.hoverScale : 1, HIT.damp, dt))
  })
  return (
    <group
      position={position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerOut={() => setHover(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (!disabled) onClick()
      }}
    >
      <mesh>
        <circleGeometry args={[size / 2 + HIT.pad, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={ref}>{children}</group>
    </group>
  )
}

const ENTER = { drop: 0.07, squash: 0.04, damp: 12 } // page slide-in on tab switch

// Slides a freshly mounted group up into place (the notes page on a tab switch).
export function useEnter() {
  const ref = useRef<Group>(null)
  const p = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g || p.current > 0.999) return
    p.current = damp(p.current, 1, ENTER.damp, dt)
    g.position.y = -(1 - p.current) * ENTER.drop
    g.scale.y = 1 - (1 - p.current) * ENTER.squash
  })
  return ref
}
