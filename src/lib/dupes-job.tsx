import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DupesCandidatesInfo, DupesProgress, DupesResult } from '../../electron/scanner/types'
import { useScan } from './scan'

type Status = 'idle' | 'running' | 'done' | 'error'

interface DupesState {
  status: Status
  info: DupesCandidatesInfo | null // candidatos encontrados na última análise
  progress: DupesProgress | null
  result: DupesResult | null
  error: string | null
  start: () => Promise<void>
  cancel: () => void
}

const DupesContext = createContext<DupesState | null>(null)

// Estado da busca de duplicados, no topo do app (igual ao da análise):
// trocar de página no meio da busca não perde o progresso.
export function DupesProvider({ children }: { children: ReactNode }) {
  const { summary } = useScan()
  const [status, setStatus] = useState<Status>('idle')
  const [info, setInfo] = useState<DupesCandidatesInfo | null>(null)
  const [progress, setProgress] = useState<DupesProgress | null>(null)
  const [result, setResult] = useState<DupesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offs = [
      window.api.onDupesProgress(setProgress),
      window.api.onDupesDone((r) => {
        setResult(r)
        setStatus('done')
      }),
      window.api.onDupesError((msg) => {
        setError(msg)
        setStatus('error')
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Nova análise → novos candidatos; o resultado anterior deixa de valer.
  useEffect(() => {
    setStatus('idle')
    setResult(null)
    setProgress(null)
    setInfo(null)
    if (summary) window.api.getDupesInfo().then(setInfo)
  }, [summary])

  const start = async () => {
    setProgress(null)
    setResult(null)
    setError(null)
    setStatus('running')
    try {
      await window.api.startDupes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  return (
    <DupesContext.Provider
      value={{ status, info, progress, result, error, start, cancel: () => window.api.cancelDupes() }}
    >
      {children}
    </DupesContext.Provider>
  )
}

export function useDupes(): DupesState {
  const ctx = useContext(DupesContext)
  if (!ctx) throw new Error('useDupes precisa estar dentro de <DupesProvider>')
  return ctx
}
