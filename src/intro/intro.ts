import { gsap } from 'gsap'
import { INTRO } from '../animation/config'
import { entrance, intro, INTRO_REST } from '../animation/introState'
import { roomBuild, setRoomBuild, type BuildPart } from '../scene/room/build'
import { resetSceneRig, sceneRig } from '../scene/sceneRig'
import { useDirector } from '../state/director'
import { useTutorStore } from '../state/store'
import { introTargets as T } from './targets'
import { unlockAudio } from './unlockAudio'

// The start-screen → lesson sequence. One GSAP master timeline drives the
// intro state the classic character's tick reads, the camera rig, the Blender
// tutor's entrance and the DOM. Every number lives in INTRO
// (src/animation/config.ts).
//
// The classic character sleeps, wakes and spins on the start screen, then
// rockets out of frame; the bare white box fades in under the room camera and
// the Blender tutor drops in from above the ceiling. Once he lands, the room
// builds itself around him (src/scene/room/build.tsx), then the lesson goes
// live, which animates in the lesson UI and starts the walkthrough.

const TAU = Math.PI * 2
const UI_PROPS = 'opacity,visibility,transform,transformOrigin,transition'

let master: gsap.core.Timeline | null = null

const store = () => useTutorStore.getState()
const els = (...list: (HTMLElement | undefined)[]) => list.filter((e): e is HTMLElement => !!e)
const uiEls = () => els(T.topBar, T.dock)
const overlayEls = () => els(T.overlay, T.title, T.subtitle, T.zs, T.startCta, T.startButton)

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function killAll() {
  master?.kill()
  master = null
  gsap.killTweensOf([intro, entrance, roomBuild, sceneRig, sceneRig.cam, ...uiEls(), ...overlayEls(), ...els(T.backdrop)])
}

function focusStart() {
  setTimeout(() => T.startButton?.focus({ preventScroll: true }), 50)
}

// Start-screen state: sleeping character in the start box, room and UI
// hidden. Safe to call before first paint (from a layout effect) and again
// for a replay.
export function showStartScreen() {
  killAll()
  Object.assign(intro, INTRO_REST)
  intro.snap = true
  Object.assign(entrance, { dropY: 0, squash: 0 })
  resetSceneRig()
  useTutorStore.setState({ roomShown: false })
  gsap.set(uiEls(), { clearProps: UI_PROPS })
  gsap.set(uiEls(), { autoAlpha: 0 })
  gsap.set(overlayEls(), { clearProps: 'all' })
  gsap.set(els(T.backdrop), { clearProps: 'all' })
  focusStart()
}

// Dev shortcut (R): back to the start screen with a fresh session.
export function replayIntro() {
  store().resetSession()
  showStartScreen()
}

export function playIntro() {
  if (store().phase !== 'start') return
  unlockAudio()
  store().setPhase('intro')
  killAll()
  master = prefersReducedMotion() ? buildReduced() : buildFull()
}

// The room takes over: the classic character unmounts, the room and the
// Blender tutor show, the tutor waiting `dropY` above his spot. `built` = 0
// shows only the bare box, for the build sequence to fill in.
function showRoom(dropY: number, built: number) {
  entrance.dropY = dropY
  entrance.squash = 0
  setRoomBuild(built)
  useTutorStore.setState({ roomShown: true })
}

// Landing: stars and a ring at his feet, and a wave.
function landed(withFx: boolean) {
  const d = useDirector.getState()
  if (withFx) {
    d.burst('ring')
    d.burst('stars')
  }
  d.play('wave')
}

// The lesson goes live: mounts the mode switch, HUD, drawers and caption with
// their own entrance animations, and starts the walkthrough after its short delay.
function goLive() {
  store().setIntroPose(null)
  store().setPhase('live')
}

function finish() {
  intro.active = false
  master = null
}

// Step 9's DOM half, shared by both versions: the top bar drops in and the
// dock (walkthrough bar + ask box) rises.
function revealUi(tl: gsap.core.Timeline, at: number, motion: boolean) {
  const U = INTRO.ui
  const from = (vars: gsap.TweenVars): gsap.TweenVars => ({ ...(motion ? vars : {}), autoAlpha: 0 })
  const to = (vars: gsap.TweenVars): gsap.TweenVars => ({ ...(motion ? vars : {}), autoAlpha: 1, duration: U.duration, ease: U.ease, immediateRender: false })
  tl.fromTo(els(T.topBar), from({ y: U.topBarY }), to({ y: 0 }), at)
  tl.fromTo(els(T.dock), from({ y: U.dockY }), to({ y: 0 }), at + U.stagger * 3)
  tl.set(uiEls(), { clearProps: UI_PROPS }, at + U.stagger * 3 + U.duration)
}

