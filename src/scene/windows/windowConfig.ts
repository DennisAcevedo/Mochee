// Interaction tuning for the room's Chrome-style window: tab sizing and
// animation, drag thresholds, window move / resize limits, maximize, minimize,
// close and storage keys. Plain numbers only (no three, no React), so the pure tab
// model and its Node tests can read it. Sizes are world units; rates are
// exponential damping rates (1/s); a rate of 20 settles ~95% in 150 ms.

export const WINDOW_UI = {
  // Tabs, offset and size. v2 = one window; a v1 (two-window) save is ignored.
  storageKey: 'gg.windows.v2',
  scratchKey: 'gg.scratch.v1.', // + window id: the scratch note text
  saveDebounceMs: 250,
  deadZonePx: 4, // a press that moves less than this is a click, not a drag
  doubleClickMs: 400, // two strip presses this close toggle maximize
  doubleClickPx: 6,

  tabs: {
    maxW: 0.98, // a lone tab never grows past this
    minW: 0.22, // at this width a tab shows only its favicon dot (the x when active)
    narrowW: 0.5, // below this only the active tab shows its x
    tinyW: 0.34, // below this the title hides
    gap: 0.02,
    widthRate: 20, // open / close grow and shrink (~150 ms)
    slideRate: 18, // neighbours sliding aside on reorder
    titleFade: 0.55, // the title fades in over the last part of the open
    lift: { z: 0.06, y: 0.012, scale: 1.04, shadow: 0.16 }, // the dragged tab
    liftRate: 20,
    maxPerWindow: 14,
    plus: { size: 0.14, gap: 0.05 }, // + button after the last tab
    rightPad: 0.22, // empty strip always left right of the tabs (like Chrome's) to grab and double-click the window
  },

  window: {
    minSize: [1.9, 1.7] as [number, number],
    maxSize: [4.4, 3.3] as [number, number],
    sizeStep: 0.01, // live resize updates in these steps
    offsetLimit: [7, 4] as [number, number], // sanity bound for stored offsets
    // Where a moved window may go: this box of the 16:9 stage (NDC x0, y0, x1, y1),
    // below the play HUD band along the top and above the caption, so its strip
    // and grip never end up under the DOM overlays.
    clampBox: [-0.98, -0.76, 0.98, 0.66] as [number, number, number, number],
    moveRate: 26, // settle after a drag or a restore
    yawFollowsX: true, // a window turns toward the stage centre wherever it is
  },

  maximize: {
    // Like Chrome, a maximized window takes its own size: as tall as a default
    // window (pages at 1:1) and as wide as this box of the 16:9 stage allows
    // (NDC x0, y0, x1, y1), which keeps clear of the play HUD along the top and
    // the caption along the bottom. It sits at world z, in front of the tutor.
    // The 0.4 NDC left either side is where the tutor steps aside and waits:
    // hand to hand he spans ~0.38 NDC, so a wider box would hide half of him.
    box: [-0.6, -0.72, 0.6, 0.6] as [number, number, number, number],
    z: 2.3, // the tutor's spots reach z 1 and his body ~0.6 past that
    height: 2.5, // = WINDOW.height in layout3d.ts (tests/ui/windowPlace.test.ts pins it)
    rate: 9,
  },

  // Minimize (yellow light): the window shrinks into a restore chip above the
  // bottom bar's left end; a click on the chip, or the lesson needing the
  // window, brings it back with its tabs and the reverse animation.
  minimize: {
    ms: 240, // window -> chip
    restoreMs: 260, // chip -> window
    z: 2.3, // world depth the window flies at, in front of the tutor (like maximize.z)
    chipFrom: 0.55, // share of the shrink after which the chip pops in (a restore runs it backwards)
    // Chip placement, CSS px: on the bottom bar's left end, `gap` above it;
    // narrowed to clear the caption, or lifted above the caption when
    // narrower than minW would leave no room for the title.
    chip: { pad: 12, gap: 10, maxW: 240, minW: 132, remeasureMs: 250 },
    lightsPxPerUnit: 200, // authored px per world unit of the DOM traffic lights (mapped onto the 3D strip)
  },

  // Close (red light): the window shrinks away into its own centre and is gone,
  // no chip. It opens again (growing back out) when the lesson needs one of its
  // tabs or the Reader opens a page in it; a reload also brings it back.
  close: {
    ms: 200, // window -> gone
    openMs: 240, // gone -> window
    scale: 0.02, // how small it gets before it hides
  },
} as const
