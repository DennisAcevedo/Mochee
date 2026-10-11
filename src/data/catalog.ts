import type { TutorVoice } from '../../shared/voices'
import type { Accessory } from '../character/look'

// Choices offered by the Create Tutor wizard, lifted from design/Create Tutor.dc.html.

export const SUBJECTS = ['Computer science', 'Biology', 'Chemistry', 'Math', 'History', 'Other'] as const
export type Subject = (typeof SUBJECTS)[number]

// A subject suggests a cap + accessory until the look is changed by hand.
export const SUBJECT_LOOKS: Record<Subject, { cap: string; accessory: Accessory }> = {
  'Computer science': { cap: '', accessory: 'glasses' },
  Biology: { cap: '#4c9a6a', accessory: 'leaf' },
  Chemistry: { cap: '#d9824a', accessory: 'none' },
  Math: { cap: '#c4566e', accessory: 'bowtie' },
  History: { cap: '#2e2f3a', accessory: 'none' },
  Other: { cap: '', accessory: 'none' },
}

export const CAP_SWATCHES: { value: string; label: string; swatch: string }[] = [
  { value: '', label: 'Indigo', swatch: 'linear-gradient(160deg, #6a4fd0, #3d5ad6)' },
  { value: '#1f8a92', label: 'Teal', swatch: '#1f8a92' },
  { value: '#4c9a6a', label: 'Leaf', swatch: '#4c9a6a' },
  { value: '#d9824a', label: 'Apricot', swatch: '#d9824a' },
  { value: '#c4566e', label: 'Rose', swatch: '#c4566e' },
  { value: '#2e2f3a', label: 'Ink', swatch: '#2e2f3a' },
]

export const ACCESSORY_OPTIONS: { value: Accessory; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'Just the cap' },
  { value: 'glasses', label: 'Glasses', hint: 'Bookish' },
  { value: 'leaf', label: 'Leaf', hint: 'Sprouting' },
  { value: 'mic', label: 'Mic', hint: 'Ready to talk' },
  { value: 'bowtie', label: 'Bow tie', hint: 'Dapper' },
  { value: 'headphones', label: 'Earbuds', hint: 'Tuned in' },
  { value: 'scarf', label: 'Tie', hint: 'Sharp' },
  { value: 'pencil', label: 'Pencil', hint: 'Note-taker' },
]

export const ACCESSORY_PALETTE: { value: string; label: string }[] = [
  { value: '#2b2b33', label: 'Ink' },
  { value: '#5cc4c9', label: 'Teal' },
  { value: '#7c5cf2', label: 'Violet' },
  { value: '#e0607a', label: 'Rose' },
  { value: '#f2b84b', label: 'Sunny' },
  { value: '#62b46e', label: 'Green' },
  { value: '#f7f5f0', label: 'Cream' },
]

// Voice ids are stored on the tutor; `eleven` is the ElevenLabs voice he
// speaks with (shared/voices.ts). `gemini` is where a Gemini Live voice name
// would go. pitch/rate/vi drive the speechSynthesis fallback sample.
export interface VoiceOption {
  id: VoiceId
  name: string
  desc: string
  eleven: TutorVoice
  pitch: number
  rate: number
  vi: number
  gemini: string | null
}
export type VoiceId = 'juniper' | 'atlas' | 'wren' | 'sol'

// Two voices to pick from: a female and a male ElevenLabs voice.
export const VOICES: VoiceOption[] = [
  { id: 'juniper', name: 'Juniper', desc: 'Female voice', eleven: 'female', pitch: 1.05, rate: 0.92, vi: 0, gemini: null },
  { id: 'atlas', name: 'Atlas', desc: 'Male voice', eleven: 'male', pitch: 0.85, rate: 1.0, vi: 1, gemini: null },
]

// The ElevenLabs voice a tutor speaks with. Tutors saved with the retired
// Wren / Sol picks keep a voice: Wren the female one, Sol the male one.
export function tutorVoiceOf(id: VoiceId | undefined): TutorVoice {
  return id === 'atlas' || id === 'sol' ? 'male' : 'female'
}
