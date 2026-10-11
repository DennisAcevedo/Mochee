// Board-window content for the lesson room. The notes-window lines live in
// shared/lessonNotes.ts because the ask server uses them too.

// Board window, lecture tab. boardReveal = n shows the first n parts in this order.
export const BOARD_PARTS = ['heading', 'p1', 'p2p3', 'ticks', 'working', 'result', 'footnote'] as const
export type BoardPart = (typeof BOARD_PARTS)[number]

export function boardShows(part: BoardPart, reveal: number): boolean {
  return BOARD_PARTS.indexOf(part) < reveal
}
