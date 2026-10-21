export const LOWER_ROW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM']
export const UPPER_ROW = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU']

export const KEY_MAPPING = new Map<string, number>([
  ...LOWER_ROW.map((code, i): [string, number] => [code, 48 + i]),
  ...UPPER_ROW.map((code, i): [string, number] => [code, 60 + i]),
])
export const NOTE_LABELS = new Map([...KEY_MAPPING].map(([code, midi]) => [midi, code.replace(/Key|Digit/, '')]))

export function noteForCode(code: string, octaveShift = 0): number | undefined {
  const base = KEY_MAPPING.get(code)
  if (base === undefined || !Number.isInteger(octaveShift) || octaveShift < -1 || octaveShift > 2) return undefined
  return base + octaveShift * 12
}
