import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ScanProgress, ScanSummary } from '../../electron/scanner/types'

type Status = 'idle' | 'running' | 'done' | 'error'

interface ScanState {
  status: Status
  root: string | null
  progress: ScanProgress | null
  summary: ScanSummary | null
  error: string | null
  start: (root: string) => Promise<void>
  cancel: () => void
}

const ScanContext = createContext<ScanState | null>(null)

// O estado da varredura fica num "contexto" no topo do app.
// Assim, se você trocar de página durante a análise, o progresso não se perde.
export function ScanProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('idle')
  const [root, setRoot] = useState<string | null>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Se o usuário já começou uma análise, o cache que chegar depois é ignorado.
  const startedRef = useRef(false)

  // Ao abrir o app, mostra a última análise salva (se houver).
  // As páginas reagem ao `summary` e buscam os dados no main.
  useEffect(() => {
    window.api
      .getLastScan()
      .then((s) => {
        if (!s || startedRef.current) return
        setRoot(s.root)
        setSummary(s)
        setStatus('done')
      })
      .catch(() => {}) // sem cache: o app só começa vazio
  }, [])

  useEffect(() => {
    // Cada "on..." devolve uma função de limpeza; o React a chama ao desmontar.
    const offs = [
      window.api.onScanProgress(setProgress),
      window.api.onScanDone((s) => {
        setSummary(s)
        setStatus('done')
      }),
      window.api.onScanError((msg) => {
        setError(msg)
        setStatus('error')
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const start = async (path: string) => {
    startedRef.current = true
    setRoot(path)
    setProgress(null)
    setSummary(null)
    setError(null)
    setStatus('running')
    try {
      await window.api.startScan(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  const cancel = () => {
    window.api.cancelScan()
  }

  return (
    <ScanContext.Provider value={{ status, root, progress, summary, error, start, cancel }}>
      {children}
    </ScanContext.Provider>
  )
}

export function useScan(): ScanState {
  const ctx = useContext(ScanContext)
  if (!ctx) throw new Error('useScan precisa estar dentro de <ScanProvider>')
  return ctx
}
