import { PALETTE } from '../layout3d'

// Everything that styles the white-box room: surface tones (baked into
// gradient textures, so the room looks the same under any light rig), the
// corner falloff, and the bold accents. Restyle the room from here; geometry
// comes from ROOM / FLOOR_Y / SPOTS in layout3d.ts.

export type PaletteKey = keyof typeof PALETTE

export const ROOM_STYLE = {
  // Surface tones, lifted from the white-box mock's "Neutral white" tone.
  tones: {
    backCenter: '#ffffff',
    backEdge: '#ebebee',
    wallInner: '#f1f1f3', // side walls, back end
    wallOuter: '#dcdce0', // side walls, toward the camera
    ceilInner: '#f3f3f5',
    ceilOuter: '#e0e0e4',
    floorBack: '#f6f5f3',
    floorFront: '#dedcd8',
  },

  // Study mode: the box takes the sparkle stage's pastel sky (Stage.module.css,
  // design/sparkle-stage/Main.dc.html): warm off-white with a blue glow low on
  // the left, peach top right and warm yellow bottom right. The back wall
  // carries the CSS gradient as is; the side walls take their side's glows,
  // and the floor and ceiling a faint echo.
  sky: {
    base: '#f8f7f4',
    floor: '#f3f1ec',
    ceiling: '#f8f7f4',
    falloff: 0.55, // softer corners than the white box: the sky is about colour, not depth
    blue: '140, 182, 255',
    peach: '255, 184, 170',
    yellow: '255, 230, 150',
  },

  // Baked corner falloff ("ambient occlusion"): a dark band along every edge
  // where two surfaces meet, `width` world units wide.
  falloff: { color: '20, 20, 40', alpha: 0.14, width: 0.85 },
  textureSize: 512,

  // Transparent planes over each surface that catch the key light's shadows.
  shadowOpacity: { floor: 0.12, walls: 0.07 },
  lift: 0.004, // gap between stacked floor layers, against z-fighting

  // Round rug under the tutor's centre spot: concentric rings, outside in.
  rug: {
    radius: 1.35,
    squash: 0.62, // z scale: an oval reads better from the camera's height
    rings: ['teal', 'sun', 'coral', 'violet'] as PaletteKey[],
    ringWidth: 0.14,
    center: '#ffffff',
    segments: 64,
    dotRing: { radius: 0.62, count: 14, size: 0.045, color: 'pink' as PaletteKey },
  },

  // Soft blob shadow on the floor under the floating window (the blob texture is white; this tints it).
  windowBlob: { width: 2.8, depth: 1.3, opacity: 0.3, dz: 0.1, color: '#1e1e28' },

  // Glowing ceiling light panel.
  ceilingLight: {
    width: 2.8,
    depth: 1.1,
    z: -4.6,
    radius: 0.3,
    color: '#ffffff',
    rim: 'teal' as PaletteKey,
    rimWidth: 0.07,
    glow: { scale: 2.1, opacity: 0.55, color: '#fff7e0' },
  },

  // Confetti decals on the walls: [surface, u, v, kind, colour, size, angle].
  // u/v are 0..1 across the surface (u: left to right as the camera sees it,
  // v: floor to ceiling). Side walls span from sideFrontZ back to the corner.
  decals: [
    ['back', 0.07, 0.72, 'dot', 'sun', 0.22, 0],
    ['back', 0.13, 0.52, 'plus', 'teal', 0.26, 0.2],
    ['back', 0.2, 0.83, 'tri', 'coral', 0.3, -0.3],
    ['back', 0.8, 0.82, 'dot', 'violet', 0.18, 0],
    ['back', 0.88, 0.58, 'tri', 'lime', 0.28, 0.5],
    ['back', 0.94, 0.78, 'plus', 'pink', 0.24, -0.2],
    ['back', 0.36, 0.9, 'dot', 'teal', 0.12, 0],
    ['back', 0.64, 0.92, 'plus', 'sun', 0.2, 0.4],
    ['left', 0.25, 0.8, 'dot', 'coral', 0.3, 0],
    ['left', 0.62, 0.86, 'plus', 'violet', 0.34, 0.3],
    ['left', 0.45, 0.66, 'tri', 'sun', 0.3, 0.2],
    ['right', 0.35, 0.84, 'tri', 'teal', 0.34, -0.4],
    ['right', 0.7, 0.7, 'dot', 'pink', 0.26, 0],
    ['right', 0.55, 0.9, 'plus', 'lime', 0.3, 0.1],
  ] as [Surface, number, number, DecalKind, PaletteKey, number, number][],
  decalOpacity: 0.95,
  sideFrontZ: -1.2,
  decalLift: 0.006,
} as const

export type Surface = 'back' | 'left' | 'right'
export type DecalKind = 'dot' | 'plus' | 'tri'
