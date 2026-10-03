import { useState } from 'react'
import { Loader2, ShieldAlert, ShieldCheck, ShieldX, Shield } from 'lucide-react'
import type { DefenderResult } from '../../../electron/scanner/types'

// Verifica UM arquivo com o Windows Defender e mostra o resultado ali mesmo.
export default function DefenderButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'running' | DefenderResult>('idle')

  const run = async () => {
    setState('running')
    try {
      setState(await window.api.scanWithDefender(path))
    } catch (e) {
      setState({ status: 'erro', threats: [], message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={run}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <Shield className="h-3.5 w-3.5" /> Verificar com o Defender
      </button>
    )
  }
  if (state === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando com o Defender…
      </span>
    )
  }
  if (state.status === 'limpo') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3.5 w-3.5" /> {state.message}
      </span>
    )
  }
  if (state.status === 'ameaca') {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="h-3.5 w-3.5" /> {state.message}
        </div>
        {state.threats.length > 0 && <div className="mt-1">Ameaça: {state.threats.join(', ')}</div>}
        <div className="mt-1 text-slate-600 dark:text-slate-400">
          Use "Enviar para quarentena" ao lado, ou a Segurança do Windows → Proteção contra vírus e ameaças.
        </div>
      </div>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" title={state.message}>
      <ShieldX className="h-3.5 w-3.5" /> {state.message}
    </span>
  )
}
