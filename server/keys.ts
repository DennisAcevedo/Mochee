import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Shared server-side key reader. A key is read per request (env first, then
// the repo-root key file), handed back only to code that puts it in a request
// header, and never logged, echoed or returned. Callers that only need to know
// whether a key exists use the has*Key helpers, which return booleans.

const KEYS = {
  gemini: { env: 'GEMINI_API_KEY', file: 'gemini_API.txt', minLength: 30 },
  voice: { env: 'ELEVENLABS_API_KEY', file: 'ElevenLabsAPI.txt', minLength: 20 },
} as const

type KeyName = keyof typeof KEYS

// The key file may hold just the key, or labelled lines ("API Key" then the key).
function parseKeyFile(raw: string, minLength: number): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 1) return lines[0]
  const label = lines.findIndex((l) => /^api[\s_-]*key\b/i.test(l))
  if (label >= 0 && lines[label + 1]) return lines[label + 1]
  return lines.find((l) => l.length >= minLength && /^[A-Za-z0-9._-]+$/.test(l)) ?? ''
}

function readKey(root: string, name: KeyName): string | null {
  const spec = KEYS[name]
  let key = process.env[spec.env]?.trim() ?? ''
  if (!key) {
    try {
      key = parseKeyFile(readFileSync(join(root, spec.file), 'utf8'), spec.minLength)
    } catch {
      return null
    }
  }
  // A header-safe token only: anything else would make fetch throw with the value in the message.
  return /^[A-Za-z0-9._-]+$/.test(key) ? key : null
}

export const readGeminiKey = (root: string) => readKey(root, 'gemini')
export const readVoiceKey = (root: string) => readKey(root, 'voice')
export const hasGeminiKey = (root: string) => readGeminiKey(root) !== null
export const hasVoiceKey = (root: string) => readVoiceKey(root) !== null

// Repo-root files the dev server must never serve (it serves the repo root).
export const KEY_FILES: readonly string[] = [KEYS.gemini.file, KEYS.voice.file]
