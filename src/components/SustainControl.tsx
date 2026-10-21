import { audioEngine } from '../features/audio/AudioEngine'
import { usePianoStore } from '../stores/pianoStore'
import { ControlIcon } from './ControlIcon'

export function SustainControl() {
  const sustain = usePianoStore((state) => state.sustain)
  const count = usePianoStore((state) => state.sustainedNotes.length)
  const ready = usePianoStore((state) => state.status === 'ready' && !state.inputBlocked)
  return <div className="sustain-control">
    <button
      aria-label="Sustain — giữ pedal"
      title="Sustain · giữ để ngân · Space"
      aria-pressed={sustain}
      disabled={!ready}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        audioEngine.setSustain(`pedal:pointer:${event.pointerId}`, true)
      }}
      onPointerUp={(event) => audioEngine.setSustain(`pedal:pointer:${event.pointerId}`, false)}
      onPointerCancel={(event) => audioEngine.setSustain(`pedal:pointer:${event.pointerId}`, false)}
      onLostPointerCapture={(event) => audioEngine.setSustain(`pedal:pointer:${event.pointerId}`, false)}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) audioEngine.setSustain(`pedal:button:${event.code}`, true)
        }
      }}
      onKeyUp={(event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault()
          audioEngine.setSustain(`pedal:button:${event.code}`, false)
        }
      }}
      onBlur={() => {
        audioEngine.setSustain('pedal:button:Space', false)
        audioEngine.setSustain('pedal:button:Enter', false)
      }}
    ><ControlIcon name="menu" />{count > 0 ? <span className="floating-pedal-count" aria-hidden="true">{count}</span> : null}</button>
    <span className="visually-hidden" role="status" aria-live="polite">{sustain ? 'Pedal đang giữ' : 'Giữ để ngân'} · {count} nốt ngân</span>
  </div>
}
