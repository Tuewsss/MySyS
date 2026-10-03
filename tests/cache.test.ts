import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { runScan, type ScanResult } from '../electron/scanner/scan'
import {
  CACHE_VERSION,
  compactTree,
  decodeCache,
  encodeCache,
  expandTree,
  loadCache,
  saveCache,
} from '../electron/scanner/cache'
import { CATEGORIES } from '../electron/scanner/categories'
import type { DirNode } from '../electron/scanner/types'

const K = CATEGORIES.length
const node = (name: string, children: DirNode[] = [], size = 0): DirNode => ({
  name,
  files: children.length,
  sizes: Array.from({ length: K }, (_, i) => (i === 0 ? size : 0)),
  mtime: 123,
  children,
})

let tmp: string
let result: ScanResult

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-cache-'))
  const scanRoot = path.join(tmp, 'disco')
  for (const [rel, size] of [
    ['a\\filme.mp4', 300],
    ['a\\b\\foto.jpg', 20],
    ['c\\leiame.txt', 5],
  ] as const) {
    const p = path.join(scanRoot, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, Buffer.alloc(size))
  }
  result = await runScan({ root: scanRoot, oldDays: 180 })
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('compactTree / expandTree', () => {
  it('ida e volta mantém a árvore igual (inclusive a ordem das filhas)', () => {
    const tree = node('C:\\', [node('Videos', [node('Ferias', [], 50), node('Outros', [], 10)], 100), node('Docs', [], 5)])
    expect(expandTree(compactTree(tree))).toEqual(tree)
  })

  it('pasta sozinha (sem filhas)', () => {
    const tree = node('X:\\')
    expect(expandTree(compactTree(tree))).toEqual(tree)
  })

  it('aguenta pastas muito profundas sem estourar a pilha', () => {
    let deep = node('fundo')
    for (let i = 0; i < 50_000; i++) deep = node(`p${i}`, [deep])
    const back = expandTree(compactTree(deep))
    let depth = 0
    for (let n = back; n.children.length; n = n.children[0]) depth++
    expect(depth).toBe(50_000)
  })

  it('recusa dados incoerentes', () => {
    const c = compactTree(node('C:\\', [node('a')]))
    expect(() => expandTree({ ...c, sizes: c.sizes.slice(1) })).toThrow()
    expect(() => expandTree({ ...c, childCount: [3, 0] })).toThrow() // promete filhas que não vêm
    expect(() => expandTree({ ...c, childCount: [0, 0] })).toThrow() // segunda pasta sem mãe
    expect(() => expandTree({ names: [], files: [], mtime: [], childCount: [], sizes: [] })).toThrow()
  })
})

describe('encodeCache / decodeCache', () => {
  it('ida e volta devolve o mesmo resultado da análise', () => {
    const back = decodeCache(encodeCache(result, 1000))
    expect(back).not.toBeNull()
    expect(back!.savedAt).toBe(1000)
    expect(back!.result).toEqual(result)
  })

  it('cache de outra versão é ignorado', () => {
    const json = JSON.stringify({ version: CACHE_VERSION + 1, savedAt: 1, result: {} })
    expect(decodeCache(zlib.gzipSync(json))).toBeNull()
  })

  it('arquivo estragado é ignorado', () => {
    expect(decodeCache(Buffer.from('não é gzip'))).toBeNull()
    const cut = encodeCache(result, 1).subarray(0, 50) // gravação interrompida
    expect(decodeCache(cut)).toBeNull()
    expect(decodeCache(zlib.gzipSync('{"version":1,"savedAt":1,"result":{"summary":{}}}'))).toBeNull()
  })
})

describe('saveCache / loadCache', () => {
  it('grava e lê de volta, sem deixar arquivo temporário', async () => {
    const file = path.join(tmp, 'dados', 'ultima-analise.json.gz')
    await saveCache(file, result, 42)
    const back = await loadCache(file)
    expect(back?.savedAt).toBe(42)
    expect(back?.result.summary).toEqual(result.summary)
    expect(fs.readdirSync(path.dirname(file))).toEqual(['ultima-analise.json.gz'])
  })

  it('sem arquivo = null', async () => {
    expect(await loadCache(path.join(tmp, 'nao-existe.gz'))).toBeNull()
  })
})
