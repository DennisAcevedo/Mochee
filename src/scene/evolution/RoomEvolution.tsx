import { Suspense, useEffect, useMemo, useRef } from 'react'
import { DoubleSide, LatheGeometry, Vector2 } from 'three'
import { GROWTH } from '../../growth/config'
import { allDocuments, useRoomDocs } from '../../growth/topics'
import { useGrowth, type TopicMastery } from '../../state/growth'
import { useMode } from '../../state/mode'
import { PALETTE } from '../layout3d'
import { Flat, Label } from '../windows/primitives'
import { EVOLUTION } from './config'
import { PopIn, SparkleBurst } from './pop'

// The stage grows from the student's own material: a floating library shelf
// with one book per document (plus the built-in lecture) and a gold trophy per
// mastered topic on a second shelf. Items that appear after the stage settles pop in with
// a sparkle burst. Mount it inside the Canvas next to <LessonRoom/>.

const L = EVOLUTION.library
const T = EVOLUTION.trophies
const HALF_PI = Math.PI / 2

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// Keys present once the room first settles (documents fetched or failed) are
// "old"; anything that shows up later is fresh and gets the sparkle burst.
function useFreshKeys(keys: string[], settled: boolean): (key: string) => boolean {
  const initial = useRef<Set<string> | null>(null)
  if (settled && initial.current === null) initial.current = new Set(keys)
  return (key) => initial.current !== null && !initial.current.has(key)
}

function Plank({ width, plank, plaque }: { width: number; plank: typeof L.plank | typeof T.plank; plaque: { text: string; size: number; dy: number } }) {
  return (
    <group>
      {/* Unlit like the stage's surfaces, so its underside never reads as a grey slab. */}
      <mesh position={[0, -plank.height / 2, 0]}>
        <boxGeometry args={[width, plank.height, plank.depth]} />
        <meshBasicMaterial color={plank.color} toneMapped={false} />
      </mesh>
      <Flat w={width} h={plank.height * 0.55} color={PALETTE[plank.edge]} position={[0, -plank.height / 2, plank.depth / 2 + 0.002]} />
      <Label size={plaque.size} color={PALETTE.ink} anchorX="center" letterSpacing={0.12} position={[0, plaque.dy, plank.depth / 2]}>
        {plaque.text}
      </Label>
    </group>
  )
}

interface Book {
  key: string
  title: string
}

