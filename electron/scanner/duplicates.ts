import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import xxhash from 'xxhash-wasm'
import type { FileInfo } from './walker'
import type { GameDataKind } from './gamesaves'
import type {
  DupeCandidateGroup,
  DupeFile,
  DupeGroup,
  DupesCandidatesInfo,
  DupesProgress,
  DupesResult,
} from './types'

export const PARTIAL_BYTES = 64 * 1024 // etapa 1 lê só o começo de cada arquivo

// ---------------------------------------------------------------------------
// Coleta durante a análise
// ---------------------------------------------------------------------------

/**
 * Guarda os arquivos grandes agrupados por TAMANHO durante a varredura.
 * Dois arquivos só podem ser iguais se tiverem exatamente o mesmo tamanho,
 * então isso já descarta quase tudo sem ler nenhum byte.
 */
export class DupeCandidates {
  private bySize = new Map<number, DupeFile[]>()
  private cloudSkipped = 0
  // Pastas raiz de projetos de código. Neles, arquivos repetidos costumam ser
  // de propósito (ex.: "media" e "media_seed"); apagar um quebraria o projeto.
  private projectRoots = new Set<string>()

  constructor(private readonly minSize: number) {}

  /** A worker avisa cada pasta e arquivo para detectarmos projetos de código. */
  noteDir(dir: string): void {
    if (path.basename(dir).toLowerCase() === '.git') this.projectRoots.add(path.dirname(dir))
  }
  noteFileName(dir: string, name: string): void {
    if (PROJECT_MARKERS.has(name.toLowerCase())) this.projectRoots.add(dir)
  }

  add(file: FileInfo, gameData: GameDataKind | null): void {
    if (file.size < this.minSize) return
    // Arquivo do OneDrive que está só na nuvem: não ocupa espaço no disco
    // (0 blocos alocados) e LER o arquivo faria o OneDrive baixá-lo. Pulamos.
    if (file.blocks === 0) {
      this.cloudSkipped++
      return
    }
    let list = this.bySize.get(file.size)
    if (!list) {
      list = []
      this.bySize.set(file.size, list)
    }
    list.push({ path: file.path, mtimeMs: file.mtimeMs, gameData })
  }

  result(): { groups: DupeCandidateGroup[]; info: DupesCandidatesInfo } {
    const groups: DupeCandidateGroup[] = []
    let files = 0
    let bytes = 0
    for (const [size, list] of this.bySize) {
      if (list.length < 2) continue
      // Só no fim conhecemos todos os projetos (o .git pode ser visto depois dos arquivos).
      for (const f of list) f.inProject = this.isInProject(path.dirname(f.path))
      groups.push({ size, files: list })
      files += list.length
      bytes += size * list.length
    }
    this.bySize.clear()
    return {
      groups,
      info: { groups: groups.length, files, bytes, cloudSkipped: this.cloudSkipped, minSize: this.minSize },
    }
  }

  private isInProject(dir: string): boolean {
    for (let p = dir; ; ) {
      if (this.projectRoots.has(p)) return true
      const parent = path.dirname(p)
      if (parent === p) return false
      p = parent
    }
  }
}

// Arquivos que indicam a raiz de um projeto de código.
const PROJECT_MARKERS = new Set([
  'package.json', 'manage.py', 'pyproject.toml', 'requirements.txt', 'cargo.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'composer.json', 'gemfile', 'cmakelists.txt',
])

// ---------------------------------------------------------------------------
// Comparação do conteúdo
// ---------------------------------------------------------------------------

export interface FindOptions {
  shouldStop?: () => boolean
  onProgress?: (p: DupesProgress) => void
  concurrency?: number // quantos arquivos ler ao mesmo tempo
}

const PROGRESS_INTERVAL_MS = 200

/**
 * Encontra os duplicados de verdade em 2 etapas:
 *  1. Para cada grupo de mesmo tamanho, compara os primeiros 64 KB (xxhash, muito rápido).
 *     Arquivos diferentes quase sempre já diferem no começo.
 *  2. Quem continuou igual tem o arquivo INTEIRO conferido com SHA-256.
 *     Só arquivos com o mesmo SHA-256 são considerados duplicados.
 */
