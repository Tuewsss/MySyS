import { FolderOpen } from 'lucide-react'

// Abre o Explorador com o item selecionado. Só abre: não altera nada.
export default function ShowInFolderButton({ path }: { path: string }) {
  return (
    <button
      onClick={() => window.api.showInFolder(path)}
      title="Mostrar no Explorador"
      aria-label="Mostrar no Explorador"
      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-sky-500 dark:hover:bg-slate-800"
    >
      <FolderOpen className="h-4 w-4" />
    </button>
  )
}
