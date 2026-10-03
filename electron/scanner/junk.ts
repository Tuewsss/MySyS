import path from 'node:path'
import { findNode } from './sizes'
import { isProtectedArea } from './protected'
import type { GameDataKind } from './gamesaves'
import type { DirNode, JunkCategoryId, JunkCategoryResult, JunkItem, JunkResult } from './types'
import type { FileInfo } from './walker'

const DAY = 24 * 60 * 60 * 1000

// Ordem em que as categorias aparecem na tela.
const JUNK_ORDER: JunkCategoryId[] = [
  'temp',
  'navegadores',
  'miniaturas',
  'logs',
  'despejos',
  'instaladores',
  'dev',
  'windowsOld',
]

// ----- Regras por PASTA: a pasta inteira é lixo (cache, temporários…) -----
// Testadas com o caminho em minúsculas. Os perfis dos navegadores variam
// ("Default", "Profile 1"…), por isso o [^\\]+ no lugar do nome do perfil.
const BROWSER_CACHE = [
  /\\appdata\\local\\(google\\chrome|microsoft\\edge)\\user data\\[^\\]+\\(cache|code cache|gpucache)$/,
  /\\appdata\\local\\mozilla\\firefox\\profiles\\[^\\]+\\cache2$/,
  /\\appdata\\(local|roaming)\\opera software\\opera gx stable(\\[^\\]+)?\\(cache|code cache|gpucache)$/,
]

interface FolderRule {
  id: JunkCategoryId
  test: (dirLower: string) => boolean
}

function folderRules(tempDir: string | undefined): FolderRule[] {
  const temp = tempDir ? path.resolve(tempDir).toLowerCase() : null
  return [
    {
      id: 'temp',
      test: (d) => d === temp || /\\appdata\\local\\temp$/.test(d) || /^[a-z]:\\windows\\temp$/.test(d),
    },
    { id: 'navegadores', test: (d) => BROWSER_CACHE.some((r) => r.test(d)) },
    { id: 'despejos', test: (d) => /\\appdata\\local\\crashdumps$/.test(d) },
    { id: 'dev', test: (d) => /\\appdata\\local\\(npm-cache|yarn\\cache)$/.test(d) },
    { id: 'windowsOld', test: (d) => /^[a-z]:\\windows\.old$/.test(d) },
  ]
}

export interface JunkOptions {
  now: number
  tempDir?: string
  logDays?: number // padrão 30
  installerDays?: number // padrão 30
  nodeModulesDays?: number // padrão 90
  maxItems?: number // itens listados por categoria (o total conta todos)
}

/** Contexto da pasta atual, calculado uma vez por pasta pela worker. */
export interface DirContext {
  inJunk: boolean // dentro de uma pasta de lixo (os arquivos já contam pela pasta)
  inDownloads: boolean
  protectedArea: boolean // ver protected.ts
  appData: boolean // AppData/ProgramData (ver isAppDataArea)
  gameData: GameDataKind | null // save/gravação de jogo (ver gamesaves.ts)
}

interface Bucket {
  size: number
  files: number
  items: JunkItem[]
}

/**
 * Junta tudo que é lixo durante a varredura.
 * Pastas de lixo são só anotadas aqui; o tamanho delas vem da árvore (sizes.ts)
 * no fim. Arquivos avulsos (logs, .dmp…) são guardados um a um.
 */
export class JunkCollector {
  private readonly rules: FolderRule[]
  private readonly roots = new Map<string, JunkCategoryId>() // pasta de lixo → categoria
  private readonly nodeModules: { path: string; project: string }[] = []
  private readonly fileItems = new Map<JunkCategoryId, JunkItem[]>()
  private readonly opts: Required<Omit<JunkOptions, 'tempDir'>>

  constructor(opts: JunkOptions) {
    this.rules = folderRules(opts.tempDir)
    // maxItems alto: só o que está na lista pode ser limpo (ver clean-allowlist.ts).
    this.opts = { logDays: 30, installerDays: 30, nodeModulesDays: 90, maxItems: 10000, ...opts }
  }

  /** Chamado para cada pasta visitada. Retorna true se ela está dentro de uma pasta de lixo. */
  visitDir(dir: string): boolean {
    if (this.junkRootOf(dir)) return true

    const lower = dir.toLowerCase()
    const rule = this.rules.find((r) => r.test(lower))
    if (rule) {
      this.roots.set(dir, rule.id)
      return true
    }

    // Só o node_modules "de cima" do projeto; os aninhados já estão dentro dele.
    if (path.basename(lower) === 'node_modules' && isUserProjectArea(dir)) {
      this.roots.set(dir, 'dev')
      this.nodeModules.push({ path: dir, project: path.dirname(dir) })
      return true
    }
    return false
  }

