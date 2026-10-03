import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS, LIMITS, dupeMinSizeBytes, loadSettings, saveSettings, sanitizeSettings } from '../electron/settings'

const tmp = path.join(__dirname, `tmp-settings-${process.pid}`)
afterAll(() => fs.rm(tmp, { recursive: true, force: true }))

describe('sanitizeSettings', () => {
  it('lixo vira os padrões', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('texto')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ oldDays: 'muito', dupeMinSizeMB: NaN, ignore: 'C:\\', theme: 'roxo' })).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  it('mantém valores válidos', () => {
    const s = { oldDays: 365, dupeMinSizeMB: 0.5, ignore: ['D:\\Backup'], theme: 'light' as const }
    expect(sanitizeSettings(s)).toEqual(s)
  })

  it('ajusta números aos limites e arredonda os dias', () => {
    const s = sanitizeSettings({ oldDays: 5, dupeMinSizeMB: 999999 })
    expect(s.oldDays).toBe(LIMITS.oldDays.min)
    expect(s.dupeMinSizeMB).toBe(LIMITS.dupeMinSizeMB.max)
    expect(sanitizeSettings({ oldDays: 90.6 }).oldDays).toBe(91)
    expect(sanitizeSettings({ oldDays: Infinity }).oldDays).toBe(DEFAULT_SETTINGS.oldDays)
  })

  it('pastas ignoradas: só caminhos absolutos, sem repetir (ignorando maiúsculas)', () => {
    const s = sanitizeSettings({
      ignore: ['D:\\Backup', 'd:\\backup\\', 'relativo\\pasta', 42, 'E:\\Jogos', 'x'.repeat(2000)],
    })
    expect(s.ignore).toEqual(['D:\\Backup', 'E:\\Jogos'])
  })

  it('limita a quantidade de pastas ignoradas', () => {
    const many = Array.from({ length: 150 }, (_, i) => `D:\\p${i}`)
    expect(sanitizeSettings({ ignore: many }).ignore).toHaveLength(LIMITS.ignoreMax)
  })

  it('converte MB em bytes', () => {
    expect(dupeMinSizeBytes({ ...DEFAULT_SETTINGS, dupeMinSizeMB: 1 })).toBe(1024 * 1024)
    expect(dupeMinSizeBytes({ ...DEFAULT_SETTINGS, dupeMinSizeMB: 0.5 })).toBe(512 * 1024)
  })
})

describe('loadSettings / saveSettings', () => {
  it('arquivo ausente = padrões', async () => {
    expect(await loadSettings(path.join(tmp, 'nao-existe.json'))).toEqual(DEFAULT_SETTINGS)
  })

  it('arquivo corrompido = padrões', async () => {
    const file = path.join(tmp, 'corrompido.json')
    await fs.mkdir(tmp, { recursive: true })
    await fs.writeFile(file, '{ isto não é json')
    expect(await loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('salva já corrigido e lê de volta igual', async () => {
    const file = path.join(tmp, 'sub', 'configuracoes.json')
    const saved = await saveSettings(file, { oldDays: 1, dupeMinSizeMB: 2, ignore: ['D:\\X'], theme: 'light' })
    expect(saved).toEqual({ oldDays: LIMITS.oldDays.min, dupeMinSizeMB: 2, ignore: ['D:\\X'], theme: 'light' })
    expect(await loadSettings(file)).toEqual(saved)
    // Não sobra o arquivo temporário.
    expect(await fs.readdir(path.dirname(file))).toEqual(['configuracoes.json'])
  })
})
