import { describe, expect, it } from 'vitest'
import {
  SuspectCollector,
  analyzeAutostart,
  commandTarget,
  decoyExtension,
  expandEnv,
  scoreFile,
  suspectLocation,
  type FileFacts,
} from '../electron/scanner/suspicious'
import { parseDefenderOutput } from '../electron/scanner/defender'
import type { SuspectCandidate } from '../electron/scanner/types'
import type { FileInfo } from '../electron/scanner/walker'

const U = 'C:\\Users\\ana'

describe('decoyExtension', () => {
  it('detecta extensão dupla enganosa', () => {
    expect(decoyExtension('foto.jpg.exe')).toBe('jpg')
    expect(decoyExtension('Documento.PDF.scr')).toBe('pdf')
    expect(decoyExtension('fatura.pdf     .exe')).toBe('pdf') // espaços para esconder
  })
  it('não confunde nomes normais', () => {
    expect(decoyExtension('setup.exe')).toBeNull()
    expect(decoyExtension('node.v20.1.exe')).toBeNull()
    expect(decoyExtension('relatorio.final.pdf')).toBeNull()
  })
})

describe('suspectLocation', () => {
  it.each([
    [`${U}\\AppData\\Local\\Temp\\x`, 'temp'],
    ['C:\\Windows\\Temp', 'temp'],
    [`${U}\\AppData\\Roaming\\App`, 'roaming'],
    [`${U}\\Downloads`, 'downloads'],
    [`${U}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`, 'startup'],
    [`${U}\\AppData\\Local\\Programs\\App`, null],
    [`${U}\\Documents`, null],
  ])('%s → %s', (dir, loc) => expect(suspectLocation(dir)).toBe(loc))
})

const file = (dir: string, name: string): FileInfo => ({
  path: `${dir}\\${name}`,
  name,
  dir,
  size: 100,
  blocks: 1,
  mtimeMs: 0,
  atimeMs: 0,
})

describe('SuspectCollector', () => {
  it('separa executáveis em locais de risco e nomes enganosos', () => {
    const c = new SuspectCollector()
    c.add(file(`${U}\\Downloads`, 'setup.exe'), 'downloads')
    c.add(file(`${U}\\Documents`, 'foto.jpg.exe'), null) // nome enganoso em qualquer lugar
    c.add(file(`${U}\\Documents`, 'programa.exe'), null) // lugar comum: fica de fora
    c.add(file(`${U}\\Downloads`, 'foto.jpg'), 'downloads') // não é executável
    c.add(file(`${U}\\AppData\\Roaming\\npm\\node_modules\\x`, 'index.js'), 'roaming') // biblioteca
    c.add(file(`${U}\\AppData\\Roaming\\x`, 'run.vbs'), 'roaming')
    c.add(file(`${U}\\AppData\\Local\\Temp`, 'bundle.js'), 'temp') // código interno de app
    c.add(file(`${U}\\Downloads`, 'fatura.js'), 'downloads') // .js baixado: risco
    c.add(file('C:\\Dev\\app\\node_modules\\x\\test', 'Iterator.zip.js'), null) // nome de função
    expect(c.result().candidates.map((x) => x.path.split('\\').pop())).toEqual([
      'setup.exe',
      'foto.jpg.exe',
      'run.vbs',
      'fatura.js',
    ])
  })
})

const cand = (path: string, extra: Partial<SuspectCandidate> = {}): SuspectCandidate => ({
  path,
  size: 1,
  mtimeMs: 0,
  location: null,
  decoyExt: null,
  rtlo: false,
  ...extra,
})
const facts = (f: Partial<FileFacts>): FileFacts => ({ exists: true, hidden: false, signature: null, signer: null, ...f })

