// Cache da última análise: %APPDATA%\MySyS\ultima-analise.json.gz
// Permite abrir o app já com os resultados, sem analisar o disco de novo.
//
// A árvore do C: tem ~210 mil pastas. Em JSON comum, cada pasta repetiria os
// nomes dos campos ("name", "files", "sizes"…), então ela é guardada
// "achatada" em listas paralelas (formato compacto) e o arquivo é comprimido
// com gzip. Gravar e ler acontecem fora do processo main (worker threads).
import fs from 'node:fs/promises'
import zlib from 'node:zlib'
import { writeFileSafe } from '../write-file-safe'
import { CATEGORIES } from './categories'
import type { ScanResult } from './scan'
import type { DirNode } from './types'

// Aumente quando o formato do cache (ou do ScanResult) mudar: caches de
// versões antigas são ignorados em vez de quebrar o app.
export const CACHE_VERSION = 1

// Um cache maior que isso é suspeito (corrompido ou não é nosso).
const MAX_CACHE_BYTES = 512 * 1024 * 1024

/**
 * Árvore achatada em "pré-ordem" (a pasta, depois as filhas, na ordem).
 * O nó i tem nome names[i], childCount[i] filhas e os tamanhos
 * sizes[i*K .. i*K+K-1], onde K = número de categorias.
 */
export interface CompactTree {
  names: string[]
  files: number[]
  mtime: number[]
  childCount: number[]
  sizes: number[]
}

export interface CachedScan {
  savedAt: number
  result: ScanResult
}

/** DirNode → formato compacto. Sem recursão (pastas muito profundas). */
export function compactTree(root: DirNode): CompactTree {
  const out: CompactTree = { names: [], files: [], mtime: [], childCount: [], sizes: [] }
  const stack: DirNode[] = [root]
  while (stack.length) {
    const n = stack.pop()!
    out.names.push(n.name)
    out.files.push(n.files)
    out.mtime.push(n.mtime)
    out.childCount.push(n.children.length)
    for (const s of n.sizes) out.sizes.push(s)
    // Empilha ao contrário para as filhas saírem na ordem original.
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i])
  }
  return out
}

/** Formato compacto → DirNode. Lança erro se os dados forem incoerentes. */
export function expandTree(c: CompactTree): DirNode {
  const K = CATEGORIES.length
  const count = c.names.length
  if (
    count === 0 ||
    c.files.length !== count ||
    c.mtime.length !== count ||
    c.childCount.length !== count ||
    c.sizes.length !== count * K
  ) {
    throw new Error('Árvore do cache incoerente.')
  }

  // Pilha de pastas que ainda esperam filhas, com quantas faltam.
  const open: { node: DirNode; remaining: number }[] = []
  let root: DirNode | null = null

  for (let i = 0; i < count; i++) {
    const node: DirNode = {
      name: c.names[i],
      files: c.files[i],
      mtime: c.mtime[i],
      sizes: c.sizes.slice(i * K, i * K + K),
      children: [],
    }
    if (i === 0) {
      root = node
    } else {
      const parent = open[open.length - 1]
      if (!parent) throw new Error('Árvore do cache incoerente.')
      parent.node.children.push(node)
      parent.remaining--
    }
    if (c.childCount[i] > 0) open.push({ node, remaining: c.childCount[i] })
    // Fecha as pastas que já receberam todas as filhas.
    while (open.length && open[open.length - 1].remaining === 0) open.pop()
  }
  if (open.length) throw new Error('Árvore do cache incompleta.')
  return root!
}

/** Resultado da análise → bytes comprimidos, prontos para gravar. */
export function encodeCache(result: ScanResult, savedAt: number): Buffer {
  const json = JSON.stringify({
    version: CACHE_VERSION,
    savedAt,
    result: { ...result, tree: compactTree(result.tree) },
  })
  return zlib.gzipSync(json)
}

/** Bytes do arquivo → resultado. Devolve null se for de outra versão ou estiver estragado. */
export function decodeCache(buf: Buffer): CachedScan | null {
  try {
    const data = JSON.parse(zlib.gunzipSync(buf).toString('utf8'))
    if (data?.version !== CACHE_VERSION || typeof data.savedAt !== 'number') return null
    const r = data.result
    if (!r || typeof r !== 'object' || !r.summary || typeof r.summary.root !== 'string') return null
    if (!r.topFiles || !r.junk || !r.old || !Array.isArray(r.dupeCandidates) || !Array.isArray(r.suspectCandidates)) {
      return null
    }
    return { savedAt: data.savedAt, result: { ...r, tree: expandTree(r.tree) } }
  } catch {
    return null
  }
}

/** Grava o cache sem nunca deixar um arquivo pela metade no lugar do antigo. */
export async function saveCache(file: string, result: ScanResult, savedAt = Date.now()): Promise<void> {
  await writeFileSafe(file, encodeCache(result, savedAt))
}

/** Lê o cache. Ausente, grande demais, de outra versão ou estragado = null. */
export async function loadCache(file: string): Promise<CachedScan | null> {
  try {
    const st = await fs.stat(file)
    if (st.size > MAX_CACHE_BYTES) return null
    return decodeCache(await fs.readFile(file))
  } catch {
    return null
  }
}
