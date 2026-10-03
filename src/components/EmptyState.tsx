import type { ReactNode } from 'react'

// Caixa usada enquanto uma página ainda não tem conteúdo.
export default function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </div>
  )
}
