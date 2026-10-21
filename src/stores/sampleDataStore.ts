import { create } from 'zustand'

export const useSampleDataStore = create<{
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: number
  error: string | null
}>(() => ({ status: 'idle', progress: 0, error: null }))
