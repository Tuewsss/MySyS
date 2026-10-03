import { CATEGORY_LABELS, categoryColor } from '../../lib/categories'

type Props = { value: number | null; onChange: (c: number | null) => void }

// Botões de filtro por tipo. Também servem de legenda das cores do gráfico.
export default function CategoryFilter({ value, onChange }: Props) {
  const chip = (active: boolean) =>
    `flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
      active
        ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
        : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
    }`

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar por tipo">
      <button role="radio" aria-checked={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        Todos
      </button>
      {CATEGORY_LABELS.map((label, i) => (
        <button key={label} role="radio" aria-checked={value === i} className={chip(value === i)} onClick={() => onChange(i)}>
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: categoryColor(i) }} />
          {label}
        </button>
      ))}
    </div>
  )
}
