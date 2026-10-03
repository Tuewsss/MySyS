import type { TopFile } from '../../../electron/scanner/types'
import { CATEGORY_LABELS, categoryColor } from '../../lib/categories'
import { formatBytes } from '../../lib/format'
import { formatDate } from '../../lib/junk'
import ShowInFolderButton from '../ShowInFolderButton'
import GameDataBadge from '../GameDataBadge'

type Props = {
  files: TopFile[]
  // Opcional: caixas de seleção (usado na página Antigos).
  selected?: Set<string>
  onToggle?: (path: string) => void
}

export default function TopFilesTable({ files, selected, onToggle }: Props) {
  if (files.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum arquivo deste tipo foi encontrado.</p>
  }

  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
          {onToggle && <th className="w-8 py-2" />}
          <th className="w-8 py-2 font-normal">#</th>
          <th className="py-2 font-normal">Arquivo</th>
          <th className="w-32 py-2 font-normal">Tipo</th>
          <th className="w-24 py-2 font-normal">Modificado</th>
          <th className="w-24 py-2 text-right font-normal">Tamanho</th>
          <th className="w-10 py-2" />
        </tr>
      </thead>
      <tbody>
        {files.map((f, i) => {
          const sep = f.path.lastIndexOf('\\')
          const name = f.path.slice(sep + 1)
          const dir = f.path.slice(0, sep)
          return (
            <tr key={f.path} className="border-b border-slate-100 dark:border-slate-800/60">
              {onToggle && (
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={selected?.has(f.path) ?? false}
                    onChange={() => onToggle(f.path)}
                    aria-label={`Selecionar ${f.path}`}
                    className="h-4 w-4 accent-sky-600"
                  />
                </td>
              )}
              <td className="py-2 text-xs text-slate-500 tabular-nums">{i + 1}</td>
              <td className="min-w-0 py-2 pr-4" title={f.path}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{name}</span>
                  <GameDataBadge kind={f.gameData} />
                </div>
                <div className="truncate text-xs text-slate-500">{dir}</div>
              </td>
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: categoryColor(f.category) }} />
                  {CATEGORY_LABELS[f.category]}
                </span>
              </td>
              <td className="py-2 text-slate-500 tabular-nums">{formatDate(f.mtimeMs)}</td>
              <td className="py-2 text-right tabular-nums">{formatBytes(f.size)}</td>
              <td className="py-2 text-right">
                <ShowInFolderButton path={f.path} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
