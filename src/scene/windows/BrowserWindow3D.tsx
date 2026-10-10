import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, Matrix4, Plane, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { useDirector } from '../../state/director'
import { useWindows } from '../../state/windows'
import { anchors } from '../anchors'
import { WINDOWS } from '../layout3d'
import { glowTexture } from '../room/bakedTextures'
import { useBoardReplay } from './LectureBoard'
import { activateByStudent, useLessonTabs } from './lessonSync'
import { facePlane, pointerOnPlane, PointerTrack, setCursor } from './pointer'
import { ArrowGlyph, damp, Flat, GripGlyph, Hit, Label, MaximizeGlyph, ReloadGlyph } from './primitives'
import { windowFrames, windowHits } from './registry'
import { roundedRect, roundedRectRing, roundedSlab } from './shapes'
import { MinimizeRig } from './minimizeRig'
import { clampSize, ellipsize } from './tabLayout'
import { tabInfo } from './tabInfo'
import type { WinId } from './tabModel'
import { TabStrip } from './TabStrip'
import { INVISIBLE, UNIT } from './TabView'
import { WINDOW_UI } from './windowConfig'
import { CONTENT_BG, WindowContent } from './WindowContent'
import { controlParts, useWindowControls } from './WindowControls'
import { clampOffset, maximizedPlace, yawAt } from './windowPlace'
import { FONTS, WINDOW_STYLE as W } from './windowStyle'

// A mini Chrome window as a 3D object, driven by the windows store
// (src/state/windows.ts): rounded frame, tab strip (TabStrip.tsx), toolbar
// (back / forward through the tabs, reload, omnibox, maximize) and the active
// tab's page. Drag the empty strip or the omnibox to move it (it stays on
// screen and turns toward the stage centre the way the defaults do), drag the
// corner grip to resize it, double-click the strip or press maximize (or the
// green light) to bring it big and centred in front of the stage while the
// other window dims and slides back. The red and yellow lights fold it into a
// restore chip (minimizeRig.ts; the lights and the chip are DOM buttons,
// WindowControls.tsx). Focus (director.focus) still turns, scales and lights it.
// Every frame it writes its world centre into anchors[id] and its placement
// into windowFrames[id].

export type { ContentBox } from './WindowContent'
export type WindowId = WinId

const L = W.layer
const S = W.tabStrip
const T = W.toolbar
const MX = T.maximize
const G = W.grip
const M = WINDOW_UI.maximize
const Z_AXIS = new Vector3(0, 0, 1)
const RING_FOCUS = new Color(W.focus.ring.color)
const RING_MAX = new Color(W.maximizedRing)
const VEIL_Z = W.z + 0.2 // in front of the tallest page content (the quiz keys)

const hitPoint = new Vector3()
const clamped: [number, number] = [0, 0]
const sized: [number, number] = [0, 0]

