import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Box3, CanvasTexture, MathUtils, Quaternion, SRGBColorSpace, Vector3, type Group, type Object3D, type PerspectiveCamera, type Scene } from 'three'
import { exposeDev } from '../../character/blender/actor'
import { tutorStatus } from '../../character/blender/BlenderTutor'
import { laneZ } from '../../lesson/roam'
import { anchors } from '../../scene/anchors'
import { FLOOR_Y, SPOTS } from '../../scene/layout3d'
import { sceneFrame } from '../../scene/sceneRig'
import type { Archetype } from '../archetypes'
import { fightDom, useFight } from '../fight'
import { ArenaFx } from './ArenaFx'
import { BossModel, newBossRig } from './BossModel'
import { ARENA, BEAT, BOSS_SHAPE, JUICE } from './config'
import { arenaFrame } from './frame'
import { useBoss } from '../bossStore'
import { bossPose, guyPose, outBack, shake, span, tense } from './timeline'

// The Beat the Boss arena, on the lesson stage itself: the real Mochee
// fights. Mounted once with the live stage (Stage.tsx); idle until a fight is
// on. Then it pops the lesson room away, frames the shot on the two fighters,
// layers the fight on top of his clips (facing the boss, the dash, the hop,
// the slump) and renders the boss, the discs and the effects.

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))
const backIn = (t: number, s = 1.7) => t * t * ((s + 1) * t - s)

interface Piece {
  o: Object3D
  pos: Vector3
  scale: Vector3
  visible: boolean
  center: Vector3 // scale about this (parent space)
  fixed: boolean // a window: its own code moves it, so only scale it
}

const box = new Box3()

// The lesson room's pieces (windows, platform, shelves): the direct children of
// the top-level group that holds the windows.
function collectRoom(scene: Scene): Piece[] {
  let o: Object3D | undefined
  for (const name of ARENA.windows) {
    o = scene.getObjectByName(name)
    if (o) break
  }
  if (!o) return []
  while (o.parent && o.parent !== scene) o = o.parent
  const room = o
  room.updateWorldMatrix(true, true)
  return room.children.map((c) => {
    const fixed = (ARENA.windows as readonly string[]).includes(c.name)
    const center = c.position.clone()
    if (!fixed) {
      box.setFromObject(c)
      if (!box.isEmpty()) room.worldToLocal(box.getCenter(center))
    }
    return { o: c, pos: c.position.clone(), scale: c.scale.clone(), visible: c.visible, center, fixed }
  })
}

// The free band between the HUD cards (marked data-arena-top) and the card
// below (data-arena-bottom), in px from the window's top. offsetTop ignores the
// cards' slide-in transforms, so the band does not jump while they animate.
function measureBand(hud: HTMLElement, out: { top: number; bottom: number }) {
  out.top = 0
  out.bottom = hud.clientHeight
  hud.querySelectorAll<HTMLElement>('[data-arena-top]').forEach((e) => {
    out.top = Math.max(out.top, e.offsetTop + e.offsetHeight)
  })
  hud.querySelectorAll<HTMLElement>('[data-arena-bottom]').forEach((e) => {
    out.bottom = Math.min(out.bottom, e.offsetTop)
  })
}

// The boss's rest height (to the pipe's top), world units above the floor.
const BOSS_TOP = (BOSS_SHAPE.body.bottom + BOSS_SHAPE.body.h + BOSS_SHAPE.pipe.h - 0.05) * ARENA.boss.scale

const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

