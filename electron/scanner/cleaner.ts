import fs from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { isProtected, isProtectedArea } from './protected'
import { walk } from './walker'
import { writeFileSafe } from '../write-file-safe'
import type {
  CleanItemResult,
  CleanProgress,
  CleanReport,
  CleanRequest,
  CleanTarget,
  QuarantineEntry,
} from './types'

// Limpeza: o único lugar do MySyS que remove arquivos.
//
// Regras de segurança (seção 5 do projeto):
//  - TODO caminho passa por isProtected() aqui, logo antes de agir;
//  - links simbólicos/junctions nunca são seguidos nem removidos;
//  - arquivos em uso ou sem permissão são pulados e anotados, sem travar;
//  - simulação (dryRun) não toca em nada.
// Quem chama (ipc.ts) ainda confere se cada caminho veio da última análise.

export interface CleanerDeps {
  /** Manda para a Lixeira do Windows (no app: shell.trashItem do Electron). */
  trash: (p: string) => Promise<void>
  /** Pasta de dados do MySyS (%APPDATA%\MySyS): quarentena e histórico. */
  dataDir: string
  /**
   * Chamado antes de QUALQUER operação que remove ou move algo. Se lançar
   * erro, a operação não acontece. Os testes usam isto para garantir que
   * nada fora da pasta de teste seja tocado, mesmo se houver um bug.
   */
  beforeDestroy?: (p: string) => void
}

/**
 * "Esvaziar uma pasta" é bem mais perigoso que remover um item: esvaziar
 * C:\ ou C:\Users\ana apagaria tudo. Além das áreas protegidas, recusamos
 * raízes de unidade, a pasta Users, perfis e as pastas comuns do perfil.
 */
export function canEmptyFolder(dir: string): boolean {
  const n = path.win32.resolve(dir).toLowerCase().replace(/\\+$/, '')
  if (isProtected(dir) && !/^[a-z]:\\windows\\temp$/.test(n)) return false
  if (isProtectedArea(dir)) return false
  if (/^[a-z]:$/.test(n)) return false // raiz da unidade
  if (/^[a-z]:\\users(\\[^\\]+)?$/.test(n)) return false // C:\Users ou C:\Users\ana
  // Pastas principais do perfil: Documentos, Desktop, Downloads, AppData, OneDrive…
  if (/^[a-z]:\\users\\[^\\]+\\[^\\]+$/.test(n) && !/\\(temp|tmp)$/.test(n)) return false
  if (/^[a-z]:\\users\\[^\\]+\\appdata(\\(local|roaming|locallow))?$/.test(n)) return false
  return true
}

const MAX_HISTORY = 300

interface Totals {
  bytes: number
  files: number
  failed: number
}
const zero = (): Totals => ({ bytes: 0, files: 0, failed: 0 })
const add = (a: Totals, b: Totals) => {
  a.bytes += b.bytes
  a.files += b.files
  a.failed += b.failed
}

export class Cleaner {
  private readonly quarantineDir: string
  private readonly indexFile: string
  private readonly historyFile: string

  constructor(private readonly deps: CleanerDeps) {
    this.quarantineDir = path.join(deps.dataDir, 'quarentena')
    this.indexFile = path.join(this.quarantineDir, 'indice.json')
    this.historyFile = path.join(deps.dataDir, 'historico.json')
  }

  // Última checagem antes de remover/mover: protegido nunca, e a trava opcional.
  private guard = (p: string) => {
    if (isProtected(p)) throw new Error(`Bloqueado: caminho protegido (${p})`)
    this.deps.beforeDestroy?.(p)
  }

  // -------------------------------------------------------------------------
  // Limpeza
  // -------------------------------------------------------------------------

  async run(
    req: CleanRequest,
    opts: { onProgress?: (p: CleanProgress) => void; shouldStop?: () => boolean } = {},
  ): Promise<CleanReport> {
    const items: CleanItemResult[] = []
    let cancelled = false

    for (let i = 0; i < req.targets.length; i++) {
      if (opts.shouldStop?.()) {
        cancelled = true
        break
      }
      const t = req.targets[i]
      opts.onProgress?.({ done: i, total: req.targets.length, currentPath: t.path })
      items.push(await this.cleanTarget(t, req))
    }
    opts.onProgress?.({ done: items.length, total: req.targets.length, currentPath: '' })

    const totals = zero()
    for (const it of items) add(totals, it)
    const report: CleanReport = {
      id: newId(),
      date: Date.now(),
      source: req.source,
      action: req.action,
      dryRun: req.dryRun,
      cancelled,
      items,
      ...totals,
    }
    // Simulações não entram no histórico: nada aconteceu de verdade.
    if (!req.dryRun) await this.saveReport(report)
    return report
  }

