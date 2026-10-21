export const FIRST_NOTE = 36 // C2
export const LAST_NOTE = 96 // C7
export const DEFAULT_VELOCITY = 0.72
const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Invalid MIDI note')
  return `${PITCHES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

export function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

export const PIANO_NOTES = Array.from({ length: LAST_NOTE - FIRST_NOTE + 1 }, (_, i) => FIRST_NOTE + i)
