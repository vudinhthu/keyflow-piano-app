import { memo, type CSSProperties } from 'react'
import { audioEngine } from '../features/audio/AudioEngine'
import { isBlack, noteName, PIANO_NOTES } from '../features/piano/notes'
import { NOTE_LABELS } from '../features/keyboard/mapping'
import { usePianoStore } from '../stores/pianoStore'

const WHITE_NOTES = PIANO_NOTES.filter((note) => !isBlack(note))
const POSITIONS = new Map<number, number>()
let whiteCount = 0
for (const note of PIANO_NOTES) {
  if (isBlack(note)) POSITIONS.set(note, whiteCount / WHITE_NOTES.length * 100)
  else whiteCount++
}

const PianoKey = memo(function PianoKey({ note }: { note: number }) {
  const pressed = usePianoStore((state) => state.activeNotes.includes(note))
  const sustained = usePianoStore((state) => state.sustainedNotes.includes(note))
  const enabled = usePianoStore((state) => state.status === 'ready' && !state.inputBlocked)
  const black = isBlack(note)
  const shift = usePianoStore((state) => state.octaveShift)
  const shortcut = NOTE_LABELS.get(note - shift * 12)
  const name = noteName(note)
  const style = black ? { left: `${POSITIONS.get(note)}%`, '--black-width': `${100 / WHITE_NOTES.length * 0.61}%` } as CSSProperties : undefined
  return (
    <button
      className={`piano-key ${black ? 'black-key' : 'white-key'} ${shortcut ? 'mapped' : ''} ${pressed ? 'pressed' : ''} ${sustained ? 'sustained' : ''}`}
      style={style}
      aria-label={`Nốt ${name}${shortcut ? `, phím ${shortcut}` : ''}`}
      title={`${name} · ${shortcut ? `Phím ${shortcut}` : 'Bấm hoặc chạm để chơi'}`}
      aria-pressed={pressed}
      aria-description={sustained ? 'Nốt đang ngân nhờ sustain' : undefined}
      disabled={!enabled}
      data-note={name}
      data-sustained={sustained}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        audioEngine.press(`pointer:${event.pointerId}`, note, usePianoStore.getState().velocity)
      }}
      onPointerUp={(event) => audioEngine.release(`pointer:${event.pointerId}`)}
      onPointerCancel={(event) => audioEngine.release(`pointer:${event.pointerId}`)}
      onLostPointerCapture={(event) => audioEngine.release(`pointer:${event.pointerId}`)}
      onKeyDown={(event) => {
        if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) {
          event.preventDefault()
          audioEngine.press(`button:${note}`, note, usePianoStore.getState().velocity)
        }
      }}
      onKeyUp={(event) => {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault()
          audioEngine.release(`button:${note}`)
        }
      }}
      onBlur={() => audioEngine.release(`button:${note}`)}
    >
      {shortcut ? <span className="key-shortcut" aria-hidden="true">{shortcut}</span> : null}
      <span className="key-note" aria-hidden="true">{name}</span>
    </button>
  )
})

export function PianoKeyboard() {
  return (
    <><div className="keyboard-scroll" role="group" aria-label="Bàn phím piano 61 phím, C2 đến C7">
      <div className="piano-keyboard">
        <div className="white-keys">{WHITE_NOTES.map((note) => <PianoKey key={note} note={note} />)}</div>
        {PIANO_NOTES.filter(isBlack).map((note) => <PianoKey key={note} note={note} />)}
      </div>
    </div>
    <p className="piano-label-guide">Chữ trên phím là shortcut QWERTY; C3, F#3… là tên nốt. Bấm/chạm phím đàn hoặc đổi Octave để chơi các nốt ngoài vùng QWERTY.</p></>
  )
}
