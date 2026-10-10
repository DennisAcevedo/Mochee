import { Text } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Color, MeshBasicMaterial, PlaneGeometry, type Group, type Mesh } from 'three'
import { CrossGlyph } from './primitives'
import { windowHits } from './registry'
import { roundedRect } from './shapes'
import { ellipsize, type TabLook } from './tabLayout'
import { tabInfo } from './tabInfo'
import type { Tab, WinId } from './tabModel'
import { WINDOW_UI } from './windowConfig'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// One tab of a strip: background (active white, hover tint), coloured top
// edge, favicon dot, bold title and the x. It renders once; TabStrip's frame
// loop animates it through placeTab(), which only moves and scales meshes,
// so a tab can be any width without new geometry.

const S = WINDOW_STYLE.tabStrip
const T = WINDOW_UI.tabs
const L = WINDOW_STYLE.layer
const R = S.tabRadius
export const TAB_H = S.tabH
export const CLOSE_ROOM = S.close.inset + S.close.hit / 2 // the x's share of a tab's right end
const DOT_X = S.dot + 0.05

export const UNIT = new PlaneGeometry(1, 1)
export const INVISIBLE = new MeshBasicMaterial({ visible: false }) // hit planes: raycast, never drawn
const CAP_L = roundedRect(R * 2, TAB_H, [R, 0, 0, 0])
const CAP_R = roundedRect(R * 2, TAB_H, [0, R, 0, 0])
const ACTIVE = new Color(S.activeColor)
const HOVER = new Color(S.hoverColor)

type TroikaText = Mesh & { clipRect: [number, number, number, number] | null; fillOpacity: number }

// A tab's meshes, filled in by ref callbacks.
export interface Parts {
  root: Group | null
  bgL: Mesh | null
  bgM: Mesh | null
  bgR: Mesh | null
  accent: Mesh | null
  dot: Mesh | null
  title: TroikaText | null
  close: Group | null
  closeGlyph: Group | null
  closeBg: Mesh | null
  closeHit: Mesh | null
  hit: Mesh | null
  shadow: Mesh | null
  bgMat: MeshBasicMaterial
  shadowMat: MeshBasicMaterial
  clip: [number, number, number, number]
}

// Animated state per tab id.
export interface Anim {
  x: number // left edge, strip-local
  w: number
  alpha: number // title opacity
  lift: number // 0..1 while dragged
  y: number // drag offset from the row
  z: number
}

interface Props {
  win: WinId
  tab: Tab
  active: boolean
  ghost: boolean // closed, shrinking out
  tw: number // the strip's target tab width (the title ellipsizes to it)
  look: TabLook
  register: (id: string, p: Parts | null) => void
}

