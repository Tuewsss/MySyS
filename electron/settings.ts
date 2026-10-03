// Configurações do usuário, salvas em %APPDATA%\MySyS\configuracoes.json.
// O arquivo pode ter sido editado à mão ou estar corrompido, então tudo que
// vem dele (ou da interface) passa por sanitizeSettings() antes de ser usado.
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Settings } from './scanner/types'
import { DEFAULT_SETTINGS, LIMITS } from './settings-defaults'
import { writeFileSafe } from './write-file-safe'

export { DEFAULT_SETTINGS, LIMITS }

function clampNumber(v: unknown, min: number, max: number, fallback: number, integer: boolean): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = integer ? Math.round(v) : v
  return Math.min(max, Math.max(min, n))
}

/**
 * Transforma qualquer coisa em configurações válidas. Campos ausentes ou
 * inválidos ficam com o valor padrão; pastas ignoradas precisam ser caminhos
 * absolutos e repetidas (sem diferenciar maiúsculas) são descartadas.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS

  const ignore: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(r.ignore)) {
    for (const p of r.ignore) {
      if (typeof p !== 'string' || p.length > 1000 || !path.isAbsolute(p)) continue
      const full = path.resolve(p)
      const key = full.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ignore.push(full)
      if (ignore.length >= LIMITS.ignoreMax) break
    }
  }

  return {
    oldDays: clampNumber(r.oldDays, LIMITS.oldDays.min, LIMITS.oldDays.max, d.oldDays, true),
    dupeMinSizeMB: clampNumber(r.dupeMinSizeMB, LIMITS.dupeMinSizeMB.min, LIMITS.dupeMinSizeMB.max, d.dupeMinSizeMB, false),
    ignore,
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : d.theme,
  }
}

/** Lê as configurações. Arquivo ausente ou corrompido = padrões. */
export async function loadSettings(file: string): Promise<Settings> {
  try {
    return sanitizeSettings(JSON.parse(await fs.readFile(file, 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Valida e grava. Devolve o que realmente foi salvo (já corrigido). */
export async function saveSettings(file: string, raw: unknown): Promise<Settings> {
  const settings = sanitizeSettings(raw)
  await writeFileSafe(file, JSON.stringify(settings, null, 2))
  return settings
}

/** Tamanho mínimo dos duplicados em bytes. */
export const dupeMinSizeBytes = (s: Settings) => Math.round(s.dupeMinSizeMB * 1024 * 1024)
