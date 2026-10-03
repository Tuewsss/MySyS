import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { inspectFiles, readAutostart } from '../electron/winfiles'
import { findMpCmdRun } from '../electron/scanner/defender'

// Testes de integração: chamam o PowerShell de verdade. Só rodam no Windows.
const onWindows = process.platform === 'win32'
let tmp: string

beforeAll(() => {
  if (!onWindows) return
  tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-win-'))
  fs.writeFileSync(path.join(tmp, 'não-assinado ção.exe'), Buffer.from('MZ fake'))
  const hidden = path.join(tmp, 'oculto.exe')
  fs.writeFileSync(hidden, Buffer.from('MZ fake'))
  execFileSync('attrib', ['+h', hidden])
})

afterAll(() => {
  if (onWindows) fs.rmSync(tmp, { recursive: true, force: true })
})

describe.runIf(onWindows)('PowerShell (Windows)', () => {
  it('informa assinatura, arquivo oculto e inexistente (com acentos no caminho)', async () => {
    const notepad = 'C:\\Windows\\System32\\notepad.exe'
    const naoAssinado = path.join(tmp, 'não-assinado ção.exe')
    const oculto = path.join(tmp, 'oculto.exe')
    const sumiu = path.join(tmp, 'sumiu.exe')
    const facts = await inspectFiles([notepad, naoAssinado, oculto, sumiu])

    expect(facts.get(notepad.toLowerCase())?.signature).toBe('Valid')
    expect(facts.get(notepad.toLowerCase())?.signer).toMatch(/Microsoft/)
    expect(facts.get(naoAssinado.toLowerCase())?.exists).toBe(true)
    expect(facts.get(naoAssinado.toLowerCase())?.signature).not.toBe('Valid')
    expect(facts.get(oculto.toLowerCase())?.hidden).toBe(true)
    expect(facts.get(naoAssinado.toLowerCase())?.hidden).toBe(false)
    expect(facts.get(sumiu.toLowerCase())?.exists).toBe(false)
  }, 60_000)

  it('lê a inicialização automática sem erro', async () => {
    const entries = await readAutostart()
    expect(Array.isArray(entries)).toBe(true)
    for (const e of entries) {
      expect(typeof e.name).toBe('string')
      expect(typeof e.command).toBe('string')
    }
  }, 60_000)

  it('encontra o MpCmdRun do Windows Defender', () => {
    expect(findMpCmdRun()).toMatch(/MpCmdRun\.exe$/)
  })
})
