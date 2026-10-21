import { setVelocity, VELOCITY_LEVELS } from '../features/keyboard/controls'
import { usePianoStore } from '../stores/pianoStore'

export function VelocityControl() {
  const velocity = usePianoStore((state) => state.velocity)
  return <div className="velocity-control">
    <label htmlFor="piano-velocity">Sắc thái</label>
    <select id="piano-velocity" value={velocity} onChange={(event) => setVelocity(Number(event.currentTarget.value))}>
      {VELOCITY_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
    </select>
  </div>
}
