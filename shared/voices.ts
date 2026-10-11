// The ElevenLabs voices a tutor can speak with. The browser sends only the
// key ('female' / 'male'); the TTS proxy maps it to the voice id here, so a
// request can never pick an arbitrary voice on the account.
export const TUTOR_VOICES = {
  female: 'BZgkqPqms7Kj9ulSkVzn',
  male: '7EzWGsX10sAS4c9m9cPf',
} as const

export type TutorVoice = keyof typeof TUTOR_VOICES

export const DEFAULT_TUTOR_VOICE: TutorVoice = 'female'

export const isTutorVoice = (v: unknown): v is TutorVoice => typeof v === 'string' && Object.hasOwn(TUTOR_VOICES, v)