export function BossArena() {
  const on = useFight((s) => s.on)
  const arch = useFight((s) => s.arch)
  const { scene } = useThree()
  const st = useMemo(
    () => ({
      still: 0,
      face: 0,
      pieces: [] as Piece[],
      tutor: null as Object3D | null,
      v: new Vector3(),
      q: new Quaternion(),
      qy: new Quaternion(),
      qr: new Quaternion(),
      guyZ: laneZ(ARENA.guy.x, SPOTS),
      band: { top: 0, bottom: 0, at: -Infinity },
      fitS: 1,
      fitP: 0,
      tense: 0,
      out: { k: 0, room: 0, guy: [0, 0], boss: [0, 0], fit: [1, 0], band: [0, 0] },
    }),
    [],
  )

  // Give the room back if the stage unmounts mid-fight.
  useEffect(
    () => () => {
      for (const p of st.pieces) {
        p.o.position.copy(p.pos)
        p.o.scale.copy(p.scale)
        p.o.visible = p.visible
      }
      st.pieces = []
    },
    [st],
  )

  // This frame's poses: after the camera rig and his placement (-1), before
  // the mixer and everything that reads them (0).
  useFrame((_, delta) => {
    const F = arenaFrame
    const f = useFight.getState()
    const dt = Math.min(delta, 0.1)
    F.now = performance.now()
    F.k = damp(F.k, f.on ? 1 : 0, ARENA.takeDamp, dt)
    if (F.k > 0.999) F.k = 1
    if (F.k < 0.001) F.k = 0
    F.room = MathUtils.clamp(F.room + ((f.on ? 1 : -1) * dt * 1000) / ARENA.room.popMs, 0, 1)
    st.still = damp(st.still, tutorStatus.phase === 'still' ? 1 : 0, 6, dt)
    F.motion = st.still * (f.reduced ? JUICE.reduced.bob : 1)
    bossPose(f.beat, f.outcome, F.now - f.outcomeAt, F.now, f.reduced ? JUICE.reduced.bob : 1, F.boss)
    guyPose(f.beat, f.outcome, F.now - f.outcomeAt, F.now, F.motion, F.guy)
    // While the answer is checked: both brace for the beat.
    st.tense = damp(st.tense, f.on && useBoss.getState().phase === 'checking' ? 1 : 0, 1000 / BEAT.tense, dt)
    tense(st.tense * (f.reduced ? JUICE.reduced.bob : 1), F.guy, F.boss)
    shake(f.beat, F.now, f.reduced, F.shake)
    F.guyAt.set(tutorStatus.x, FLOOR_Y, tutorStatus.z)
    F.bossAt.set(ARENA.boss.x + F.boss.x + F.boss.jitter, FLOOR_Y + F.boss.y, ARENA.boss.z)
  }, -0.5)

  // After the mixer, the tumble layer and his anchors: the room, the fight
  // layer on him, the camera and the HUD's anchor variables.
  useFrame((state, delta) => {
    const F = arenaFrame
    const k = F.k
    const f = useFight.getState()
    const dt = Math.min(delta, 0.1)

    // The room pops away (a quick swell, then gone) and pops back after.
    if (F.room > 0 && st.pieces.length === 0) st.pieces = collectRoom(scene)
    if (st.pieces.length) {
      const t = F.room
      const s = Math.max(1e-4, 1 - backIn(t))
      for (const p of st.pieces) {
        p.o.scale.copy(p.scale).multiplyScalar(s)
        if (!p.fixed) p.o.position.copy(p.center).addScaledVector(st.v.copy(p.pos).sub(p.center), s)
        p.o.visible = p.visible && t < 0.98
      }
      if (t === 0 && !f.on) {
        for (const p of st.pieces) {
          p.o.position.copy(p.pos)
          p.o.scale.copy(p.scale)
          p.o.visible = p.visible
        }
        st.pieces = []
      }
    }
    if (k === 0) {
      st.fitS = 1
      st.fitP = 0
      st.band.at = -Infinity
      return
    }

    // Mochee: turned toward the boss once he stands still, plus the beat's
    // offsets, pivoting about his feet. His placement is rewritten every frame
    // before the mixer, so nothing here accumulates.
    if (!st.tutor || !st.tutor.parent) st.tutor = scene.getObjectByName(ARENA.tutorName) ?? null
    const g = st.tutor
    st.face = damp(st.face, f.on && tutorStatus.phase === 'still' ? ARENA.face : 0, ARENA.faceDamp, dt)
    if (g) {
      const P = F.guy
      st.qy.setFromAxisAngle(Y, st.face * k)
      st.qr.setFromAxisAngle(Z, -P.pitch * k)
      st.q.copy(st.qr).multiply(st.qy)
      st.v.copy(g.position).sub(F.guyAt).applyQuaternion(st.q).add(F.guyAt)
      st.v.x += P.dx * k
      st.v.y += P.dy * k
      g.position.copy(st.v)
      g.quaternion.premultiply(st.q)
      g.scale.x *= 1 + (P.sx - 1) * k
      g.scale.y *= 1 + (P.sy - 1) * k
      g.scale.z *= 1 + (P.sx - 1) * k
    }

    // The shot: from the stage frame to the whole window (the HUD covers it
    // all), zoomed about its centre, panned, fitted to the free band between
    // the cards, and shaken on big hits.
    const cam = state.camera as PerspectiveCamera
    const vw = state.size.width
    const vh = state.size.height
    const fr = sceneFrame
    const hud = fightDom.hud
    if (vw && vh && fr.w && fr.h) {
      const fx = MathUtils.lerp(fr.x, 0, k)
      const fy = MathUtils.lerp(fr.y, 0, k)
      const fw = MathUtils.lerp(fr.w, vw, k)
      const fh = MathUtils.lerp(fr.h, vh, k)
      const view = (z: number, px: number, py: number) => {
        const w = vw / z
        const h = vh / z
        cam.aspect = fw / fh
        cam.setViewOffset(fw, fh, -fx + (vw - w) / 2 - px / z, -fy + (vh - h) / 2 - py / z, w, h)
      }
      const z0 = MathUtils.lerp(1, ARENA.frame.zoom, k)
      const px0 = ARENA.frame.dx * k
      const py0 = ARENA.frame.dy * k
      // On screen, y = vh/2 + q·zoom + pan, so scaling the zoom by s about the
      // centre and panning by p moves a point at y to vh/2 + (y - pan - vh/2)·s + pan + p.
      const G = ARENA.frame.fit
      let s = 1
      let p = 0
      if (hud && f.on) {
        if (F.now - st.band.at > G.everyMs) {
          measureBand(hud, st.band)
          st.band.at = F.now
        }
        view(z0, px0, py0)
        const sy = (x: number, y: number, z: number) => ((1 - st.v.set(x, y, z).project(cam).y) / 2) * vh
        const D = ARENA.disc
        const top = sy(ARENA.boss.x, FLOOR_Y + BOSS_TOP, ARENA.boss.z)
        const feet = Math.max(sy(ARENA.boss.x, FLOOR_Y - D.base, ARENA.boss.z + D.boss), sy(ARENA.guy.x, FLOOR_Y - D.base, st.guyZ + D.guy))
        const lo = st.band.bottom - G.gap
        const hi = st.band.top + G.gap
        s = MathUtils.clamp((lo - hi) / Math.max(1, feet - top), G.minScale, 1)
        p = Math.min(0, lo - (vh / 2 + (feet - py0 - vh / 2) * s + py0))
      }
      st.fitS = damp(st.fitS, s, G.damp, dt)
      st.fitP = damp(st.fitP, p, G.damp, dt)
      view(z0 * st.fitS, px0 + F.shake.x * k, py0 + st.fitP + F.shake.y * k)
      st.out.fit[0] = Math.round(st.fitS * 1000) / 1000
      st.out.fit[1] = Math.round(st.fitP)
      st.out.band[0] = st.band.top
      st.out.band[1] = st.band.bottom
    }

    // Where their heads are on screen, for the HUD's combo pill and damage numbers.
    if (hud && f.on) {
      const v = st.v.copy(anchors.tutor)
      v.x += F.guy.dx * k
      v.y += F.guy.dy * k
      v.project(cam)
      const gx = ((v.x + 1) / 2) * vw
      const gy = ((1 - v.y) / 2) * vh
      const top = (BOSS_SHAPE.body.bottom + BOSS_SHAPE.body.h) * ARENA.boss.scale * F.boss.sy
      v.set(F.bossAt.x, F.bossAt.y + top, F.bossAt.z).project(cam)
      const bx = ((v.x + 1) / 2) * vw
      const by = ((1 - v.y) / 2) * vh
      hud.style.setProperty('--guy-x', `${gx.toFixed(1)}px`)
      hud.style.setProperty('--guy-y', `${gy.toFixed(1)}px`)
      hud.style.setProperty('--boss-x', `${bx.toFixed(1)}px`)
      hud.style.setProperty('--boss-y', `${by.toFixed(1)}px`)
      st.out.guy[0] = Math.round(gx)
      st.out.guy[1] = Math.round(gy)
      st.out.boss[0] = Math.round(bx)
      st.out.boss[1] = Math.round(by)
    }
    st.out.k = Math.round(k * 1000) / 1000
    st.out.room = Math.round(F.room * 1000) / 1000
    exposeDev('bossArena', st.out)
  })

  return on && arch ? <ArenaScene arch={arch} /> : null
}