  /** Chamado para cada arquivo FORA de pastas de lixo e de áreas protegidas. */
  visitFile(file: FileInfo, ctx: DirContext): void {
    if (ctx.inJunk || ctx.protectedArea) return

    const name = file.name.toLowerCase()
    const ext = name.slice(name.lastIndexOf('.') + 1)
    const ageDays = (this.opts.now - file.mtimeMs) / DAY

    if (/^thumbcache_.*\.db$/.test(name) && /\\appdata\\local\\microsoft\\windows\\explorer$/i.test(file.dir)) {
      this.addFile('miniaturas', file)
    } else if (ext === 'dmp') {
      this.addFile('despejos', file)
    } else if (ext === 'log' && ageDays > this.opts.logDays) {
      this.addFile('logs', file)
    } else if (
      ['exe', 'msi', 'zip', 'rar'].includes(ext) &&
      ageDays > this.opts.installerDays &&
      // Só direto em Downloads: em subpastas costumam estar programas
      // portáteis já extraídos, que parariam de funcionar.
      /\\downloads$/i.test(file.dir)
    ) {
      this.addFile('instaladores', file)
    }
  }

  /** Monta o resultado final, usando a árvore já finalizada para medir as pastas. */
  result(tree: DirNode, rootPath: string): JunkResult {
    const buckets = new Map<JunkCategoryId, Bucket>()
    const bucket = (id: JunkCategoryId) => {
      if (!buckets.has(id)) buckets.set(id, { size: 0, files: 0, items: [] })
      return buckets.get(id)!
    }

    // Pastas de lixo (exceto node_modules, que tem regra de idade).
    const nodeModulesPaths = new Set(this.nodeModules.map((n) => n.path))
    for (const [dir, id] of this.roots) {
      if (nodeModulesPaths.has(dir)) continue
      const node = findNode(tree, rootPath, dir)
      if (!node) continue
      const size = sum(node.sizes)
      if (size === 0 && id !== 'windowsOld') continue
      addTo(bucket(id), { path: dir, kind: 'folder', size, files: node.files, mtimeMs: null })
    }

    // node_modules: só se o projeto está parado há bastante tempo.
    const limit = this.opts.now - this.opts.nodeModulesDays * DAY
    for (const nm of this.nodeModules) {
      const nmNode = findNode(tree, rootPath, nm.path)
      const project = findNode(tree, rootPath, nm.project)
      if (!nmNode || !project) continue
      const lastChange = newestOutsideNodeModules(project)
      if (lastChange > limit) continue
      addTo(bucket('dev'), {
        path: nm.path,
        kind: 'folder',
        size: sum(nmNode.sizes),
        files: nmNode.files,
        mtimeMs: lastChange || null,
      })
    }

    // Arquivos avulsos.
    for (const [id, items] of this.fileItems) {
      const target = bucket(id)
      for (const item of items) addTo(target, item)
    }

    const categories: JunkCategoryResult[] = JUNK_ORDER.map((id) => {
      const b = buckets.get(id) ?? { size: 0, files: 0, items: [] }
      b.items.sort((a, c) => c.size - a.size)
      const shown = b.items.slice(0, this.opts.maxItems)
      return { id, size: b.size, files: b.files, items: shown, truncated: b.items.length - shown.length }
    })
    return { categories }
  }

  // Sobe pelos "pais" da pasta procurando uma pasta de lixo já anotada.
  // São poucos níveis por pasta, então é rápido.
  private junkRootOf(dir: string): boolean {
    let p = dir
    for (;;) {
      if (this.roots.has(p)) return true
      const parent = path.dirname(p)
      if (parent === p) return false
      p = parent
    }
  }

  private addFile(id: JunkCategoryId, file: FileInfo) {
    if (!this.fileItems.has(id)) this.fileItems.set(id, [])
    this.fileItems.get(id)!.push({ path: file.path, kind: 'file', size: file.size, files: 1, mtimeMs: file.mtimeMs })
  }
}

function addTo(b: Bucket, item: JunkItem) {
  b.size += item.size
  b.files += item.files
  b.items.push(item)
}

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)

/**
 * Pasta pode ser um projeto do usuário? Programas instalados também trazem
 * node_modules (Discord, VS Code, extensões, launchers…) e apagá-los quebraria
 * o programa. Eles ficam em AppData, ProgramData, Program Files ou em pastas
 * que começam com ponto (.vscode, .cursor…), então ignoramos esses lugares.
 */
function isUserProjectArea(dir: string): boolean {
  return !isAppDataArea(dir) && !isProtectedArea(dir)
}

/**
 * Dados internos de programas: AppData, ProgramData e pastas que começam
 * com ponto (.vscode, .cursor, .gradle…). Não são arquivos "do usuário".
 */
export function isAppDataArea(dir: string): boolean {
  return /\\appdata(\\|$)/i.test(dir) || /^[a-z]:\\programdata(\\|$)/i.test(dir) || /\\\.[^\\]+(\\|$)/.test(dir)
}

/** Arquivo mais recente do projeto, ignorando qualquer node_modules. */
function newestOutsideNodeModules(project: DirNode): number {
  let newest = 0
  const stack = [project]
  while (stack.length) {
    const n = stack.pop()!
    if (n.mtime > newest) newest = n.mtime
    for (const c of n.children) if (c.name.toLowerCase() !== 'node_modules') stack.push(c)
  }
  return newest
}
