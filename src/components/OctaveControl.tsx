import { keyboardRange, MAX_OCTAVE_SHIFT, MIN_OCTAVE_SHIFT, shiftOctave } from '../features/keyboard/controls'
import { usePianoStore } from '../stores/pianoStore'
import { ControlIcon } from './ControlIcon'

export function OctaveControl() {
  const shift = usePianoStore((state) => state.octaveShift)
  return <div className="octave-control" role="group" aria-label="Octave">
    <span className="visually-hidden">Octave</span>
    <button aria-label="Octave cao hơn" title="Octave cao hơn" disabled={shift === MAX_OCTAVE_SHIFT} onClick={() => shiftOctave(1)}><ControlIcon name="up" /></button>
    <output aria-live="polite" title={keyboardRange(shift)}><span className="visually-hidden">{keyboardRange(shift)} · </span><span>{shift > 0 ? '+' : ''}{shift}</span></output>
    <button aria-label="Octave thấp hơn" title="Octave thấp hơn" disabled={shift === MIN_OCTAVE_SHIFT} onClick={() => shiftOctave(-1)}><ControlIcon name="down" /></button>
  </div>
}
