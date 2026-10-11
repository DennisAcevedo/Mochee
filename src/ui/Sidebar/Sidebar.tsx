import { useRef, type ChangeEvent } from 'react'
import { formatLabel, UPLOAD_ACCEPT, uploadFormat } from '../../../shared/docsTypes'
import { introRef } from '../../intro/targets'
import { useCurrentTutor } from '../../state/currentTutor'
import { addTutorFiles } from '../../state/fileStore'
import { formatBytes, useLibrary } from '../../state/library'
import { selectIsQuiz, selectSection, useTutorStore } from '../../state/store'
import { Transcript } from '../Transcript/Transcript'
import styles from './Sidebar.module.css'

// Any format the documents backend reads (shared/docsTypes UPLOAD_FORMATS).
const isAccepted = (f: File) => uploadFormat(f.name, f.type) !== null

export function Sidebar() {
  const panelOpen = useTutorStore((s) => s.panelOpen)
  const isQuiz = useTutorStore(selectIsQuiz)
  const section = useTutorStore(selectSection)
  const setMode = useTutorStore((s) => s.setMode)
  const togglePanel = useTutorStore((s) => s.togglePanel)
  const showToast = useTutorStore((s) => s.showToast)
  const addFiles = useLibrary((s) => s.addFiles)
  const tutor = useCurrentTutor()
  const picker = useRef<HTMLInputElement>(null)

  // Upload adds files to this tutor (metadata in the library, the File itself in IndexedDB).
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(isAccepted)
    e.target.value = ''
    if (!files.length) return
    addFiles(
      tutor.id,
      files.map((f, i) => ({ id: `${tutor.id}-${Date.now()}-${i}`, name: f.name, size: f.size })),
    )
    void addTutorFiles(tutor.id, files)
    showToast(`Added ${files.length} file${files.length === 1 ? '' : 's'}`)
  }

  return (
    <div ref={introRef('sidebar')} className={styles.panel} data-open={panelOpen}>
      <div className={styles.tabsRow}>
        <div className={styles.tabs}>
          <button type="button" className={styles.tab} data-on={!isQuiz} onClick={() => setMode('lecture')}>
            Lecture
          </button>
          <button type="button" className={styles.tab} data-on={isQuiz} onClick={() => setMode('quiz')}>
            Quiz
          </button>
        </div>
        <button type="button" className={styles.collapse} title="Hide panel" onClick={togglePanel}>
          ›
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.label}>Your notes</div>
          <button type="button" className={styles.upload} onClick={() => picker.current?.click()}>
            <span className={styles.plus}>+</span>Upload
          </button>
          <input ref={picker} type="file" accept={UPLOAD_ACCEPT} multiple hidden onChange={onPick} />
        </div>
        <div className={styles.list}>
          {tutor.files.map((n, i) => (
            <div key={n.id} className={styles.noteRow} data-active={i === 0}>
              <div className={styles.pdfIcon}>{formatLabel(n.name)}</div>
              <div className={styles.noteText}>
                <div className={styles.noteName}>{n.name}</div>
                <div className={styles.noteMeta}>
                  {n.pages ? `${n.pages} pages` : formatBytes(n.size)}
                  {i === 0 ? ' · in use' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Lesson outline</div>
        <div className={styles.outline}>
          {tutor.outline.map(({ title }, i) => {
            const state = i === section ? 'current' : i < section ? 'done' : 'todo'
            return (
              <div key={title} className={styles.outlineRow} data-state={state}>
                <div className={styles.badge} data-state={state}>
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <div className={styles.outlineTitle}>{title}</div>
                {state === 'current' && <div className={styles.now}>Now</div>}
              </div>
            )
          })}
        </div>
      </div>

      <Transcript />
    </div>
  )
}
