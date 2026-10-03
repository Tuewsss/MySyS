import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SuspectsProgress, SuspectsResult } from '../../electron/scanner/types'
import { useScan } from './scan'

type Status = 'idle' | 'running' | 'done' | 'error'

interface SuspectsState {
  status: Status
  progress: SuspectsProgress | null
  result: SuspectsResult | null
  error: string | null
  start: () => Promise<void>
  cancel: () => void
}

const SuspectsContext = createContext<SuspectsState | null>(null)

// Estado da verificação de suspeitos (igual ao dos duplicados): sobrevive à troca de página.
export function SuspectsProvider({ children }: { children: ReactNode }) {
  const { summary } = useScan()
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<SuspectsProgress | null>(null)
  const [result, setResult] = useState<SuspectsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offs = [
      window.api.onSuspectsProgress(setProgress),
      window.api.onSuspectsDone((r) => {
        setResult(r)
        setStatus(r ? 'done' : 'idle') // null = cancelado
      }),
      window.api.onSuspectsError((msg) => {
        setError(msg)
        setStatus('error')
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Nova análise → o resultado anterior deixa de valer.
  useEffect(() => {
    setStatus('idle')
    setResult(null)
    setProgress(null)
  }, [summary])

  const start = async () => {
    setProgress(null)
    setResult(null)
    setError(null)
    setStatus('running')
    try {
      await window.api.startSuspects()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  return (
    <SuspectsContext.Provider
      value={{ status, progress, result, error, start, cancel: () => window.api.cancelSuspects() }}
    >
      {children}
    </SuspectsContext.Provider>
  )
}

export function useSuspects(): SuspectsState {
  const ctx = useContext(SuspectsContext)
  if (!ctx) throw new Error('useSuspects precisa estar dentro de <SuspectsProvider>')
  return ctx
}
