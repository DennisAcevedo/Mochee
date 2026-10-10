import type { IncomingMessage } from 'node:http'

// Cross-site guard for the dev server's POST routes (/api/ask, /api/tts, the
// docs API). A page on any other site can fire a "simple" POST (text/plain, no
// preflight) at localhost; Vite's CORS only hides the reply, so the paid
// upstream call would still run. Browsers always attach Origin (and, in all
// current engines, Sec-Fetch-Site) to a cross-site POST, so a request is
// refused when either names another origin. Requests carrying neither (curl,
// Playwright's request API, the server tests) are not from a web page and pass.
// JSON routes also require the content type the client always sends, which
// forces a CORS preflight on any cross-origin attempt.

export interface GuardRefusal {
  status: number
  error: string
}

export function refuseCrossSite(req: IncomingMessage, contentType: string | null): GuardRefusal | null {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return { status: 403, error: 'forbidden' }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== `http://${req.headers.host ?? ''}`) return { status: 403, error: 'forbidden' }
  if (contentType) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (type !== contentType) return { status: 415, error: 'bad-request' }
  }
  return null
}
