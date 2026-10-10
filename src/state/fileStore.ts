// Uploaded PDFs, kept as real File objects per tutor so they can go to Gemini
// later. Memory first, IndexedDB behind it so they survive a reload.

const DB_NAME = 'tutor-files'
const STORE = 'files'
const memory = new Map<string, File[]>()

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function getTutorFiles(tutorId: string): Promise<File[]> {
  const cached = memory.get(tutorId)
  if (cached) return cached
  try {
    const stored = ((await run('readonly', (s) => s.get(tutorId))) as File[] | undefined) ?? []
    memory.set(tutorId, stored)
    return stored
  } catch {
    return []
  }
}

export async function addTutorFiles(tutorId: string, files: File[]): Promise<void> {
  if (!files.length) return
  const next = [...(await getTutorFiles(tutorId)), ...files.filter((f) => !memory.get(tutorId)?.some((g) => g.name === f.name))]
  memory.set(tutorId, next)
  try {
    await run('readwrite', (s) => s.put(next, tutorId))
  } catch {
    // Private mode or quota: the in-memory copy still works for this session.
  }
}

export async function deleteTutorFiles(tutorId: string): Promise<void> {
  memory.delete(tutorId)
  try {
    await run('readwrite', (s) => s.delete(tutorId))
  } catch {
    // Nothing stored, or storage unavailable: nothing to remove.
  }
}