function buildFull() {
  const tl = gsap.timeline()
  const { exit: E, push: P, wake: W, windup: WU, spin: S, launch: LA, room: R, backdrop: B, drop: D, ui: U } = INTRO

  // 1. Start screen leaves: button squishes and shrinks away with its rings,
  //    logo and subtitle float up, the z's pop and vanish.
  const squish = E.duration * E.squishPortion
  tl.set(els(T.startButton), { transition: 'none' }, 0)
  tl.to(els(T.startButton), { scale: E.squishScale, duration: squish, ease: 'power2.out' }, 0)
  tl.to(els(T.startCta), { scale: E.ctaEndScale, autoAlpha: 0, duration: E.duration - squish, ease: E.ease }, squish)
  tl.to(els(T.title, T.subtitle), { y: -E.titleRise, autoAlpha: 0, duration: E.duration - E.titleStagger, ease: E.ease, stagger: E.titleStagger }, 0)
  const pop = E.duration * E.zPopPortion
  tl.to(els(T.zs), { scale: E.zPopScale, duration: pop, ease: 'back.out(3)' }, 0)
  tl.to(els(T.zs), { scale: 0, autoAlpha: 0, duration: E.duration - pop, ease: 'power2.in' }, pop)
  tl.set(els(T.overlay), { autoAlpha: 0 }, E.duration)

  // 2. Camera pushes in on the face.
  tl.to(sceneRig.cam, { px: P.position[0], py: P.position[1], pz: P.position[2], tx: P.target[0], ty: P.target[1], tz: P.target[2], duration: P.duration, ease: P.ease }, P.at)

  // 3. Wake: eyes pop open with a twinkle, surprised hop, cap pops off and lands.
  const wake = P.at + P.duration
  tl.call(() => store().setIntroPose('explain'), [], wake)
  tl.to(intro, { eyePop: 1, duration: W.eyePopIn, ease: W.eyePopEase }, wake)
  tl.to(intro, { eyePop: 0, duration: W.eyePopOut, ease: 'power2.inOut' }, wake + W.eyePopIn + W.eyePopHold)
  tl.to(intro, { sparkle: 1, duration: W.sparkleIn, ease: 'back.out(2.5)' }, wake)
  tl.to(intro, { sparkle: 0, duration: W.sparkleOut, ease: 'power2.in' }, wake + W.sparkleIn)
  tl.to(intro, { hop: W.hop, duration: W.hopUp, ease: 'power2.out' }, wake)
  tl.to(intro, { hop: 0, duration: W.hopDown, ease: 'power2.in' }, wake + W.hopUp)
  tl.to(intro, { squash: -W.hopStretch, duration: W.hopUp / 2, ease: 'power2.out' }, wake)
  tl.to(intro, { squash: 0, duration: W.hopUp / 2, ease: 'power2.in' }, wake + W.hopUp / 2)
  tl.to(intro, { squash: W.landSquash, duration: W.landDuration / 2, ease: 'power2.out' }, wake + W.hopUp + W.hopDown)
  tl.to(intro, { squash: 0, duration: W.landDuration / 2, ease: 'power2.in' }, wake + W.hopUp + W.hopDown + W.landDuration / 2)
  tl.to(intro, { capPop: W.capPop, duration: W.capUp, ease: 'power2.out' }, wake + W.capDelay)
  tl.to(intro, { capPop: 0, duration: W.capDown, ease: W.capLandEase }, wake + W.capDelay + W.capUp)

  // 4. Wind-up: squash down and twist back.
  const windup = wake + W.duration
  tl.to(intro, { squash: WU.squash, twist: WU.twist, duration: WU.duration, ease: WU.ease }, windup)

  // 5. Spin. Stretch, rise and flung-out hands follow spin speed in the tick.
  const spin = windup + WU.duration
  const turns = S.turns * TAU
  tl.to(intro, { squash: 0, twist: 0, duration: S.twistRelease, ease: 'power2.out' }, spin)
  tl.to(intro, { spin: turns + S.overshoot, duration: S.duration, ease: S.ease }, spin)
  tl.to(intro, { spin: turns, duration: S.wobbleDuration, ease: S.wobbleEase }, spin + S.duration)

  // 6. Launch: he rockets straight up out of frame, stretched tall.
  const launch = spin + S.duration + LA.delay
  tl.to(intro, { hop: LA.height, duration: LA.duration, ease: LA.ease }, launch)
  tl.to(intro, { squash: -LA.stretch, duration: LA.duration * 0.6, ease: 'power2.out' }, launch)

  // 7. The room: the start gradient gives way to the bare white box as the
  //    camera settles into the room shot and the canvas clips to the stage.
  const room = launch + LA.duration * R.lead
  tl.call(() => showRoom(D.height, 0), [], room)
  tl.to(els(T.backdrop), { autoAlpha: 0, duration: B.duration, ease: B.ease }, room)
  tl.to(sceneRig, { roomT: 1, frameT: 1, clipT: 1, duration: R.duration, ease: R.ease }, room)

  // 8. Drop: the Blender tutor falls from above the ceiling onto his spot,
  //    squashes on his feet and springs back up.
  const drop = room + R.duration * D.at
  tl.to(entrance, { dropY: 0, duration: D.duration, ease: D.ease }, drop)
  const land = drop + D.duration
  tl.to(entrance, { squash: D.squash, duration: D.squashIn, ease: 'power2.out' }, land)
  tl.to(entrance, { squash: 0, duration: D.settle, ease: D.settleEase }, land + D.squashIn)

  tl.call(() => landed(true), [], land)

  // 8b. Build: the room assembles around him, piece by piece.
  const BU = INTRO.build
  for (const [part, p] of Object.entries(BU.parts) as [BuildPart, { at: number; duration: number; ease: string }][]) {
    tl.to(roomBuild, { [part]: 1, duration: p.duration, ease: p.ease }, land + p.at)
  }

  // 9. Live: the lesson UI staggers in and the walkthrough starts.
  const live = land + BU.liveAt
  tl.call(goLive, [], live)
  revealUi(tl, live + U.delay, true)
  tl.call(finish, [], live + U.delay + U.stagger * 3 + U.duration)
  return tl
}

