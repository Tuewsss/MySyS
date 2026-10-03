import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Cleaner, canEmptyFolder } from '../electron/scanner/cleaner'
import { migrateDataDir } from '../electron/migrate-data'
import type { CleanRequest, CleanTarget } from '../electron/scanner/types'

const DAY = 24 * 60 * 60 * 1000
let tmp: string
let work: string // onde ficam os arquivos "do usuário"
let trashed: string[] // o que foi mandado para a Lixeira falsa
let trashFails: Set<string> // caminhos que a Lixeira falsa recusa (simula "em uso")
let cleaner: Cleaner

const p = (...parts: string[]) => path.join(work, ...parts)
function file(rel: string, size = 10, daysAgo = 0) {
  const f = p(rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, Buffer.alloc(size))
  const t = new Date(Date.now() - daysAgo * DAY)
  fs.utimesSync(f, t, t)
  return f
}
const exists = (f: string) => fs.existsSync(f)
const req = (action: CleanRequest['action'], targets: CleanTarget[], dryRun = false): CleanRequest => ({
  action,
  targets,
  dryRun,
  source: 'teste',
})

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-cleaner-'))
  work = path.join(tmp, 'usuario')
  fs.mkdirSync(work)
  trashed = []
  trashFails = new Set()
  cleaner = new Cleaner({
    dataDir: path.join(tmp, 'dados'),
    // TRAVA DOS TESTES: qualquer tentativa de remover/mover algo FORA da pasta
    // temporária vira erro. Assim, um bug no cleaner nunca apaga arquivos reais.
    beforeDestroy: (f) => {
      if (!isInside(f, tmp)) throw new Error(`TESTE TENTOU REMOVER FORA DA PASTA DE TESTE: ${f}`)
    },
    trash: async (f) => {
      if (!isInside(f, tmp)) throw new Error(`TESTE TENTOU MANDAR PARA A LIXEIRA FORA DA PASTA DE TESTE: ${f}`)
      if (trashFails.has(f)) throw Object.assign(new Error('em uso'), { code: 'EBUSY' })
      trashed.push(f)
      fs.rmSync(f, { recursive: true, force: true })
    },
  })
})

