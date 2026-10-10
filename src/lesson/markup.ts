// Lesson lines mark key terms with **double stars**. Captions render them bold
// and coloured; the transcript and the voice get the plain text.

export interface Span {
  text: string
  bold: boolean
}

export function parseMarks(text: string): Span[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((s) => s.text.length > 0)
}

export const stripMarks = (text: string) => text.replace(/\*\*/g, '')
