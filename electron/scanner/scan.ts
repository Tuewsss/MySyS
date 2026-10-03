// A análise completa: percorre o disco e alimenta todos os coletores
// (tamanhos, maiores arquivos, lixo, antigos, candidatos a duplicados). Separado da worker para
// poder ser testado diretamente.
import { walk } from './walker'
import { SizeTree, TopFiles } from './sizes'
import { CATEGORIES, categorize, isDownloadsFolder, isGameFolder } from './categories'
import { JunkCollector, isAppDataArea, type DirContext } from './junk'
import { OldCollector } from './old'
import { isProtectedArea } from './protected'
import { classifyGameDir, classifyGameFile } from './gamesaves'
import { DupeCandidates } from './duplicates'
import { SuspectCollector, suspectLocation } from './suspicious'
import type { ScanErrorSample, ScanProgress, ScanSummary, SuspectLocation, WorkerMessage } from './types'

export interface ScanOptions {
  root: string
  ignore?: string[]
  oldDays?: number
  dupeMinSize?: number // tamanho mínimo para procurar duplicados (padrão 1 MB)
  now?: number // permite "fingir" a data atual nos testes
  tempDir?: string
  shouldStop?: () => boolean
  onProgress?: (p: ScanProgress) => void
}

export type ScanResult = Omit<Extract<WorkerMessage, { type: 'done' }>, 'type'>

const PROGRESS_INTERVAL_MS = 200
const MAX_ERROR_SAMPLES = 200
const ACCESS_DENIED = new Set(['EPERM', 'EACCES'])

export async function runScan(opts: ScanOptions): Promise<ScanResult> {
  const { root } = opts
  const start = Date.now()
  const now = opts.now ?? start
  let files = 0
  let dirs = 0
  let bytes = 0
  let skippedLinks = 0
  let errorCount = 0
  let needsAdmin = false
  const errorSamples: ScanErrorSample[] = []
  let currentPath = root
  let lastProgress = 0

  const tree = new SizeTree(root)
  const topAll = new TopFiles(50)
  const topByCategory = CATEGORIES.map(() => new TopFiles(50))
  const junk = new JunkCollector({ now, tempDir: opts.tempDir })
  const old = new OldCollector(now, opts.oldDays ?? 180)
  const dupes = new DupeCandidates(opts.dupeMinSize ?? 1024 * 1024)
  const suspects = new SuspectCollector()
  let suspectLoc: SuspectLocation | null = null

  // O walker avisa a pasta (onDir) e logo em seguida entrega os arquivos dela.
  // Calculamos as características da pasta uma vez só, não a cada arquivo.
  let inGames = false
  let ctx: DirContext = { inJunk: false, inDownloads: false, protectedArea: false, appData: false, gameData: null }

  // Envia progresso no máximo a cada 200 ms: mandar a cada arquivo
  // inundaria a interface de mensagens e deixaria tudo mais lento.
  const reportProgress = (force = false) => {
    const t = Date.now()
    if (!opts.onProgress || (!force && t - lastProgress < PROGRESS_INTERVAL_MS)) return
    lastProgress = t
    opts.onProgress({ files, dirs, bytes, currentPath, elapsedMs: t - start })
  }

  const finished = await walk(root, {
    ignore: opts.ignore,
    shouldStop: opts.shouldStop,
    onDir: (dir) => {
      dirs++
      currentPath = dir
      tree.addDir(dir)
      inGames = isGameFolder(dir)
      ctx = {
        inJunk: junk.visitDir(dir),
        inDownloads: isDownloadsFolder(dir),
        protectedArea: isProtectedArea(dir),
        appData: isAppDataArea(dir),
        gameData: classifyGameDir(dir),
      }
      dupes.noteDir(dir)
      suspectLoc = suspectLocation(dir)
      reportProgress()
    },
    onFile: (file) => {
      files++
      bytes += file.size

      const category = categorize(file.name, inGames, ctx.inDownloads)
      tree.addFile(file.dir, file.size, category, file.mtimeMs)

      const top = { path: file.path, size: file.size, mtimeMs: file.mtimeMs, category }
      topAll.add(top)
      topByCategory[category].add(top)

      junk.visitFile(file, ctx)
      dupes.noteFileName(file.dir, file.name)
      // Suspeitos: fora do sistema/programas e de jogos instalados.
      if (!ctx.protectedArea && !inGames) suspects.add(file, suspectLoc)
      // Antigos: só arquivos do usuário. Ignora o que já é lixo, o sistema,
      // os programas e os dados internos deles (AppData/ProgramData).
      if (!ctx.inJunk && !ctx.protectedArea && !ctx.appData) {
        old.add(file, category, ctx.gameData)
        // Duplicados: mesmas regras e, além disso, fora de jogos instalados
        // (arquivos repetidos ali fazem parte do jogo; apagar quebraria).
        if (!inGames) dupes.add(file, classifyGameFile(file.name, ctx.gameData))
      }
    },
    onSkipLink: () => skippedLinks++,
    onError: (path, err) => {
      errorCount++
      const code = err.code ?? 'ERRO'
      if (ACCESS_DENIED.has(code)) needsAdmin = true
      if (errorSamples.length < MAX_ERROR_SAMPLES) errorSamples.push({ path, code })
    },
  })

  reportProgress(true)

  const summary: ScanSummary = {
    root,
    files,
    dirs,
    bytes,
    skippedLinks,
    errorCount,
    errorSamples,
    needsAdmin,
    cancelled: !finished,
    durationMs: Date.now() - start,
  }
  const finalTree = tree.finalize()
  const suspectsResult = suspects.result()
  return {
    summary,
    tree: finalTree,
    topFiles: { all: topAll.list(), byCategory: topByCategory.map((t) => t.list()) },
    junk: junk.result(finalTree, root),
    old: old.result(),
    ...dupesOut(dupes),
    suspectCandidates: suspectsResult.candidates,
    suspectsDropped: suspectsResult.dropped,
  }
}

function dupesOut(dupes: DupeCandidates) {
  const { groups, info } = dupes.result()
  return { dupeCandidates: groups, dupeInfo: info }
}
