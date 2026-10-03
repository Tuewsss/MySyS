import { useEffect, useState } from 'react'
import { FolderSearch, RefreshCw } from 'lucide-react'
import type { Drive } from '../../electron/scanner/types'
import PageHeader from '../components/PageHeader'
import DriveCard from '../components/DriveCard'
import ScanPanel from '../components/ScanPanel'
import FreeableSummary from '../components/FreeableSummary'
import { useScan } from '../lib/scan'

export default function Painel() {
  const { status, start } = useScan()
  const [drives, setDrives] = useState<Drive[] | null>(null)
  const [drivesError, setDrivesError] = useState<string | null>(null)
  const running = status === 'running'

  const loadDrives = () => {
    setDrives(null)
    setDrivesError(null)
    window.api
      .listDrives()
      .then(setDrives)
      .catch(() => setDrivesError('Não foi possível listar as unidades.'))
  }

  useEffect(loadDrives, [])

  const pickFolder = async () => {
    const folder = await window.api.pickFolder()
    if (folder) start(folder)
  }

  return (
    <>
      <PageHeader title="Painel" subtitle="Escolha uma unidade ou pasta para analisar. Nada é apagado nesta etapa." />

      <div className="mb-4 flex gap-2">
        <button
          onClick={pickFolder}
          disabled={running}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <FolderSearch className="h-4 w-4" /> Analisar pasta…
        </button>
        <button
          onClick={loadDrives}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar unidades
        </button>
      </div>

      {drivesError && <p className="mb-4 text-sm text-red-500">{drivesError}</p>}
      {!drives && !drivesError && <p className="mb-4 text-sm text-slate-500">Carregando unidades…</p>}

      {drives && (
        <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {drives.map((d) => (
            <DriveCard key={d.letter} drive={d} disabled={running} onAnalyze={() => start(d.letter + '\\')} />
          ))}
        </div>
      )}

      <ScanPanel />
      <FreeableSummary />
    </>
  )
}
