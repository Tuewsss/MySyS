import type { ReactNode } from 'react'

type Props = { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string }

// Caixa padrão das páginas.
export default function Card({ title, subtitle, children, className = '' }: Props) {
  return (
    <section
      className={`mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0f1520] ${className}`}
    >
      {title && <h2 className="font-medium">{title}</h2>}
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {title && <div className="mb-3" />}
      {children}
    </section>
  )
}
