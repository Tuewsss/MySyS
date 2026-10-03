import { HardDrive, Usb, Network, Disc } from 'lucide-react'
import type { Drive } from '../../electron/scanner/types'
import { formatBytes } from '../lib/format'

const ICONS = { local: HardDrive, removivel: Usb, rede: Network, cd: Disc, outro: HardDrive }
const KIND_LABEL = { local: 'Disco local', removivel: 'Removível', rede: 'Rede', cd: 'CD/DVD', outro: 'Unidade' }

type Props = { drive: Drive; disabled: boolean; onAnalyze: () => void }

export default function DriveCard({ drive, disabled, onAnalyze }: Props) {
  const used = drive.total - drive.free
  const pct = drive.total > 0 ? (used / drive.total) * 100 : 0
  const Icon = ICONS[drive.kind]
  // Barra fica vermelha quando o disco está quase cheio.
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {drive.label || KIND_LABEL[drive.kind]} ({drive.letter})
          </div>
          <div className="text-xs text-slate-500">{KIND_LABEL[drive.kind]}</div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{formatBytes(used)} usados</span>
        <span>
          {formatBytes(drive.free)} livres de {formatBytes(drive.total)}
        </span>
      </div>

      <button
        onClick={onAnalyze}
        disabled={disabled}
        className="mt-4 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Analisar
      </button>
    </div>
  )
}