const isInside = (f: string, dir: string) => path.resolve(f).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('segurança', () => {
  it.each([
    ['C:\\Windows\\notepad.exe', 'file'],
    ['C:\\Windows\\System32', 'folder'],
    ['C:\\Program Files', 'contents'],
    ['C:\\', 'contents'],
    ['C:\\', 'folder'],
    ['C:\\pagefile.sys', 'file'],
    ['C:\\Windows\\Temp', 'folder'], // a pasta Temp em si nunca sai
    ['D:\\', 'contents'],
    ['C:\\Users', 'contents'],
    ['C:\\Users\\ana', 'contents'],
    ['C:\\Users\\ana\\Documents', 'contents'],
    ['C:\\Users\\ana\\Downloads', 'contents'],
    ['C:\\Users\\ana\\AppData\\Local', 'contents'],
    ['relativo\\x.txt', 'file'],
  ] as const)('recusa %s (%s) logo de cara, sem tocar em nada', async (target, kind) => {
    for (const action of ['lixeira', 'apagar', 'quarentena'] as const) {
      const r = await cleaner.run(req(action, [{ path: target, kind }]))
      expect(r.items[0].status).toBe('pulado')
      expect(r.items[0].bytes).toBe(0)
    }
    expect(trashed).toEqual([])
  })

  it('canEmptyFolder libera só pastas de lixo específicas', () => {
    expect(canEmptyFolder('C:\\Users\\ana\\AppData\\Local\\Temp')).toBe(true)
    expect(canEmptyFolder('C:\\Windows\\Temp')).toBe(true)
    expect(canEmptyFolder('C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache')).toBe(true)
    expect(canEmptyFolder('C:\\')).toBe(false)
    expect(canEmptyFolder('C:\\Users\\ana\\Desktop')).toBe(false)
  })

  it('a trava dos testes funciona (prova de que um bug não apagaria arquivos reais)', async () => {
    const r = await cleaner.run(req('apagar', [{ path: 'C:\\Dev\\nao-existe-mysys-teste.txt', kind: 'file' }]))
    expect(r.items[0].status).toBe('pulado') // não existe, nem chega a tentar
    expect(() => (cleaner as unknown as { guard: (p: string) => void }).guard('C:\\Dev\\x.txt')).toThrow(/FORA DA PASTA/)
  })

  it('não segue nem remove o destino de um link (junction) dentro da pasta apagada', async () => {
    const fora = path.join(tmp, 'fora')
    fs.mkdirSync(fora)
    fs.writeFileSync(path.join(fora, 'importante.txt'), 'não pode sumir')
    file('node_modules\\pkg\\index.js')
    fs.symlinkSync(fora, p('node_modules', 'link-para-fora'), 'junction')

    const r = await cleaner.run(req('apagar', [{ path: p('node_modules'), kind: 'folder' }]))
    expect(r.items[0].status).toBe('ok')
    expect(exists(p('node_modules'))).toBe(false)
    expect(fs.readFileSync(path.join(fora, 'importante.txt'), 'utf8')).toBe('não pode sumir')
  })

  it('ignora quando o próprio alvo é um link', async () => {
    const fora = path.join(tmp, 'fora2')
    fs.mkdirSync(fora)
    fs.symlinkSync(fora, p('atalho'), 'junction')
    const r = await cleaner.run(req('apagar', [{ path: p('atalho'), kind: 'folder' }]))
    expect(r.items[0].status).toBe('pulado')
    expect(exists(fora)).toBe(true)
  })

  it('quarentena só aceita arquivos', async () => {
    file('pasta\\a.txt')
    const r = await cleaner.run(req('quarentena', [{ path: p('pasta'), kind: 'folder' }]))
    expect(r.items[0].status).toBe('pulado')
    expect(exists(p('pasta', 'a.txt'))).toBe(true)
  })

  it('arquivo que não existe mais é pulado', async () => {
    const r = await cleaner.run(req('lixeira', [{ path: p('sumiu.txt'), kind: 'file' }]))
    expect(r.items[0]).toMatchObject({ status: 'pulado', reason: 'Não existe mais' })
  })
})

describe('simulação (dry-run)', () => {
  it('calcula o que seria liberado sem tocar em nada e sem ir para o histórico', async () => {
    const a = file('a.bin', 100)
    file('cache\\x.bin', 50)
    file('cache\\sub\\y.bin', 25)
    const r = await cleaner.run(
      req('apagar', [
        { path: a, kind: 'file' },
        { path: p('cache'), kind: 'contents' },
      ], true),
    )
    expect(r.bytes).toBe(175)
    expect(r.files).toBe(3)
    expect(exists(a) && exists(p('cache', 'sub', 'y.bin'))).toBe(true)
    expect(await cleaner.history()).toEqual([])
  })
})

describe('ações', () => {
  it('Lixeira (padrão): manda o arquivo para a Lixeira', async () => {
    const a = file('a.txt', 30)
    const r = await cleaner.run(req('lixeira', [{ path: a, kind: 'file' }]))
    expect(r.items[0]).toMatchObject({ status: 'ok', bytes: 30, files: 1 })
    expect(trashed).toEqual([a])
  })

  it('apagar permanentemente', async () => {
    const a = file('a.txt')
    await cleaner.run(req('apagar', [{ path: a, kind: 'file' }]))
    expect(exists(a)).toBe(false)
    expect(trashed).toEqual([])
  })

  it('"contents" esvazia a pasta, mas a pasta fica', async () => {
    file('Temp\\a.tmp', 10)
    file('Temp\\sub\\b.tmp', 20)
    const r = await cleaner.run(req('lixeira', [{ path: p('Temp'), kind: 'contents' }]))
    expect(r.items[0]).toMatchObject({ status: 'ok', bytes: 30, files: 2 })
    expect(exists(p('Temp'))).toBe(true)
    expect(fs.readdirSync(p('Temp'))).toEqual([])
  })

  it('item em uso é pulado e o resto continua (parcial)', async () => {
    file('Temp\\livre.tmp', 10)
    const preso = file('Temp\\em-uso.tmp', 20)
    trashFails.add(preso)
    const r = await cleaner.run(req('lixeira', [{ path: p('Temp'), kind: 'contents' }]))
    expect(r.items[0]).toMatchObject({ status: 'parcial', bytes: 10, files: 1, failed: 1 })
    expect(exists(preso)).toBe(true)
  })

  it('"old-files" remove só arquivos antigos direto na pasta', async () => {
    const velho = file('Docs\\velho.pdf', 10, 400)
    const novo = file('Docs\\novo.pdf', 10, 1)
    const sub = file('Docs\\sub\\velho2.pdf', 10, 400)
    const r = await cleaner.run(
      req('apagar', [{ path: p('Docs'), kind: 'old-files', olderThanMs: Date.now() - 180 * DAY }]),
    )
    expect(r.items[0].files).toBe(1)
    expect([exists(velho), exists(novo), exists(sub)]).toEqual([false, true, true])
  })
})

