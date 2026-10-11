import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { DEFAULT_DOC_KIND, DOCS_LIMITS, formatLabel, UPLOAD_ACCEPT, type DocKind, type DocumentInfo } from '../../../shared/docsTypes'
import { ClassSwitcher, StudyHub } from '../../hub/StudyHub'
import { PALETTE } from '../../scene/layout3d'
import { useDrawers } from '../../state/drawers'
import { errorText } from './docsClient'
import { useDocs, useDocsAutoRefresh } from './docsStore'
import { UploadIcon } from './icons'
import s from './Learning.module.css'
import { DocumentPage } from './PageViewer'
import { Panel } from './Panel'

// LEFT drawer: what the student is learning from. The built-in lesson is
// always first; uploaded files follow with their topic chips. Selecting one
// makes it the subject of the hub's chat and quiz, and opens its pages in
// the reader below.

const LEARNING = {
  maxChips: 4, // topic chips per document before "+N"
  chipColors: [PALETTE.violet, PALETTE.teal, PALETTE.coral, PALETTE.indigo, PALETTE.lime, PALETTE.pink],
  // Class material is taught topic by topic; a paper is walked through by Gemini in one pass.
  kinds: [
    { id: 'class', label: 'Class', hint: 'PDF, Word, PowerPoint, text, HTML or images' },
    { id: 'paper', label: 'Research paper', hint: 'Gemini walks the whole paper, question to results' },
  ] satisfies readonly { id: DocKind; label: string; hint: string }[],
} as const


export function LearningDrawer() {
  useDocsAutoRefresh()
  const documentId = useDrawers((d) => d.documentId)
  const documents = useDocs((d) => d.documents)
  const selected = documents.find((d) => d.id === documentId) ?? null

  return (
    <Panel id="learning" title="Learning" accent="#A78BFA" icon={<LearningMark />} headerExtra={<ClassSwitcher />}>
      {/* The Study hub is the home view; Upload Materials opens the original material pane. */}
      <StudyHub
        upload={
          <>
            <UploadZone />
            <section className={s.section} aria-labelledby="learning-list">
              <h3 id="learning-list" className={s.kicker}>
                Your material
              </h3>
              <DocList />
            </section>
            <section className={s.section} aria-labelledby="learning-reader">
              <h3 id="learning-reader" className={s.kicker}>
                Reader
              </h3>
              {selected ? <DocumentPage key={selected.id} doc={selected} /> : <p className={s.empty}>Pick a document above to read it here.</p>}
            </section>
          </>
        }
      />
    </Panel>
  )
}

// The header's tilted logo tile: a notebook.
function LearningMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="16" rx="3" />
      <path d="M5 12h14" />
    </svg>
  )
}

