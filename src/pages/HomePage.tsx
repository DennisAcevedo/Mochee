import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { lastStudiedLabel, lookOf, useLibrary } from '../state/library'
import { CardCharacter, HomeCanvas } from './HomeScene'
import styles from './HomePage.module.css'

// "/": design/Tutor Home.dc.html.

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'
}

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

export function HomePage() {
  const tutors = useLibrary((s) => s.tutors)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)

  // "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isField(e.target)) return
      e.preventDefault()
      search.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const list = tutors.filter((t) => !q || t.name.toLowerCase().includes(q))
  const leave = (id: string) => setHover((h) => (h === id ? null : h))

  return (
    <div className={styles.page} data-screen-label="Home">
      <div className={styles.wrap}>
        <div className={styles.topBar}>
          <div className={styles.logo}>
            <div className={styles.logoDot} />
            Tutor
          </div>
          <div className={styles.searchRow}>
            <div className={styles.search}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="#8a857d" strokeWidth="2.2" />
                <path d="M15.5 15.5L20 20" stroke="#8a857d" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <input
                ref={search}
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
                placeholder="Search tutors and notes"
                aria-label="Search tutors"
              />
              <div className={styles.kbd}>/</div>
            </div>
          </div>
          <div className={styles.avatar}>AK</div>
        </div>

        <div className={styles.hello}>
          {greeting()} <span className={styles.helloSoft}>What are we studying?</span>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>Your tutors</div>
            <div className={styles.count}>
              {tutors.length} tutor{tutors.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className={styles.grid}>
            <Link
              to="/new"
              className={styles.card}
              data-dashed="true"
              data-hover={hover === 'new'}
              onMouseEnter={() => setHover('new')}
              onMouseLeave={() => leave('new')}
            >
              <div className={styles.art} data-variant="new">
                <CardCharacter
                  className={styles.view}
                  pose="wave"
                  active={hover === 'new'}
                  size={1.2}
                  roam={0.05}
                  rleft={0.2}
                  rright={0.8}
                  offsetY={0.38}
                />
              </div>
              <div className={styles.body} data-gap="tight">
                <div className={styles.newTitle}>
                  <div className={styles.plus}>+</div>
                  New tutor
                </div>
                <div className={styles.newDesc}>Upload your notes and get a tutor that teaches them.</div>
              </div>
            </Link>

            {list.map((t) => {
              const on = hover === t.id
              const total = t.outline.length
              const done = Math.min(t.sectionsDone, total)
              const complete = done >= total
              return (
                <Link
                  key={t.id}
                  to={`/tutor/${t.id}`}
                  className={styles.card}
                  data-hover={on}
                  onMouseEnter={() => setHover(t.id)}
                  onMouseLeave={() => leave(t.id)}
                >
                  <div className={styles.art}>
                    <div className={styles.floor} />
                    <CardCharacter
                      className={styles.view}
                      pose={on ? 'wave' : 'sleep'}
                      look={lookOf(t)}
                      active={on}
                      size={1}
                      roam={0.12}
                      rleft={0.15}
                      rright={0.85}
                    />
                    {!on && (
                      <div className={styles.zs} aria-hidden="true">
                        <span className={styles.z} data-z="1">
                          z
                        </span>
                        <span className={styles.z} data-z="2">
                          z
                        </span>
                      </div>
                    )}
                    {complete && <div className={styles.badge}>✓ Complete</div>}
                  </div>
                  <div className={styles.body}>
                    <div className={styles.titleBlock}>
                      <div className={styles.name}>{t.name}</div>
                      <div className={styles.files}>
                        {t.files.length} file{t.files.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className={styles.progressBlock}>
                      <div className={styles.track}>
                        <div className={styles.bar} style={{ width: `${Math.round((done / total) * 100)}%` }} />
                      </div>
                      <div className={styles.meta}>
                        <span className={styles.progress}>{complete ? `All ${total} sections` : `${done} of ${total} sections`}</span>
                        <span className={styles.last}>{lastStudiedLabel(t.lastStudied)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {list.length === 0 && <div className={styles.empty}>No tutors match “{query}”.</div>}
        </div>
      </div>
      <HomeCanvas className={styles.canvas} />
    </div>
  )
}
