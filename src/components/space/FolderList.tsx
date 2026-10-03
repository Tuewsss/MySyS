import { Folder, Files, MoreHorizontal } from 'lucide-react'
import type { FolderEntry } from '../../../electron/scanner/types'
import { CATEGORY_LABELS, categoryColor } from '../../lib/categories'
import { formatBytes, formatNumber } from '../../lib/format'

type Props = {
  entries: FolderEntry[]
  total: number
  category: number | null
  onOpen: (path: string) => void
}

const ICONS = { dir: Folder, files: Files, rest: MoreHorizontal }

// Lista do conteúdo da pasta, do maior para o menor.
// É também a "versão em tabela" do treemap, com os números exatos.
export default function FolderList({ entries, total, category, onOpen }: Props) {
  const max = entries[0]?.size ?? 0
  if (entries.length === 0) return null

  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {entries.map((e, i) => {
        const Icon = ICONS[e.kind]
        const clickable = e.kind === 'dir'
        const pct = total > 0 ? (e.size / total) * 100 : 0
        return (
          <button
            key={`${e.kind}-${e.name}-${i}`}
            disabled={!clickable}
            onClick={() => onOpen(e.path)}
            title={clickable ? `Abrir ${e.path}` : undefined}
            className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_3.5rem] items-center gap-4 px-2 py-2 text-left text-sm enabled:hover:bg-slate-100 disabled:cursor-default dark:enabled:hover:bg-slate-800/60"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${clickable ? 'text-sky-500' : 'text-slate-400'}`} />
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatNumber(e.files)} arq.</span>
            </span>
            <SizeBar entry={e} max={max} category={category} />
            <span className="text-right tabular-nums">{formatBytes(e.size)}</span>
            <span className="text-right text-xs text-slate-500 tabular-nums">
              {pct.toLocaleString('pt-BR', { maximumFractionDigits: pct < 10 ? 1 : 0 })}%
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Barra proporcional ao tamanho, dividida por tipo de arquivo (sem filtro)
// ou de uma cor só (com filtro). Passar o mouse mostra a divisão em texto.
function SizeBar({ entry, max, category }: { entry: FolderEntry; max: number; category: number | null }) {
  const width = max > 0 ? (entry.size / max) * 100 : 0
  const segments =
    category === null
      ? entry.sizes.map((s, k) => ({ k, s })).filter(({ s }) => s > 0)
      : [{ k: category, s: entry.size }]
  const breakdown = segments
    .slice()
    .sort((a, b) => b.s - a.s)
    .map(({ k, s }) => `${CATEGORY_LABELS[k]}: ${formatBytes(s)}`)
    .join('\n')

  return (
    <span className="h-2.5 w-full" title={breakdown}>
      <span className="flex h-full gap-[2px] overflow-hidden rounded" style={{ width: `${Math.max(width, 0.5)}%` }}>
        {segments.map(({ k, s }) => (
          <span key={k} className="h-full" style={{ flexGrow: s, flexBasis: 0, background: categoryColor(k) }} />
        ))}
      </span>
    </span>
  )
}
