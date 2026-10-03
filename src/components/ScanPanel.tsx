import { Loader2, CheckCircle2, XCircle, ShieldAlert, Ban, History, RefreshCw } from 'lucide-react'
import { useScan } from '../lib/scan'
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '../lib/format'

// Mostra o andamento da análise e, no fim, o resumo.
export default function ScanPanel() {
  const { status, root, progress, summary, error, cancel, start } = useScan()

  if (status === 'idle') return null

  const box = 'rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0f1520]'

  if (status === 'error') {
    return (
      <div className={`${box} flex items-start gap-3 border-red-500/40`}>
        <XCircle className="h-5 w-5 shrink-0 text-red-500" />
        <div>
          <div className="font-medium">A análise falhou</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</div>
        </div>
      </div>
    )
  }

  if (status === 'running') {
    return (
      <div className={box}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
          <div className="flex-1 font-medium">Analisando {root}</div>
          <button
            onClick={cancel}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
        <Stats
          items={[
            ['Arquivos lidos', formatNumber(progress?.files ?? 0)],
            ['Pastas', formatNumber(progress?.dirs ?? 0)],
            ['Analisado', formatBytes(progress?.bytes ?? 0)],
            ['Tempo', formatDuration(progress?.elapsedMs ?? 0)],
          ]}
        />
        <div className="mt-3 truncate text-xs text-slate-500" title={progress?.currentPath}>
          {progress?.currentPath ?? 'Iniciando…'}
        </div>
      </div>
    )
  }

  // status === 'done'
  if (!summary) return null
  return (
    <div className={box}>
      {summary.cachedAt ? (
        <>
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-sky-500" />
            <div className="flex-1 font-medium">Última análise salva — {summary.root}</div>
            <button
              onClick={() => start(summary.root)}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              <RefreshCw className="h-4 w-4" /> Analisar de novo
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Resultado da análise de {formatDateTime(summary.cachedAt)}. Os arquivos podem ter mudado desde então: dá
            para ver tudo, mas para limpar é preciso analisar de novo.
          </p>
        </>
      ) : (
        <div className="flex items-center gap-3">
          {summary.cancelled ? (
            <Ban className="h-5 w-5 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          )}
          <div className="font-medium">
            {summary.cancelled ? 'Análise cancelada (resultado parcial)' : 'Análise concluída'} — {summary.root}
          </div>
        </div>
      )}
      <Stats
        items={[
          ['Arquivos', formatNumber(summary.files)],
          ['Pastas', formatNumber(summary.dirs)],
          ['Tamanho total', formatBytes(summary.bytes)],
          ['Tempo', formatDuration(summary.durationMs)],
        ]}
      />

      {summary.skippedLinks > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {formatNumber(summary.skippedLinks)} atalho(s) de pasta (links/junctions) não foram seguidos, para não
          contar nada duas vezes.
        </p>
      )}

      {summary.errorCount > 0 && (
        <details className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            {formatNumber(summary.errorCount)} item(ns) não puderam ser lidos e foram pulados.
            {summary.needsAdmin && ' Algumas pastas exigem permissão de administrador.'}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
            {summary.errorSamples.map((e, i) => (
              <li key={i} className="truncate" title={e.path}>
                <span className="font-mono text-amber-600 dark:text-amber-400">{e.code}</span> {e.path}
              </li>
            ))}
          </ul>
          {summary.needsAdmin && (
            <p className="mt-2 text-xs text-slate-500">
              O MySyS roda sem administrador por segurança e não pede elevação sozinho. Essas pastas costumam ser do
              sistema e não precisam de limpeza.
            </p>
          )}
        </details>
      )}
    </div>
  )
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  )
}
