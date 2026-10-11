import { DOCS_CONFIG } from './config.ts'

// One structured Gemini REST call (generateContent with responseSchema). The
// key travels only in the x-goog-api-key header; failures come back as short
// codes, never as upstream bodies, so nothing upstream can echo into a reply.

export type GeminiResult = { ok: true; json: unknown } | { ok: false; error: 'timeout' | 'network' | 'upstream' | 'parse'; status?: number }

export interface GeminiCall {
  key: string
  system: string
  user: string
  schema: Record<string, unknown>
  temperature: number
  maxOutputTokens: number
  inline?: { mimeType: string; base64: string } // inline file part, sent before the text (lecture audio, a PDF, an image)
  timeoutMs?: number // default DOCS_CONFIG.timeoutMs
}

export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || DOCS_CONFIG.defaultModel

function thinkingConfig(model: string) {
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: DOCS_CONFIG.thinkingLevel }
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 }
  return undefined
}

export async function callGemini(call: GeminiCall): Promise<GeminiResult> {
  const model = geminiModel()
  const thinking = thinkingConfig(model)
  let upstream: Response
  try {
    upstream = await fetch(`${DOCS_CONFIG.endpoint}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': call.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.system }] },
        contents: [{ role: 'user', parts: [...(call.inline ? [{ inlineData: { mimeType: call.inline.mimeType, data: call.inline.base64 } }] : []), { text: call.user }] }],
        generationConfig: {
          temperature: call.temperature,
          maxOutputTokens: call.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: call.schema,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
      signal: AbortSignal.timeout(call.timeoutMs ?? DOCS_CONFIG.timeoutMs),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { ok: false, error: timedOut ? 'timeout' : 'network' }
  }
  if (!upstream.ok) {
    void upstream.body?.cancel()
    return { ok: false, error: 'upstream', status: upstream.status }
  }
  try {
    const data = (await upstream.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
    return { ok: true, json: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, error: 'parse' }
  }
}

// Passages as labelled, quoted data blocks. Triple quotes inside a passage are
// defused so a document cannot close its own block and speak as the prompt.
export function passageBlock(passages: { id: string; page: number; text: string }[]): string {
  return passages.map((p) => `[${p.id} p.${p.page}]\n"""\n${p.text.replace(/"""/g, "''")}\n"""`).join('\n\n')
}
