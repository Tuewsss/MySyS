import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { JunkResult, OldResult } from '../../electron/scanner/types'
import { useScan } from '../lib/scan'
import { JUNK_INFO } from '../lib/junk'
import { formatBytes } from '../lib/format'

// Resumo do Painel após a análise: quanto dá para liberar em cada categoria.
export default function FreeableSummary() {
  const { status, summary } = useScan()
  const [junk, setJunk] = useState<JunkResult | null>(null)
  const [old, setOld] = useState<OldResult | null>(null)

  useEffect(() => {
    if (!summary) return
    window.api.getJunk().then(setJunk)
    window.api.getOld().then(setOld)
  }, [summary])

  if (status !== 'done' || !junk || !old) return null

  const rows = junk.categories.filter((c) => c.size > 0 && !JUNK_INFO[c.id].infoOnly)
  const junkTotal = rows.reduce((s, c) => s + c.size, 0)

  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      <Link
        to="/lixo"
        className="rounded-xl border border-slate-200 bg-white p-5 hover:border-sky-500/60 dark:border-slate-800 dark:bg-[#0f1520]"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Arquivos inúteis</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-1 text-2xl font-semibold">{formatBytes(junkTotal)}</div>
        <ul className="mt-3 space-y-1 text-sm">
          {rows.map((c) => (
            <li key={c.id} className="flex justify-between gap-4">
              <span className="truncate text-slate-600 dark:text-slate-400">{JUNK_INFO[c.id].title}</span>
              <span className="tabular-nums">{formatBytes(c.size)}</span>
            </li>
          ))}
          {rows.length === 0 && <li className="text-slate-500">Nada encontrado.</li>}
        </ul>
      </Link>

      <Link
        to="/antigos"
        className="rounded-xl border border-slate-200 bg-white p-5 hover:border-sky-500/60 dark:border-slate-800 dark:bg-[#0f1520]"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Arquivos antigos (+{old.days} dias)</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-1 text-2xl font-semibold">{formatBytes(old.size)}</div>
        <p className="mt-3 text-sm text-slate-500">Revise antes de limpar: antigo não quer dizer inútil.</p>
      </Link>
    </div>
  )
}
