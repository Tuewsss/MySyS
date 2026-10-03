import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Cloud, Code2, Copy, Loader2, Search, Trash2, XCircle } from 'lucide-react'
import type { DupeGroup } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import CleanDialog, { type DialogTarget } from '../components/CleanDialog'
import { pathKey, useClean } from '../lib/clean'
import EmptyState from '../components/EmptyState'
import Card from '../components/Card'
import GameDataBadge from '../components/GameDataBadge'
import ShowInFolderButton from '../components/ShowInFolderButton'
import { useScan } from '../lib/scan'
import { useDupes } from '../lib/dupes-job'
import { canSelect, initialSelection, pickKeeper, selectedBytes } from '../lib/dupes'
import { formatDate } from '../lib/junk'
import { formatBytes, formatDuration, formatNumber } from '../lib/format'

const GROUPS_PAGE = 30

export default function Duplicados() {
  const { summary, status: scanStatus } = useScan()
  const { status, info, result, error, start } = useDupes()
  const { removed } = useClean()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(GROUPS_PAGE)
  const [dialog, setDialog] = useState(false)

  // Grupos sem os arquivos já limpos nesta sessão (grupo com 1 arquivo some).
  const groups = useMemo(
    () =>
      (result?.groups ?? [])
        .map((g) => ({ ...g, files: g.files.filter((f) => !removed.has(pathKey(f.path))) }))
        .filter((g) => g.files.length >= 2),
    [result, removed],
  )

  // Novo resultado → sugere a seleção (todas as cópias menos uma por grupo).
  useEffect(() => {
    setSelected(result ? initialSelection(result.groups) : new Set())
    setLimit(GROUPS_PAGE)
  }, [result])

  const freed = useMemo(() => selectedBytes(groups, selected), [groups, selected])
  const targets: DialogTarget[] = groups.flatMap((g) =>
    g.files.filter((f) => selected.has(f.path)).map((f) => ({ path: f.path, kind: 'file' as const, size: g.size })),
  )

  if (!summary || !info) {
    return (
      <>
        <PageHeader title="Duplicados" subtitle="Arquivos com conteúdo idêntico em mais de um lugar." />
        <EmptyState>Faça uma análise no Painel para procurar duplicados.</EmptyState>
      </>
    )
  }

  const toggle = (group: DupeGroup, path: string) => {
    if (!canSelect(group, selected, path)) return
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
  }

  return (
    <>
      <PageHeader
        title="Duplicados"
        subtitle={`Arquivos de ${formatBytes(info.minSize)} ou mais com conteúdo idêntico, em ${summary.root}.`}
      />

      {status !== 'running' && (
        <Card>
          <div className="flex items-start gap-4">
            <Copy className="mt-1 h-6 w-6 shrink-0 text-sky-500" />
            <div className="flex-1 text-sm text-slate-600 dark:text-slate-300">
              {info.groups === 0 ? (
                <p>Nenhum arquivo com tamanho repetido foi encontrado, então não há duplicados.</p>
              ) : (
                <>
                  <p>
                    A análise encontrou <strong>{formatNumber(info.files)} arquivos</strong> com tamanhos repetidos (
                    {formatBytes(info.bytes)}). Para saber se são iguais de verdade, o MySyS compara o conteúdo em duas
                    etapas: primeiro o começo de cada arquivo (rápido) e depois, só dos parecidos, o arquivo inteiro
                    (SHA-256).
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Ficam de fora: sistema, programas, jogos instalados, AppData e o que já aparece em Lixo.
                  </p>
                </>
              )}
              {info.cloudSkipped > 0 && (
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Cloud className="h-3.5 w-3.5" />
                  {formatNumber(info.cloudSkipped)} arquivo(s) do OneDrive estão só na nuvem e não serão lidos (ler
                  faria o OneDrive baixá-los).
                </p>
              )}
            </div>
            {info.groups > 0 && (
              <button
                onClick={start}
                disabled={scanStatus === 'running'}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                <Search className="h-4 w-4" />
                {result ? 'Procurar de novo' : 'Procurar duplicados'}
              </button>
            )}
          </div>
        </Card>
      )}

      {status === 'running' && <ProgressCard />}

      {status === 'error' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/40 p-4 text-sm">
          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
          <div>A busca falhou: {error}</div>
        </div>
      )}

      {status === 'done' && result && (
        <>
          {result.cancelled ? (
            <p className="mb-6 text-sm text-amber-600 dark:text-amber-400">Busca cancelada.</p>
          ) : (
            <>
              <div className="sticky -top-8 z-10 -mx-8 mb-4 border-b border-slate-200 bg-slate-50/95 px-8 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0b0f17]/95">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-slate-500">
                      {formatNumber(groups.length)} grupo(s) · {formatBytes(result.wasted)} em cópias extras · busca
                      em {formatDuration(result.durationMs)}
                    </div>
                    <div className="text-xl font-semibold tabular-nums">{formatBytes(freed)} selecionados</div>
                  </div>
                  <button
                    disabled={targets.length === 0}
                    onClick={() => setDialog(true)}
                    className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" /> Limpar
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Cada grupo sempre mantém pelo menos uma cópia. Saves de jogos, arquivos de projetos de código e do
                  OneDrive não vêm marcados.
                </p>
              </div>

              {dialog && (
                <CleanDialog
                  title="Limpar duplicados"
                  source="Duplicados"
                  targets={targets}
                  onClose={() => setDialog(false)}
                />
              )}

              {result.errorCount > 0 && (
                <p className="mb-4 text-xs text-slate-500">
                  {formatNumber(result.errorCount)} arquivo(s) não puderam ser lidos (em uso ou sem permissão) e
                  ficaram de fora.
                </p>
              )}

              {groups.length === 0 ? (
                <EmptyState>
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                  {result.groups.length === 0
                    ? 'Nenhum duplicado encontrado: os arquivos de mesmo tamanho têm conteúdos diferentes.'
                    : 'Todos os duplicados foram resolvidos.'}
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  {groups.slice(0, limit).map((g) => (
                    <GroupCard key={g.hash + g.size} group={g} selected={selected} onToggle={(p) => toggle(g, p)} />
                  ))}
                  {groups.length > limit && (
                    <button
                      onClick={() => setLimit(limit + GROUPS_PAGE)}
                      className="text-sm text-sky-600 hover:underline dark:text-sky-400"
                    >
                      Mostrar mais grupos ({formatNumber(groups.length - limit)} restantes)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

function ProgressCard() {
  const { progress, cancel } = useDupes()
  const pct = progress && progress.bytesTotal > 0 ? (progress.bytesDone / progress.bytesTotal) * 100 : 0
  const stageLabel =
    progress?.stage === 2
      ? 'Etapa 2 de 2: conferindo o arquivo inteiro (SHA-256)'
      : 'Etapa 1 de 2: comparando o começo dos arquivos'

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
        <div className="flex-1 font-medium">{stageLabel}</div>
        <button
          onClick={cancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500 tabular-nums">
        <span>
          {formatNumber(progress?.filesDone ?? 0)} de {formatNumber(progress?.filesTotal ?? 0)} arquivos ·{' '}
          {formatBytes(progress?.bytesDone ?? 0)} de {formatBytes(progress?.bytesTotal ?? 0)}
        </span>
        <span>{formatDuration(progress?.elapsedMs ?? 0)}</span>
      </div>
      <div className="mt-2 truncate text-xs text-slate-500" title={progress?.currentPath}>
        {progress?.currentPath || 'Iniciando…'}
      </div>
    </Card>
  )
}

function GroupCard({
  group,
  selected,
  onToggle,
}: {
  group: DupeGroup
  selected: Set<string>
  onToggle: (path: string) => void
}) {
  const keep = pickKeeper(group.files)
  const name = group.files[0].path.split('\\').pop()

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Copy className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
          {name}
        </span>
        <span className="shrink-0 text-xs text-slate-500">
          {group.files.length} cópias de {formatBytes(group.size)}
        </span>
        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
          {formatBytes(group.size * (group.files.length - 1))}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 px-4 dark:divide-slate-800/60">
        {group.files.map((f, i) => {
          const checked = selected.has(f.path)
          const allowed = canSelect(group, selected, f.path)
          return (
            <li key={f.path} className="flex items-center gap-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                disabled={!allowed}
                onChange={() => onToggle(f.path)}
                title={allowed ? undefined : 'Pelo menos uma cópia precisa ficar'}
                aria-label={`Selecionar ${f.path}`}
                className="h-4 w-4 shrink-0 accent-sky-600 disabled:opacity-40"
              />
              <span className="min-w-0 flex-1 truncate" title={f.path}>
                {f.path}
              </span>
              <GameDataBadge kind={f.gameData} />
              {f.inProject && (
                <span
                  title="Está dentro de um projeto de código. Arquivos repetidos ali costumam ser de propósito; apagar pode quebrar o projeto."
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300"
                >
                  <Code2 className="h-3 w-3" /> Projeto de código
                </span>
              )}
              {i === keep && (
                <span
                  title="Sugestão: parece ser o original (fora de Downloads, mais antigo)."
                  className="shrink-0 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                >
                  Manter
                </span>
              )}
              <span className="shrink-0 text-xs text-slate-500">{formatDate(f.mtimeMs)}</span>
              <ShowInFolderButton path={f.path} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
