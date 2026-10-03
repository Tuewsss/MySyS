import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import type { FolderView, TopFile } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import Breadcrumb from '../components/space/Breadcrumb'
import CategoryFilter from '../components/space/CategoryFilter'
import SpaceTreemap from '../components/space/SpaceTreemap'
import FolderList from '../components/space/FolderList'
import TopFilesTable from '../components/space/TopFilesTable'
import { useScan } from '../lib/scan'
import { CATEGORY_LABELS } from '../lib/categories'
import { formatBytes, formatNumber } from '../lib/format'

export default function Espaco() {
  const { summary } = useScan()
  const [path, setPath] = useState<string | null>(null) // null = raiz da análise
  const [category, setCategory] = useState<number | null>(null)
  const [view, setView] = useState<FolderView | null>(null)
  const [topFiles, setTopFiles] = useState<TopFile[]>([])

  // Nova análise → volta para a raiz.
  useEffect(() => setPath(null), [summary])

  // Busca a pasta atual sempre que muda a pasta, o filtro ou a análise.
  // A flag "stale" descarta respostas antigas se o usuário clicar rápido.
  useEffect(() => {
    if (!summary) return
    let stale = false
    window.api.getFolder(path, category).then((v) => {
      if (!stale) setView(v)
    })
    return () => {
      stale = true
    }
  }, [summary, path, category])

  useEffect(() => {
    if (!summary) return
    let stale = false
    window.api.getTopFiles(category).then((f) => {
      if (!stale) setTopFiles(f)
    })
    return () => {
      stale = true
    }
  }, [summary, category])

  if (!summary || !view) {
    return (
      <>
        <PageHeader title="Espaço" subtitle="O que está ocupando o disco: pastas, gráfico e maiores arquivos." />
        <EmptyState>Faça uma análise no Painel para ver o mapa de espaço.</EmptyState>
      </>
    )
  }

  const atRoot = view.path === view.rootPath
  const goUp = () => {
    const parent = view.path.replace(/\\[^\\]+$/, '')
    setPath(parent.length < view.rootPath.length ? view.rootPath : parent || view.rootPath)
  }
  const filterLabel = category === null ? '' : ` de ${CATEGORY_LABELS[category].toLowerCase()}`

  return (
    <>
      <PageHeader title="Espaço" subtitle="O que está ocupando o disco. Clique numa pasta para entrar nela." />

      {summary.cancelled && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          A última análise foi cancelada: os números abaixo são parciais.
        </div>
      )}

      <div className="mb-4">
        <CategoryFilter value={category} onChange={setCategory} />
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={goUp}
            disabled={atRoot}
            title="Voltar para a pasta de cima"
            aria-label="Voltar para a pasta de cima"
            className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumb rootPath={view.rootPath} path={view.path} onNavigate={setPath} />
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">{formatBytes(view.size)}</div>
            <div className="text-xs text-slate-500">
              {category === null ? `${formatNumber(view.files)} arquivos` : `somente ${CATEGORY_LABELS[category].toLowerCase()}`}
            </div>
          </div>
        </div>

        <SpaceTreemap entries={view.entries} total={view.size} category={category} onOpen={setPath} />
      </Card>

      <Card title="Conteúdo da pasta">
        <FolderList entries={view.entries} total={view.size} category={category} onOpen={setPath} />
      </Card>

      <Card title={`50 maiores arquivos${filterLabel}`} subtitle={`Em toda a análise de ${view.rootPath}`}>
        <TopFilesTable files={topFiles} />
      </Card>
    </>
  )
}
