import type { ReactNode } from 'react'
import { emptyBoard, packBoard, packBoardShows, useLessonPack, type PackBoard as Board } from '../../lesson/packSession'
import { useDirector } from '../../state/director'
import { Label, usePop } from './primitives'
import type { ContentBox } from './WindowContent'
import { FONTS, WINDOW_STYLE } from './windowStyle'

// The board tab's page for a document lesson (packBoard: the section's rule,
// formula or worked example) or the "no notes yet" board, in the lecture
// board's hand: the heading, then each line popping in as boardReveal grows.

const B = WINDOW_STYLE.board
const C = WINDOW_STYLE.content

// The board the lesson has now: the section on the notes tab's index, the
// empty board, or null for the hand-written lecture board.
export function currentBoard(): Board | null {
  const { pack, empty } = useLessonPack.getState()
  if (empty !== null) return emptyBoard()
  if (!pack?.sections.length) return null
  return packBoard(pack, Math.min(useDirector.getState().notesTab, pack.sections.length - 1))
}

function Part({ part, reveal, position, children }: { part: number; reveal: number; position: [number, number, number]; children: ReactNode }) {
  const ref = usePop(packBoardShows(part, reveal), B.pop.stiffness, B.pop.damping)
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

export function PackBoardPage({ board, box, reveal }: { board: Board; box: ContentBox; reveal: number }) {
  const pad = C.pad
  const iw = box.w - pad * 2
  const rows = B.rows
  // The lines share the space between the heading and the board's foot.
  const step = (rows.footnote - rows.gantt) / Math.max(1, board.lines.length)
  return (
    <group position={[pad, 0, 0]}>
      <Part part={0} reveal={reveal} position={[0, -rows.kicker, 0]}>
        <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.monoBold} letterSpacing={0.08}>
          BOARD
        </Label>
        <Label size={B.kicker.size} color={B.kicker.color} font={FONTS.mono} letterSpacing={0.06} anchorX="right" maxWidth={iw * 0.6} position={[iw, 0, 0]}>
          {board.sectionLabel.toUpperCase()}
        </Label>
        <Label size={B.heading.size} color={B.heading.color} font={FONTS.hand} anchorY="top" maxWidth={iw} position={[0, rows.kicker - rows.heading, 0]}>
          {board.heading}
        </Label>
      </Part>
      {board.lines.map((line, i) => (
        <Part key={i} part={i + 1} reveal={reveal} position={[0, -rows.gantt - i * step, 0]}>
          <Label size={B.working.size} color={B.working.color} font={FONTS.hand} anchorY="top" maxWidth={iw} lineHeight={1.25}>
            {line.replace(/\*\*/g, '')}
          </Label>
        </Part>
      ))}
      {board.page > 0 && (
        <Label size={B.footnote.size} color={B.footnote.color} font={FONTS.semi} anchorY="top" position={[0, -rows.footnote, 0]}>
          {`From page ${board.page}`}
        </Label>
      )}
    </group>
  )
}
