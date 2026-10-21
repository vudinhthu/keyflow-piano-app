import { useEffect, useRef } from 'react'
import { audioEngine } from '../features/audio/AudioEngine'

export function OrientationPrompt() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)')
    const syncOrientation = () => {
      if (portrait.matches) {
        // Opening a modal must release notes/pedal already held on the page.
        audioEngine.panic()
        if (!dialog.open) dialog.showModal()
      } else if (dialog.open) dialog.close()
    }
    syncOrientation()
    portrait.addEventListener('change', syncOrientation)
    return () => {
      portrait.removeEventListener('change', syncOrientation)
      if (dialog.open) dialog.close()
    }
  }, [])
  return <dialog ref={dialogRef} className="orientation-popup" aria-labelledby="orientation-title" aria-describedby="orientation-description" onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Tab') {
      event.preventDefault()
      closeRef.current?.focus()
    }
  }}>
    <form method="dialog"><button ref={closeRef} className="orientation-close" aria-label="Đóng lời nhắc xoay ngang"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></form>
    <h2 id="orientation-title">Xoay ngang màn hình</h2>
    <p id="orientation-description">Bạn sẽ có thêm không gian để chơi piano thoải mái hơn.</p>
  </dialog>
}
