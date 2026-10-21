import { useRef } from 'react'
import { AudioStart } from './components/AudioStart'
import { KeyboardGuide } from './components/KeyboardGuide'
import { PianoKeyboard } from './components/PianoKeyboard'
import { VolumeControl } from './components/VolumeControl'
import { FloatingControls } from './components/FloatingControls'
import { VelocityControl } from './components/VelocityControl'
import { OfflineControl } from './components/OfflineControl'
import { InstallControl } from './components/InstallControl'
import { PullToRefresh } from './components/PullToRefresh'
import { OrientationPrompt } from './components/OrientationPrompt'
import { keyboardRange } from './features/keyboard/controls'
import { noteName } from './features/piano/notes'
import { useKeyboard } from './hooks/useKeyboard'
import { usePianoStore } from './stores/pianoStore'

export default function App() {
  useKeyboard()
  const notes = usePianoStore((state) => state.activeNotes)
  const shift = usePianoStore((state) => state.octaveShift)
  const playingArea = useRef<HTMLDivElement>(null)
  const scrollToPiano = () => playingArea.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  return <div className="studio-shell">
    <PullToRefresh />
    <OrientationPrompt />
    <header className="site-header">
      <a className="brand" href="#main" aria-label="KeyFlow — Piano studio"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>KeyFlow<span className="brand-dot">.</span></a>
      <span className="header-caption">A LITTLE SPACE FOR YOUR MUSIC</span>
      <span className="studio-badge"><span aria-hidden="true">◈</span> Piano studio</span>
    </header>
    <main id="main">
      <section className="intro" aria-labelledby="intro-title">
        <div><p className="eyebrow">CHỈ BẠN VÀ NHỮNG PHÍM ĐÀN</p><h1 id="intro-title">Để giai điệu <em>tuôn chảy.</em></h1><p className="intro-copy">Một chiếc grand piano, ngay trên bàn phím của bạn.<br />Bắt đầu bằng một nốt. Phần còn lại, cứ để cảm hứng dẫn lối.</p></div>
        <div className="intro-number" aria-hidden="true">01<span>GRAND PIANO</span></div>
      </section>
      <section className="instrument" aria-label="Grand piano">
        <div className="instrument-top">
          <div className="instrument-title"><span className="instrument-icon" aria-hidden="true">♬</span><div><h2>Salamander Grand</h2><p>Acoustic piano <span>·</span> C2 — C7</p></div></div>
          <AudioStart onStarted={scrollToPiano} />
        </div>
        <OfflineControl />
        <div className="playing-area" ref={playingArea}>
          <FloatingControls playingArea={playingArea} />
          <div className="instrument-toolbar" aria-label="Điều khiển tiếng đàn"><VolumeControl /><VelocityControl /></div>
          <div className="instrument-stage">
            <div className="stage-caption"><span>KEYFLOW <span className="subtle">/ GRAND COLLECTION</span></span><span>61 PHÍM</span></div>
            <PianoKeyboard />
          </div>
        </div>
        <div className="instrument-bottom">
          <div className="active-readout" data-testid="active-notes"><span className="readout-label">ĐANG CHƠI</span><span>{notes.length ? notes.map(noteName).join(' · ') : '—'}</span></div>
          <span className="small-caption">QWERTY <span className="divider">/</span> {keyboardRange(shift)} <span className="divider">/</span> {notes.length} nốt đang giữ</span>
        </div>
      </section>
      <KeyboardGuide />
      <InstallControl />
      <aside className="session-note"><span aria-hidden="true">✳</span><p>Không cần biết nhạc lý để bắt đầu.<br /><span>Thử vài phím, giữ một hợp âm, tìm giai điệu của riêng bạn.</span></p><span className="session-line" /></aside>
    </main>
    <footer className="site-footer"><span>Made for the moments between.</span><span><a href="https://github.com/vudinhthu/keyflow-piano-app" target="_blank" rel="noreferrer">GitHub ↗</a> · <a href="/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Giấy phép thư viện ↗</a> · Sample: Alexander Holm · <a href="/samples/salamander/ATTRIBUTION.md" target="_blank" rel="noreferrer">CC BY 3.0 ↗</a></span></footer>
  </div>
}
