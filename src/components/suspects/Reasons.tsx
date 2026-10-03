import type { RiskReason } from '../../../electron/scanner/types'

// Lista dos motivos da pontuação, com os pontos de cada um.
export default function Reasons({ reasons }: { reasons: RiskReason[] }) {
  if (reasons.length === 0) return <p className="text-xs text-slate-500">Nenhum sinal de alerta.</p>
  return (
    <ul className="space-y-0.5 text-xs">
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2">
          <span
            className={`w-8 shrink-0 text-right font-mono tabular-nums ${
              r.points > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {r.points > 0 ? `+${r.points}` : r.points}
          </span>
          <span className="text-slate-600 dark:text-slate-400">{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
