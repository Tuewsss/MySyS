import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CleanProgress, CleanReport, CleanRequest } from '../../electron/scanner/types'
import { useScan } from './scan'

interface CleanState {
  running: boolean
  progress: CleanProgress | null
  /** Caminhos (em minúsculas) já removidos nesta sessão: as páginas os escondem. */
  removed: Set<string>
  run: (req: CleanRequest) => Promise<CleanReport>
  cancel: () => void
}

const CleanContext = createContext<CleanState | null>(null)

export const pathKey = (p: string) => p.toLowerCase()

export function CleanProvider({ children }: { children: ReactNode }) {
  const { summary } = useScan()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<CleanProgress | null>(null)
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  useEffect(() => window.api.onCleanProgress(setProgress), [])
  // Nova análise: os números já refletem o que foi limpo.
  useEffect(() => setRemoved(new Set()), [summary])

  const run = async (req: CleanRequest) => {
    setRunning(true)
    setProgress(null)
    try {
      const report = await window.api.runClean(req)
      if (!report.dryRun) {
        const next = new Set(removed)
        for (const it of report.items) if (it.status === 'ok') next.add(pathKey(it.path))
        setRemoved(next)
      }
      return report
    } finally {
      setRunning(false)
    }
  }

  return (
    <CleanContext.Provider value={{ running, progress, removed, run, cancel: () => window.api.cancelClean() }}>
      {children}
    </CleanContext.Provider>
  )
}

export function useClean(): CleanState {
  const ctx = useContext(CleanContext)
  if (!ctx) throw new Error('useClean precisa estar dentro de <CleanProvider>')
  return ctx
}
