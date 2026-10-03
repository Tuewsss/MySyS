import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'

// Faixas de risco definidas no projeto: verde 0–30, amarelo 31–69, vermelho 70–100.
export function riskLevel(score: number): 'baixo' | 'medio' | 'alto' {
  if (score >= 70) return 'alto'
  if (score >= 31) return 'medio'
  return 'baixo'
}

const STYLE = {
  baixo: {
    label: 'Risco baixo',
    icon: ShieldCheck,
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  medio: {
    label: 'Risco médio',
    icon: ShieldQuestion,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  alto: {
    label: 'Risco alto',
    icon: ShieldAlert,
    className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  },
}

// Ícone + texto + número: a cor nunca é a única pista.
export default function RiskBadge({ score }: { score: number }) {
  const { label, icon: Icon, className } = STYLE[riskLevel(score)]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" />
      {label} · {score}
    </span>
  )
}
