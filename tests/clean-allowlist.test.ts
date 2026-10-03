import { describe, expect, it } from 'vitest'
import { buildAllowlist, validateRequest } from '../electron/clean-allowlist'
import type { ScanResult } from '../electron/scanner/scan'
import type { DupesResult } from '../electron/scanner/types'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

// Só os campos que o allowlist usa.
const scan = {
  junk: {
    categories: [
      { id: 'temp', items: [{ path: 'C:\\Users\\a\\AppData\\Local\\Temp', kind: 'folder' }] },
      { id: 'dev', items: [{ path: 'C:\\Dev\\velho\\node_modules', kind: 'folder' }] },
      { id: 'logs', items: [{ path: 'C:\\Users\\a\\x.log', kind: 'file' }] },
      { id: 'windowsOld', items: [{ path: 'C:\\Windows.old', kind: 'folder' }] },
    ],
  },
  old: { days: 180, folders: [{ path: 'C:\\Users\\a\\Docs' }], largest: [{ path: 'C:\\Users\\a\\Docs\\v.pdf' }] },
} as unknown as ScanResult

const dupes = {
  groups: [{ size: 1, hash: 'h', files: [{ path: 'C:\\A\\x.mp4' }, { path: 'C:\\B\\x.mp4' }] }],
} as unknown as DupesResult

const allow = buildAllowlist(scan, dupes, null, NOW)
const ask = (targets: { path: string; kind: string }[], action = 'lixeira') =>
  validateRequest({ action, dryRun: false, source: 'teste', targets }, allow, dupes)

describe('allowlist', () => {
  it('aceita itens da última análise, com o tipo certo', () => {
    const r = ask([
      { path: 'C:\\Users\\a\\AppData\\Local\\Temp', kind: 'contents' },
      { path: 'c:\\dev\\velho\\node_modules', kind: 'folder' }, // maiúsculas não importam
      { path: 'C:\\Users\\a\\x.log', kind: 'file' },
    ])
    expect(r.ok).toBe(true)
  })

  it('recusa caminhos que não vieram da análise', () => {
    const r = ask([{ path: 'C:\\Users\\a\\Documents', kind: 'contents' }])
    expect(r).toMatchObject({ ok: false })
  })

  it('recusa tipo diferente do encontrado (ex.: apagar a pasta Temp inteira)', () => {
    expect(ask([{ path: 'C:\\Users\\a\\AppData\\Local\\Temp', kind: 'folder' }]).ok).toBe(false)
  })

  it('Windows.old nunca pode ser limpo pelo MySyS', () => {
    expect(ask([{ path: 'C:\\Windows.old', kind: 'contents' }]).ok).toBe(false)
  })

  it('a data limite dos antigos é definida pelo main, não pela interface', () => {
    const r = validateRequest(
      { action: 'apagar', dryRun: false, targets: [{ path: 'C:\\Users\\a\\Docs', kind: 'old-files', olderThanMs: NOW }] },
      allow,
      dupes,
    )
    expect(r.ok && r.request.targets[0].olderThanMs).toBe(NOW - 180 * DAY)
  })

  it('nunca deixa remover todas as cópias de um duplicado', () => {
    expect(ask([{ path: 'C:\\A\\x.mp4', kind: 'file' }]).ok).toBe(true)
    const r = ask([
      { path: 'C:\\A\\x.mp4', kind: 'file' },
      { path: 'C:\\B\\x.mp4', kind: 'file' },
    ])
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/uma cópia/) })
  })

  it('recusa pedidos malformados', () => {
    expect(validateRequest(null, allow, dupes).ok).toBe(false)
    expect(validateRequest({ action: 'formatar', dryRun: false, targets: [] }, allow, dupes).ok).toBe(false)
    expect(ask([])).toMatchObject({ ok: false })
  })
})
