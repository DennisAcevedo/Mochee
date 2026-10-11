import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff?url'
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url'
import figtree800 from '@fontsource/figtree/files/figtree-latin-800-normal.woff?url'
import mono500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url'
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url'
import { PALETTE } from '../layout3d'
import { WINDOW_UI } from './windowConfig'

// Look of the 3D mini browser window, in world units (the window is
// WINDOW.width x WINDOW.height from layout3d.ts). One object to restyle
// the chrome, the notes page and the board. troika reads .woff, not .woff2.

export const FONTS = {
  bold: figtree800,
  semi: figtree600,
  hand: caveat700,
  mono: mono500,
  monoBold: mono700,
} as const

export type Accent = keyof typeof PALETTE

// Light tints of the accents, for chips and table rows.
export const TINT: Record<'teal' | 'coral' | 'sun' | 'violet' | 'lime' | 'pink' | 'indigo', string> = {
  teal: '#d4f1f3',
  coral: '#ffe0dc',
  sun: '#fff1c7',
  violet: '#e6dffd',
  lime: '#d9f4df',
  pink: '#ffe0ee',
  indigo: '#dde3fa',
}

// Text colour that reads on a solid accent fill.
export const ON_ACCENT: Record<keyof typeof TINT, string> = {
  teal: '#ffffff',
  coral: '#ffffff',
  sun: PALETTE.ink,
  violet: '#ffffff',
  lime: '#ffffff',
  pink: '#ffffff',
  indigo: '#ffffff',
}

