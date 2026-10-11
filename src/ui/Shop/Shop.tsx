import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/jetbrains-mono/500.css'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CAMERA, RENDER } from '../../animation/config'
import { BlenderTutorSafe } from '../../character/blender/BlenderTutorSafe'
import { CardShadow } from '../../pages/HomeScene'
import { usePlay } from '../../play/playStore'
import { Lights } from '../../scene/Lights'
import { useHoops } from '../../scene/hoops/hoopsStore'
import type { Gesture } from '../../state/director'
import { capColor } from '../../play/actions'
import { shopItem, useProgress } from '../../state/progress'
import { CoinIcon } from '../PlayHud/CoinIcon'
import { SHOP_ITEMS, type ShopEntry } from './items'
import styles from './Shop.module.css'

// The shop: a big popup over the page in two tabs, Animations and Items
// (room decorations, empty until the models exist). Animations is the
// vertical picker: the rail scrolls round (wheel, arrows, click a row); the
// stage shows the tutor himself looping the selected animation. "Play it" runs the real
// action on the stage behind, then closes the shop. Locked items (dances,
// the cap, party lights) show their price instead: "Buy" spends the coins
// (the "Unlocked" banner and his equip clip follow) and the shop stays open.

const STEP = 66
const HALF = 6
const REPLAY_MS = 3200 // a one-shot preview replays this often
const mod = (x: number, m: number) => ((x % m) + m) % m
const N = SHOP_ITEMS.length

function Row({ k, item, index, onPick }: { k: number; item: ShopEntry; index: number; onPick: (k: number) => void }) {
  const locked = useProgress((s) => !!item.unlock && !s.owned.includes(item.unlock))
  return (
    <div
      className={styles.row}
      data-sel={k === 0 || undefined}
      style={{ opacity: k === 0 ? 1 : Math.max(0.25, 1 - Math.abs(k) * 0.22) }}
      onClick={() => k && onPick(k)}
    >
      <div className={styles.swatch} style={{ background: item.color }} />
      <div className={styles.name}>{item.name}</div>
      {locked && item.unlock ? (
        <div className={styles.price}>
          <CoinIcon className={styles.coin} />
          {shopItem(item.unlock).price}
        </div>
      ) : (
        <div className={styles.num}>{String(index + 1).padStart(2, '0')}</div>
      )}
    </div>
  )
}

function PreviewTutor({ item, capHex }: { item: ShopEntry; capHex?: string }) {
  const [tick, setTick] = useState(1)
  useEffect(() => {
    if (!('clip' in item.preview)) return
    setTick((t) => t + 1)
    const t = window.setInterval(() => setTick((n) => n + 1), REPLAY_MS)
    return () => window.clearInterval(t)
  }, [item])
  const control = useMemo(() => {
    const p = item.preview
    if ('loop' in p) return { loop: p.loop, gesture: null as Gesture | null }
    return { loop: 'idle' as const, gesture: { id: tick, clip: p.clip } as Gesture | null }
  }, [item, tick])
  return (
    <group scale={1.15}>
      <CardShadow />
      <Suspense fallback={null}>
        <BlenderTutorSafe standalone control={control} capColor={capHex} />
      </Suspense>
    </group>
  )
}

function Balance() {
  const coins = useProgress((s) => s.coins)
  return (
    <div className={styles.coins} role="status" aria-label={`${coins} coins`}>
      <CoinIcon className={styles.coin} />
      <b key={coins}>{coins}</b>
    </div>
  )
}

function Shots() {
  const makes = useHoops((s) => s.makes)
  const attempts = useHoops((s) => s.attempts)
  return (
    <div className={styles.shots} role="status" aria-label={`Shots: ${makes} made of ${attempts}`}>
      <span>SHOTS</span>
      <b>
        {makes} / {attempts}
      </b>
    </div>
  )
}

const Arrow = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

