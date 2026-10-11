import { FLOOR_Y, LESSON_CAMERA, ROOM } from '../layout3d'
import { PHYSICS } from '../physics/config'

// Everything that styles and places the two stage worlds
// (design/study-play/Backgrounds.dc.html): the calm Study classroom and the
// loud Play gym, which WorldSwitch swaps on the mode store. Both are one room
// shell (floor, back wall, two side walls) sized to the physics room's
// colliders, so whatever bounces off a wall bounces off a wall you can see,
// and the toy hoop hangs on the gym's right wall. The walls run far above and
// the floor far past anything a full-bleed canvas can show at any aspect, so
// no edge or void is ever in view. Restyle the worlds from here.

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

// A horizontal band of wall colour, floor-relative heights (world units above FLOOR_Y).
export interface Band {
  from: number
  to: number
  color: string
}

const HALF_W = ROOM.width / 2
const BACK_Z = -ROOM.backZ
const TOP = 13 // wall height above the floor: past the top of any frame (no ceiling is ever in view)
const RIM = PHYSICS.hoop.rim // the toy hoop's rim centre (src/scene/physics/config.ts); the gym hangs its hoop on it
const H = (y: number) => y - FLOOR_Y // world y -> height above the floor

export const WORLD = {
  // The shared room shell. halfW / backZ match the physics room (ROOM_BOX).
  shell: {
    halfW: HALF_W,
    backZ: BACK_Z,
    frontZ: LESSON_CAMERA.position[2] + 4, // floor and side walls run on past the camera
    top: TOP,
    sideShade: 0.9, // side walls are this much darker (linear), so the corners read
    order: -200, // shells draw first among transparent things (they are transparent only so a fade never recompiles)
  },

  // The Study / Play cross-fade when the mode flips.
  fade: {
    ms: 360,
    incomingOrder: 10, // added to the incoming shell's renderOrder while it blends over the outgoing one
  },

  study: {
    wall: '#E9EEF5',
    floor: '#DCE3EC',
    // Lower wall a shade cooler, under a pale chalk rail: the room's soft horizon.
    wainscot: { to: 1.05, color: '#E2E8F1' } as const,
    rail: { at: 1.05, height: 0.07, depth: 0.06, color: '#F8FAFD', lip: '#C9D2E0' },
    chalk: [
      { x: -1.55, length: 0.2, color: '#FFFFFF' },
      { x: -1.2, length: 0.16, color: '#FFE9A8' },
      { x: 1.35, length: 0.18, color: '#BFE3FF' },
    ],
    eraser: { x: 0.95, size: [0.34, 0.08, 0.1] as Vec3, felt: '#B9C4D6', top: '#5B6478' },
    skirting: { height: 0.2, color: '#CFD8E6', line: '#B9C4D6', lineWidth: 0.035 },
    // Big pale floor tiles with hairline seams, for depth without noise.
    tiles: { size: 1.4, seam: '#D2DAE6', seamPx: 3, px: 256 },
    // One wide window high on the back wall, above the poster gallery.
    window: {
      center: [0, H(3.25)] as Vec2, // x, height above the floor
      size: [4.4, 2.05] as Vec2,
      frame: 0.11,
      mullion: 0.055,
      cols: 4,
      rows: 2,
      frameColor: '#FFFFFF',
      mullionColor: '#D5DEEA',
      glass: ['#B9DBF5', '#E3F1FC'] as [top: string, bottom: string],
      glints: [
        [0.12, 0.07],
        [0.24, 0.03],
        [0.62, 0.05],
      ] as Vec2[], // diagonal glints on the glass: [left at the sill, width], shares of the width

      sill: { depth: 0.16, height: 0.07, overhang: 0.14, color: '#F6F8FB' },
      shadow: { color: '#C5CFDE', offset: 0.05 }, // soft drop shadow under the frame
    },
    // Daylight from the window: its panes thrown onto the floor in front of
    // the back wall (sun high behind the window, a little to the left), and
    // a faint shaft from the glass down to them.
    light: {
      patch: { z: [BACK_Z + 3.4, BACK_Z + 6.0] as Vec2, width: 4.4, skew: 1.1, opacity: 0.7, color: '#FFFFFF' },
      panes: { px: [512, 256] as Vec2, gap: 14, blur: 5 },
      shaft: { opacity: 0.07, color: '#FFFFFF' },
    },
    platform: true, // the sparkle stage's white platform with the rainbow rim stays under the tutor
  },

  play: {
    wall: '#FFE07A',
    floor: '#E8B76A',
    // Bold stripes over the warm wall, heights above the floor (the mock's orange / sky / purple, top down).
    stripes: [
      { from: H(1.05), to: H(1.68), color: '#7B5CF0' },
      { from: H(1.68), to: H(2.82), color: '#3BB4F2' },
      { from: H(2.82), to: TOP, color: '#FF7A45' },
    ] as Band[],
    // Light dashes along the sky band (the mock's 35% white bars).
    dashes: { at: H(2.42), height: 0.16, length: 0.62, gap: 0.42, color: '#FFFFFF', opacity: 0.35 },
    skirting: { height: 0.16, color: '#F2C94C' },
    // Planks run along the back wall (x), seams staggered row to row.
    planks: { width: 0.42, length: 2.4, rows: 6, seam: '#D39A4F', seamPx: 3, grain: '#C98A3E', vary: 0.035, px: 1024 },
    // Court lines: a half court whose baseline is the right wall, under the hoop.
    court: {
      color: '#FFFFFF',
      width: 0.07,
      lift: 0.004,
      laneLength: 2.35, // baseline to the free-throw line (x)
      laneWidth: 1.9, // across (z)
      freeThrowRadius: 0.95,
      threeRadius: 4.3, // around the rim's floor spot, cut off by the walls
      sideline: 0.4, // a sideline this far in front of the back wall
      centerRadius: 1.25, // half of the centre circle on the left wall
    },
    // The hoop. The toy Hoop in src/scene/physics/Toys.tsx owns the real rim
    // (colliders, score sensor, shootBall's aim) at PHYSICS.hoop.rim and draws
    // its own backboard, rim and net, so by default the gym only adds the
    // padded wall mount behind that board ('mount'). 'full' also draws a
    // board, rim and net in the mock's colours at the same rim (for a scene
    // without the toys, or once the toy's meshes are dropped).
    hoop: {
      draw: 'mount' as HoopDraw,
      rim: RIM as unknown as Vec3,
      rimRadius: PHYSICS.hoop.rimRadius,
      tube: PHYSICS.hoop.tube,
      board: PHYSICS.hoop.board, // width (z), height, thick, above (board centre above the rim)
      netDepth: PHYSICS.hoop.net.depth,
      pad: { margin: 0.2, color: '#55596E', inset: 0.06, trim: '#FF7A45' }, // wall pad round the board
      colors: { board: '#FFFFFF', frame: '#55596E', target: '#F0605D', rim: '#F0605D', net: '#FFFFFF' },
    },
    scoreboard: {
      center: [0, H(3.05)] as Vec2, // x, height above the floor, on the back wall
      size: [3.1, 1.25] as Vec2,
      depth: 0.12,
      body: '#1B1D2A',
      label: '#FFD84D',
      digits: '#FFFFFF',
      text: 'SHOTS',
      px: [512, 206] as Vec2,
      font: "'Figtree', 'Bricolage Grotesque', system-ui, sans-serif",
    },
    // Ball rack against the back wall, left of the tutor (the mock's rack, lower left).
    rack: {
      position: [-2.45, FLOOR_Y, BACK_Z + 0.5] as Vec3,
      length: 1.5,
      height: 0.5,
      depth: 0.42,
      frame: '#55596E',
      balls: 3,
      ballRadius: 0.24,
      ball: '#F08A24',
      seam: '#7A3A08',
    },
    shadow: { opacity: 0.18, lift: 0.008 }, // catcher for the tutor's and the toys' shadows on the court
  },
} as const

export type HoopDraw = 'mount' | 'full'
export type WorldId = 'study' | 'play'

// The toy hoop's rim centre, for anything that must line up with it.
export const GYM_HOOP_RIM: Vec3 = [RIM[0], RIM[1], RIM[2]]
