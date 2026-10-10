import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { notesTabs } from '../../../shared/lessonNotes'
import { DEFAULT_DOC_KIND, DOCS_LIMITS, formatLabel, UPLOAD_ACCEPT, UPLOAD_FORMATS, type DocKind, type DocumentInfo } from '../../../shared/docsTypes'
import { StudyHub } from '../../hub/StudyHub'
import { PALETTE } from '../../scene/layout3d'
import { useDrawers } from '../../state/drawers'
import { errorText } from './docsClient'
import { useDocs, useDocsAutoRefresh } from './docsStore'
import { BookIcon, UploadIcon } from './icons'
import s from './Learning.module.css'
import { BuiltInPage, DocumentPage } from './PageViewer'
import { Panel } from './Panel'

// LEFT drawer: what the student is learning from. The built-in lesson is
// always first; uploaded files follow with their topic chips. Selecting one
// makes it the subject of the hub's chat and quiz, and opens its pages in
// the reader below.

const LEARNING = {
  maxChips: 4, // topic chips per document before "+N"
  builtInTopics: ['FCFS', 'Ready queue', 'Convoy effect'], // what the built-in lesson covers
  chipColors: [PALETTE.violet, PALETTE.teal, PALETTE.coral, PALETTE.indigo, PALETTE.lime, PALETTE.pink],
  // Class material is taught topic by topic; a paper is walked through by Gemini in one pass.
  kinds: [
    { id: 'class', label: 'Class', hint: 'PDF, Word, PowerPoint, text, HTML or images' },
    { id: 'paper', label: 'Research paper', hint: 'Gemini walks the whole paper, question to results' },
  ] satisfies readonly { id: DocKind; label: string; hint: string }[],
} as const

// 'CS111 Lecture 4.pdf' -> 'CS111 · Lecture 4'
const BUILT_IN_LABEL = notesTabs[0].title.replace(/\.pdf$/i, '').replace(' ', ' · ')

export function LearningDrawer() {
  useDocsAutoRefresh()
  const documentId = useDrawers((d) => d.documentId)
  const documents = useDocs((d) => d.documents)
  const selected = documents.find((d) => d.id === documentId) ?? null

  return (
    <Panel id="learning" title="Learning" accent={PALETTE.violet} icon={<BookIcon />}>
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
              {selected ? <DocumentPage key={selected.id} doc={selected} /> : <BuiltInPage />}
            </section>
          </>
        }
      />
    </Panel>
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
  const documentId = useDrawers((d) => d.documentId)
  const selectDocument = useDrawers((d) => d.selectDocument)

  return (
    <ul className={s.docs}>
      <li>
        <DocRow
          title={BUILT_IN_LABEL}
          badge={UPLOAD_FORMATS.pdf.label}
          meta="Built-in lesson"
          chips={[...LEARNING.builtInTopics]}
          selected={documentId === null}
          onSelect={() => selectDocument(null)}
          accent={PALETTE.violet}
        />
      </li>
      {documents.map((doc, i) => (
        <li key={doc.id}>
          <DocRow
            title={doc.title}
            badge={formatLabel(doc.original)}
            meta={docMeta(doc)}
            chips={doc.topics.map((t) => t.title)}
            selected={documentId === doc.id}
            onSelect={() => selectDocument(doc.id)}
            accent={LEARNING.chipColors[(i + 1) % LEARNING.chipColors.length]}
          />
        </li>
      ))}
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
}

function DocRow({ title, badge, meta, chips, selected, onSelect, accent }: DocRowProps) {
  const shown = chips.slice(0, LEARNING.maxChips)
  const more = chips.length - shown.length
  return (
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
              <span key={c} className={s.chip} style={{ '--c': LEARNING.chipColors[i % LEARNING.chipColors.length] } as CSSProperties}>
                {c}
              </span>
            ))}
            {more > 0 && <span className={s.chipMore}>+{more}</span>}
          </span>
        )}
      </span>
    </button>
  )
}
