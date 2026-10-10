import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// The frontend/backend boundary: server/ may import shared/, src/ may import
// shared/, and shared/ imports neither side. Catches static, side-effect and
// dynamic imports (template literals too) with relative specifiers.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"`]([^'"`]+)['"`]/g
const SOURCE = /\.[cm]?[jt]sx?$/

function crossings(dir: string, banned: string[]): string[] {
  const found: string[] = []
  const files = readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).filter((f) => SOURCE.test(f))
  for (const file of files) {
    const path = join(ROOT, dir, file)
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(SPECIFIER)) {
      if (!spec.startsWith('.')) continue
      const target = relative(ROOT, join(dirname(path), spec)).replaceAll('\\', '/')
      if (banned.some((b) => target === b || target.startsWith(b + '/'))) found.push(`${dir}/${file.replaceAll('\\', '/')} -> ${spec}`)
    }
  }
  return found
}

test('server/ never imports from src/', () => {
  assert.deepEqual(crossings('server', ['src']), [])
})

test('src/ never imports from server/ (Node code stays out of the browser bundle)', () => {
  assert.deepEqual(crossings('src', ['server']), [])
})

test('shared/ imports from neither src/ nor server/', () => {
  assert.deepEqual(crossings('shared', ['src', 'server']), [])
})
