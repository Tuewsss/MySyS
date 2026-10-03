import path from 'node:path'
import { CATEGORIES } from './categories'
import type { DirNode, FolderEntry, FolderView, TopFile } from './types'

// Observação: durante a varredura, `files` e `sizes` de cada pasta contam só
// os arquivos diretos dela. O finalize() soma as subpastas no fim.

const emptySizes = () => new Array<number>(CATEGORIES.length).fill(0)
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)

/** Monta a árvore durante a varredura. */
export class SizeTree {
  readonly root: DirNode
  // Atalho caminho → pasta, usado só durante a varredura (depois é apagado).
  private byPath = new Map<string, DirNode>()

  constructor(readonly rootPath: string) {
    this.root = { name: rootPath, files: 0, sizes: emptySizes(), mtime: 0, children: [] }
    this.byPath.set(rootPath, this.root)
  }

  /** Registra uma pasta. A pasta-mãe sempre é visitada antes da filha. */
  addDir(dir: string): void {
    if (this.byPath.has(dir)) return
    const parent = this.byPath.get(path.dirname(dir))
    if (!parent) return
    const node: DirNode = { name: path.basename(dir), files: 0, sizes: emptySizes(), mtime: 0, children: [] }
    parent.children.push(node)
    this.byPath.set(dir, node)
  }

  addFile(dir: string, size: number, category: number, mtimeMs = 0): void {
    const node = this.byPath.get(dir)
    if (!node) return
    node.sizes[category] += size
    node.files++
    if (mtimeMs > node.mtime) node.mtime = mtimeMs
  }

  /**
   * Soma os tamanhos das subpastas nas pastas-mãe e ordena por tamanho.
   * Feito sem recursão (pilha explícita) para aguentar pastas muito profundas.
   */
  finalize(): DirNode {
    const order: DirNode[] = []
    const stack = [this.root]
    while (stack.length) {
      const n = stack.pop()!
      order.push(n)
      for (const c of n.children) stack.push(c)
    }
    // Percorrendo ao contrário, cada filha é processada antes da mãe.
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]
      for (const c of n.children) {
        n.files += c.files
        for (let k = 0; k < n.sizes.length; k++) n.sizes[k] += c.sizes[k]
      }
      n.children.sort((a, b) => sum(b.sizes) - sum(a.sizes))
    }
    this.byPath.clear()
    return this.root
  }
}

/** Guarda só os N maiores arquivos, sem acumular todos em memória. */
export class TopFiles {
  // Ordenado do MENOR para o maior: o primeiro é o candidato a sair.
  private items: TopFile[] = []

  constructor(private readonly limit = 50) {}

  add(file: TopFile): void {
    if (this.items.length >= this.limit && file.size <= this.items[0].size) return
    // Busca binária da posição para manter a lista ordenada.
    let lo = 0
    let hi = this.items.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.items[mid].size < file.size) lo = mid + 1
      else hi = mid
    }
    this.items.splice(lo, 0, file)
    if (this.items.length > this.limit) this.items.shift()
  }

  /** Maior primeiro. */
  list(): TopFile[] {
    return [...this.items].reverse()
  }
}

// Pastas com milhares de subpastas (ex.: WinSxS) ficariam pesadas na tela.
// Mostramos as maiores e juntamos o resto numa linha só.
export const MAX_ENTRIES = 300

/** Acha a pasta `target` dentro da árvore. Retorna null se não existir. */
export function findNode(root: DirNode, rootPath: string, target: string): DirNode | null {
  const rel = path.relative(rootPath, target)
  if (rel === '') return root
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null

  let node = root
  for (const part of rel.split(path.sep)) {
    const lower = part.toLowerCase() // Windows não diferencia maiúsculas
    const next = node.children.find((c) => c.name.toLowerCase() === lower)
    if (!next) return null
    node = next
  }
  return node
}

/**
 * Monta o que a tela precisa para exibir UMA pasta: o total dela e a lista
 * do que tem dentro, já filtrada por categoria (null = todas) e ordenada.
 */
export function folderView(
  root: DirNode,
  rootPath: string,
  target: string,
  category: number | null,
): FolderView | null {
  const node = findNode(root, rootPath, target)
  if (!node) return null
  const sizeOf = (s: number[]) => (category === null ? sum(s) : s[category])

  const dirs: FolderEntry[] = node.children
    .map((c) => ({
      kind: 'dir' as const,
      name: c.name,
      path: path.join(target, c.name),
      size: sizeOf(c.sizes),
      files: c.files,
      sizes: c.sizes,
      hasChildren: c.children.length > 0,
    }))
    .filter((e) => e.size > 0)

  // Arquivos que estão direto nesta pasta = total da pasta − soma das subpastas.
  const looseSizes = node.sizes.slice()
  let looseFiles = node.files
  for (const c of node.children) {
    looseFiles -= c.files
    for (let k = 0; k < looseSizes.length; k++) looseSizes[k] -= c.sizes[k]
  }
  const loose: FolderEntry = {
    kind: 'files',
    name: 'Arquivos nesta pasta',
    path: target,
    size: sizeOf(looseSizes),
    files: looseFiles,
    sizes: looseSizes,
    hasChildren: false,
  }

  let entries = loose.size > 0 ? [...dirs, loose] : dirs
  entries.sort((a, b) => b.size - a.size)

  if (entries.length > MAX_ENTRIES) {
    const rest = entries.slice(MAX_ENTRIES)
    const restSizes = emptySizes()
    for (const e of rest) for (let k = 0; k < restSizes.length; k++) restSizes[k] += e.sizes[k]
    entries = entries.slice(0, MAX_ENTRIES)
    entries.push({
      kind: 'rest',
      name: `Outros ${rest.length} itens menores`,
      path: target,
      size: rest.reduce((s, e) => s + e.size, 0),
      files: rest.reduce((s, e) => s + e.files, 0),
      sizes: restSizes,
      hasChildren: false,
    })
  }

  return {
    path: target,
    rootPath,
    size: sizeOf(node.sizes),
    files: node.files,
    sizes: node.sizes,
    entries,
  }
}
