import { useCallback, useEffect, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import type { CleanAction, CleanReport, QuarantineEntry } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Card from '../components/Card'
import { useClean } from '../lib/clean'
import { formatBytes, formatNumber } from '../lib/format'

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const ACTION_LABEL: Record<CleanAction, { label: string; icon: typeof Trash2 }> = {
  lixeira: { label: 'Lixeira', icon: Trash2 },
  quarentena: { label: 'Quarentena', icon: Archive },
  apagar: { label: 'Apagado permanentemente', icon: ShieldAlert },
}

export default function Historico() {
  const { running } = useClean()
  const [history, setHistory] = useState<CleanReport[] | null>(null)
  const [quarantine, setQuarantine] = useState<QuarantineEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    window.api.getHistory().then(setHistory)
    window.api.getQuarantine().then(setQuarantine)
  }, [])

  // Recarrega ao abrir a página e sempre que uma limpeza terminar.
  useEffect(() => {
    if (!running) load()
  }, [running, load])

  const undo = async (r: CleanReport) => {
    const res = await window.api.undoClean(r.id)
    setMessage(
      `${formatNumber(res.restored)} arquivo(s) restaurado(s).` + (res.failed.length ? ` Falhas: ${res.failed.join(' ')}` : ''),
    )
    load()
  }

  const restore = async (e: QuarantineEntry) => {
    const res = await window.api.restoreFromQuarantine(e.id)
    setMessage(res.message)
    load()
  }

  return (
    <>
      <PageHeader title="Histórico" subtitle="Limpezas feitas pelo MySyS, com opção de desfazer o que foi para a quarentena." />

      {message && (
        <div className="mb-4 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm">{message}</div>
      )}

      <Card
        title={`Quarentena (${formatNumber(quarantine.length)})`}
        subtitle="Arquivos isolados pelo MySyS. Eles não podem ser abertos por engano e podem voltar para o lugar original."
      >
        {quarantine.length === 0 ? (
          <p className="text-sm text-slate-500">A quarentena está vazia.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {quarantine.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <Archive className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate" title={e.originalPath}>
                  {e.originalPath}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{dateTime.format(e.date)}</span>
                <span className="w-20 shrink-0 text-right tabular-nums">{formatBytes(e.size)}</span>
                <button
                  onClick={() => restore(e)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 font-medium">Limpezas</h2>
      {!history || history.length === 0 ? (
        <EmptyState>Nenhuma limpeza realizada ainda.</EmptyState>
      ) : (
        <div className="space-y-3">
          {history.map((r) => (
            <ReportRow key={r.id} report={r} onUndo={() => undo(r)} />
          ))}
        </div>
      )}
    </>
  )
}

function ReportRow({ report, onUndo }: { report: CleanReport; onUndo: () => void }) {
  const [open, setOpen] = useState(false)
  const { label, icon: Icon } = ACTION_LABEL[report.action]
  const canUndo = report.items.some((i) => i.quarantineId && !i.restored)

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <div className="font-medium">
              {report.source} · {label}
            </div>
            <div className="text-xs text-slate-500">
              {dateTime.format(report.date)} · {formatNumber(report.files)} arquivo(s)
              {report.failed > 0 && ` · ${formatNumber(report.failed)} pulado(s)`}
              {report.cancelled && ' · cancelada no meio'}
            </div>
          </div>
        </button>
        <span className="shrink-0 font-semibold tabular-nums">{formatBytes(report.bytes)}</span>
        {canUndo ? (
          <button
            onClick={onUndo}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Desfazer
          </button>
        ) : report.action === 'lixeira' ? (
          <span className="shrink-0 text-xs text-slate-500" title="Abra a Lixeira do Windows e use Restaurar">
            Restaure pela Lixeira
          </span>
        ) : null}
      </div>
      {open && (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200 px-4 text-xs dark:divide-slate-800/60 dark:border-slate-800">
          {report.items.map((i, k) => (
            <li key={k} className="flex gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate" title={i.path}>
                {i.path}
              </span>
              {i.reason && <span className="shrink-0 text-slate-500">{i.reason}</span>}
              {i.restored && <span className="shrink-0 text-emerald-600">restaurado</span>}
              <span className="w-16 shrink-0 text-right tabular-nums">{formatBytes(i.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
