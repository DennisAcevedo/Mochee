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