  private async cleanTarget(t: CleanTarget, req: CleanRequest): Promise<CleanItemResult> {
    const base = { path: t.path, kind: t.kind, bytes: 0, files: 0, failed: 0 }
    const skip = (reason: string): CleanItemResult => ({ ...base, status: 'pulado', reason })

    if (typeof t.path !== 'string' || !path.isAbsolute(t.path)) return skip('Caminho inválido')
    // "contents" mexe só no que está DENTRO da pasta (ex.: C:\Windows\Temp),
    // com regra própria e mais rígida.
    const blocked = t.kind === 'contents' ? !canEmptyFolder(t.path) : isProtected(t.path)
    if (blocked) return skip('Caminho protegido: o MySyS nunca remove')
    if (req.action === 'quarentena' && t.kind !== 'file') return skip('A quarentena é só para arquivos')

    const st = await lstatOrNull(t.path)
    if (!st) return skip('Não existe mais')
    if (st.isSymbolicLink()) return skip('É um atalho de pasta (link): ignorado por segurança')

    try {
      let totals: Totals
      let quarantineId: string | undefined
      switch (t.kind) {
        case 'file': {
          if (!st.isFile()) return skip('Não é um arquivo')
          const r = await this.removeFile(t.path, st, req)
          totals = r.totals
          quarantineId = r.quarantineId
          break
        }
        case 'folder':
          if (!st.isDirectory()) return skip('Não é uma pasta')
          totals = await this.removeFolder(t.path, req)
          break
        case 'contents':
          if (!st.isDirectory()) return skip('Não é uma pasta')
          totals = await this.removeContents(t.path, req)
          break
        case 'old-files':
          if (!st.isDirectory()) return skip('Não é uma pasta')
          if (typeof t.olderThanMs !== 'number') return skip('Data limite ausente')
          totals = await this.removeOldFiles(t.path, t.olderThanMs, req)
          break
        default:
          return skip('Tipo desconhecido')
      }
      const status = totals.failed === 0 ? 'ok' : totals.files > 0 ? 'parcial' : 'erro'
      const reason = totals.failed > 0 ? `${totals.failed} item(ns) em uso ou sem permissão` : undefined
      return { ...base, ...totals, status, reason, quarantineId }
    } catch (err) {
      return { ...base, status: 'erro', failed: 1, reason: describeError(err) }
    }
  }

  private async removeFile(p: string, st: Stats, req: CleanRequest): Promise<{ totals: Totals; quarantineId?: string }> {
    const done: Totals = { bytes: st.size, files: 1, failed: 0 }
    if (req.dryRun) return { totals: done }
    try {
      this.guard(p)
      if (req.action === 'lixeira') await this.deps.trash(p)
      else if (req.action === 'apagar') await fs.unlink(p)
      else return { totals: done, quarantineId: await this.quarantine(p, st.size) }
      return { totals: done }
    } catch {
      return { totals: { bytes: 0, files: 0, failed: 1 } }
    }
  }

  private async removeFolder(dir: string, req: CleanRequest): Promise<Totals> {
    if (req.dryRun) return measure(dir)
    if (req.action === 'apagar') return removeTree(dir, this.guard)
    // Lixeira: a pasta vai inteira (ou nada vai, se algo estiver em uso).
    const size = await measure(dir)
    try {
      this.guard(dir)
      await this.deps.trash(dir)
      return size
    } catch {
      return { bytes: 0, files: 0, failed: Math.max(1, size.files) }
    }
  }

