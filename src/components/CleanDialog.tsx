import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Archive,
  X,
} from 'lucide-react'
import type { CleanAction, CleanKind, CleanReport } from '../../electron/scanner/types'
import { useClean } from '../lib/clean'
import { useScan } from '../lib/scan'
import { isInOneDrive } from '../lib/onedrive'
import { formatBytes, formatDateTime, formatNumber } from '../lib/format'

export interface DialogTarget {
  path: string
  kind: CleanKind
  size: number // estimado, para mostrar antes de limpar
}

type Props = {
  title: string
  source: string // página de origem (vai para o histórico)
  targets: DialogTarget[]
  actions?: CleanAction[] // ações oferecidas
  defaultAction?: CleanAction
  onClose: () => void
}

const ACTION_INFO: Record<CleanAction, { label: string; description: string; icon: typeof Trash2 }> = {
  lixeira: {
    label: 'Mover para a Lixeira',
    description:
      'Recomendado. Dá para recuperar pela Lixeira do Windows. O espaço só é liberado de verdade quando você esvaziar a Lixeira.',
    icon: Trash2,
  },
  quarentena: {
    label: 'Enviar para a quarentena',
    description:
      'Move para uma pasta isolada do DSS e o arquivo não pode ser aberto por engano. Dá para desfazer pelo Histórico.',
    icon: Archive,
  },
  apagar: {
    label: 'Apagar permanentemente',
    description: 'Não dá para desfazer. Pede confirmação digitando APAGAR.',
    icon: ShieldAlert,
  },
}

const CONFIRM_WORD = 'APAGAR'

/**
 * Tela de confirmação de TODA limpeza do DSS.
 * Passos: escolher a ação (ou simular) → [digitar APAGAR] → andamento → resultado.
 */