// ---- The fight's own set: two discs and the boss.

function rimTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 4
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createLinearGradient(0, 0, 256, 0)
  ;['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#4285f4'].forEach((col, i) => grad.addColorStop(i / 4, col))
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 4)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function Disc({ r, top, side, rim }: { r: number; top: string; side: string; rim?: CanvasTexture | null }) {
  const { base, line, lineColor } = ARENA.disc
  return (
    <group>
      <mesh position={[0, -base / 2, 0]}>
        <cylinderGeometry args={[r, r * 0.96, base, 64, 1, true]} />
        <meshBasicMaterial color={rim ? '#ffffff' : side} map={rim ?? null} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 64]} />
        <meshBasicMaterial color={top} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * line[0], r * line[1], 64]} />
        <meshBasicMaterial color={rim ? lineColor : side} transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  )
}

function ArenaScene({ arch }: { arch: Archetype }) {
  const rig = useMemo(newBossRig, [])
  const root = useRef<Group>(null)
  const { gl, camera, scene } = useThree()
  // Compile every arena shader up front (the effects start hidden), so the
  // first hit or lunge does not stall on a shader compile mid-beat.
  useEffect(() => {
    const g = root.current
    if (g) gl.compileAsync(g, camera, scene).catch(() => {})
  }, [gl, camera, scene])
  const rim = useMemo(rimTexture, [])
  useEffect(() => () => rim?.dispose(), [rim])
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const guyDisc = useRef<Group>(null)
  const bossDisc = useRef<Group>(null)
  const st = useMemo(() => ({ wheel: 0, lastX: Number.NaN }), [])
  const guyZ = useMemo(() => laneZ(ARENA.guy.x, SPOTS), [])

  useFrame((_, delta) => {
    const F = arenaFrame
    const P = F.boss
    const f = useFight.getState()
    const dt = Math.max(1e-3, Math.min(delta, 0.1))
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    o.position.copy(F.bossAt)
    o.rotation.set(0, 0, P.lean)
    o.visible = !P.gone
    i.scale.set(P.sx, P.sy, P.sz).multiplyScalar(ARENA.boss.scale)

    // Wheels: the roll that matches how far it moved, plus any revving.
    const W = BOSS_SHAPE.wheel
    const vx = Number.isNaN(st.lastX) ? 0 : MathUtils.clamp((o.position.x - st.lastX) / dt, -25, 25)
    st.lastX = o.position.x
    st.wheel += (-vx / (W.r * ARENA.boss.scale) + P.spin) * dt
    for (const w of rig.wheels) w.rotation.z = st.wheel

    const flash = P.flash * (f.reduced ? JUICE.reduced.flash : 1)
    for (const m of rig.mats) m.emissiveIntensity = flash * 0.85
    const blink = F.now % BEAT.idle.blink < BEAT.idle.blinkLen
    const ey = P.hurt > 0.5 ? 0.22 : blink ? 0.12 : 1 + 0.12 * P.glare
    for (const e of rig.eyes) e.scale.set(1 + 0.1 * P.glare, ey, 1)
    const ps = P.hurt > 0.5 ? 0.6 : 1 - 0.3 * P.glare
    for (const p of rig.pupils) p.scale.setScalar(ps)

    bossDisc.current?.scale.setScalar(Math.max(1e-3, P.disc))
    const enter = f.beat?.kind === 'enter' ? span(F.now - f.beat.at, 0, ARENA.disc.pop) : 1
    guyDisc.current?.scale.setScalar(Math.max(1e-3, outBack(Math.min(enter, F.room))))
  })

  return (
    <group ref={root} name="boss-arena">
      <group ref={guyDisc} position={[ARENA.guy.x, FLOOR_Y, guyZ]}>
        <Disc r={ARENA.disc.guy} top="#ffffff" side={ARENA.disc.lineColor} rim={rim} />
      </group>
      <group ref={bossDisc} position={[ARENA.boss.x, FLOOR_Y, ARENA.boss.z]}>
        <Disc r={ARENA.disc.boss} top={arch.disc} side={BOSS_SHAPE.discBase} />
      </group>
      <group ref={outer}>
        <group ref={inner} rotation={[0, ARENA.boss.yaw, 0]}>
          <BossModel arch={arch} rig={rig} />
        </group>
      </group>
      <ArenaFx arch={arch} />
    </group>
  )
}
