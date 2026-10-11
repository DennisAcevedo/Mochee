import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { geminiProxy } from './server/geminiProxy'
import { ttsProxy } from './server/ttsProxy'
import { docsApi } from './server/docs/plugin'

export default defineConfig({
  // Server-side proxies on the dev and preview servers (keys stay server-side):
  // geminiProxy = POST /api/ask, ttsProxy = POST /api/tts (ElevenLabs voice),
  // docsApi = the document-grounded tutor API (/api/documents, /api/tutor/chat, /api/quiz, /api/health).
  plugins: [react(), geminiProxy(), ttsProxy(), docsApi()],
  server: {
    port: 5176,
    strictPort: true,
    // IPv4 loopback: Node resolves "localhost" to ::1 alone, which left
    // http://127.0.0.1:5176 (and browsers that try IPv4 first) unanswered.
    // Still local-only.
    host: '127.0.0.1',
    // Pre-transform the app at startup so the first page load after a restart
    // is not ~260 on-demand transforms in a request waterfall.
    warmup: { clientFiles: ['./src/main.tsx'] }, // its static imports are crawled too
    // The dev server serves the repo root, so the key files, the docs data,
    // scratch output (tts cache, e2e shots), local agent config and the
    // third-party Blender add-on are denied explicitly. This list replaces
    // Vite's defaults, which are kept as the first four entries.
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'gemini_API.txt', 'ElevenLabsAPI.txt', '**/.data/**', '**/tmp/**', '**/.claude/**', '**/BLENDER/MCP/**'],
    },
    // Same-origin app: no CORS headers at all, so a page on another localhost
    // port cannot read the documents API.
    cors: false,
  },
})
