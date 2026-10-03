import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PieChart,
  Trash2,
  Clock,
  Copy,
  ShieldAlert,
  History,
  Settings,
  HardDrive,
  type LucideIcon,
} from 'lucide-react'

type Item = { to: string; label: string; icon: LucideIcon }

const items: Item[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/espaco', label: 'Espaço', icon: PieChart },
  { to: '/lixo', label: 'Lixo', icon: Trash2 },
  { to: '/antigos', label: 'Antigos', icon: Clock },
  { to: '/duplicados', label: 'Duplicados', icon: Copy },
  { to: '/suspeitos', label: 'Suspeitos', icon: ShieldAlert },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar() {
  const [version, setVersion] = useState('')

  // Primeiro uso do IPC: confirma que React ↔ Electron estão conversando.
  useEffect(() => {
    window.api.getVersion().then(setVersion)
  }, [])

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1520]">
      <div className="flex items-center gap-2 px-5 py-5">
        <HardDrive className="h-6 w-6 text-sky-500" />
        <span className="text-lg font-semibold">MySyS</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'} // sem isso, "/" ficaria ativo em todas as páginas
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-sky-500/15 font-medium text-sky-600 dark:text-sky-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 text-xs text-slate-500">v{version}</div>
    </aside>
  )
}