describe('scoreFile', () => {
  it('nome enganoso + sem assinatura + Downloads = risco alto (vermelho)', () => {
    const r = scoreFile(cand(`${U}\\Downloads\\foto.jpg.exe`, { decoyExt: 'jpg', location: 'downloads' }), facts({ signature: 'NotSigned' }))
    expect(r.score).toBe(100)
    expect(r.reasons.map((x) => x.text).join(' ')).toMatch(/parece \.jpg/)
  })

  it('programa assinado em AppData\\Roaming = risco baixo (verde)', () => {
    const r = scoreFile(cand(`${U}\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe`, { location: 'roaming' }), facts({ signature: 'Valid', signer: 'Zoom' }))
    expect(r.score).toBe(0)
  })

  it('sem assinatura no Temp = risco médio (amarelo)', () => {
    const r = scoreFile(cand(`${U}\\AppData\\Local\\Temp\\a.exe`, { location: 'temp' }), facts({ signature: 'NotSigned' }))
    expect(r.score).toBe(60)
  })

  it('assinatura adulterada e arquivo oculto pesam muito', () => {
    const r = scoreFile(cand(`${U}\\Downloads\\x.exe`, { location: 'downloads' }), facts({ signature: 'HashMismatch', hidden: true }))
    expect(r.score).toBe(85)
  })

  it('programa de gerenciador de pacotes (pip/uv) sem assinatura fica verde', () => {
    const r = scoreFile(
      cand(`${U}\\AppData\\Roaming\\uv\\tools\\graphifyy\\Scripts\\f2py.exe`, { location: 'roaming' }),
      facts({ signature: 'NotSigned' }),
    )
    expect(r.score).toBe(30)
  })

  it('ícones do Windows Installer com extensão .exe ficam verdes', () => {
    const r = scoreFile(
      cand(`${U}\\AppData\\Roaming\\Microsoft\\Installer\\{70316E2B-A36C-4CF2-A14C-431BEC482141}\\powertoys.exe`, {
        location: 'roaming',
      }),
      facts({ signature: 'UnknownError' }),
    )
    expect(r.score).toBe(10)
  })

  it('scripts não são penalizados por falta de assinatura', () => {
    const r = scoreFile(cand(`${U}\\AppData\\Roaming\\x\\run.vbs`, { location: 'roaming' }), facts({ signature: 'NotSigned' }))
    expect(r.score).toBe(20)
  })
})

describe('inicialização automática', () => {
  it('extrai o programa da linha de comando', () => {
    expect(commandTarget('"C:\\Program Files\\App\\app.exe" --min')).toBe('C:\\Program Files\\App\\app.exe')
    expect(commandTarget('C:\\Users\\ana\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe')).toBe(
      'C:\\Users\\ana\\AppData\\Local\\Discord\\Update.exe',
    )
  })

  it('troca variáveis de ambiente', () => {
    expect(expandEnv('%APPDATA%\\x.exe', { APPDATA: 'C:\\R' })).toBe('C:\\R\\x.exe')
    expect(expandEnv('%NAO_EXISTE%\\x', {})).toBe('%NAO_EXISTE%\\x')
  })

  it('programa assinado em Program Files = verde', () => {
    const r = analyzeAutostart({ command: '"C:\\Program Files\\App\\app.exe"' }, () => facts({ signature: 'Valid' }))
    expect(r.score).toBe(0)
  })

  it('script escondido via wscript na pasta Temp = vermelho', () => {
    const r = analyzeAutostart(
      { command: `wscript.exe //B "${U}\\AppData\\Local\\Temp\\x.vbs"` },
      () => facts({}),
    )
    expect(r.launcher).toBe('wscript.exe')
    expect(r.target).toBe(`${U}\\AppData\\Local\\Temp\\x.vbs`)
    expect(r.score).toBeGreaterThanOrEqual(60)
  })

  it('valor que não é caminho de programa', () => {
    const r = analyzeAutostart({ command: '99edffb0-fb99-4c7a-9729-9d39fbcef4e5' }, () => facts({ exists: false }))
    expect(r.score).toBe(5)
    expect(r.reasons[0].text).toMatch(/não é o caminho/)
  })

  it('PowerShell com comando codificado', () => {
    const r = analyzeAutostart({ command: 'powershell.exe -w hidden -enc SQBFAFgA' }, () => undefined)
    expect(r.reasons.some((x) => /codificado/.test(x.text))).toBe(true)
  })
})

describe('parseDefenderOutput', () => {
  it('nenhuma ameaça (código 0)', () => {
    const out = 'Scan starting...\nScan finished.\nScanning C:\\x.exe found no threats.'
    expect(parseDefenderOutput(0, out).status).toBe('limpo')
  })

  it('ameaça encontrada (código 2)', () => {
    const out = 'Scan starting...\nScan finished.\nScanning C:\\x.exe found 1 threats.\n\n' +
      'LIST OF DETECTED THREATS\n-------------------\nThreat                  : Trojan:Win32/Exemplo!ml\nResources               : 1 total\n'
    const r = parseDefenderOutput(2, out)
    expect(r.status).toBe('ameaca')
    expect(r.threats).toEqual(['Trojan:Win32/Exemplo!ml'])
  })

  it('falha do Defender', () => {
    expect(parseDefenderOutput(5, 'CmdTool: Failed with hr = 0x80508023').status).toBe('erro')
  })
})
