import { LOWER_ROW, UPPER_ROW, noteForCode } from '../features/keyboard/mapping'
import { isBlack, noteName } from '../features/piano/notes'
import { usePianoStore } from '../stores/pianoStore'

function GuideKey({ code }: { code: string }) {
  const shift = usePianoStore((state) => state.octaveShift)
  const midi = noteForCode(code, shift)!
  const active = usePianoStore((state) => state.activeNotes.includes(midi))
  const sustained = usePianoStore((state) => state.sustainedNotes.includes(midi))
  return <div className={`guide-key ${isBlack(midi) ? 'accidental' : ''} ${active ? 'active' : ''} ${sustained ? 'sustained' : ''}`}>
    <kbd>{code.replace(/Key|Digit/, '')}</kbd><span>{noteName(midi).replace(/\d/, '')}</span>
  </div>
}

export function KeyboardGuide() {
  const shift = usePianoStore((state) => state.octaveShift)
  return <section className="guide-panel" aria-labelledby="guide-title">
    <div className="section-heading">
      <div><p className="eyebrow">MÁY TÍNH CỦA BẠN, NHẠC CỤ CỦA BẠN</p><h2 id="guide-title">Tìm những nốt đầu tiên.</h2></div>
      <span className="small-caption">Nhấn để chơi · Space để ngân</span>
    </div>
    <div className="guide-row"><span className="row-name">Cao<span>C{4 + shift} — B{4 + shift}</span></span><div className="guide-keys">{UPPER_ROW.map((code) => <GuideKey key={code} code={code} />)}</div></div>
    <div className="guide-row"><span className="row-name">Trầm<span>C{3 + shift} — B{3 + shift}</span></span><div className="guide-keys">{LOWER_ROW.map((code) => <GuideKey key={code} code={code} />)}</div></div>
    <p className="guide-tip"><span aria-hidden="true">↗</span> Thử hợp âm đầu tiên: giữ <kbd>Z</kbd> + <kbd>C</kbd> + <kbd>B</kbd> để chơi C — E — G.</p>
  </section>
}
