import { describe, expect, it, vi } from 'vitest'
import { isBlack, noteName, PIANO_NOTES } from '../src/features/piano/notes'
import { KEY_MAPPING, LOWER_ROW, UPPER_ROW, noteForCode } from '../src/features/keyboard/mapping'
import { VoiceManager } from '../src/features/audio/VoiceManager'

function setup(limit = 32) {
  const output = { attack: vi.fn(), release: vi.fn(), releaseAll: vi.fn() }
  const changed = vi.fn()
  return { output, changed, voices: new VoiceManager(output, changed, limit) }
}

describe('piano range and QWERTY contract', () => {
  it('renders C2–C7 as 36 white and 25 black notes', () => {
    expect(PIANO_NOTES).toHaveLength(61)
    expect(PIANO_NOTES.filter(isBlack)).toHaveLength(25)
    expect(noteName(PIANO_NOTES[0])).toBe('C2')
    expect(noteName(PIANO_NOTES.at(-1)!)).toBe('C7')
  })
  it('maps every physical key exactly once across two contiguous octaves', () => {
    expect(KEY_MAPPING.size).toBe(24)
    expect(LOWER_ROW.map((code) => noteForCode(code))).toEqual(Array.from({ length: 12 }, (_, i) => 48 + i))
    expect(UPPER_ROW.map((code) => noteForCode(code))).toEqual(Array.from({ length: 12 }, (_, i) => 60 + i))
    expect([noteForCode('KeyZ'), noteForCode('KeyC'), noteForCode('KeyB')]).toEqual([48, 52, 55])
  })
  it('keeps future octave shifts within the instrument and rejects invalid input', () => {
    expect(noteForCode('KeyZ', -1)).toBe(36)
    expect(noteForCode('KeyU', 2)).toBe(95)
    expect(noteForCode('KeyZ', -2)).toBeUndefined()
    expect(noteForCode('KeyZ', 0.5)).toBeUndefined()
    expect(noteForCode('KeyF')).toBeUndefined()
    expect(() => noteName(NaN)).toThrow(RangeError)
  })
})