describe('quarentena, histórico e desfazer', () => {
  it('move para a quarentena e Desfazer devolve ao lugar original', async () => {
    const sus = file('Downloads\\foto.jpg.exe', 42)
    const r = await cleaner.run(req('quarentena', [{ path: sus, kind: 'file' }]))
    expect(exists(sus)).toBe(false)

    const q = await cleaner.listQuarantine()
    expect(q).toHaveLength(1)
    expect(q[0].originalPath).toBe(sus)
    expect(q[0].storedPath.endsWith('.quarentena')).toBe(true) // não abre com clique duplo
    expect(exists(q[0].storedPath)).toBe(true)

    const hist = await cleaner.history()
    expect(hist[0].id).toBe(r.id)

    const u = await cleaner.undo(r.id)
    expect(u).toEqual({ restored: 1, failed: [] })
    expect(fs.statSync(sus).size).toBe(42)
    expect(await cleaner.listQuarantine()).toEqual([])
    expect((await cleaner.history())[0].items[0].restored).toBe(true)
  })

  it('não sobrescreve se já existir um arquivo no lugar original', async () => {
    const sus = file('x.exe')
    await cleaner.run(req('quarentena', [{ path: sus, kind: 'file' }]))
    file('x.exe') // outro arquivo apareceu no mesmo lugar
    const [entry] = await cleaner.listQuarantine()
    const r = await cleaner.restore(entry.id)
    expect(r.ok).toBe(false)
    expect(await cleaner.listQuarantine()).toHaveLength(1)
  })

  it('restaura depois de migrar os dados do DSS para a pasta do MySyS', async () => {
    const sus = file('Downloads\\antigo.exe', 7)
    const r = await cleaner.run(req('quarentena', [{ path: sus, kind: 'file' }]))

    const novaPasta = path.join(tmp, 'dados-mysys')
    expect(migrateDataDir(path.join(tmp, 'dados'), novaPasta)).toEqual(['historico.json', 'quarentena'])
    const novo = new Cleaner({ dataDir: novaPasta, beforeDestroy: () => {}, trash: async () => {} })

    expect(await novo.undo(r.id)).toEqual({ restored: 1, failed: [] })
    expect(fs.statSync(sus).size).toBe(7)
  })
})

describe('migração da pasta de dados', () => {
  it('não sobrescreve o que já existe na pasta nova', () => {
    const velha = path.join(tmp, 'DSS')
    const nova = path.join(tmp, 'MySyS')
    fs.mkdirSync(velha)
    fs.mkdirSync(nova)
    fs.writeFileSync(path.join(velha, 'configuracoes.json'), 'velha')
    fs.writeFileSync(path.join(nova, 'configuracoes.json'), 'nova')
    fs.writeFileSync(path.join(velha, 'historico.json'), '[]')

    expect(migrateDataDir(velha, nova)).toEqual(['historico.json'])
    expect(fs.readFileSync(path.join(nova, 'configuracoes.json'), 'utf8')).toBe('nova')
    expect(exists(path.join(velha, 'configuracoes.json'))).toBe(true)
  })

  it('não faz nada sem a pasta antiga', () => {
    expect(migrateDataDir(path.join(tmp, 'nao-existe'), path.join(tmp, 'MySyS'))).toEqual([])
    expect(exists(path.join(tmp, 'MySyS'))).toBe(false)
  })
})
