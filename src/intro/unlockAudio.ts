declare global {
  interface Window {
    __tutorAudioCtx?: AudioContext
    __tutorAudioUnlocked?: boolean
    webkitAudioContext?: typeof AudioContext
  }
}

// Ported from unlockAudio() in design/Tutor.dc.html. Must run inside the click
// (or key) handler so later voice playback isn't blocked by autoplay rules.
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      const ctx = window.__tutorAudioCtx || (window.__tutorAudioCtx = new AC())
      if (ctx.state === 'suspended') void ctx.resume()
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, 1, 22050)
      src.connect(ctx.destination)
      src.start(0)
    }
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance('')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
    window.__tutorAudioUnlocked = true
  } catch {
    // Audio is a nice-to-have; never block the intro on it.
  }
}