export function BrowserWindow3D({ id }: { id: WinId }) {
  useLessonTabs()
  const place = WINDOWS[id]
  const size = useWindows((s) => s.layout[id].size)
  const maximized = useWindows((s) => s.maximized)
  const isMax = maximized === id
  // Maximized, the window takes the maximized size (content reflows); restore brings its own back.
  const mp = maximizedPlace()
  const width = isMax ? mp.w : size ? size[0] : place.width
  const height = isMax ? mp.h : size ? size[1] : place.height
  const veiled = maximized !== null && !isMax
  const wt = useWindows((s) => s.tabs[id])
  const tab = wt.tabs.find((t) => t.id === wt.active) ?? wt.tabs[0]
  const index = wt.tabs.indexOf(tab)
  const info = tabInfo(tab)
  const canvas = useThree((s) => s.gl.domElement)
  const [reloads, setReloads] = useState(0)
  const replay = useBoardReplay()

  const outer = useRef<Group>(null)
  const mini = useRef<Group>(null) // the minimize fold: carries the window into its chip
  const pivot = useRef<Group | null>(null)
  const ringMat = useRef<MeshBasicMaterial>(null)
  const glowMat = useRef<MeshBasicMaterial>(null)
  const veilMat = useRef<MeshBasicMaterial>(null)
  const veil = useRef<Mesh>(null)
  const glow = useMemo(() => glowTexture(), [])
  useEffect(() => () => glow.dispose(), [glow])

  // The DOM lights and restore chip, and the fold that drives them.
  const parts = useMemo(controlParts, [])
  useWindowControls(id, parts, canvas)
  const rig = useMemo(() => new MinimizeRig(id, parts, useWindows.getState().minimized[id]), [id, parts])

  // Registry: the e2e (window.__gg.windows.rects) and the other window's tab drags read these.
  const setPivot = useCallback(
    (g: Group | null) => {
      pivot.current = g
      windowHits[id].pivot = g
    },
    [id],
  )
  const setFrame = useCallback((m: Mesh | null) => void (windowHits[id].frame = m), [id])
  const setMax = useCallback((g: Group | null) => void (windowHits[id].max = g), [id])
  const setGrip = useCallback((g: Group | null) => void (windowHits[id].grip = g), [id])
  const setOmni = useCallback((m: Mesh | null) => void (windowHits[id].omni = m), [id])

  // Resting placement at mount (afterwards the frame loop owns it).
  const initial = useMemo(() => {
    const o = useWindows.getState().layout[id].offset
    const x = place.position[0] + o[0]
    return { position: [x, place.position[1] + o[1], place.position[2]] as [number, number, number], rotation: [0, yawAt(id, x), 0] as [number, number, number] }
  }, [id, place])

  // ---- Moving (empty strip or omnibox) and resizing (corner grip)
  const moveTrack = useMemo(() => new PointerTrack(), [])
  const sizeTrack = useMemo(() => new PointerTrack(), [])
  const move = useRef({ px: 0, py: 0, ox: 0, oy: 0, x: 0, y: 0, live: false })
  const movePlane = useMemo(() => new Plane(), [])
  const resize = useRef({ w0: 0, h0: 0, ox: 0, oy: 0, dx: 0, dy: 0, sx: 1, sy: 1 })
  const sizePlane = useMemo(() => new Plane(), [])
  const sizeInv = useMemo(() => new Matrix4(), [])
  const lastStrip = useRef({ t: -1e9, x: 0, y: 0 })

  useEffect(
    () => () => {
      moveTrack.end()
      sizeTrack.end()
      setCursor(null)
    },
    [moveTrack, sizeTrack],
  )

  const startMove = (e: ThreeEvent<PointerEvent>, fromStrip: boolean) => {
    e.stopPropagation()
    const ne = e.nativeEvent
    if (ne.button !== 0) return
    if (fromStrip) {
      // Double-click on the strip toggles maximize, like Chrome.
      const last = lastStrip.current
      const now = performance.now()
      if (now - last.t < WINDOW_UI.doubleClickMs && Math.hypot(ne.clientX - last.x, ne.clientY - last.y) < WINDOW_UI.doubleClickPx) {
        last.t = -1e9
        useWindows.getState().toggleMaximize(id)
        return
      }
      lastStrip.current = { t: now, x: ne.clientX, y: ne.clientY }
    }
    if (useWindows.getState().maximized === id) return // a maximized window stays put
    const o = useWindows.getState().layout[id].offset
    movePlane.setFromNormalAndCoplanarPoint(Z_AXIS, e.point)
    move.current = { px: e.point.x, py: e.point.y, ox: o[0], oy: o[1], x: o[0], y: o[1], live: false }
    moveTrack.press(ne, canvas)
  }

  const startResize = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const g = pivot.current
    const ne = e.nativeEvent
    if (!g || ne.button !== 0 || useWindows.getState().maximized === id) return
    const st = useWindows.getState().layout[id]
    const [w0, h0] = st.size ?? [place.width, place.height]
    facePlane(g, sizePlane)
    sizeInv.copy(g.matrixWorld).invert()
    const p = hitPoint.copy(e.point).applyMatrix4(sizeInv)
    // The corner keeps its offset from the pointer; the top-left corner stays put.
    resize.current = { w0, h0, ox: st.offset[0], oy: st.offset[1], dx: w0 / 2 - p.x, dy: -h0 / 2 - p.y, sx: Math.cos(g.rotation.y) * g.scale.x, sy: g.scale.y }
    sizeTrack.press(ne, canvas)
    setCursor('nwse-resize')
  }

  const hoverCursor = (cursor: string) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (!moveTrack.active && !sizeTrack.active) setCursor(cursor)
    },
    onPointerOut: () => {
      if (!moveTrack.active && !sizeTrack.active) setCursor(null)
    },
  })

  useFrame((state, dt) => {
    const g = outer.current
    const pv = pivot.current
    const mn = mini.current
    if (!g || !pv || !mn) return
    const k = Math.min(dt, 0.05)
    const st = useWindows.getState()
    const lay = st.layout[id]
    const max = st.maximized === id
    const back = st.maximized !== null && !max
    const cw = max ? mp.w : lay.size ? lay.size[0] : place.width
    const ch = max ? mp.h : lay.size ? lay.size[1] : place.height

    // Window move: the pointer on a plane facing the camera through the grab point.
    const mv = move.current
    if (moveTrack.active) {
      if (moveTrack.dragging && pointerOnPlane(moveTrack.x, moveTrack.y, state.camera, state.gl.domElement, movePlane, hitPoint)) {
        clampOffset(id, mv.ox + hitPoint.x - mv.px, mv.oy + hitPoint.y - mv.py, cw, ch, clamped)
        mv.x = clamped[0]
        mv.y = clamped[1]
        if (!mv.live) setCursor('grabbing')
        mv.live = true
      }
      if (moveTrack.up) {
        if (mv.live) st.setOffset(id, [mv.x, mv.y])
        mv.live = false
        moveTrack.end()
        setCursor(null)
      }
    }

    // Resize from the corner grip, in the window's own (frozen) frame.
    if (sizeTrack.active) {
      const r = resize.current
      if (sizeTrack.dragging && pointerOnPlane(sizeTrack.x, sizeTrack.y, state.camera, state.gl.domElement, sizePlane, hitPoint)) {
        const p = hitPoint.applyMatrix4(sizeInv)
        clampSize(p.x + r.dx + r.w0 / 2, r.h0 / 2 - (p.y + r.dy), sized)
        if (sized[0] !== cw || sized[1] !== ch) {
          st.setSize(id, [sized[0], sized[1]])
          st.setOffset(id, [r.ox + ((sized[0] - r.w0) / 2) * r.sx, r.oy - ((sized[1] - r.h0) / 2) * r.sy])
        }
      }
      if (sizeTrack.up) {
        sizeTrack.end()
        setCursor(null)
        const o = useWindows.getState().layout[id].offset
        clampOffset(id, o[0], o[1], cw, ch, clamped)
        st.setOffset(id, [clamped[0], clamped[1]])
      }
    }

    // Where the window should be this frame.
    const ox = mv.live ? mv.x : lay.offset[0]
    const oy = mv.live ? mv.y : lay.offset[1]
    let tx = place.position[0] + ox
    let ty = place.position[1] + oy
    let tz = place.position[2]
    let yaw = yawAt(id, tx)
    let scale = 1
    let lift = 0
    const focused = !max && !back && useDirector.getState().focus === id
    if (max) {
      tx = mp.x
      ty = mp.y
      tz = mp.z
      yaw = 0
      scale = mp.scale
    } else if (back) {
      tx = Math.sign(tx || place.position[0]) * Math.max(Math.abs(tx) + M.pushOut, M.peekX)
      tz -= M.pushBack
    } else if (focused) {
      yaw *= WINDOWS.focusYaw / Math.abs(place.yaw || 1)
      scale = WINDOWS.focusScale
      lift = W.focus.lift
    }
    if (mv.live || sizeTrack.active) g.position.set(tx, ty, tz) // pointer-driven: no lag
    else {
      g.position.x = damp(g.position.x, tx, M.rate, k)
      g.position.y = damp(g.position.y, ty, M.rate, k)
      g.position.z = damp(g.position.z, tz, M.rate, k)
    }
    const rate = max || back ? M.rate : W.focus.damp
    pv.rotation.y = damp(pv.rotation.y, yaw, rate, k)
    pv.scale.setScalar(damp(pv.scale.x, scale, rate, k))
    pv.position.z = damp(pv.position.z, lift, rate, k)

    if (ringMat.current) {
      ringMat.current.color.copy(max ? RING_MAX : RING_FOCUS)
      ringMat.current.opacity = damp(ringMat.current.opacity, max || focused ? 1 : 0, rate, k)
    }
    if (glowMat.current) glowMat.current.opacity = damp(glowMat.current.opacity, focused ? W.focus.glow.opacity : 0, W.focus.damp, k)
    if (veilMat.current && veil.current) {
      veilMat.current.opacity = damp(veilMat.current.opacity, back ? M.dim : 0, M.rate, k)
      veil.current.visible = veilMat.current.opacity > 0.01
    }

    rig.step(dt, state.clock.elapsedTime * 1000, st.minimized[id], g, mn, cw, ch, pv.scale.x, state.camera, state.gl.domElement)
    rig.glue(pv, cw, ch, !back, state.camera, state.gl.domElement)

    pv.getWorldPosition(anchors[id])
    const f = windowFrames[id]
    f.center.copy(anchors[id])
    f.halfW = (cw / 2) * pv.scale.x
    f.halfH = (ch / 2) * pv.scale.y
    f.yaw = pv.rotation.y
  })

  // Strip, toolbar and content stacked from the top edge down.
  const top = height / 2
  const stripY = top - S.height / 2
  const toolY = top - S.height - T.height / 2
  const contentTop = top - S.height - T.height
  const contentH = contentTop + height / 2
  const z = W.z
  // Pages are laid out for the default size: a smaller window scales them
  // down to fit, a bigger one gives them more room.
  const refH = place.height - S.height - T.height
  const contentScale = Math.min(1, width / place.width, contentH / refH)
  const box = { w: width / contentScale, h: contentH / contentScale }

  const ring = W.focus.ring
  const omniW = width - T.omnibox.x - T.omnibox.right
  const omniX = -width / 2 + T.omnibox.x + omniW / 2
  const url = W.urlHost + info.path

  const go = (i: number) => {
    const next = wt.tabs[i]
    if (next) activateByStudent(id, next)
  }
  const reload = tab.kind === 'notes' || tab.kind === 'pdf' ? () => setReloads((n) => n + 1) : tab.kind === 'board' ? replay : undefined

  return (
    <group ref={outer} name={`${id}-window`} position={initial.position}>
      <group ref={mini}>
        <group ref={setPivot} rotation={initial.rotation}>
          {/* Focus glow behind the window and a ring around it (teal focused, blue maximized). */}
          <mesh position={[0, 0, -W.depth]} scale={[width + W.focus.glow.pad * 2, height + W.focus.glow.pad * 2, 1]} renderOrder={-1}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial ref={glowMat} map={glow} color={W.focus.glow.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh geometry={roundedRectRing(width + ring.gap * 2, height + ring.gap * 2, W.radius + ring.gap, ring.stroke)} position={[0, 0, z - W.depth / 2]}>
            <meshBasicMaterial ref={ringMat} color={ring.color} transparent opacity={0} toneMapped={false} />
          </mesh>

          <mesh ref={setFrame} geometry={roundedSlab(width, height, W.radius, W.depth, W.bevel)} castShadow={W.castShadow}>
            <meshStandardMaterial color={W.frameColor} roughness={0.45} />
          </mesh>

          {/* Tab strip. */}
          <Flat w={width} h={S.height} r={[W.radius, W.radius, 0, 0]} color={S.color} position={[0, stripY, z]} />
          {/* Traffic lights: close and minimize fold the window into its chip, maximize
              toggles maximized. These are the dots; the DOM buttons over them take the
              clicks and show the glyphs (WindowControls.tsx). */}
          {S.lights.colors.map((c, i) => (
            <mesh key={c} position={[-width / 2 + S.lights.x + i * S.lights.gap, stripY + S.lights.dy, z + L * 8]}>
              <circleGeometry args={[S.lights.size, 28]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
          ))}
          <TabStrip win={id} width={width} top={top} z={z} pivot={pivot} onEmptyPress={(e) => startMove(e, true)} />

          {/* Toolbar: back, forward, reload, omnibox (also a drag handle), maximize. */}
          <Flat w={width} h={T.height} color={T.color} position={[0, toolY, z]} />
          <Flat w={width} h={0.008} color={T.divider} position={[0, contentTop + 0.004, z + L]} />
          <group position={[-width / 2 + T.glyph.x, toolY, z + L]}>
            <Hit size={T.glyph.size} disabled={index <= 0} onClick={() => go(index - 1)}>
              <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={index > 0 ? T.glyph.color : T.glyph.dim} dir={-1} />
            </Hit>
            <Hit size={T.glyph.size} disabled={index >= wt.tabs.length - 1} onClick={() => go(index + 1)} position={[T.glyph.gap, 0, 0]}>
              <ArrowGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={index < wt.tabs.length - 1 ? T.glyph.color : T.glyph.dim} dir={1} />
            </Hit>
            <Hit size={T.glyph.size} disabled={!reload} onClick={() => reload?.()} position={[T.glyph.gap * 2, 0, 0]}>
              <ReloadGlyph size={T.glyph.size} stroke={T.glyph.stroke} color={reload ? T.glyph.color : T.glyph.dim} />
            </Hit>
          </group>
          <mesh ref={setOmni} geometry={roundedRect(omniW, T.omnibox.h, T.omnibox.h / 2)} position={[omniX, toolY, z + L]} onPointerDown={(e) => startMove(e, false)} {...hoverCursor('grab')}>
            <meshBasicMaterial color={T.omnibox.color} toneMapped={false} />
          </mesh>
          <mesh position={[omniX - omniW / 2 + 0.08, toolY, z + L * 2]}>
            <circleGeometry args={[0.022, 16]} />
            <meshBasicMaterial color={T.omnibox.lock} toneMapped={false} />
          </mesh>
          <Label size={T.omnibox.size} color={T.omnibox.text} font={FONTS.mono} position={[omniX - omniW / 2 + 0.13, toolY, z + L * 2]}>
            {ellipsize(url, omniW - 0.2, T.omnibox.size * 1.06)}
          </Label>
          <group ref={setMax} position={[width / 2 - MX.inset, toolY, z + L]}>
            <Hit size={MX.size} onClick={() => useWindows.getState().toggleMaximize(id)}>
              <Flat w={MX.size} h={MX.size} r={MX.radius} color={MX.bg} />
              <MaximizeGlyph size={MX.glyph} stroke={MX.stroke} color={MX.color} bg={MX.bg} restore={isMax} position={[0, 0, L]} />
            </Hit>
          </group>

          {/* The active tab's page, drawn from its top-left corner. */}
          <Flat w={width} h={contentH} r={[0, 0, W.radius, W.radius]} color={CONTENT_BG[tab.kind]} position={[0, contentTop - contentH / 2, z]} />
          <group position={[-width / 2, contentTop, z + L * 2]} scale={contentScale}>
            <WindowContent win={id} tab={tab} box={box} reloads={reloads} />
          </group>

          {/* Bottom-right resize grip. */}
          <group ref={setGrip} position={[width / 2 - G.inset - G.size / 2, -height / 2 + G.inset + G.size / 2, VEIL_Z - 0.02]} visible={!isMax}>
            <mesh geometry={roundedRect(G.size, G.size, G.radius)} onPointerDown={isMax ? undefined : startResize} {...hoverCursor('nwse-resize')}>
              <meshBasicMaterial color={G.bg} toneMapped={false} />
            </mesh>
            <GripGlyph size={G.size * 0.62} stroke={G.stroke} color={G.color} position={[0, 0, L]} />
          </group>

          {/* Dims the window while the other one is maximized; a press restores it. */}
          <mesh
            ref={veil}
            geometry={UNIT}
            scale={[width + 0.02, height + 0.02, 1]}
            position={[0, 0, VEIL_Z]}
            renderOrder={5}
            visible={false}
            onPointerDown={
              veiled
                ? (e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation()
                    useWindows.getState().setMaximized(null)
                  }
                : undefined
            }
          >
            <meshBasicMaterial ref={veilMat} color={W.veil} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
          {/* Keeps clicks on the window's body from reaching what is behind it. */}
          <mesh geometry={UNIT} material={INVISIBLE} scale={[width, height, 1]} position={[0, 0, z - L]} onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()} />
        </group>
      </group>
    </group>
  )
}
