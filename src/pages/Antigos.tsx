import { useEffect, useState } from 'react'
import { Folder, Gamepad2, Info, Trash2 } from 'lucide-react'
import type { OldResult } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import CleanDialog, { type DialogTarget } from '../components/CleanDialog'
import { pathKey, useClean } from '../lib/clean'
import EmptyState from '../components/EmptyState'
import Card from '../components/Card'
import ShowInFolderButton from '../components/ShowInFolderButton'
import TopFilesTable from '../components/space/TopFilesTable'
import GameDataBadge, { isSaveLike } from '../components/GameDataBadge'
import { useScan } from '../lib/scan'
import { formatDate } from '../lib/junk'
import { formatBytes, formatNumber } from '../lib/format'

const PAGE = 50

export default function Antigos() {
  const { summary } = useScan()
  const [old, setOld] = useState<OldResult | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [hideSaves, setHideSaves] = useState(false)
  const { removed } = useClean()
  const [selFolders, setSelFolders] = useState<Set<string>>(new Set())
  const [selFiles, setSelFiles] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState(false)

  useEffect(() => {
    if (!summary) return
    window.api.getOld().then(setOld)
    setLimit(PAGE)
    setSelFolders(new Set())
    setSelFiles(new Set())
  }, [summary])

  if (!summary || !old) {
    return (
      <>
        <PageHeader title="Arquivos antigos" subtitle="Arquivos que não são modificados há muito tempo." />
        <EmptyState>Faça uma análise no Painel para listar arquivos antigos.</EmptyState>
      </>
    )
  }

  const savesSize = old.games.save.size + old.games['possivel-save'].size
  const notRemoved = (p: string) => !removed.has(pathKey(p))
  const folders = old.folders.filter((f) => notRemoved(f.path) && !(hideSaves && isSaveLike(f.gameData)))
  const largest = old.largest.filter((f) => notRemoved(f.path) && !(hideSaves && isSaveLike(f.gameData)))

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (p: string) => {
    const next = new Set(set)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setter(next)
  }
  // Nada vem marcado: antigo não quer dizer inútil.
  const targets: DialogTarget[] = [
    ...folders.filter((f) => selFolders.has(f.path)).map((f) => ({ path: f.path, kind: 'old-files' as const, size: f.size })),
    ...largest.filter((f) => selFiles.has(f.path)).map((f) => ({ path: f.path, kind: 'file' as const, size: f.size })),
  ]
  const selectedSize = targets.reduce((s, t) => s + t.size, 0)

  return (
    <>
      <PageHeader title="Arquivos antigos" subtitle={`Arquivos sem modificação há mais de ${old.days} dias em ${summary.root}.`} />

      <div className="sticky -top-8 z-10 -mx-8 mb-4 border-b border-slate-200 bg-slate-50/95 px-8 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0b0f17]/95">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-slate-500">Selecionado para limpar (nada vem marcado: revise antes)</div>
            <div className="text-xl font-semibold tabular-nums">{formatBytes(selectedSize)}</div>
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
          Ao marcar uma pasta, saem só os arquivos antigos que estão direto nela; os recentes e as subpastas ficam.
        </p>
      </div>

      {dialog && (
        <CleanDialog
          title="Limpar arquivos antigos"
          source="Antigos"
          targets={targets}
          onClose={() => {
            setDialog(false)
            setSelFolders(new Set())
            setSelFiles(new Set())
          }}
        />
      )}

      <div className="mb-6 flex gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <div>
          Usamos a <strong>data de modificação</strong>. A data de "último acesso" do Windows não é confiável: ele pode
          não atualizá-la, ou atualizar quando um antivírus lê o arquivo. Ficam de fora o sistema e os programas (Windows,
          Program Files), os dados internos deles (AppData, ProgramData, pastas como .vscode) e o que já aparece em
          Lixo. Antigo não quer dizer inútil: revise antes de limpar.
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Total em arquivos antigos" value={formatBytes(old.size)} />
        <Stat label="Quantidade de arquivos" value={formatNumber(old.files)} />
        <Stat label="Saves de jogos (certos + prováveis)" value={formatBytes(savesSize)} />
      </div>

      {savesSize > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          <Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="flex-1">
            <strong>{formatBytes(savesSize)}</strong> dos arquivos antigos parecem ser <strong>saves de jogos</strong>.
            Eles guardam seu progresso e ocupam pouco espaço: o DSS nunca vai marcá-los para limpeza automaticamente.
            {old.games.gravacao.size > 0 && (
              <> Já as gravações e replays de jogos ({formatBytes(old.games.gravacao.size)}) não guardam progresso.</>
            )}
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hideSaves}
                onChange={(e) => setHideSaves(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Esconder saves de jogos das listas abaixo
            </label>
          </div>
        </div>
      )}

      <Card title="Pastas com mais arquivos antigos" subtitle="Soma só dos arquivos antigos que estão direto em cada pasta.">
        {folders.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum arquivo antigo encontrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {folders.slice(0, limit).map((f) => (
              <li key={f.path} className="flex items-center gap-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selFolders.has(f.path)}
                  onChange={() => toggle(selFolders, setSelFolders)(f.path)}
                  aria-label={`Selecionar arquivos antigos de ${f.path}`}
                  className="h-4 w-4 shrink-0 accent-sky-600"
                />
                <Folder className="h-4 w-4 shrink-0 text-sky-500" />
                <span className="min-w-0 flex-1 truncate" title={f.path}>
                  {f.path}
                </span>
                <GameDataBadge kind={f.gameData} />
                <span className="shrink-0 text-xs text-slate-500">
                  {formatNumber(f.files)} arq. · mais recente {formatDate(f.newestMtimeMs)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">{formatBytes(f.size)}</span>
                <ShowInFolderButton path={f.path} />
              </li>
            ))}
          </ul>
        )}
        {folders.length > limit && (
          <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-sm text-sky-600 hover:underline dark:text-sky-400">
            Mostrar mais ({formatNumber(folders.length - limit)} restantes)
          </button>
        )}
        {old.foldersTruncated > 0 && limit >= folders.length && (
          <p className="mt-2 text-xs text-slate-500">
            + {formatNumber(old.foldersTruncated)} pastas menores não listadas (já incluídas no total).
          </p>
        )}
      </Card>

      <Card title="100 maiores arquivos antigos">
        <TopFilesTable files={largest} selected={selFiles} onToggle={toggle(selFiles, setSelFiles)} />
      </Card>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}