function Library({ books, fresh }: { books: Book[]; fresh: (key: string) => boolean }) {
  const { book, colors } = L
  const shown = books.slice(0, L.max)
  const span = shown.length * book.width + (shown.length - 1) * book.gap
  const x0 = -L.width / 2 + 0.16 // books lean against the left end, like a real shelf
  return (
    <group position={L.position} rotation={[0, L.yaw, 0]} scale={L.scale}>
      <Plank width={L.width} plank={L.plank} plaque={L.plaque} />
      {shown.map((b, i) => {
        const h = book.heights[i % book.heights.length]
        const color = PALETTE[colors[i % colors.length]]
        const x = x0 + i * (book.width + book.gap) + book.width / 2
        return (
          <group key={b.key} name={`evo-book-${b.key.slice('book:'.length)}`} position={[x, 0, 0]}>
            <PopIn delay={fresh(b.key) ? 0 : i * EVOLUTION.pop.stagger}>
              <group position={[0, h / 2, 0]}>
                <mesh castShadow>
                  <boxGeometry args={[book.width, h, book.depth]} />
                  <meshStandardMaterial color={color} roughness={0.5} />
                </mesh>
                <Flat w={book.width * 0.86} h={0.035} color="#ffffff" position={[0, h / 2 - 0.06, book.depth / 2 + 0.002]} />
                <group position={[0, -0.02, book.depth / 2 + 0.004]} rotation={[0, 0, HALF_PI]}>
                  <Label size={book.spineText} color="#ffffff" anchorX="center" maxWidth={h - 0.12}>
                    {clip(b.title, 20)}
                  </Label>
                </group>
              </group>
            </PopIn>
            {fresh(b.key) && (
              <group position={[0, h, 0.2]}>
                <SparkleBurst />
              </group>
            )}
          </group>
        )
      })}
      {/* Bookend after the last book. */}
      <mesh position={[x0 + span + 0.06, 0.12, 0]} castShadow>
        <boxGeometry args={[0.04, 0.24, 0.26]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={0.4} />
      </mesh>
    </group>
  )
}

// Profile of the cup, revolved around Y.
function useCupGeometry() {
  const geo = useMemo(() => {
    const pts = [
      [0, 0],
      [0.42, 0],
      [0.42, 0.08],
      [0.14, 0.14],
      [0.1, 0.42],
      [0.16, 0.5],
      [0.5, 0.72],
      [0.58, 1.18],
      [0.52, 1.18],
      [0.44, 0.78],
      [0, 0.64],
    ].map(([x, y]) => new Vector2(x, y))
    return new LatheGeometry(pts, 40)
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

function Trophy({ topic }: { topic: TopicMastery }) {
  const cup = useCupGeometry()
  const { pedestal: pd, cup: c } = T
  const tag = topic.title.split(/[,(]/)[0]
  return (
    <group>
      <mesh position={[0, pd.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[pd.width, pd.height, pd.width]} />
        <meshStandardMaterial color={pd.color} roughness={0.5} />
      </mesh>
      <Flat w={pd.width} h={pd.height * 0.32} color={PALETTE[pd.band]} position={[0, pd.height * 0.62, pd.width / 2 + 0.002]} />
      <Label size={0.032} color={PALETTE.ink} anchorX="center" maxWidth={pd.width - 0.02} position={[0, pd.height * 0.26, pd.width / 2 + 0.003]}>
        {clip(tag, 18)}
      </Label>
      <group position={[0, pd.height, 0]} scale={c.scale}>
        <mesh geometry={cup} castShadow>
          <meshStandardMaterial color={c.color} metalness={c.metalness} roughness={c.roughness} side={DoubleSide} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.56, 0.9, 0]} rotation={[0, 0, s * 0.2]}>
            <torusGeometry args={[0.16, 0.035, 10, 24, Math.PI * 1.2]} />
            <meshStandardMaterial color={c.color} metalness={c.metalness} roughness={c.roughness} />
          </mesh>
        ))}
        <mesh position={[0, 0.98, 0.5]}>
          <circleGeometry args={[0.13, 5]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Trophies({ mastered, fresh }: { mastered: TopicMastery[]; fresh: (key: string) => boolean }) {
  const shown = mastered.slice(-T.max)
  const x0 = -((shown.length - 1) * T.spacing) / 2
  return (
    <group position={T.position} rotation={[0, T.yaw, 0]} scale={T.scale}>
      <Plank width={T.width} plank={T.plank} plaque={T.plaque} />
      {shown.map((topic, i) => {
        const key = `trophy:${topic.id}`
        return (
          <group key={key} name={`evo-trophy-${topic.id}`} position={[x0 + i * T.spacing, 0, 0]}>
            <PopIn delay={fresh(key) ? 0 : i * EVOLUTION.pop.stagger}>
              <Trophy topic={topic} />
            </PopIn>
            {fresh(key) && (
              <group position={[0, 0.5, 0.2]}>
                <SparkleBurst />
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}

function Evolution() {
  const documents = useRoomDocs((s) => s.documents)
  const local = useRoomDocs((s) => s.local)
  const status = useRoomDocs((s) => s.status)
  const topicsById = useGrowth((s) => s.topics)

  // Read the documents list now, on focus, and every few seconds.
  useEffect(() => {
    const refresh = () => void useRoomDocs.getState().refresh()
    refresh()
    const timer = window.setInterval(refresh, GROWTH.documentsPollMs)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const books = useMemo<Book[]>(
    () => allDocuments({ documents, local }).map((d) => ({ key: `book:${d.id}`, title: d.title })),
    [documents, local],
  )
  const mastered = useMemo(
    () => Object.values(topicsById).filter((t) => t.mastered).sort((a, b) => (a.masteredAt ?? 0) - (b.masteredAt ?? 0)),
    [topicsById],
  )

  const keys = [...books.map((b) => b.key), ...mastered.map((t) => `trophy:${t.id}`)]
  const fresh = useFreshKeys(keys, status === 'ok' || status === 'unavailable')
  const study = useMode((m) => m.mode === 'study') // the study room stays calm: no library shelf or posters there

  return (
    <group name="room-evolution">
      <group visible={!study}>
        <Library books={books} fresh={fresh} />
      </group>
      <Trophies mastered={mastered} fresh={fresh} />
    </group>
  )
}

export function RoomEvolution() {
  return (
    <Suspense fallback={null}>
      <Evolution />
    </Suspense>
  )
}