export function TabView({ win, tab, active, ghost, tw, look, register }: Props) {
  const info = tabInfo(tab)
  const parts = useMemo<Parts>(
    () => ({
      root: null,
      bgL: null,
      bgM: null,
      bgR: null,
      accent: null,
      dot: null,
      title: null,
      close: null,
      closeGlyph: null,
      closeBg: null,
      closeHit: null,
      hit: null,
      shadow: null,
      bgMat: new MeshBasicMaterial({ color: S.activeColor, toneMapped: false }),
      shadowMat: new MeshBasicMaterial({ color: S.shadowColor, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      clip: [-0.02, -0.2, 0, 0.2],
    }),
    [],
  )
  useEffect(
    () => () => {
      parts.bgMat.dispose()
      parts.shadowMat.dispose()
    },
    [parts],
  )
  useLayoutEffect(() => {
    register(tab.id, parts)
    return () => register(tab.id, null)
  }, [register, tab.id, parts])

  // The e2e reads each live tab's hit plane and x button through the registry.
  useLayoutEffect(() => {
    if (ghost || !parts.hit || !parts.closeHit) return
    const hits = windowHits[win].tabs
    hits.set(tab.id, { hit: parts.hit, close: parts.closeHit, closeVisible: active, kind: tab.kind, title: info.title })
    return () => {
      if (hits.get(tab.id)?.hit === parts.hit) hits.delete(tab.id)
    }
  }, [win, tab.id, tab.kind, info.title, ghost, active, parts])

  const title = ghost ? '' : ellipsize(info.title, tw - S.title.padL - CLOSE_ROOM, S.title.size)
  return (
    <group ref={(g) => void (parts.root = g)}>
      <mesh ref={(m) => void (parts.shadow = m)} geometry={UNIT} material={parts.shadowMat} position={[0, -0.018, -L]} visible={false} />
      <mesh ref={(m) => void (parts.bgL = m)} geometry={CAP_L} material={parts.bgMat} />
      <mesh ref={(m) => void (parts.bgM = m)} geometry={UNIT} material={parts.bgMat} />
      <mesh ref={(m) => void (parts.bgR = m)} geometry={CAP_R} material={parts.bgMat} />
      <mesh ref={(m) => void (parts.accent = m)} geometry={UNIT} position={[0, TAB_H / 2 - S.accentBar / 2, L]} visible={false}>
        <meshBasicMaterial color={info.color} toneMapped={false} />
      </mesh>
      <mesh ref={(m) => void (parts.dot = m)} position={[DOT_X, 0, L]}>
        <circleGeometry args={[S.dot, 20]} />
        <meshBasicMaterial color={info.color} toneMapped={false} />
      </mesh>
      {look !== 'tiny' && title && (
        <Text
          ref={(m: TroikaText | null) => void (parts.title = m)}
          fontSize={S.title.size}
          color={active ? S.title.color : S.title.dim}
          font={active ? FONTS.bold : FONTS.semi}
          anchorX="left"
          anchorY="middle"
          whiteSpace="nowrap"
          position={[S.title.padL, 0, L * 2]}
        >
          {title}
          <meshBasicMaterial toneMapped={false} transparent />
        </Text>
      )}
      <group ref={(g) => void (parts.close = g)} position={[0, 0, L * 2]}>
        <mesh ref={(m) => void (parts.closeHit = m)} material={INVISIBLE}>
          <circleGeometry args={[S.close.hit / 2, 12]} />
        </mesh>
        <group ref={(g) => void (parts.closeGlyph = g)} visible={false}>
          <mesh ref={(m) => void (parts.closeBg = m)} visible={false}>
            <circleGeometry args={[S.close.hit * 0.42, 20]} />
            <meshBasicMaterial color={S.close.hoverBg} toneMapped={false} />
          </mesh>
          <CrossGlyph size={S.close.size} stroke={S.close.stroke} color={S.close.color} position={[0, 0, L]} />
        </group>
      </group>
      <mesh ref={(m) => void (parts.hit = m)} geometry={UNIT} material={INVISIBLE} />
    </group>
  )
}

// Writes one tab's animated layout onto its meshes.
export function placeTab(p: Parts, a: Anim, rowY: number, active: boolean, look: TabLook, closeOn: boolean, closeHover: boolean, hover: boolean) {
  const { root, bgL, bgM, bgR, accent, dot, title, close, closeGlyph, closeBg, hit, shadow } = p
  if (!root || !bgL || !bgM || !bgR || !accent || !dot || !close || !closeGlyph || !closeBg || !hit || !shadow) return
  const w = Math.max(a.w, 0.0001)
  root.position.set(a.x, rowY + a.y, a.z + a.lift * T.lift.z)
  root.scale.setScalar(1 + a.lift * (T.lift.scale - 1))
  // Background: two rounded caps and a stretched middle.
  const sx = Math.min(1, w / (4 * R))
  bgL.scale.x = bgR.scale.x = sx
  bgL.position.x = R * sx
  bgR.position.x = w - R * sx
  bgM.scale.set(Math.max(0.0001, w - 4 * R * sx), TAB_H, 1)
  bgM.position.x = w / 2
  const lifted = a.lift > 0.02
  bgL.visible = bgM.visible = bgR.visible = active || hover || lifted
  p.bgMat.color.copy(active || lifted ? ACTIVE : HOVER)
  accent.visible = active && w > R * 2
  accent.scale.set(Math.max(0.0001, w - R * 2), S.accentBar, 1)
  accent.position.x = w / 2
  const tiny = look === 'tiny'
  dot.visible = !(tiny && closeOn) && w > S.dot * 2.5
  dot.position.x = tiny ? w / 2 : Math.min(DOT_X, w / 2)
  close.position.x = tiny ? w / 2 : w - S.close.inset
  closeGlyph.visible = closeOn && w > S.close.hit * 0.8
  closeBg.visible = closeHover
  if (title) {
    const room = w - S.title.padL - (closeOn ? CLOSE_ROOM - 0.02 : 0.05)
    p.clip[2] = Math.max(0, room)
    title.clipRect = p.clip
    title.fillOpacity = a.alpha
    title.visible = room > 0.02 && a.alpha > 0.01
  }
  hit.scale.set(w, TAB_H, 1)
  hit.position.x = w / 2
  shadow.visible = lifted
  shadow.scale.set(w + 0.05, TAB_H + 0.03, 1)
  shadow.position.x = w / 2
  p.shadowMat.opacity = a.lift * T.lift.shadow
}
