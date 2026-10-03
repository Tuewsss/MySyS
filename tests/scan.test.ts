import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { runScan, type ScanResult } from '../electron/scanner/scan'
import type { JunkCategoryId } from '../electron/scanner/types'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

let tmp: string
let result: ScanResult

// Cria um arquivo com `size` bytes e data de modificação de `daysAgo` dias atrás.
function file(rel: string, size: number, daysAgo = 0) {
  const p = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, Buffer.alloc(size))
  const t = new Date(NOW - daysAgo * DAY)
  fs.utimesSync(p, t, t)
}

beforeAll(async () => {
  // Não usamos a pasta temporária do sistema: ela fica dentro de AppData,
  // e o DSS trata AppData de forma especial (o que mudaria o resultado).
  tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-scan-'))
  const user = 'Users\\ana'
  const local = `${user}\\AppData\\Local`

  file(`${local}\\Temp\\a.tmp`, 100)
  file(`${local}\\Temp\\sub\\velho.log`, 7, 400) // dentro do Temp: conta só como Temp
  file(`${local}\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data\\f_1`, 200)
  file(`${local}\\Google\\Chrome\\User Data\\Default\\Preferences`, 5) // não é cache
  file(`${local}\\Mozilla\\Firefox\\Profiles\\abc.default\\cache2\\entries\\x`, 60)
  file(`${local}\\Microsoft\\Windows\\Explorer\\thumbcache_256.db`, 30)
  file(`${local}\\CrashDumps\\app.exe.123.dmp`, 80)
  file(`${local}\\npm-cache\\_cacache\\x`, 90)
  file(`${user}\\Downloads\\setup.exe`, 50, 60)
  file(`${user}\\Downloads\\novo.exe`, 40, 1) // recente: fica
  file(`${user}\\Downloads\\leiame.txt`, 3, 60) // não é instalador
  file(`${user}\\logs\\app.log`, 20, 40)
  file(`${user}\\logs\\recente.log`, 20, 1)
  file(`${user}\\crash.dmp`, 70, 1)
  file(`projetos\\velho\\index.js`, 1, 120)
  file(`projetos\\velho\\node_modules\\pkg\\x.js`, 300, 2000)
  file(`projetos\\velho\\node_modules\\pkg\\node_modules\\dep\\y.js`, 30, 2000)
  file(`projetos\\novo\\index.js`, 1, 2)
  file(`projetos\\novo\\node_modules\\x.js`, 300, 2000)
  file(`Documentos\\foto-2019.jpg`, 500, 1000)
  file(`Documentos\\atual.docx`, 10, 5)
  // Coisas de programas instalados que NÃO podem aparecer:
  file(`${user}\\.vscode\\extensions\\ext-1.0\\node_modules\\a.js`, 40, 2000)
  file(`${local}\\Programs\\App\\resources\\app\\node_modules\\b.js`, 40, 2000)
  file(`${user}\\Downloads\\JogoPortatil\\Jogo.exe`, 25, 400)
  file(`${local}\\AlgumApp\\modelo-antigo.bin`, 900, 1000)
  // Save de jogo antigo: aparece nos antigos, mas marcado como save.
  file(`${user}\\Saved Games\\Jogo\\saves\\slot1.dat`, 15, 400)

  result = await runScan({ root: tmp, now: NOW, oldDays: 180, tempDir: path.join(tmp, local, 'Temp') })
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const cat = (id: JunkCategoryId) => result.junk.categories.find((c) => c.id === id)!
const rel = (p: string) => path.relative(tmp, p)

describe('lixo', () => {
  it('pasta Temp inteira, sem contar o .log de dentro também como log', () => {
    expect(cat('temp').size).toBe(107)
    expect(cat('temp').items.map((i) => i.kind)).toEqual(['folder'])
  })

  it('cache de navegadores (Chrome e Firefox), mas não o resto do perfil', () => {
    expect(cat('navegadores').size).toBe(260)
    expect(cat('navegadores').items).toHaveLength(2)
  })

  it('miniaturas, despejos e cache do npm', () => {
    expect(cat('miniaturas').size).toBe(30)
    expect(cat('despejos').size).toBe(150) // pasta CrashDumps 80 + crash.dmp 70
  })

  it('logs só com mais de 30 dias', () => {
    expect(cat('logs').items.map((i) => rel(i.path))).toEqual(['Users\\ana\\logs\\app.log'])
  })

  it('instaladores antigos só direto em Downloads (não em subpastas)', () => {
    expect(cat('instaladores').items.map((i) => rel(i.path))).toEqual(['Users\\ana\\Downloads\\setup.exe'])
  })

  it('node_modules só de projeto parado há 90 dias, nunca de programas instalados', () => {
    const dev = cat('dev')
    const paths = dev.items.map((i) => rel(i.path)).sort()
    expect(paths).toEqual(['Users\\ana\\AppData\\Local\\npm-cache', 'projetos\\velho\\node_modules'])
    const nm = dev.items.find((i) => i.path.endsWith('node_modules'))!
    expect(nm.size).toBe(330)
    expect(nm.mtimeMs).toBeCloseTo(NOW - 120 * DAY, -4)
  })
})

describe('antigos', () => {
  it('lista arquivos do usuário com mais de 180 dias (fora de lixo e de AppData)', () => {
    const paths = result.old.largest.map((f) => rel(f.path))
    expect(paths).toEqual([
      'Documentos\\foto-2019.jpg',
      'Users\\ana\\Downloads\\JogoPortatil\\Jogo.exe',
      'Users\\ana\\Saved Games\\Jogo\\saves\\slot1.dat',
    ])
    expect(result.old.size).toBe(540)
    expect(result.old.folders.map((f) => rel(f.path))).toEqual([
      'Documentos',
      'Users\\ana\\Downloads\\JogoPortatil',
      'Users\\ana\\Saved Games\\Jogo\\saves',
    ])
  })

  it('marca saves de jogos nos antigos', () => {
    expect(result.old.games.save).toEqual({ size: 15, files: 1 })
    expect(result.old.largest.find((f) => f.path.endsWith('slot1.dat'))?.gameData).toBe('save')
    expect(result.old.largest.find((f) => f.path.endsWith('foto-2019.jpg'))?.gameData).toBeNull()
    expect(result.old.folders.find((f) => f.path.endsWith('saves'))?.gameData).toBe('save')
  })
})
