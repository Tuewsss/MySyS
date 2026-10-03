import { Gamepad2, Film } from 'lucide-react'
import type { GameDataKind } from '../../electron/scanner/types'

const INFO: Record<GameDataKind, { label: string; title: string; className: string; icon: typeof Gamepad2 }> = {
  save: {
    label: 'Save de jogo',
    title: 'Guarda o progresso de um jogo. Apagar pode fazer você perder o progresso.',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: Gamepad2,
  },
  'possivel-save': {
    label: 'Pode ser save',
    title: 'Está numa pasta de dados de jogo e pode conter progresso ou configurações.',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: Gamepad2,
  },
  gravacao: {
    label: 'Gravação de jogo',
    title: 'Replay, gravação ou captura de tela de jogo. Não guarda progresso.',
    className: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
    icon: Film,
  },
}

// Selo com ícone + texto (a cor nunca é a única pista).
export default function GameDataBadge({ kind }: { kind: GameDataKind | null | undefined }) {
  if (!kind) return null
  const { label, title, className, icon: Icon } = INFO[kind]
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

/** Save ou possível save: algo que pode ter progresso de jogo. */
export const isSaveLike = (kind: GameDataKind | null | undefined) => kind === 'save' || kind === 'possivel-save'
