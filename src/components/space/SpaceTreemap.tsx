import { ResponsiveContainer, Tooltip, Treemap, type TreemapNode } from 'recharts'
import type { FolderEntry } from '../../../electron/scanner/types'
import { CATEGORY_LABELS, categoryColor, dominantCategory } from '../../lib/categories'
import { formatBytes, formatNumber } from '../../lib/format'

// Mais que ~40 blocos vira um mosaico ilegível; o resto vira um bloco "Outros".
const MAX_BLOCKS = 40

interface Datum {
  [key: string]: unknown // exigido pelo tipo de dados do Recharts
  name: string
  size: number
  files: number
  path: string
  kind: FolderEntry['kind']
  color: string
  typeLabel: string
  total: number // tamanho da pasta atual, para calcular a %
}

type Props = {
  entries: FolderEntry[]
  total: number
  category: number | null
  onOpen: (path: string) => void
}

export default function SpaceTreemap({ entries, total, category, onOpen }: Props) {
  const shown = entries.slice(0, MAX_BLOCKS)
  const rest = entries.slice(MAX_BLOCKS)

  const data: Datum[] = shown.map((e) => {
    // Sem filtro, cada bloco tem a cor do tipo que mais ocupa espaço nele.
    const cat = category ?? dominantCategory(e.sizes)
    return {
      name: e.name,
      size: e.size,
      files: e.files,
      path: e.path,
      kind: e.kind,
      color: e.kind === 'rest' ? categoryColor(5) : categoryColor(cat),
      typeLabel: CATEGORY_LABELS[cat],
      total,
    }
  })
  if (rest.length > 0) {
    data.push({
      name: `Outros ${rest.length} itens`,
      size: rest.reduce((s, e) => s + e.size, 0),
      files: rest.reduce((s, e) => s + e.files, 0),
      path: '',
      kind: 'rest',
      color: categoryColor(5),
      typeLabel: 'Vários',
      total,
    })
  }

  if (data.length === 0) {
    return <div className="flex h-80 items-center justify-center text-sm text-slate-500">Nada deste tipo aqui.</div>
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          isAnimationActive={false}
          content={(node) => <Block {...node} />}
          onClick={(node) => {
            const d = node as unknown as Datum
            if (d.kind === 'dir') onOpen(d.path)
          }}
        >
          <Tooltip content={<BlockTooltip />} isAnimationActive={false} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}

// Desenha um bloco. Um contorno de 2px na cor do fundo separa os blocos vizinhos.
function Block(node: TreemapNode) {
  const { x, y, width, height, depth } = node
  // depth 0 é o "retângulo raiz" que o Recharts também desenha; ignoramos.
  if (depth !== 1 || width < 1 || height < 1) return <g />
  const d = node as unknown as TreemapNode & Datum
  const clickable = d.kind === 'dir'
  const showLabel = width > 64 && height > 34

  return (
    <g style={{ cursor: clickable ? 'pointer' : 'default' }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        style={{ fill: d.color, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
      />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18} style={{ fill: 'var(--chart-ink)', fontSize: 12, fontWeight: 600 }}>
            {truncate(d.name, Math.floor((width - 16) / 7))}
          </text>
          <text x={x + 8} y={y + 32} style={{ fill: 'var(--chart-ink)', fontSize: 11, opacity: 0.8 }}>
            {formatBytes(d.size)}
          </text>
        </>
      )}
    </g>
  )
}

function BlockTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const pct = d.total > 0 ? (d.size / d.total) * 100 : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 max-w-72 truncate font-medium text-slate-900 dark:text-slate-100">{d.name}</div>
      <div className="text-slate-600 dark:text-slate-300">
        {formatBytes(d.size)} · {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% desta pasta
      </div>
      <div className="text-slate-500">
        {formatNumber(d.files)} arquivo(s) · maior parte: {d.typeLabel}
      </div>
      {d.kind === 'dir' && <div className="mt-1 text-sky-600 dark:text-sky-400">Clique para abrir</div>}
    </div>
  )
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text
}
