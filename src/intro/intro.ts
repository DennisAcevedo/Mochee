import { gsap } from 'gsap'
import { INTRO } from '../animation/config'
import { intro, INTRO_REST } from '../animation/introState'
import { tutorActor } from '../character/blender/actor'
import { INTRO_LAYER } from '../character/blender/config'
import { CAMERA_REST, resetSceneRig, sceneRig } from '../scene/sceneRig'
import { useTutorStore } from '../state/store'
import { introTargets as T } from './targets'
import { unlockAudio } from './unlockAudio'

// The start-screen → lesson sequence. One GSAP master timeline drives the
// intro state the character tick reads, the camera rig, and the DOM.
// Every number lives in INTRO (src/animation/config.ts).

const TAU = Math.PI * 2
const UI_PROPS = 'opacity,visibility,transform,transformOrigin,transition'

let master: gsap.core.Timeline | null = null

const store = () => useTutorStore.getState()

// Where the camera pushes in to: the Blender tutor stands on the floor and
// keeps his feet in the start box; the classic stand-in floats, face-height.
const pushPose = () => (tutorActor.classic ? INTRO.push : INTRO_LAYER.push)
const els = (...list: (HTMLElement | undefined)[]) => list.filter((e): e is HTMLElement => !!e)
const uiEls = () => els(T.topBar, T.board, T.sidebar, T.inputBar)
const overlayEls = () => els(T.overlay, T.title, T.subtitle, T.zs, T.startCta, T.startButton)

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function killAll() {
  master?.kill()
  master = null
  gsap.killTweensOf([intro, sceneRig, sceneRig.cam, ...uiEls(), ...overlayEls(), ...els(T.backdrop)])
}

function focusStart() {
  setTimeout(() => T.startButton?.focus({ preventScroll: true }), 50)
}

