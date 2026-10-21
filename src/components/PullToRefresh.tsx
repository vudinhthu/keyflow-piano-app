import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '../features/audio/AudioEngine'
import { offlineManager } from '../features/offline/OfflineManager'
import { pullDistance, PULL_THRESHOLD } from '../features/pwa/pullGesture'
import { useOfflineStore } from '../stores/offlineStore'
import { usePianoStore } from '../stores/pianoStore'
import { useSampleDataStore } from '../stores/sampleDataStore'

function canRefresh(): boolean {
  const piano = usePianoStore.getState()
  const offline = useOfflineStore.getState()
  return !piano.inputBlocked && piano.status !== 'loading' && !piano.activeNotes.length && !piano.sustainedNotes.length && !piano.sustain && !offline.busy && !offline.applying && useSampleDataStore.getState().status !== 'loading'
}

export function PullToRefresh() {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const refresh = async () => {
    if (busy.current || !canRefresh()) return
    busy.current = true
    setRefreshing(true)
    // Gate input first, then let existing audio tails finish before reloading.
    usePianoStore.setState({ inputBlocked: true })
    audioEngine.panic()
    await new Promise(resolve => window.setTimeout(resolve, 400))
    await offlineManager.checkForUpdates()
    window.location.reload()
  }
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })
  useEffect(() => {
    let start: { x: number; y: number } | undefined
    let pulled = 0
    const reset = () => { start = undefined; pulled = 0; setDistance(0) }
    const touchStart = (event: TouchEvent) => {
      reset()
      if (event.touches.length !== 1 || window.scrollY > 1 || !canRefresh()) return
      const target = event.target
      if (target instanceof Element && target.closest('button, a, input, select, textarea, summary, [contenteditable], .playing-area')) return
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    const touchMove = (event: TouchEvent) => {
      if (!start) return
      if (event.touches.length !== 1 || !canRefresh() || window.scrollY > 1) { reset(); return }
      const point = event.touches[0]
      pulled = pullDistance(start, { x: point.clientX, y: point.clientY })
      if (!pulled && (Math.abs(point.clientX - start.x) > 12 || point.clientY < start.y - 12)) { reset(); return }
      if (pulled > 12 && event.cancelable) event.preventDefault()
      setDistance(pulled)
    }
    const touchEnd = () => {
      const triggered = pulled >= PULL_THRESHOLD
      reset()
      if (triggered) void refreshRef.current()
    }
    document.addEventListener('touchstart', touchStart, { passive: true })
    document.addEventListener('touchmove', touchMove, { passive: false })
    document.addEventListener('touchend', touchEnd)
    document.addEventListener('touchcancel', reset)
    return () => {
      document.removeEventListener('touchstart', touchStart)
      document.removeEventListener('touchmove', touchMove)
      document.removeEventListener('touchend', touchEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }, [])
  return <div className={`pull-refresh ${distance > 12 || refreshing ? 'is-visible' : ''}`}>
    <span role="status" aria-live="polite">{refreshing ? 'Đang làm mới…' : distance >= PULL_THRESHOLD ? 'Thả để làm mới' : 'Kéo xuống để làm mới'}</span>
    <button className="stop-button" disabled={refreshing} onClick={() => { void refresh() }}>Làm mới</button>
  </div>
}
