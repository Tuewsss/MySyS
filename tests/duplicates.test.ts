import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DupeCandidates, PARTIAL_BYTES, findDuplicates } from '../electron/scanner/duplicates'
import type { FileInfo } from '../electron/scanner/walker'

let tmp: string
const p = (name: string) => path.join(tmp, name)

// Conteúdos de teste (todos com o MESMO tamanho, para cair no mesmo grupo):
const SIZE = PARTIAL_BYTES * 3
const base = Buffer.alloc(SIZE, 7)
const diffAtStart = Buffer.from(base)
diffAtStart[10] = 1 // difere no começo: a etapa 1 já separa
const diffAtEnd = Buffer.from(base)
diffAtEnd[SIZE - 1] = 1 // começo igual, fim diferente: só a etapa 2 (SHA-256) separa

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-dupes-'))
  fs.writeFileSync(p('original.bin'), base)
  fs.writeFileSync(p('copia.bin'), base)
  fs.writeFileSync(p('copia2.bin'), base)
  fs.writeFileSync(p('inicio-diferente.bin'), diffAtStart)
  fs.writeFileSync(p('fim-diferente.bin'), diffAtEnd)
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const info = (name: string, size: number, blocks = 1): FileInfo => ({
  path: p(name),
  name,
  dir: tmp,
  size,
  blocks,
  mtimeMs: 0,
  atimeMs: 0,
})

describe('DupeCandidates', () => {
  it('agrupa por tamanho, ignora pequenos, únicos e arquivos só na nuvem', () => {
    const c = new DupeCandidates(100)
    c.add(info('a', 500), null)
    c.add(info('b', 500), null)
    c.add(info('unico', 700), null)
    c.add(info('pequeno1', 50), null)
    c.add(info('pequeno2', 50), null)
    c.add(info('nuvem', 500, 0), null) // OneDrive: 0 blocos no disco
    const { groups, info: resumo } = c.result()
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => path.basename(f.path))).toEqual(['a', 'b'])
    expect(resumo.cloudSkipped).toBe(1)
  })

  it('marca arquivos dentro de projetos de código (.git ou package.json)', () => {
    const c = new DupeCandidates(100)
    const at = (dir: string, name: string): FileInfo => ({ ...info(name, 500), dir, path: path.join(dir, name) })
    c.add(at('C:\\Dev\\Got\\backend\\media', 'a.png'), null) // arquivo visto ANTES do .git
    c.noteDir('C:\\Dev\\Got\\.git')
    c.noteFileName('C:\\Dev\\site', 'package.json')
    c.add(at('C:\\Dev\\site\\public', 'b.png'), null)
    c.add(at('C:\\Users\\ana\\Fotos', 'c.png'), null)
    const files = c.result().groups[0].files
    expect(files.map((f) => f.inProject)).toEqual([true, true, false])
  })
})

describe('findDuplicates', () => {
  const candidates = () => [
    {
      size: SIZE,
      files: ['original.bin', 'copia.bin', 'copia2.bin', 'inicio-diferente.bin', 'fim-diferente.bin'].map((n) => ({
        path: p(n),
        mtimeMs: 0,
        gameData: null,
      })),
    },
  ]

  it('confirma só arquivos idênticos (começo igual e fim diferente não conta)', async () => {
    const r = await findDuplicates(candidates())
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].files.map((f) => path.basename(f.path)).sort()).toEqual(['copia.bin', 'copia2.bin', 'original.bin'])
    expect(r.wasted).toBe(SIZE * 2)
    expect(r.cancelled).toBe(false)
  })

  it('pula arquivos que sumiram, sem travar', async () => {
    const c = candidates()
    c[0].files.push({ path: p('nao-existe.bin'), mtimeMs: 0, gameData: null })
    const r = await findDuplicates(c)
    expect(r.errorCount).toBe(1)
    expect(r.groups).toHaveLength(1)
  })

  it('pode ser cancelado', async () => {
    const r = await findDuplicates(candidates(), { shouldStop: () => true })
    expect(r.cancelled).toBe(true)
    expect(r.groups).toEqual([])
  })

  it('informa o progresso das duas etapas', async () => {
    const stages = new Set<number>()
    await findDuplicates(candidates(), { onProgress: (pr) => stages.add(pr.stage) })
    expect([...stages].sort()).toEqual([1, 2])
  })
})