describe('voice ownership and cleanup', () => {
  it('releases sustained audio before publishing its visual change', () => {
    const order: string[] = []
    const voices = new VoiceManager({ attack: vi.fn(), release: () => order.push('audio'), releaseAll: vi.fn() }, () => order.push('ui'))
    voices.setSustain(true)
    voices.press('z', 48, 0.72)
    voices.release('z')
    order.length = 0
    voices.setSustain(false)
    expect(order).toEqual(['audio', 'ui'])
  })
  it('sustains released notes but pedal-up does not cut a physically held note', () => {
    const { voices, output, changed } = setup()
    voices.setSustain(true)
    voices.press('z', 48, 0.72)
    voices.press('c', 52, 0.72)
    voices.release('z')
    expect(output.release).not.toHaveBeenCalled()
    expect(changed).toHaveBeenLastCalledWith([52])
    voices.setSustain(false)
    expect(output.release.mock.calls).toEqual([[48]])
    voices.release('c')
    expect(output.release.mock.calls).toEqual([[48], [52]])
  })
  it('reattacks a sustained pitch and gives its new owner normal release', () => {
    const { voices, output } = setup()
    voices.setSustain(true)
    voices.press('z', 48, 0.3)
    voices.release('z')
    voices.press('z', 48, 0.9)
    expect(output.attack.mock.calls).toEqual([[48, 0.3], [48, 0.9]])
    expect(output.release).toHaveBeenCalledExactlyOnceWith(48)
    voices.setSustain(false)
    expect(output.release).toHaveBeenCalledTimes(1)
    voices.release('z')
    expect(output.release).toHaveBeenCalledTimes(2)
  })
  it('counts sustained pitches toward the voice limit and steals released pitches first', () => {
    const { voices, output, changed } = setup(2)
    voices.setSustain(true)
    voices.press('a', 48, 0.7)
    voices.press('b', 52, 0.7)
    voices.release('b')
    voices.press('c', 55, 0.7)
    expect(output.release).toHaveBeenCalledExactlyOnceWith(52)
    expect(changed).toHaveBeenLastCalledWith([48, 55])
  })
  it('panic clears pedal and sustained voices so later keyup releases normally', () => {
    const { voices, output } = setup()
    voices.setSustain(true)
    voices.press('z', 48, 0.7)
    voices.release('z')
    voices.panic()
    voices.press('z', 48, 0.7)
    voices.release('z')
    expect(output.releaseAll).toHaveBeenCalledOnce()
    expect(output.release).toHaveBeenCalledExactlyOnceWith(48)
  })
  it('plays C E G as simultaneous independent notes', () => {
    const { voices, output, changed } = setup()
    for (const note of [48, 52, 55]) voices.press(`key:${note}`, note, 0.72)
    expect(output.attack.mock.calls).toEqual([[48, 0.72], [52, 0.72], [55, 0.72]])
    expect(changed).toHaveBeenLastCalledWith([48, 52, 55])
    voices.release('key:52')
    expect(output.release).toHaveBeenCalledWith(52)
    expect(changed).toHaveBeenLastCalledWith([48, 55])
  })
  it('ignores repeated input from one physical owner', () => {
    const { voices, output } = setup()
    voices.press('z', 48, 0.7)
    voices.press('z', 48, 0.7)
    expect(output.attack).toHaveBeenCalledTimes(1)
    voices.release('z')
    voices.release('z')
    expect(output.release).toHaveBeenCalledTimes(1)
  })
  it('shares a pitch between QWERTY and pointer until both release', () => {
    const { voices, output, changed } = setup()
    voices.press('keyboard:z', 48, 0.7)
    voices.press('pointer:1', 48, 0.7)
    expect(output.attack).toHaveBeenCalledTimes(1)
    voices.release('pointer:1')
    expect(output.release).not.toHaveBeenCalled()
    expect(changed).toHaveBeenLastCalledWith([48])
    voices.release('keyboard:z')
    expect(output.release).toHaveBeenCalledWith(48)
  })
  it('releases the original note when mapping changes while held', () => {
    const { voices, output } = setup()
    voices.press('keyboard:z', 48, 0.7)
    voices.press('keyboard:z', 60, 0.7)
    voices.release('keyboard:z')
    expect(output.release).toHaveBeenCalledWith(48)
    expect(output.attack).toHaveBeenCalledTimes(1)
  })
  it('steals the oldest held pitch at the cap and clears all its owners', () => {
    const { voices, output, changed } = setup(2)
    voices.press('a', 48, 0.7)
    voices.press('b', 48, 0.7)
    voices.press('c', 52, 0.7)
    voices.press('d', 55, 0.7)
    expect(output.release).toHaveBeenCalledWith(48)
    expect(changed).toHaveBeenLastCalledWith([52, 55])
    voices.release('a')
    voices.release('b')
    expect(output.release).toHaveBeenCalledTimes(1)
  })
  it('releases all notes and lets the same owner start fresh', () => {
    const { voices, output, changed } = setup()
    voices.press('a', 48, 0.7)
    voices.panic()
    expect(output.releaseAll).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenLastCalledWith([])
    voices.press('a', 48, 0.7)
    expect(output.attack).toHaveBeenCalledTimes(2)
  })
  it('rejects malformed events and clamps velocity', () => {
    const { voices, output } = setup()
    voices.press('bad', 20, 0.7)
    voices.press('bad', 48, NaN)
    voices.press('good', 48, 9)
    expect(output.attack.mock.calls).toEqual([[48, 1]])
  })
  it('sends audio before publishing React state', () => {
    const order: string[] = []
    const voices = new VoiceManager({ attack: () => order.push('audio'), release: vi.fn(), releaseAll: vi.fn() }, () => order.push('ui'))
    voices.press('a', 48, 0.7)
    expect(order).toEqual(['audio', 'ui'])
  })
})