// Start-screen state: sleeping character in the start box, UI hidden. Safe to
// call before first paint (from a layout effect) and again for a replay.
export function showStartScreen() {
  killAll()
  Object.assign(intro, INTRO_REST)
  intro.snap = true
  resetSceneRig()
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

// The board grows out of wherever the character is standing.
function aimBoard() {
  const el = T.board
  if (!el) return
  const r = el.getBoundingClientRect()
  gsap.set(el, { transformOrigin: `${sceneRig.charScreen.x - r.left}px ${sceneRig.charScreen.y - r.top}px` })
}

// Step 9, shared by both versions: wave, type the greeting, settle.
function greet(tl: gsap.core.Timeline, at: number, roamDuration: number) {
  const G = INTRO.greet
  const typeAt = at + G.lead
  const chars = store().session.greeting.length
  const typeDuration = chars / G.charsPerSecond
  const settleAt = typeAt + typeDuration
  const typer = { n: 0 }
  let shown = -1

  tl.call(() => store().setIntroPose('wave'), [], at)
  tl.call(() => store().startGreeting(), [], typeAt)
  tl.to(
    typer,
    {
      n: chars,
      duration: typeDuration,
      ease: 'none',
      onUpdate: () => {
        const n = Math.round(typer.n)
        if (n !== shown) store().typeGreeting((shown = n))
      },
    },
    typeAt,
  )
  tl.call(
    () => {
      store().completeGreeting()
      store().setIntroPose(null) // explain, from the lesson state
      store().setPhase('live')
    },
    [],
    settleAt,
  )
  tl.to(intro, { roam: 1, duration: roamDuration, ease: INTRO.roam.ease }, settleAt)
  tl.call(finish, [], settleAt + roamDuration)
}

function finish() {
  intro.active = false
  master = null
}

function buildFull() {
  const tl = gsap.timeline()
  const { exit: E, push: P, wake: W, windup: WU, spin: S, pull: PO, land: L, backdrop: B, ui: U } = INTRO

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

  // 2. Camera pushes in on him.
  const { position: PP, target: PT } = pushPose()
  tl.to(sceneRig.cam, { px: PP[0], py: PP[1], pz: PP[2], tx: PT[0], ty: PT[1], tz: PT[2], duration: P.duration, ease: P.ease }, P.at)

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
  tl.set(intro, { spin: 0 }, spin + S.duration + S.wobbleDuration) // same angle, unwound

  // 6. Pull out to the teaching shot while arcing over to the teaching spot.
  const pull = spin + S.duration - PO.overlap
  const rest = { px: CAMERA_REST.px, py: CAMERA_REST.py, pz: CAMERA_REST.pz, tx: CAMERA_REST.tx, ty: CAMERA_REST.ty, tz: CAMERA_REST.tz }
  tl.to(sceneRig.cam, { ...rest, duration: PO.duration, ease: PO.ease }, pull)
  tl.to(sceneRig, { frameT: 1, duration: PO.duration, ease: PO.ease }, pull)
  tl.to(intro, { travel: 1, duration: PO.duration, ease: PO.travelEase }, pull)
  tl.to(intro, { lift: PO.arc, duration: PO.duration * PO.arcPeak, ease: PO.arcUpEase }, pull)
  tl.to(intro, { lift: 0, duration: PO.duration * (1 - PO.arcPeak), ease: PO.arcDownEase }, pull + PO.duration * PO.arcPeak)

  // 7. Land: squash, elastic settle; the start gradient gives way to the stage.
  const land = pull + PO.duration
  tl.to(intro, { squash: L.squash, duration: L.squashDuration, ease: 'power2.out' }, land)
  tl.to(intro, { squash: 0, duration: L.settleDuration, ease: L.settleEase }, land + L.squashDuration)
  tl.to(els(T.backdrop), { autoAlpha: 0, duration: B.duration, ease: B.ease }, land - B.lead)
  tl.to(sceneRig, { clipT: 1, duration: L.clipDuration, ease: 'power2.out' }, land)

  // 8. UI staggers in: top bar down, board out of the character, sidebar from
  //    the right, input bar up.
  const ui = land + U.delay
  const from = (vars: gsap.TweenVars): gsap.TweenVars => ({ ...vars, autoAlpha: 0 })
  const to = (vars: gsap.TweenVars): gsap.TweenVars => ({ ...vars, autoAlpha: 1, duration: U.duration, ease: U.ease, immediateRender: false })
  tl.set(els(T.sidebar), { transition: 'none' }, 0)
  tl.call(aimBoard, [], ui)
  tl.fromTo(els(T.topBar), from({ y: U.topBarY }), to({ y: 0 }), ui)
  tl.fromTo(els(T.board), from({ scale: U.boardScale }), to({ scale: 1 }), ui + U.stagger)
  tl.fromTo(els(T.sidebar), from({ xPercent: U.sidebarXPercent }), to({ xPercent: 0 }), ui + U.stagger * 2)
  tl.fromTo(els(T.inputBar), from({ y: U.inputBarY }), to({ y: 0 }), ui + U.stagger * 3)
  tl.set(uiEls(), { clearProps: UI_PROPS }, ui + U.stagger * 3 + U.duration)

  // 9. Wave, type the greeting, settle into explain and resume roaming.
  greet(tl, land + L.squashDuration, INTRO.roam.duration)
  return tl
}

// prefers-reduced-motion: no spin, no camera moves. Fade, wake, wave.
function buildReduced() {
  const tl = gsap.timeline()
  const R = INTRO.reduced

  tl.to(els(T.title, T.subtitle, T.zs, T.startCta), { autoAlpha: 0, duration: R.fade, ease: 'power1.out' }, 0)
  tl.set(els(T.overlay), { autoAlpha: 0 }, R.fade)

  // Wake in place.
  tl.call(() => store().setIntroPose('explain'), [], R.fade)
  tl.to(intro, { eyePop: 1, duration: R.eyePopIn, ease: 'power2.out' }, R.fade)
  tl.to(intro, { eyePop: 0, duration: R.eyePopOut, ease: 'power2.inOut' }, R.fade + R.eyePopIn)

  // Fade the scene out, cut to the teaching framing, fade everything in.
  const cut = R.fade + R.wakeHold
  tl.to(sceneRig, { canvasOpacity: 0, duration: R.cutFade, ease: 'power1.in' }, cut)
  const reveal = cut + R.cutFade
  tl.call(
    () => {
      sceneRig.frameT = 1
      sceneRig.clipT = 1
      intro.travel = 1
      intro.snap = true
    },
    [],
    reveal,
  )
  tl.to(sceneRig, { canvasOpacity: 1, duration: R.reveal, ease: 'power1.out' }, reveal)
  tl.to(els(T.backdrop), { autoAlpha: 0, duration: R.reveal, ease: 'power1.out' }, reveal)
  tl.to(uiEls(), { autoAlpha: 1, duration: R.reveal, ease: 'power1.out' }, reveal)
  tl.set(uiEls(), { clearProps: UI_PROPS }, reveal + R.reveal)

  greet(tl, reveal, 0)
  return tl
}

// Skip: drop the timeline and glide everything to its final state.
export function skipIntro() {
  if (store().phase !== 'intro') return
  killAll()
  const K = INTRO.skip
  const ease = K.ease

  // Unwind the spin to one turn (same angle) and finish whichever way is shorter.
  intro.spin = ((intro.spin % TAU) + TAU) % TAU
  const tl = gsap.timeline({
    onComplete: () => {
      intro.spin = 0
      finish()
    },
  })
  const { active: _active, ...rest } = INTRO_REST
  tl.to(intro, { ...rest, travel: 1, roam: 1, spin: intro.spin > Math.PI ? TAU : 0, duration: K.duration, ease }, 0)
  tl.to(sceneRig.cam, { ...CAMERA_REST, duration: K.duration, ease }, 0)
  tl.to(sceneRig, { frameT: 1, clipT: 1, canvasOpacity: 1, duration: K.duration, ease }, 0)
  tl.to(els(T.title, T.subtitle, T.zs, T.startCta, T.backdrop), { autoAlpha: 0, duration: K.duration, ease }, 0)
  tl.set(els(T.overlay), { autoAlpha: 0 }, K.duration)
  tl.to(els(T.topBar, T.inputBar), { y: 0, autoAlpha: 1, duration: K.duration, ease }, 0)
  tl.to(els(T.board), { scale: 1, autoAlpha: 1, duration: K.duration, ease }, 0)
  tl.to(els(T.sidebar), { xPercent: 0, autoAlpha: 1, duration: K.duration, ease }, 0)
  tl.set(uiEls(), { clearProps: UI_PROPS }, K.duration)
  master = tl

  store().completeGreeting()
  store().setIntroPose(null)
  store().setPhase('live')
}

export function disposeIntro() {
  killAll()
}