export async function findDuplicates(candidates: DupeCandidateGroup[], opts: FindOptions = {}): Promise<DupesResult> {
  const start = Date.now()
  const concurrency = opts.concurrency ?? 4
  const { create64 } = await xxhash()
  let errorCount = 0
  let cancelled = false

  // Progresso compartilhado pelas duas etapas.
  const progress: DupesProgress = {
    stage: 1,
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    currentPath: '',
    elapsedMs: 0,
  }
  let lastReport = 0
  const report = (force = false) => {
    const t = Date.now()
    if (!opts.onProgress || (!force && t - lastReport < PROGRESS_INTERVAL_MS)) return
    lastReport = t
    opts.onProgress({ ...progress, elapsedMs: t - start })
  }
  const stop = () => {
    if (!cancelled && opts.shouldStop?.()) cancelled = true
    return cancelled
  }

  // Lê o hash de cada arquivo de cada grupo e reagrupa por (hash). Arquivos com
  // erro (sumiu, em uso, sem permissão) são pulados e contados.
  async function regroup(
    groups: { size: number; files: DupeFile[] }[],
    hashFile: (f: DupeFile, size: number) => Promise<string>,
  ) {
    const jobs = groups.flatMap((g) => g.files.map((f) => ({ g, f })))
    const hashes = new Map<DupeFile, string>()
    let next = 0

    // Um "pool" simples: N leitores pegam o próximo arquivo da fila.
    const worker = async () => {
      while (next < jobs.length && !stop()) {
        const { g, f } = jobs[next++]
        progress.currentPath = f.path
        try {
          hashes.set(f, await hashFile(f, g.size))
        } catch {
          errorCount++
        }
        progress.filesDone++
        report()
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))

    const out: { size: number; hash: string; files: DupeFile[] }[] = []
    for (const g of groups) {
      const byHash = new Map<string, DupeFile[]>()
      for (const f of g.files) {
        const h = hashes.get(f)
        if (h === undefined) continue
        if (!byHash.has(h)) byHash.set(h, [])
        byHash.get(h)!.push(f)
      }
      for (const [hash, files] of byHash) if (files.length >= 2) out.push({ size: g.size, hash, files })
    }
    return out
  }

  // ---- Etapa 1: começo do arquivo com xxhash ----
  progress.filesTotal = candidates.reduce((s, g) => s + g.files.length, 0)
  progress.bytesTotal = candidates.reduce((s, g) => s + Math.min(g.size, PARTIAL_BYTES) * g.files.length, 0)
  report(true)

  const partial = await regroup(candidates, async (f, size) => {
    const n = Math.min(size, PARTIAL_BYTES)
    const buf = Buffer.alloc(n)
    const fh = await fs.promises.open(f.path, 'r')
    try {
      await fh.read(buf, 0, n, 0)
    } finally {
      await fh.close()
    }
    progress.bytesDone += n
    return create64().update(buf).digest().toString(16)
  })

  // ---- Etapa 2: arquivo inteiro com SHA-256 ----
  let full: DupeGroup[] = []
  if (!stop()) {
    progress.stage = 2
    progress.filesDone = 0
    progress.bytesDone = 0
    progress.filesTotal = partial.reduce((s, g) => s + g.files.length, 0)
    progress.bytesTotal = partial.reduce((s, g) => s + g.size * g.files.length, 0)
    report(true)

    full = await regroup(partial, (f) => sha256File(f.path, stop, (n) => (progress.bytesDone += n)))
  }
  report(true)

  // Os grupos que mais desperdiçam espaço primeiro.
  const wastedOf = (g: DupeGroup) => g.size * (g.files.length - 1)
  full.sort((a, b) => wastedOf(b) - wastedOf(a))

  return {
    groups: cancelled ? [] : full,
    wasted: cancelled ? 0 : full.reduce((s, g) => s + wastedOf(g), 0),
    errorCount,
    cancelled,
    durationMs: Date.now() - start,
  }
}

/** SHA-256 do arquivo inteiro, lendo em pedaços (não carrega tudo na memória). */
function sha256File(p: string, shouldStop: () => boolean, onBytes: (n: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(p, { highWaterMark: 1024 * 1024 })
    stream.on('data', (chunk) => {
      if (shouldStop()) {
        stream.destroy(new Error('cancelado'))
        return
      }
      hash.update(chunk)
      onBytes(chunk.length)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