  /** Remove cada item de dentro da pasta, um por um. A pasta em si fica. */
  private async removeContents(dir: string, req: CleanRequest): Promise<Totals> {
    const totals = zero()
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return { bytes: 0, files: 0, failed: 1 }
    }
    for (const name of entries) {
      const child = path.join(dir, name)
      if (isProtected(child)) continue
      const st = await lstatOrNull(child)
      if (!st || st.isSymbolicLink()) continue
      if (st.isDirectory()) add(totals, await this.removeFolder(child, req))
      else if (st.isFile()) add(totals, (await this.removeFile(child, st, req)).totals)
    }
    return totals
  }

  /** Remove os arquivos (direto na pasta, sem subpastas) modificados antes da data limite. */
  private async removeOldFiles(dir: string, olderThanMs: number, req: CleanRequest): Promise<Totals> {
    const totals = zero()
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return { bytes: 0, files: 0, failed: 1 }
    }
    for (const name of entries) {
      const child = path.join(dir, name)
      if (isProtected(child)) continue
      const st = await lstatOrNull(child)
      if (!st || !st.isFile() || st.mtimeMs >= olderThanMs) continue
      add(totals, (await this.removeFile(child, st, req)).totals)
    }
    return totals
  }

  // -------------------------------------------------------------------------
  // Quarentena
  // -------------------------------------------------------------------------

  /**
   * Move o arquivo para a quarentena com a extensão ".quarentena", para que
   * não possa ser aberto sem querer com um clique duplo.
   */
  private async quarantine(p: string, size: number): Promise<string> {
    await fs.mkdir(this.quarantineDir, { recursive: true })
    const id = newId()
    const storedPath = path.join(this.quarantineDir, `${id}.quarentena`)
    this.guard(p)
    await moveFile(p, storedPath)
    const index = await this.listQuarantine()
    index.push({ id, originalPath: p, storedPath, size, date: Date.now() })
    await writeJson(this.indexFile, index)
    return id
  }

  async listQuarantine(): Promise<QuarantineEntry[]> {
    return readJson<QuarantineEntry[]>(this.indexFile, [])
  }

  /** Devolve um arquivo da quarentena para o lugar original. */
  async restore(id: string): Promise<{ ok: boolean; message: string }> {
    const index = await this.listQuarantine()
    const entry = index.find((e) => e.id === id)
    if (!entry) return { ok: false, message: 'Item não está mais na quarentena.' }
    if (await lstatOrNull(entry.originalPath)) {
      return { ok: false, message: `Já existe um arquivo em ${entry.originalPath}.` }
    }
    // O arquivo é procurado na pasta de quarentena ATUAL: o storedPath gravado
    // pode apontar para a pasta antiga (%APPDATA%\DSS, antes de virar MySyS).
    const storedPath = path.join(this.quarantineDir, path.basename(entry.storedPath))
    try {
      this.deps.beforeDestroy?.(storedPath)
      await fs.mkdir(path.dirname(entry.originalPath), { recursive: true })
      await moveFile(storedPath, entry.originalPath)
    } catch (err) {
      return { ok: false, message: describeError(err) }
    }
    await writeJson(
      this.indexFile,
      index.filter((e) => e.id !== id),
    )
    await this.markRestored(id)
    return { ok: true, message: `Restaurado em ${entry.originalPath}.` }
  }

  // -------------------------------------------------------------------------
  // Histórico
  // -------------------------------------------------------------------------

  async history(): Promise<CleanReport[]> {
    return readJson<CleanReport[]>(this.historyFile, [])
  }

  /** Desfaz uma limpeza: restaura tudo dela que ainda está na quarentena. */
  async undo(reportId: string): Promise<{ restored: number; failed: string[] }> {
    const report = (await this.history()).find((r) => r.id === reportId)
    const failed: string[] = []
    let restored = 0
    for (const item of report?.items ?? []) {
      if (!item.quarantineId || item.restored) continue
      const r = await this.restore(item.quarantineId)
      if (r.ok) restored++
      else failed.push(r.message)
    }
    return { restored, failed }
  }

  private async saveReport(report: CleanReport) {
    const list = await this.history()
    list.unshift(report)
    await writeJson(this.historyFile, list.slice(0, MAX_HISTORY))
  }

  private async markRestored(quarantineId: string) {
    const list = await this.history()
    for (const r of list) for (const it of r.items) if (it.quarantineId === quarantineId) it.restored = true
    await writeJson(this.historyFile, list)
  }
}

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

async function lstatOrNull(p: string): Promise<Stats | null> {
  try {
    return await fs.lstat(p)
  } catch {
    return null
  }
}

/** Tamanho de uma pasta (sem seguir links). */
async function measure(dir: string): Promise<Totals> {
  const t = zero()
  await walk(dir, {
    onFile: (f) => {
      t.bytes += f.size
      t.files++
    },
  })
  return t
}

/**
 * Apaga uma pasta e tudo dentro, de baixo para cima, CONTINUANDO quando um
 * arquivo está em uso. Links/junctions são removidos como atalho: o destino
 * deles nunca é tocado.
 */
async function removeTree(dir: string, guard: (p: string) => void): Promise<Totals> {
  const t = zero()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    t.failed++
    return t
  }
  for (const name of entries) {
    const p = path.join(dir, name)
    const st = await lstatOrNull(p)
    if (!st) continue
    try {
      guard(p)
      if (st.isSymbolicLink()) await fs.unlink(p) // remove só o atalho
      else if (st.isDirectory()) add(t, await removeTree(p, guard))
      else {
        await fs.unlink(p)
        t.bytes += st.size
        t.files++
      }
    } catch {
      t.failed++
    }
  }
  try {
    guard(dir)
    await fs.rmdir(dir)
  } catch {
    // sobrou algo em uso dentro dela: a pasta fica, já contamos as falhas
  }
  return t
}

/** Move um arquivo; entre unidades diferentes, copia e depois apaga o original. */
async function moveFile(from: string, to: string) {
  try {
    await fs.rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await fs.copyFile(from, to)
    await fs.unlink(from)
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Se o PC desligar no meio, o JSON não corrompe (ver write-file-safe.ts). */
async function writeJson(file: string, data: unknown) {
  await writeFileSafe(file, JSON.stringify(data))
}

function newId() {
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
}

function describeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') return 'Em uso ou sem permissão'
  if (code === 'ENOENT') return 'Não existe mais'
  return (err as Error)?.message ?? String(err)
}