function AnimationsPanel({ onClose }: { onClose: () => void }) {
  const coins = useProgress((s) => s.coins)
  const owned = useProgress((s) => s.owned)
  const capIndex = usePlay((s) => s.capIndex)
  const [pos, setPos] = useState(0)
  const [nope, setNope] = useState(false)
  const rail = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const shift = useRef(0)
  const busy = useRef(0)

  const base = () => (rail.current?.clientHeight ?? 0) / 2 - 28 - HALF * STEP
  const move = (d: number) => {
    shift.current = d
    setPos((p) => p + d)
  }

  // Infinite loop: the rows shift one slot, the track jumps back to hide it, then glides to rest.
  useLayoutEffect(() => {
    const t = track.current
    if (!t) return
    if (!shift.current) {
      t.style.transform = `translateY(${base()}px)`
      return
    }
    t.classList.remove(styles.anim)
    t.style.transform = `translateY(${base() + shift.current * STEP}px)`
    shift.current = 0
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        t.classList.add(styles.anim)
        t.style.transform = `translateY(${base()}px)`
      }),
    )
  }, [pos])

  useEffect(() => {
    const onResize = () => {
      if (track.current) track.current.style.transform = `translateY(${base()}px)`
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') move(-1)
      else if (e.key === 'ArrowDown') move(1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    const r = rail.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now - busy.current < 260) return
      busy.current = now
      move((Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? 1 : -1)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey, true)
    r?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey, true)
      r?.removeEventListener('wheel', onWheel)
    }
  }, [])

  const cur = SHOP_ITEMS[mod(pos, N)]
  const locked = !!cur.unlock && !owned.includes(cur.unlock)
  const price = cur.unlock ? shopItem(cur.unlock).price : 0
  const short = locked ? Math.max(0, price - coins) : 0
  const capHex = cur.cap ? (capColor(true, capIndex + 1) ?? undefined) : undefined

  // Owned: run it and close. Locked: buy it if he can afford it, and stay to play it.
  const act = () => {
    if (locked ? cur.unlock && useProgress.getState().spend(cur.unlock) : cur.run()) {
      if (!locked) onClose()
      return
    }
    setNope(true)
    window.setTimeout(() => setNope(false), 380)
  }

  const rows = []
  for (let k = -HALF; k <= HALF; k++) {
    const j = mod(pos + k, N)
    rows.push(<Row key={k} k={k} item={SHOP_ITEMS[j]} index={j} onPick={move} />)
  }

  return (
    <div className={styles.picker} role="tabpanel" aria-label="Animations">
        <div className={styles.rail} ref={rail}>
          <div className={styles.slot} />
          <div className={styles.track} ref={track}>
            {rows}
          </div>
        </div>
        <div className={styles.stage}>
          <Canvas
            className={styles.canvas}
            shadows="soft"
            dpr={[1, RENDER.maxDpr]}
            gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: RENDER.exposure }}
            camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: CAMERA.position }}
            onCreated={({ camera }) => camera.lookAt(...CAMERA.lookAt)}
            style={{ pointerEvents: 'none' }}
          >
            <Lights />
            <PreviewTutor item={cur} capHex={capHex} />
          </Canvas>
          <div className={styles.nav}>
            <button type="button" className={styles.btn} aria-label="Previous" onClick={() => move(-1)}>
              <Arrow d="M5 15l7-7 7 7" />
            </button>
            <button type="button" className={styles.btn} aria-label="Next" onClick={() => move(1)}>
              <Arrow d="M5 9l7 7 7-7" />
            </button>
          </div>
          <div className={styles.caption}>
            <div className={styles.tag} style={{ background: cur.color }} data-testid="shop-current">
              {cur.name}
            </div>
            <div className={styles.loop}>looping</div>
            <button
              type="button"
              className={`${styles.tag} ${styles.play}`}
              data-buy={(locked && !short) || undefined}
              data-testid="shop-act"
              data-nope={nope || undefined}
              aria-disabled={short > 0}
              aria-label={locked ? (short ? `${cur.name}, ${price} coins, need ${short} more` : `Buy ${cur.name} for ${price} coins`) : `Play ${cur.name}`}
              onClick={act}
            >
              {locked ? (
                short ? (
                  `Need ${short} more`
                ) : (
                  <>
                    Buy for <CoinIcon className={styles.coin} /> {price}
                  </>
                )
              ) : (
                'Play it'
              )}
            </button>
          </div>
          <div className={styles.stats}>
            <Balance />
            {cur.id === 'hoops' && <Shots />}
          </div>
        </div>
    </div>
  )
}

type Tab = 'animations' | 'items'
const TABS: { id: Tab; label: string }[] = [
  { id: 'animations', label: 'Animations' },
  { id: 'items', label: 'Items' },
]

// Room decorations to buy. None exist yet, so the tab says so.
function ItemsPanel() {
  return (
    <div className={`${styles.picker} ${styles.items}`} role="tabpanel" aria-label="Items">
      <div className={styles.soon}>
        <div className={styles.soonIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9h16l-1.4 10.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3z" />
            <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
          </svg>
        </div>
        <div className={styles.soonTitle}>Items are on the way</div>
        <div className={styles.soonText}>Decorations for his room will show up here. Keep learning to save up coins!</div>
      </div>
      <div className={styles.stats}>
        <Balance />
      </div>
    </div>
  )
}

export function Shop({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('animations')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.shop} role="dialog" aria-modal="true" aria-label="Shop">
        <div className={styles.top}>
          <div className={styles.tabs} role="tablist" aria-label="Shop sections" style={{ '--i': TABS.findIndex((t) => t.id === tab) } as CSSProperties}>
            <span className={styles.thumb} aria-hidden="true" />
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className={`${styles.btn} ${styles.closeBtn}`} aria-label="Close the shop" onClick={onClose}>
            <Arrow d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
        {tab === 'animations' ? <AnimationsPanel onClose={onClose} /> : <ItemsPanel />}
      </div>
    </div>,
    document.body,
  )
}
