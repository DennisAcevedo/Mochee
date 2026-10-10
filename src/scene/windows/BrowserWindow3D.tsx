import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Group, MeshBasicMaterial } from 'three'
import { useDirector } from '../../state/director'
import { anchors } from '../anchors'
import { WINDOWS } from '../layout3d'
import { glowTexture } from '../room/bakedTextures'
import { ArrowGlyph, CrossGlyph, damp, Flat, Hit, Label, PlusGlyph, ReloadGlyph } from './primitives'
import { roundedRectRing, roundedSlab } from './shapes'
import { FONTS, WINDOW_STYLE as W } from './windowStyle'

// A generic mini Chrome window as a 3D object: rounded frame, tab strip
// (traffic lights, tabs with a colour favicon dot, bold title and close x,
// a + button), toolbar (back, forward, reload, omnibox) and a content area.
// Focus comes from director.focus: the window turns further toward the
// camera, scales up, lifts forward and lights a teal ring, all damped. It
// writes its world centre into anchors[id] every frame.

export type WindowId = 'notes' | 'board'

export interface WindowTab {
  title: string
  color: string // favicon dot and active-tab accent
}

export interface ContentBox {
  w: number
  h: number
}

interface Props {
  id: WindowId
  tabs: WindowTab[]
  active: number
  onTab: (index: number) => void
  url: string
  contentBg: string
  onReload?: () => void // the toolbar's reload button; tabs drive back, forward and +
  children: (box: ContentBox) => ReactNode // drawn with the content's top-left corner at the origin
}

const L = W.layer
const S = W.tabStrip
const T = W.toolbar

// Rough Figtree-bold advance per character, in ems, to truncate tab titles.
const CHAR_EM = 0.56

function truncate(text: string, width: number, size: number) {
  const max = Math.floor(width / (size * CHAR_EM))
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + '…'
}