function UploadZone() {
  const upload = useDocs((d) => d.upload)
  const uploadError = useDocs((d) => d.uploadError)
  const addFile = useDocs((d) => d.addFile)
  const clearUploadError = useDocs((d) => d.clearUploadError)
  const selectDocument = useDrawers((d) => d.selectDocument)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [kind, setKind] = useState<DocKind>(DEFAULT_DOC_KIND)

  const take = async (file: File | undefined) => {
    if (!file) return
    const doc = await addFile(file, kind)
    if (doc) selectDocument(doc.id)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files[0])
  }

  const pct = upload ? Math.round(upload.progress * 100) : 0

  return (
    <div
      className={s.drop}
      data-over={over}
      data-busy={!!upload}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {upload ? (
        <div className={s.uploading} aria-live="polite">
          <div className={s.uploadRow}>
            <span className={s.uploadName}>{upload.name}</span>
            <span className={s.uploadPct}>{upload.phase === 'sending' ? `${pct}%` : upload.kind === 'paper' ? 'Gemini is reading the paper…' : 'Reading pages…'}</span>
          </div>
          <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload">
            <span style={{ width: `${upload.phase === 'indexing' ? 100 : pct}%` }} data-indexing={upload.phase === 'indexing'} />
          </div>
        </div>
      ) : (
        <>
          <KindPicker kind={kind} onChange={setKind} />
          <button type="button" className={s.uploadBtn} onClick={() => input.current?.click()}>
            <UploadIcon />
            Add a file
          </button>
          <p className={s.dropHint}>
            or drop one here &middot; {LEARNING.kinds.find((k) => k.id === kind)?.hint} &middot; up to {Math.round(DOCS_LIMITS.maxUploadBytes / 1024 / 1024)} MB
          </p>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {uploadError && (
        <div className={s.notice} data-tone="error" role="alert">
          <p>{errorText(uploadError)}</p>
          <button type="button" className={s.linkBtn} onClick={clearUploadError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// Class / Research paper, as a two-option radio group in the pill style (arrows switch).
function KindPicker({ kind, onChange }: { kind: DocKind; onChange: (k: DocKind) => void }) {
  return (
    <div className={`${s.tabs} ${s.kindPick}`} role="radiogroup" aria-label="What are you adding?">
      {LEARNING.kinds.map((k, i) => (
        <button
          key={k.id}
          type="button"
          role="radio"
          aria-checked={kind === k.id}
          tabIndex={kind === k.id ? 0 : -1}
          className={s.tab}
          data-testid={`upload-kind-${k.id}`}
          onClick={() => onChange(k.id)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
            e.preventDefault()
            const next = LEARNING.kinds[(i + 1) % LEARNING.kinds.length]
            onChange(next.id)
            ;(e.currentTarget.parentElement?.querySelector(`[data-testid="upload-kind-${next.id}"]`) as HTMLElement | null)?.focus()
          }}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}

function DocList() {
  const status = useDocs((d) => d.status)
  const error = useDocs((d) => d.error)
  const documents = useDocs((d) => d.documents)
  const refresh = useDocs((d) => d.refresh)
  const removeDocument = useDocs((d) => d.removeDocument)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null)
  const documentId = useDrawers((d) => d.documentId)
  const selectDocument = useDrawers((d) => d.selectDocument)

  const remove = async (doc: DocumentInfo) => {
    if (deleting) return
    setDeleting(doc.id)
    setDeleteError(null)
    const error = await removeDocument(doc.id)
    if (error) setDeleteError(errorText(error))
    else setDeleteTarget(null)
    setDeleting(null)
  }

  return (
    <ul className={s.docs}>
      {documents.map((doc, i) => (
        <li key={doc.id}>
          <DocRow
            title={doc.title}
            badge={formatLabel(doc.original)}
            meta={docMeta(doc)}
            chips={doc.topics.map((t) => t.title)}
            selected={documentId === doc.id}
            onSelect={() => selectDocument(doc.id)}
            onDelete={() => { setDeleteTarget(doc); setDeleteError(null) }}
            deleting={deleting === doc.id}
            deleteDisabled={deleting !== null}
            accent={LEARNING.chipColors[(i + 1) % LEARNING.chipColors.length]}
          />
          {deleteTarget?.id === doc.id && (
            <div className={s.deleteConfirm} role="group" aria-label={`Confirm deleting ${doc.title}`}>
              <p>Delete this material and its generated quizzes? This cannot be undone.</p>
              <div>
                <button type="button" className={s.linkBtn} disabled={deleting !== null} onClick={() => { setDeleteTarget(null); setDeleteError(null) }}>Cancel</button>
                <button type="button" className={s.linkBtn} disabled={deleting !== null} onClick={() => void remove(doc)}>{deleting === doc.id ? 'Deleting…' : 'Delete material'}</button>
              </div>
            </div>
          )}
        </li>
      ))}
      {deleteError && <li className={s.notice} data-tone="error" role="alert">{deleteError}</li>}
      {status === 'loading' && documents.length === 0 && (
        <li className={s.docSkeleton} aria-label="Loading documents">
          <span />
          <span />
        </li>
      )}
      {status === 'error' && (
        <li className={s.notice} data-tone={error === 'not-ready' ? 'info' : 'warn'}>
          <p>
            {errorText(error ?? 'internal')}
            {error === 'not-ready' && ' Uploads open up as soon as it is.'}
          </p>
          <button type="button" className={s.linkBtn} onClick={() => void refresh()}>
            Retry
          </button>
        </li>
      )}
      {status === 'ready' && documents.length === 0 && <li className={s.empty}>Nothing added yet. Add lecture notes or a paper to grow his room.</li>}
    </ul>
  )
}

const docMeta = (doc: DocumentInfo) =>
  `${doc.kind === 'paper' ? 'Research paper · ' : ''}${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'} · ${doc.topics.length} topic${doc.topics.length === 1 ? '' : 's'}`

interface DocRowProps {
  title: string
  badge: string
  meta: string
  chips: string[]
  selected: boolean
  onSelect: () => void
  accent: string
  onDelete?: () => void
  deleting?: boolean
  deleteDisabled?: boolean
}

function DocRow({ title, badge, meta, chips, selected, onSelect, accent, onDelete, deleting, deleteDisabled }: DocRowProps) {
  const shown = chips.slice(0, LEARNING.maxChips)
  const more = chips.length - shown.length
  return (
    <div className={s.docWrap} data-deletable={!!onDelete} aria-busy={deleting || undefined}>
      <button type="button" className={s.doc} aria-pressed={selected} onClick={onSelect} style={{ '--c': accent } as CSSProperties}>
        <span className={s.docIcon} aria-hidden>
          {badge}
        </span>
        <span className={s.docMain}>
          <span className={s.docTitle}>{title}</span>
          <span className={s.docMeta}>{meta}</span>
          {shown.length > 0 && (
            <span className={s.chips}>
              {shown.map((c, i) => (
                <span key={c} className={s.chip} title={c} style={{ '--c': LEARNING.chipColors[i % LEARNING.chipColors.length] } as CSSProperties}>
                  {c}
                </span>
              ))}
              {more > 0 && <span className={s.chipMore}>+{more}</span>}
            </span>
          )}
        </span>
      </button>
      {onDelete && (
        <button type="button" className={s.deleteDoc} onClick={onDelete} disabled={deleteDisabled} aria-label={`Delete ${title}`} title={deleting ? 'Deleting…' : 'Delete material'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
          </svg>
        </button>
      )}
    </div>
  )
}
