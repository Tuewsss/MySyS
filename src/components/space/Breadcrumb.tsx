import { ChevronRight } from 'lucide-react'

type Props = { rootPath: string; path: string; onNavigate: (p: string) => void }

// Mostra "C:\ › Users › ana" e deixa voltar clicando em qualquer parte.
export default function Breadcrumb({ rootPath, path, onNavigate }: Props) {
  const rel = path.slice(rootPath.length).replace(/^\\+/, '')
  const parts = rel ? rel.split('\\') : []

  const crumbs = [{ label: rootPath, path: rootPath }]
  let acc = rootPath
  for (const part of parts) {
    acc = acc.endsWith('\\') ? acc + part : `${acc}\\${part}`
    crumbs.push({ label: part, path: acc })
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
            {last ? (
              <span className="font-medium">{c.label}</span>
            ) : (
              <button onClick={() => onNavigate(c.path)} className="text-sky-600 hover:underline dark:text-sky-400">
                {c.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
