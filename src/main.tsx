import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { audioEngine } from './features/audio/AudioEngine'
import { sampleDataManager } from './features/audio/SampleDataManager'
import { initializeSettings } from './features/settings/persistence'
import { usePianoStore } from './stores/pianoStore'
import './styles.css'

const stopSettingsPersistence = initializeSettings(usePianoStore)
const closePageAudio = () => { sampleDataManager.cancel(); audioEngine.dispose() }
window.addEventListener('pagehide', closePageAudio)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
if (import.meta.hot) import.meta.hot.dispose(() => { stopSettingsPersistence(); window.removeEventListener('pagehide', closePageAudio); closePageAudio() })
