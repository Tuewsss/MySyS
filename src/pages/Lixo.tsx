import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, Info, Trash2 } from 'lucide-react'
import type { JunkCategoryId, JunkCategoryResult, JunkResult } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import CleanDialog, { type DialogTarget } from '../components/CleanDialog'
import { pathKey, useClean } from '../lib/clean'
import EmptyState from '../components/EmptyState'
import ShowInFolderButton from '../components/ShowInFolderButton'
import { useScan } from '../lib/scan'
import { JUNK_INFO, formatDate } from '../lib/junk'
import { formatBytes, formatNumber } from '../lib/format'

// Categorias que NÃO vêm marcadas: node_modules exige reinstalar o projeto.
const NOT_PRESELECTED: JunkCategoryId[] = ['dev', 'windowsOld']

export default function Lixo() {
  const { summary } = useScan()
  const { removed } = useClean()
  const [junk, setJunk] = useState<JunkResult | null>(null)
  const [selected, setSelected] = useState<Set<JunkCategoryId>>(new Set())
  const [dialog, setDialog] = useState(false)

  useEffect(() => {
    if (!summary) return
    window.api.getJunk().then((j) => {
      setJunk(j)
      if (j) {
        const pre = j.categories.filter((c) => c.size > 0 && !NOT_PRESELECTED.includes(c.id)).map((c) => c.id)
        setSelected(new Set(pre))
      }
    })
  }, [summary])

  if (!summary || !junk) {
    return (
      <>
        <PageHeader title="Arquivos inúteis" subtitle="Temporários, caches, logs antigos e instaladores esquecidos." />
        <EmptyState>Faça uma análise no Painel para encontrar arquivos inúteis.</EmptyState>
      </>
    )
  }

  const toggle = (id: JunkCategoryId) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  // Esconde o que já foi limpo nesta sessão e recalcula os totais.
  const categories = junk.categories.map((c) => withoutRemoved(c, removed))
  const selectedCats = categories.filter((c) => selected.has(c.id) && !JUNK_INFO[c.id].infoOnly)
  const selectedSize = selectedCats.reduce((s, c) => s + c.size, 0)
  const cleanable = categories.filter((c) => !JUNK_INFO[c.id].infoOnly)
  const total = cleanable.reduce((s, c) => s + c.size, 0)

  const targets: DialogTarget[] = selectedCats.flatMap((c) =>
    c.items.map((item) => ({
      path: item.path,
      // Arquivo sai inteiro; node_modules sai inteira; as demais pastas (Temp,
      // caches) só são esvaziadas: a pasta em si continua existindo.
      kind:
        item.kind === 'file' ? 'file' : /\\node_modules$/i.test(item.path) ? ('folder' as const) : ('contents' as const),
      size: item.size,
    })),
  )

  return (
    <>
      <PageHeader
        title="Arquivos inúteis"
        subtitle={`Encontrados ${formatBytes(total)} em ${summary.root}. Marque o que deseja limpar.`}
      />

      {/* Total selecionado sempre visível no topo enquanto a página rola. */}
      <div className="sticky -top-8 z-10 -mx-8 mb-4 border-b border-slate-200 bg-slate-50/95 px-8 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0b0f17]/95">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-slate-500">Selecionado para limpar</div>
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
          Você confirma antes de qualquer remoção. Pastas como Temp e caches são esvaziadas, mas continuam existindo;
          arquivos em uso são pulados.
        </p>
      </div>

      {dialog && (
        <CleanDialog
          title="Limpar arquivos inúteis"
          source="Lixo"
          targets={targets}
          actions={['lixeira', 'apagar']}
          onClose={() => setDialog(false)}
        />
      )}

      {summary.cancelled && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          A última análise foi cancelada: a lista pode estar incompleta.
        </div>
      )}

      <div className="space-y-3">
        {categories.map((c) => (
          <CategoryRow key={c.id} cat={c} checked={selected.has(c.id)} onToggle={() => toggle(c.id)} />
        ))}
      </div>
    </>
  )
}

/** Tira os itens já limpos nesta sessão e recalcula o total da categoria. */
function withoutRemoved(cat: JunkCategoryResult, removed: Set<string>): JunkCategoryResult {
  const items = cat.items.filter((i) => !removed.has(pathKey(i.path)))
  if (items.length === cat.items.length) return cat
  return {
    ...cat,
    items,
    size: items.reduce((s, i) => s + i.size, 0),
    files: items.reduce((s, i) => s + i.files, 0),
  }
}

const ITEMS_PAGE = 100

function CategoryRow({ cat, checked, onToggle }: { cat: JunkCategoryResult; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(ITEMS_PAGE)
  const info = JUNK_INFO[cat.id]
  const empty = cat.size === 0 && cat.items.length === 0

  // Windows.old só aparece se existir.
  if (info.infoOnly && empty) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="flex items-center gap-4 p-4">
        {info.infoOnly ? (
          <Info className="h-5 w-5 shrink-0 text-sky-500" />
        ) : (
          <input
            type="checkbox"
            checked={checked}
            disabled={empty}
            onChange={onToggle}
            aria-label={`Selecionar ${info.title}`}
            className="h-4 w-4 shrink-0 accent-sky-600"
          />
        )}
        <button
          onClick={() => setOpen(!open)}
          disabled={empty}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <div className="min-w-0 flex-1">
            <div className={`font-medium ${empty ? 'text-slate-400 dark:text-slate-500' : ''}`}>{info.title}</div>
            <div className="text-xs text-slate-500">{info.description}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums">{empty ? '—' : formatBytes(cat.size)}</div>
            {!empty && <div className="text-xs text-slate-500">{formatNumber(cat.files)} arquivo(s)</div>}
          </div>
          {!empty &&
            (open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-4 py-2 dark:border-slate-800">
          {info.infoOnly && (
            <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Abra o menu Iniciar e procure por "Limpeza de Disco".</li>
              <li>Escolha a unidade e clique em "Limpar arquivos do sistema".</li>
              <li>Marque "Instalações anteriores do Windows" e confirme.</li>
            </ol>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {cat.items.slice(0, limit).map((item) => (
              <li key={item.path} className="flex items-center gap-3 py-1.5 text-sm">
                {item.kind === 'folder' ? (
                  <Folder className="h-4 w-4 shrink-0 text-sky-500" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="min-w-0 flex-1 truncate" title={item.path}>
                  {item.path}
                </span>
                {item.mtimeMs !== null && (
                  <span className="shrink-0 text-xs text-slate-500" title={cat.id === 'dev' ? 'Última alteração do projeto' : 'Modificado em'}>
                    {cat.id === 'dev' ? 'projeto parado desde ' : ''}
                    {formatDate(item.mtimeMs)}
                  </span>
                )}
                <span className="w-20 shrink-0 text-right tabular-nums">{formatBytes(item.size)}</span>
                <ShowInFolderButton path={item.path} />
              </li>
            ))}
          </ul>
          {cat.items.length > limit && (
            <button onClick={() => setLimit(limit + ITEMS_PAGE)} className="my-2 text-sm text-sky-600 hover:underline dark:text-sky-400">
              Mostrar mais ({formatNumber(cat.items.length - limit)} restantes)
            </button>
          )}
          {cat.truncated > 0 && limit >= cat.items.length && (
            <p className="my-2 text-xs text-slate-500">
              + {formatNumber(cat.truncated)} itens menores não listados (já incluídos no total).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
