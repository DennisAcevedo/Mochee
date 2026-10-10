import { GEMINI } from '../layout3d'

// Everything that styles the sparkle stage (design/sparkle-stage/Main.dc.html):
// the white platform with the rainbow rim. The pastel backdrop behind it is
// CSS (Stage.module.css; the canvas is transparent). Restyle the stage from
// here; the platform's size and place come from PLATFORM in layout3d.ts.

export type GradientStop = readonly [at: number, color: string]

export const STAGE_STYLE = {
  platform: {
    top: '#ffffff',
    rim: {
      width: 0.065, // share of the radius, on the top face
      band: 0.05, // world height of the rainbow band down the side
      // Left to right across the platform, as the mock's rim gradient.
      stops: [
        [0, GEMINI.blue],
        [0.34, GEMINI.red],
        [0.66, GEMINI.yellow],
        [1, GEMINI.green],
      ] as GradientStop[],
    },
    groove: { at: 0.7, width: 0.018, color: '#eeecf6' }, // faint inner ring (shares of the radius)
    side: { top: '#e6e4ef', bottom: '#d2cfe3', taper: 0.95 }, // body below the rim
    segments: 128,
    shadowOpacity: 0.16, // the key light's shadow of the tutor on the top
    lift: 0.002, // gap between stacked top layers, against z-fighting
    // Soft blob on the "floor" under the floating platform.
    under: { color: '#46508c', opacity: 0.2, scale: 1.18, drop: 0.55 },
    // Soft contact blob that follows the tutor's feet across the top, fading
    // out as he nears the edge (`fade` is the share of the radius it starts at).
    contact: { color: '#46508c', opacity: 0.2, width: 1.05, depth: 0.62, fade: [0.8, 1.02] as [number, number] },
  },
} as const