export const WINDOW_STYLE = {
  urlHost: 'tutor.app/', // omnibox prefix in front of each tab's path
  depth: WINDOW_UI.window.depth, // frame thickness (windowConfig.ts)
  bevel: 0.014, // rounded edge on the frame's front and back
  // Real key-light shadows from the frames. Off: their long floor shadows read
  // as grey slabs; the room's soft blobs ground the windows instead.
  castShadow: false,
  radius: WINDOW_UI.window.radius, // frame corner radius (windowConfig.ts: the placement tests read it there)
  frameColor: '#ffffff',
  z: 0.031, // front face of the frame; chrome layers stack from here
  layer: 0.004, // spacing between stacked flat layers

  focus: {
    damp: 7, // exponential damping rate for yaw, scale and glow
    lift: WINDOW_UI.focus.lift, // moves toward the camera when focused
    ring: { color: PALETTE.teal, ...WINDOW_UI.focus.ring }, // gap and stroke: windowConfig.ts
    glow: { color: PALETTE.teal, pad: 0.55, opacity: 0.55 },
  },

  // Chrome-style tab strip (colours from design/sparkle-stage/Main.dc.html).
  tabStrip: {
    height: 0.27,
    color: '#eceaf2',
    // Traffic lights: close, minimize, maximize. Drawn in 3D;
    // DOM buttons laid over them (WindowControls.tsx) take the clicks and show
    // the hover glyphs. size is the dot radius, dy their lift above the strip's
    // middle, hitH the buttons' height.
    lights: { size: 0.036, gap: 0.094, x: 0.125, dy: 0.01, hitH: 0.22, colors: [PALETTE.coral, PALETTE.sun, PALETTE.lime] },
    tabsX: 0.38, // tab row starts here (from the left edge)
    tabH: 0.21,
    tabRadius: 0.06,
    activeColor: '#ffffff',
    hoverColor: '#f6f5fa',
    accentBar: 0.022, // coloured top edge of the active tab
    // compactSize: the title on narrow tabs (5-6 open), where an inactive tab
    // has no x and its title runs on to padR from the right end.
    title: { size: 0.068, compactSize: 0.058, color: PALETTE.ink, dim: '#4a4754', padL: 0.13, padR: 0.05 },
    dot: 0.022, // favicon dot radius
    close: { size: 0.042, stroke: 0.011, color: '#6e6b78', hit: 0.11, hoverBg: '#e4e2ec', inset: 0.07 },
    plus: { bg: '#ffffff', color: '#3d5ad6', glyph: 0.062, stroke: 0.013, shadow: 0.1 },
    hover: { lift: 0.012, damp: 14 },
    shadowColor: '#2a2350',
  },

  toolbar: {
    height: 0.23,
    color: '#ffffff',
    divider: '#eceaf2',
    glyph: { color: '#6e6b78', dim: '#cfcdd8', size: 0.07, stroke: 0.014, gap: 0.12, x: 0.13 },
    omnibox: { x: 0.5, h: 0.15, color: '#f3f2f7', text: '#4a4754', size: 0.058, lock: '#34a853', right: 0.3 },
    maximize: { size: 0.15, radius: 0.04, bg: '#f3f2f7', hover: '#e6e9fb', color: '#3d5ad6', glyph: 0.075, stroke: 0.012, inset: 0.13 },
  },

  // Bottom-right resize grip.
  // inset: the grip's centre sits this far inside the frame corner (smaller than
  // half its size, so it straddles the corner); border: a thin edge round it.
  grip: { size: 0.15, radius: 0.04, inset: 0.012, border: 0.008, edge: '#d4d1df', bg: '#eceaf3', color: '#5f5c6b', stroke: 0.013 },

  maximizedRing: '#4285f4', // ring around the maximized window
  chipAccent: PALETTE.teal, // the restore chip's stripe while the window is minimized

  // Favicon dot per tab kind (notes tabs by index).
  kinds: {
    notes: ['#12a4b4', '#7c5cf2', '#ffc83d'],
    board: '#4285f4',
    quiz: '#ea4335',
    scratch: '#34a853',
    pdf: '#3d5ad6',
    newtab: '#b4b2bf',
  },

  // The New tab page (design/sparkle-stage/NewTab.dc.html).
  // Top edges are measured down from the content's top-left corner.
  newTab: {
    pad: 0.15,
    heading: { size: 0.095, color: PALETTE.ink, y: 0.13 },
    kicker: { size: 0.04, color: '#6e6b78', letterSpacing: 0.08 },
    scratch: { y: 0.23, h: 0.27, bg: '#e3f5e8', border: '#1f8a43', icon: '#1f8a43', title: 0.066, sub: 0.046, subColor: '#4a4754' },
    lessonY: 0.6,
    grid: { cols: 2, h: 0.13, gap: 0.035, size: 0.054, dot: 0.02, top: 0.06 },
    pdfsY: 1.2,
    pdfRow: { h: 0.2, gap: 0.035, badge: '#3d5ad6', title: 0.052, sub: 0.042, top: 0.06, step: 0.11, open: 0.3 },
    button: { bg: '#ffffff', border: '#eceaf2', hoverBorder: '#4285f4', radius: 0.05, stroke: 0.012 },
    empty: { size: 0.046, color: '#6e6b78' },
    maxTitle: 64, // characters of a PDF title before it ellipsizes
  },

  scratch: { pad: 0.1, kicker: 0.04, paper: '#fffdf6', border: '#e7e3d6', rule: '#ece6d3', ruleGap: 0.16, pxPerUnit: 240, font: 30, color: PALETTE.ink },

  pdf: { size: 0.058, color: '#2b2a33', kicker: 0.04, lineHeight: 1.42, maxChars: 1600, pager: { size: 0.12, y: 0.12, text: 0.05 } },

  content: {
    pad: 0.15,
    notesBg: '#eeedea',
    newTabBg: '#ffffff',
    paper: '#ffffff',
    paperInset: 0.1, // grey margin around the paper
    paperShadow: 'rgba(0,0,0,0.08)',
    boardBg: '#fdfdfb',
  },

  notes: {
    gap: 0.05, // vertical gap between lines
    kicker: { size: 0.046, color: '#8a857d', letterSpacing: 0.08 },
    title: { size: 0.15, color: PALETTE.ink, underline: { w: 0.42, h: 0.026, color: PALETTE.teal } },
    heading: { size: 0.1, color: PALETTE.ink },
    text: { size: 0.074, color: '#3a3840', lineHeight: 1.32 },
    key: { size: 0.074, color: PALETTE.ink, bar: 0.026, padX: 0.07, padY: 0.04, radius: 0.035 },
    row: { h: 0.17, size: 0.07, headerSize: 0.05, headerBg: '#f1eee8', divider: '#ece8e1', pill: { h: 0.12, radius: 0.06 } },
    marker: { color: PALETTE.sun, padX: 0.04, padY: 0.025, radius: 0.03, damp: 10 },
    footer: { size: 0.052, color: '#8a857d', bar: { h: 0.012, color: PALETTE.teal, track: '#ece8e1' } },
  },

  board: {
    // Top edge of each part, measured down from the content's top-left corner.
    rows: { kicker: 0.14, heading: 0.24, gantt: 0.55, ticks: 0.79, working: 0.98, result: 1.25, footnote: 1.55 },
    kicker: { size: 0.046, color: '#8a857d' },
    heading: { size: 0.21, color: PALETTE.ink },
    gantt: { h: 0.22, radius: 0.05, gap: 0.014, label: 0.072, colors: ['teal', 'sun', 'violet'] as ('teal' | 'sun' | 'violet')[] },
    ticks: { h: 0.05, w: 0.012, size: 0.048, color: '#6c6861' },
    working: { size: 0.15, color: PALETTE.ink },
    result: { size: 0.21, color: PALETTE.ink, indent: 0.55, ring: { color: PALETTE.coral, stroke: 0.024, padX: 0.1, padY: 0.06, segments: 72, sweep: 1.1, spiral: 0.07, tilt: -0.08, damp: 4 } },
    footnote: { size: 0.064, color: '#5f5b55', dash: { w: 0.04, gap: 0.03, h: 0.008, color: '#d9d3c8' } },
    pop: { stiffness: 320, damping: 18 }, // spring for the step-by-step reveal
    replayStepMs: 220, // the reload button re-reveals the board one part per step
    quiz: {
      promptTop: 0.25,
      gridTop: 0.7, // top of the 2 x 2 answer grid
      // The prompt's bold part sits on a solid chip, measured from troika's caret positions.
      prompt: { size: 0.09, color: PALETTE.ink, boldColor: '#ffffff', chip: PALETTE.violet, chipPadX: 0.015, chipPadY: 0.012, chipRadius: 0.03 },
      option: { h: 0.3, gap: 0.08, radius: 0.06, depth: 0.05, size: 0.095, badge: 0.05, color: '#ffffff', edgeDrop: 0.022 },
      badgeColors: [PALETTE.teal, PALETTE.sun, PALETTE.violet, PALETTE.pink] as string[],
      right: PALETTE.lime,
      wrong: PALETTE.coral,
      hover: { lift: 0.05, scale: 1.04, damp: 14 },
      press: 0.02,
      feedback: { size: 0.068, idle: '#6c6861', h: 0.18, gap: 0.2 },
    },
  },
} as const
