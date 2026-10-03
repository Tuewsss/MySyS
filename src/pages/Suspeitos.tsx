import { useState } from 'react'
import { AlertTriangle, Archive, Loader2, Power, PowerOff, Rocket, ScanSearch, XCircle } from 'lucide-react'
import CleanDialog from '../components/CleanDialog'
import { pathKey, useClean } from '../lib/clean'
import type { AutostartEntry, SuspectItem } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Card from '../components/Card'
import ShowInFolderButton from '../components/ShowInFolderButton'
import RiskBadge, { riskLevel } from '../components/suspects/RiskBadge'
import DefenderButton from '../components/suspects/DefenderButton'
import Reasons from '../components/suspects/Reasons'
import { useScan } from '../lib/scan'
import { useSuspects } from '../lib/suspects-job'
import { formatDate } from '../lib/junk'
import { formatBytes, formatDuration, formatNumber } from '../lib/format'

const PAGE = 50

export default function Suspeitos() {
  const { summary, status: scanStatus } = useScan()
  const { status, progress, result, error, start, cancel } = useSuspects()
  const { removed } = useClean()
  const [showLow, setShowLow] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const header = (
    <>
      <PageHeader title="Suspeitos" subtitle="Arquivos com características de risco. O MySyS não é um antivírus." />
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>Suspeito não significa vírus.</strong> São sinais comuns em arquivos mal-intencionados, mas muitos
          programas legítimos também os têm. Na dúvida, verifique com o Windows Defender e envie para quarentena em vez
          de apagar.
        </div>
      </div>
    </>
  )

  if (!summary) {
    return (
      <>
        {header}
        <EmptyState>Faça uma análise no Painel para verificar arquivos suspeitos.</EmptyState>
      </>
    )
  }

  const items = (result?.items ?? []).filter((i) => !removed.has(pathKey(i.path)))
  const lowCount = items.filter((i) => riskLevel(i.score) === 'baixo').length
  const visible = showLow ? items : items.filter((i) => riskLevel(i.score) !== 'baixo')

  return (
    <>
      {header}

      {status !== 'running' && (
        <Card>
          <div className="flex items-start gap-4">
            <ScanSearch className="mt-1 h-6 w-6 shrink-0 text-sky-500" />
            <div className="flex-1 text-sm text-slate-600 dark:text-slate-300">
              <p>
                O MySyS confere executáveis e scripts em lugares de risco (Temp, AppData\Roaming, Downloads), nomes
                enganosos como <code>foto.jpg.exe</code>, assinatura digital, arquivos ocultos e o que roda sozinho
                quando o Windows inicia. Nada é alterado.
              </p>
              {result && (
                <p className="mt-2 text-xs text-slate-500">
                  Última verificação: {formatNumber(items.length)} arquivo(s) e {formatNumber(result.autostart.length)}{' '}
                  item(ns) de inicialização em {formatDuration(result.durationMs)}.
                  {result.dropped > 0 && ` ${formatNumber(result.dropped)} candidato(s) além do limite não foram verificados.`}
                </p>
              )}
            </div>
            <button
              onClick={start}
              disabled={scanStatus === 'running'}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              <ScanSearch className="h-4 w-4" />
              {result ? 'Verificar de novo' : 'Verificar suspeitos'}
            </button>
          </div>
        </Card>
      )}

      {status === 'running' && (
        <Card>
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
            <div className="flex-1 font-medium">{progress?.step ?? 'Iniciando…'}</div>
            <button
              onClick={cancel}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
          {progress && progress.total > 0 && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <div className="mt-2 text-xs text-slate-500 tabular-nums">
                {formatNumber(progress.done)} de {formatNumber(progress.total)} arquivos
              </div>
            </>
          )}
        </Card>
      )}

      {status === 'error' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/40 p-4 text-sm">
          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
          <div>A verificação falhou: {error}</div>
        </div>
      )}

      {status === 'done' && result && (
        <>
          <Card
            title={`Arquivos (${formatNumber(visible.length)})`}
            subtitle="Do mais arriscado para o menos. Cada linha mostra os motivos da pontuação."
          >
            {lowCount > 0 && (
              <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                Mostrar também os de risco baixo ({formatNumber(lowCount)})
              </label>
            )}
            {visible.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum arquivo com risco médio ou alto. 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {visible.slice(0, limit).map((item) => (
                  <SuspectRow key={item.path} item={item} />
                ))}
              </ul>
            )}
            {visible.length > limit && (
              <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-sm text-sky-600 hover:underline dark:text-sky-400">
                Mostrar mais ({formatNumber(visible.length - limit)} restantes)
              </button>
            )}
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-sky-500" /> Inicialização automática ({formatNumber(result.autostart.length)})
              </span>
            }
            subtitle="Programas que rodam sozinhos quando o Windows liga. O MySyS só lista: para desativar, use o Gerenciador de Tarefas → Aplicativos de inicialização."
          >
            {result.autostart.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum programa encontrado.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {result.autostart.map((e, i) => (
                  <AutostartRow key={`${e.source}-${e.name}-${i}`} entry={e} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function SuspectRow({ item }: { item: SuspectItem }) {
  const name = item.path.split('\\').pop()
  const [dialog, setDialog] = useState(false)
  return (
    <li className="py-3">
      {dialog && (
        <CleanDialog
          title={`Remover ${name}`}
          source="Suspeitos"
          targets={[{ path: item.path, kind: 'file', size: item.size }]}
          defaultAction="quarentena"
          onClose={() => setDialog(false)}
        />
      )}
      <div className="flex items-center gap-3">
        <RiskBadge score={item.score} />
        <span className="min-w-0 flex-1 truncate font-medium" title={item.path}>
          {name}
        </span>
        <span className="shrink-0 text-xs text-slate-500">
          {formatBytes(item.size)} · {formatDate(item.mtimeMs)}
        </span>
        <ShowInFolderButton path={item.path} />
      </div>
      <div className="mt-1 truncate pl-1 text-xs text-slate-500" title={item.path}>
        {item.path}
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3 pl-1">
        <Reasons reasons={item.reasons} />
        <div className="flex flex-wrap items-start gap-2">
          <DefenderButton path={item.path} />
          <button
            onClick={() => setDialog(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Archive className="h-3.5 w-3.5" /> Enviar para quarentena
          </button>
        </div>
      </div>
    </li>
  )
}

function AutostartRow({ entry }: { entry: AutostartEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
        <RiskBadge score={entry.score} />
        <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
        {entry.enabled === false ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
            <PowerOff className="h-3.5 w-3.5" /> Desativado
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
            <Power className="h-3.5 w-3.5" /> Ativo
          </span>
        )}
        <span className="w-44 shrink-0 truncate text-right text-xs text-slate-500" title={entry.source}>
          {entry.source}
        </span>
      </button>
      <div className="mt-1 truncate pl-1 font-mono text-xs text-slate-500" title={entry.command}>
        {entry.command}
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3 pl-1">
          <div className="space-y-2">
            <Reasons reasons={entry.reasons} />
            <div className="text-xs text-slate-500">Programa: {entry.target}</div>
          </div>
          <div className="flex items-center gap-2">
            <DefenderButton path={entry.target} />
            <ShowInFolderButton path={entry.target} />
          </div>
        </div>
      )}
    </li>
  )
}