// prefers-reduced-motion: no spin, no flight, no camera moves. Fade, wake,
// fade to the room, wave.
function buildReduced() {
  const tl = gsap.timeline()
  const R = INTRO.reduced

  tl.to(els(T.title, T.subtitle, T.zs, T.startCta), { autoAlpha: 0, duration: R.fade, ease: 'power1.out' }, 0)
  tl.set(els(T.overlay), { autoAlpha: 0 }, R.fade)

  // Wake in place.
  tl.call(() => store().setIntroPose('explain'), [], R.fade)
  tl.to(intro, { eyePop: 1, duration: R.eyePopIn, ease: 'power2.out' }, R.fade)
  tl.to(intro, { eyePop: 0, duration: R.eyePopOut, ease: 'power2.inOut' }, R.fade + R.eyePopIn)

  // Fade the scene out, cut to the room with him already on his spot, fade in.
  const cut = R.fade + R.wakeHold
  tl.to(sceneRig, { canvasOpacity: 0, duration: R.cutFade, ease: 'power1.in' }, cut)
  const reveal = cut + R.cutFade
  tl.call(
    () => {
      Object.assign(sceneRig, { roomT: 1, frameT: 1, clipT: 1 })
      showRoom(0, 1)
    },
    [],
    reveal,
  )
  tl.to(sceneRig, { canvasOpacity: 1, duration: R.reveal, ease: 'power1.out' }, reveal)
  tl.to(els(T.backdrop), { autoAlpha: 0, duration: R.reveal, ease: 'power1.out' }, reveal)
  tl.call(() => {
    landed(false)
    goLive()
  }, [], reveal)
  revealUi(tl, reveal, false)
  tl.call(finish, [], reveal + R.reveal)
  return tl
}

// Skip: drop the timeline, fade the canvas over to the room with him already
// standing on his spot, and bring the UI in.
export function skipIntro() {
  if (store().phase !== 'intro') return
  killAll()
  const K = INTRO.skip
  const ease = K.ease

  Object.assign(intro, INTRO_REST, { active: false })
  Object.assign(sceneRig, { roomT: 1, frameT: 1, clipT: 1, canvasOpacity: 0 })
  showRoom(0, 1)
  const tl = gsap.timeline({ onComplete: finish })
  tl.to(sceneRig, { canvasOpacity: 1, duration: K.duration, ease }, 0)
  tl.to(els(T.title, T.subtitle, T.zs, T.startCta, T.backdrop), { autoAlpha: 0, duration: K.duration, ease }, 0)
  tl.set(els(T.overlay), { autoAlpha: 0 }, K.duration)
  tl.to(uiEls(), { y: 0, autoAlpha: 1, duration: K.duration, ease }, 0)
  tl.set(uiEls(), { clearProps: UI_PROPS }, K.duration)
  master = tl
  landed(false)
  goLive()
}

export function disposeIntro() {
  killAll()
}