export default function CleanDialog({
  title,
  source,
  targets,
  actions = ['lixeira', 'quarentena', 'apagar'],
  defaultAction = 'lixeira',
  onClose,
}: Props) {
  const { running, progress, run, cancel } = useClean()
  const { summary, start } = useScan()
  const navigate = useNavigate()
  // Resultado da análise salva (cache): só para ver. O main também recusa a limpeza.
  const cachedAt = summary?.cachedAt ?? null

  const rescan = () => {
    if (!summary) return
    onClose()
    navigate('/') // o progresso aparece no Painel
    start(summary.root)
  }
  // A quarentena só aceita arquivos.
  const available = actions.filter((a) => a !== 'quarentena' || targets.every((t) => t.kind === 'file'))
  const [action, setAction] = useState<CleanAction>(available.includes(defaultAction) ? defaultAction : available[0])
  const [step, setStep] = useState<'choose' | 'confirm-delete' | 'result'>('choose')
  const [typed, setTyped] = useState('')
  const [report, setReport] = useState<CleanReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const total = targets.reduce((s, t) => s + t.size, 0)
  const inOneDrive = targets.filter((t) => isInOneDrive(t.path)).length

  const execute = async (dryRun: boolean) => {
    setError(null)
    try {
      const r = await run({
        action,
        dryRun,
        source,
        targets: targets.map(({ path, kind }) => ({ path, kind })),
      })
      setReport(r)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }

  const proceed = () => (action === 'apagar' ? setStep('confirm-delete') : execute(false))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#0f1520]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="flex-1 font-semibold">{title}</h2>
          {!running && (
            <button onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 py-4 text-sm">
          {running ? (
            <Running progress={progress} onCancel={cancel} />
          ) : step === 'result' && report ? (
            <Result report={report} />
          ) : cachedAt !== null ? (
            <div className="flex gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sky-800 dark:text-sky-200">
              <History className="h-5 w-5 shrink-0" />
              <div>
                <strong>Estes resultados são da análise salva de {formatDateTime(cachedAt)}.</strong> Desde então, os
                arquivos podem ter mudado, sumido ou sido trocados. Por segurança, o DSS só limpa a partir de uma
                análise feita agora.
              </div>
            </div>
          ) : step === 'confirm-delete' ? (
            <div className="space-y-3">
              <div className="flex gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-800 dark:text-red-200">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div>
                  Você vai <strong>apagar permanentemente</strong> {formatNumber(targets.length)} item(ns) (
                  {formatBytes(total)}). Não vai para a Lixeira e não dá para desfazer.
                </div>
              </div>
              <label className="block">
                Para confirmar, digite <strong>{CONFIRM_WORD}</strong>:
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 font-mono dark:border-slate-700"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <p>
                <strong>{formatNumber(targets.length)}</strong> item(ns) selecionado(s), cerca de{' '}
                <strong>{formatBytes(total)}</strong>.
              </p>

              {inOneDrive > 0 && (
                <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  <Cloud className="h-5 w-5 shrink-0" />
                  <div>
                    <strong>{formatNumber(inOneDrive)} item(ns) estão no OneDrive.</strong> Remover aqui também remove da
                    nuvem e dos seus outros aparelhos. Para só liberar espaço no PC, use "Liberar espaço" no menu do
                    OneDrive.
                  </div>
                </div>
              )}

              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs text-slate-500">O que fazer</legend>
                {available.map((a) => {
                  const { label, description, icon: Icon } = ACTION_INFO[a]
                  return (
                    <label
                      key={a}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                        action === a ? 'border-sky-500 bg-sky-500/10' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <input type="radio" name="acao" checked={action === a} onChange={() => setAction(a)} className="mt-1 accent-sky-600" />
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <Icon className="h-4 w-4" /> {label}
                        </div>
                        <div className="text-xs text-slate-500">{description}</div>
                      </div>
                    </label>
                  )
                })}
              </fieldset>
            </div>
          )}

          {error && (
            <div className="mt-3 flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {!running && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {step === 'choose' && cachedAt !== null && (
              <>
                <button onClick={onClose} className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Cancelar
                </button>
                <button
                  onClick={rescan}
                  className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500"
                >
                  <RefreshCw className="h-4 w-4" /> Analisar de novo
                </button>
              </>
            )}
            {step === 'choose' && cachedAt === null && (
              <>
                <button
                  onClick={() => execute(true)}
                  title="Mostra o que seria feito, sem tocar em nada"
                  className="mr-auto flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <FlaskConical className="h-4 w-4" /> Simular
                </button>
                <button onClick={onClose} className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Cancelar
                </button>
                <button
                  onClick={proceed}
                  className={`rounded-lg px-4 py-2 font-medium text-white ${
                    action === 'apagar' ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {ACTION_INFO[action].label}
                </button>
              </>
            )}
            {step === 'confirm-delete' && (
              <>
                <button onClick={() => setStep('choose')} className="rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Voltar
                </button>
                <button
                  onClick={() => execute(false)}
                  disabled={typed !== CONFIRM_WORD}
                  className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500 disabled:opacity-40"
                >
                  Apagar permanentemente
                </button>
              </>
            )}
            {step === 'result' && (
              <>
                {report?.dryRun && (
                  <button onClick={() => setStep('choose')} className="mr-auto rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Voltar
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500">
                  Fechar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Running({ progress, onCancel }: { progress: ReturnType<typeof useClean>['progress']; onCancel: () => void }) {
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
        <span className="flex-1">Limpando… {progress ? `${progress.done} de ${progress.total}` : ''}</span>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1 text-xs dark:border-slate-700">
          Cancelar
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="truncate text-xs text-slate-500">{progress?.currentPath}</div>
    </div>
  )
}

const STATUS_LABEL = { ok: 'Concluído', parcial: 'Parcial', pulado: 'Pulado', erro: 'Erro' }

function Result({ report }: { report: CleanReport }) {
  const problems = report.items.filter((i) => i.status !== 'ok')
  const verb = report.dryRun ? 'seriam liberados' : report.action === 'lixeira' ? 'foram para a Lixeira' : 'liberados'
  return (
    <div className="space-y-3">
      {report.dryRun && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sky-800 dark:text-sky-200">
          <FlaskConical className="h-4 w-4" /> Simulação: nada foi alterado.
        </div>
      )}
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        <div>
          <div className="text-lg font-semibold">
            {formatBytes(report.bytes)} {verb}
          </div>
          <div className="text-xs text-slate-500">
            {formatNumber(report.files)} arquivo(s)
            {report.failed > 0 && ` · ${formatNumber(report.failed)} em uso ou sem permissão (pulados)`}
            {report.cancelled && ' · limpeza cancelada no meio'}
          </div>
        </div>
      </div>
      {problems.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-500">Itens com observação:</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {problems.slice(0, 100).map((i) => (
              <li key={i.path} className="flex gap-2">
                <span className="w-16 shrink-0 font-medium">{STATUS_LABEL[i.status]}</span>
                <span className="min-w-0 flex-1 truncate" title={i.path}>
                  {i.path}
                </span>
                <span className="shrink-0 text-slate-500">{i.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!report.dryRun && (
        <p className="text-xs text-slate-500">
          Registrado no Histórico. Para os números das páginas ficarem exatos, faça uma nova análise no Painel.
        </p>
      )}
    </div>
  )
}
