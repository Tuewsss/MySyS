import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, FolderPlus, Moon, RotateCcw, Save, Sun, X } from 'lucide-react'
import type { Settings, Theme } from '../../electron/scanner/types'
import { DEFAULT_SETTINGS, LIMITS } from '../../electron/settings-defaults'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import { applyTheme } from '../lib/theme'
import { formatNumber } from '../lib/format'

// Os campos numéricos ficam como texto enquanto a pessoa digita
// (assim dá para apagar tudo e digitar de novo sem o valor "pular").
interface Draft {
  oldDays: string
  dupeMinSizeMB: string
  ignore: string[]
}

const toDraft = (s: Settings): Draft => ({
  oldDays: String(s.oldDays),
  dupeMinSizeMB: String(s.dupeMinSizeMB).replace('.', ','),
  ignore: s.ignore,
})

// Aceita vírgula ou ponto como separador decimal ("0,5" ou "0.5").
const parseNumber = (text: string) => (text.trim() === '' ? NaN : Number(text.trim().replace(',', '.')))

function checkRange(text: string, { min, max }: { min: number; max: number }, integer: boolean): string | null {
  const n = parseNumber(text)
  if (!Number.isFinite(n)) return 'Digite um número.'
  if (integer && !Number.isInteger(n)) return 'Use um número inteiro.'
  if (n < min || n > max) return `Use um valor entre ${formatNumber(min)} e ${formatNumber(max)}.`
  return null
}

export default function Configuracoes() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getSettings()
      .then((s) => {
        setSaved(s)
        setDraft(toDraft(s))
      })
      .catch(() => setError('Não foi possível carregar as configurações.'))
  }, [])

  if (!saved || !draft) {
    return (
      <>
        <PageHeader title="Configurações" subtitle="Ajuste os critérios de análise e a aparência do app." />
        <p className="text-sm text-slate-500">{error ?? 'Carregando…'}</p>
      </>
    )
  }

  const oldDaysError = checkRange(draft.oldDays, LIMITS.oldDays, true)
  const dupeError = checkRange(draft.dupeMinSizeMB, LIMITS.dupeMinSizeMB, false)
  const valid = !oldDaysError && !dupeError
  const dirty =
    parseNumber(draft.oldDays) !== saved.oldDays ||
    parseNumber(draft.dupeMinSizeMB) !== saved.dupeMinSizeMB ||
    draft.ignore.join('\n') !== saved.ignore.join('\n')

  const persist = async (next: Settings, okMessage: string | null) => {
    setError(null)
    try {
      const result = await window.api.saveSettings(next)
      setSaved(result)
      return result
    } catch {
      setError('Não foi possível salvar as configurações.')
      return null
    } finally {
      setMessage(okMessage)
    }
  }

  const save = async () => {
    const result = await persist(
      {
        ...saved,
        oldDays: parseNumber(draft.oldDays),
        dupeMinSizeMB: parseNumber(draft.dupeMinSizeMB),
        ignore: draft.ignore,
      },
      'Configurações salvas. Elas valem a partir da próxima análise.',
    )
    if (result) setDraft(toDraft(result))
  }

  // O tema muda e é salvo na hora (não depende do botão Salvar).
  const changeTheme = async (theme: Theme) => {
    applyTheme(theme)
    const result = await persist({ ...saved, theme }, null)
    if (!result) applyTheme(saved.theme)
  }

  const addFolder = async () => {
    const folder = await window.api.pickFolder()
    if (!folder) return
    if (draft.ignore.some((p) => p.toLowerCase() === folder.toLowerCase())) return
    setDraft({ ...draft, ignore: [...draft.ignore, folder] })
    setMessage(null)
  }

  const removeFolder = (folder: string) => {
    setDraft({ ...draft, ignore: draft.ignore.filter((p) => p !== folder) })
    setMessage(null)
  }

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setMessage(null)
  }

  const input =
    'w-28 rounded-lg border bg-transparent px-3 py-1.5 text-right tabular-nums dark:border-slate-700 border-slate-300'

  return (
    <>
      <PageHeader title="Configurações" subtitle="Ajuste os critérios de análise e a aparência do app." />

      <Card title="Aparência">
        <div className="flex gap-2">
          {(
            [
              ['dark', 'Escuro', Moon],
              ['light', 'Claro', Sun],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => changeTheme(value)}
              aria-pressed={saved.theme === value}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                saved.theme === value
                  ? 'border-sky-500 bg-sky-500/10 font-medium'
                  : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Critérios da análise" subtitle="Valem a partir da próxima análise.">
        <div className="space-y-4 text-sm">
          <Field
            label="Arquivo antigo depois de"
            hint="Arquivos sem modificação há mais tempo que isso aparecem em Antigos."
            error={oldDaysError}
          >
            <input
              inputMode="numeric"
              value={draft.oldDays}
              onChange={(e) => update({ oldDays: e.target.value })}
              className={input}
            />
            <span>dias</span>
          </Field>

          <Field
            label="Duplicados: tamanho mínimo"
            hint="Arquivos menores são ignorados na busca de duplicados (valores baixos deixam a busca bem mais lenta)."
            error={dupeError}
          >
            <input
              inputMode="decimal"
              value={draft.dupeMinSizeMB}
              onChange={(e) => update({ dupeMinSizeMB: e.target.value })}
              className={input}
            />
            <span>MB</span>
          </Field>
        </div>
      </Card>

      <Card
        title="Pastas ignoradas"
        subtitle="A análise não entra nessas pastas (nem nas subpastas). Útil para discos de backup ou pastas que você nunca quer limpar."
      >
        {draft.ignore.length === 0 ? (
          <p className="mb-3 text-sm text-slate-500">Nenhuma pasta ignorada.</p>
        ) : (
          <ul className="mb-3 space-y-1 text-sm">
            {draft.ignore.map((p) => (
              <li key={p} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-800">
                <span className="min-w-0 flex-1 truncate" title={p}>
                  {p}
                </span>
                <button
                  onClick={() => removeFolder(p)}
                  aria-label={`Remover ${p}`}
                  className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={addFolder}
          disabled={draft.ignore.length >= LIMITS.ignoreMax}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <FolderPlus className="h-4 w-4" /> Adicionar pasta…
        </button>
      </Card>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || !valid}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" /> Salvar
        </button>
        <button
          onClick={() => update(toDraft({ ...DEFAULT_SETTINGS, theme: saved.theme }))}
          title="Volta os critérios e as pastas ignoradas aos valores padrão (é preciso salvar depois)"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" /> Restaurar padrões
        </button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Alterações não salvas</span>}
        {!dirty && message && !error && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> {message}
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint: string
  error: string | null
  children: ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-3">
        <span className="w-56 font-medium">{label}</span>
        {children}
      </label>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