function Tab({
  tab,
  index,
  active,
  width,
  onTab,
}: {
  tab: WindowTab
  index: number
  active: boolean
  width: number
  onTab: (index: number) => void
}) {
  const [hover, setHover] = useState(false)
  const lift = useRef<Group>(null)
  useCursor(hover)

  useFrame((_, dt) => {
    const g = lift.current
    if (g) g.position.y = damp(g.position.y, hover && !active ? S.hover.lift : 0, S.hover.damp, dt)
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onTab(index)
  }

  const titleX = -width / 2 + 0.13
  const titleW = width - 0.25
  return (
    <group onPointerOver={over} onPointerOut={() => setHover(false)} onClick={click}>
      <group ref={lift}>
        {/* Hit area + background: white when active, a soft tint on hover. */}
        <Flat
          w={width}
          h={S.tabH}
          r={[S.tabRadius, S.tabRadius, 0, 0]}
          color={active ? S.activeColor : S.hoverColor}
          opacity={active || hover ? 1 : 0.001}
        />
        {active && <Flat w={width - S.tabRadius * 2} h={S.accentBar} r={S.accentBar / 2} color={tab.color} position={[0, S.tabH / 2 - S.accentBar / 2, L]} />}
        <mesh position={[-width / 2 + 0.07, 0, L]}>
          <circleGeometry args={[S.dot, 20]} />
          <meshBasicMaterial color={tab.color} toneMapped={false} />
        </mesh>
        <Label size={S.title.size} color={active ? S.title.color : S.title.dim} font={active ? FONTS.bold : FONTS.semi} position={[titleX, 0, L * 2]}>
          {truncate(tab.title, titleW, S.title.size)}
        </Label>
        <CrossGlyph size={S.close.size} stroke={0.011} color={S.close.color} position={[width / 2 - 0.065, 0, L]} />
      </group>
    </group>
  )
}

export function BrowserWindow3D({ id, tabs, active, onTab, url, contentBg, onReload, children }: Props) {
  const place = WINDOWS[id]
  const { width, height } = place
  const focused = useDirector((s) => s.focus === id)
  const setFocus = useDirector((s) => s.setFocus)

  const pivot = useRef<Group>(null)
  const ringMat = useRef<MeshBasicMaterial>(null)
  const glowMat = useRef<MeshBasicMaterial>(null)
  const glow = useMemo(() => glowTexture(), [])
  useEffect(() => () => glow.dispose(), [glow])

  // Focus tween + anchor, every frame.
  useFrame((_, dt) => {
    const g = pivot.current
    if (!g) return
    const k = W.focus.damp
    const yaw = focused ? Math.sign(place.yaw) * WINDOWS.focusYaw : place.yaw
    g.rotation.y = damp(g.rotation.y, yaw, k, dt)
    const s = damp(g.scale.x, focused ? WINDOWS.focusScale : 1, k, dt)
    g.scale.setScalar(s)
    g.position.z = damp(g.position.z, focused ? W.focus.lift : 0, k, dt)
    if (ringMat.current) ringMat.current.opacity = damp(ringMat.current.opacity, focused ? 1 : 0, k, dt)
    if (glowMat.current) glowMat.current.opacity = damp(glowMat.current.opacity, focused ? W.focus.glow.opacity : 0, k, dt)
    g.getWorldPosition(anchors[id])
  })

  // Strip, toolbar and content stacked from the top edge down.
  const top = height / 2
  const stripY = top - S.height / 2
  const toolY = top - S.height - T.height / 2
  const contentTop = top - S.height - T.height
  const contentH = contentTop + height / 2
  const tabsLeft = -width / 2 + S.tabsX
  const tabW = Math.min(S.tabMaxW, (width - S.tabsX - 0.24) / tabs.length - S.tabGap)
  const z = W.z

  const ring = W.focus.ring
  const omniW = width - T.omnibox.x - 0.12
  const omniX = -width / 2 + T.omnibox.x + omniW / 2

  return (
    <group name={`${id}-window`} position={place.position}>
      <group ref={pivot} rotation={[0, place.yaw, 0]}>
        {/* Focus glow behind the window and a teal ring around it. */}
        <mesh position={[0, 0, -W.depth]} scale={[width + W.focus.glow.pad * 2, height + W.focus.glow.pad * 2, 1]} renderOrder={-1}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial ref={glowMat} map={glow} color={W.focus.glow.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh geometry={roundedRectRing(width + ring.gap * 2, height + ring.gap * 2, W.radius + ring.gap, ring.stroke)} position={[0, 0, z - W.depth / 2]}>
          <meshBasicMaterial ref={ringMat} color={ring.color} transparent opacity={0} toneMapped={false} />
        </mesh>

        <mesh geometry={roundedSlab(width, height, W.radius, W.depth, W.bevel)} castShadow={W.castShadow}>
          <meshStandardMaterial color={W.frameColor} roughness={0.45} />
        </mesh>

        {/* Tab strip. */}
        <Flat w={width} h={S.height} r={[W.radius, W.radius, 0, 0]} color={S.color} position={[0, stripY, z]} />
        {/* Traffic lights: red and yellow let the window go, green focuses it. */}
        {S.lights.colors.map((c, i) => (
          <Hit key={c} size={S.lights.size * 2} onClick={() => setFocus(i === 2 ? id : 'none')} position={[-width / 2 + S.lights.x + i * S.lights.gap, stripY + 0.01, z + L]}>
            <mesh>
              <circleGeometry args={[S.lights.size, 20]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
          </Hit>
        ))}
        <group position={[0, top - S.height + S.tabH / 2, z + L]}>
          {tabs.map((t, i) => (
            <group key={t.title + i} position={[tabsLeft + i * (tabW + S.tabGap) + tabW / 2, 0, 0]}>
              <Tab tab={t} index={i} active={i === active} width={tabW} onTab={onTab} />
            </group>
          ))}
          <Hit size={S.plus.size} onClick={() => onTab((active + 1) % tabs.length)} position={[tabsLeft + tabs.length * (tabW + S.tabGap) + 0.08, 0, 0]}>
            <PlusGlyph size={S.plus.size} stroke={0.013} color={S.plus.color} />
          </Hit>
        </group>

        {/* Toolbar: back, forward, reload, omnibox. */}
        <Flat w={width} h={T.height} color={T.color} position={[0, toolY, z]} />
        <Flat w={width} h={0.008} color={T.divider} position={[0, contentTop + 0.004, z + L]} />
        <group position={[-width / 2 + T.glyph.x, toolY, z + L]}>
          <Hit size={T.glyph.size} disabled={active === 0} onClick={() => onTab(active - 1)}>
            <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={active > 0 ? T.glyph.color : T.glyph.dim} dir={-1} />
          </Hit>
          <Hit size={T.glyph.size} disabled={active >= tabs.length - 1} onClick={() => onTab(active + 1)} position={[T.glyph.gap, 0, 0]}>
            <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={active < tabs.length - 1 ? T.glyph.color : T.glyph.dim} dir={1} />
          </Hit>
          <Hit size={T.glyph.size} disabled={!onReload} onClick={() => onReload?.()} position={[T.glyph.gap * 2, 0, 0]}>
            <ReloadGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={onReload ? T.glyph.color : T.glyph.dim} />
          </Hit>
        </group>
        <Flat w={omniW} h={T.omnibox.h} r={T.omnibox.h / 2} color={T.omnibox.color} position={[omniX, toolY, z + L]} />
        <mesh position={[omniX - omniW / 2 + 0.08, toolY, z + L * 2]}>
          <circleGeometry args={[0.022, 16]} />
          <meshBasicMaterial color={T.omnibox.lock} toneMapped={false} />
        </mesh>
        <Label size={T.omnibox.size} color={T.omnibox.text} font={FONTS.mono} position={[omniX - omniW / 2 + 0.13, toolY, z + L * 2]}>
          {truncate(url, omniW - 0.2, T.omnibox.size * 1.06)}
        </Label>

        {/* Content area; children draw from its top-left corner. */}
        <Flat w={width} h={contentH} r={[0, 0, W.radius, W.radius]} color={contentBg} position={[0, contentTop - contentH / 2, z]} />
        <group position={[-width / 2, contentTop, z + L * 2]}>{children({ w: width, h: contentH })}</group>
      </group>
    </group>
  )
}

