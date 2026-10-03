import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { listDrives } from './drives'
import { CATEGORIES } from './scanner/categories'
import { folderView } from './scanner/sizes'
import type { WorkerInput } from './scanner/worker'
import type { ScanResult } from './scanner/scan'
import { scanWithDefender } from './scanner/defender'
import { runSuspects } from './suspects'
import { Cleaner } from './scanner/cleaner'
import { buildAllowlist, validateRequest } from './clean-allowlist'
import { dupeMinSizeBytes, loadSettings, saveSettings } from './settings'
import * as paths from './paths'
import type { CachedScan } from './scanner/cache'
import type {
  DupesResult,
  DupesWorkerMessage,
  ScanSummary,
  Settings,
  SuspectsResult,
  WorkerMessage,
} from './scanner/types'

// Só uma análise e uma busca de duplicados por vez.
let scanWorker: Worker | null = null
let dupesWorker: Worker | null = null

// Resultado da última análise. Fica aqui no main (e não no React) porque a
// árvore completa é grande; a interface pede só o pedaço que vai mostrar.
let lastResult: ScanResult | null = null
// Se o lastResult veio do cache (análise de outro dia), quando ela foi salva.
// null = análise feita agora. Resultado do cache serve só para ver: os arquivos
// podem ter mudado desde então, então a limpeza exige uma análise nova.
let lastCachedAt: number | null = null
let lastDupes: DupesResult | null = null
let lastSuspects: SuspectsResult | null = null
let suspectsRunning = false
let suspectsCancel = false
let cleaning = false
let cleanCancel = false

// Nunca confie no que vem da interface: valida antes de usar.
function assertAbsolutePath(p: unknown): string {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('Caminho inválido.')
  return path.resolve(p)
}

// Lê o cache numa worker thread (ver cache-worker.ts). Nunca falha: sem cache = null.
function readCacheInWorker(file: string): Promise<CachedScan | null> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'cache-worker.js'), { workerData: file })
    worker.once('message', (cached: CachedScan | null) => resolve(cached))
    worker.once('error', () => resolve(null))
    worker.once('exit', () => resolve(null)) // se já resolveu, não faz nada
  })
}

function parseCategory(c: unknown): number | null {
  if (c === null || c === undefined) return null
  if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < CATEGORIES.length) return c
  throw new Error('Categoria inválida.')
}

export function registerIpc(win: BrowserWindow) {
  // Envia um evento para a janela, se ela ainda existir.
  const send = (channel: string, data: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }

  // Pasta de dados do DSS: %APPDATA%\DSS (configurações, cache, quarentena e histórico).
  const dataDir = paths.dataDir()
  const settingsFile = paths.settingsFile()
  const cacheFile = paths.cacheFile()

  ipcMain.handle('app:getVersion', () => app.getVersion())

  // ---------------- Configurações ----------------

  let settings: Settings
  const settingsReady = loadSettings(settingsFile).then((s) => (settings = s))

  ipcMain.handle('settings:get', async () => {
    await settingsReady
    return settings
  })

  // Valida e salva; devolve o que foi salvo (valores fora do limite são corrigidos).
  ipcMain.handle('settings:set', async (_e, raw: unknown) => {
    await settingsReady
    settings = await saveSettings(settingsFile, raw)
    return settings
  })

  ipcMain.handle('drives:list', () => listDrives())

  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Escolha a pasta para analisar',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Só abre o Explorador com o arquivo selecionado. Não altera nada.
  ipcMain.handle('shell:showInFolder', (_e, p: unknown) => {
    shell.showItemInFolder(assertAbsolutePath(p))
  })

  // ---------------- Análise ----------------

  // Ao abrir o app, a interface pede a última análise. Na primeira vez, ela vem
  // do cache em disco (lido uma vez só). Se uma análise nova já terminou, vale ela.
  let cacheRead: Promise<void> | null = null
  ipcMain.handle('scan:getLast', async (): Promise<ScanSummary | null> => {
    cacheRead ??= readCacheInWorker(cacheFile).then((cached) => {
      // Uma análise feita (ou começada) enquanto o cache carregava vale mais.
      if (!cached || lastResult || scanWorker) return
      lastResult = cached.result
      lastCachedAt = cached.savedAt
    })
    await cacheRead
    if (!lastResult) return null
    return lastCachedAt === null ? lastResult.summary : { ...lastResult.summary, cachedAt: lastCachedAt }
  })

  ipcMain.handle('scan:start', async (_event, root: unknown) => {
    const rootPath = assertAbsolutePath(root)
    await settingsReady
    if (scanWorker) throw new Error('Já existe uma análise em andamento.')
    if (dupesWorker) throw new Error('Aguarde ou cancele a busca de duplicados antes de analisar de novo.')
    if (suspectsRunning) throw new Error('Aguarde ou cancele a verificação de suspeitos antes de analisar de novo.')
    if (cleaning) throw new Error('Aguarde a limpeza terminar antes de analisar de novo.')

    // As configurações valem a partir desta análise.
    const input: WorkerInput = {
      root: rootPath,
      ignore: settings.ignore,
      oldDays: settings.oldDays,
      dupeMinSize: dupeMinSizeBytes(settings),
      cacheFile,
    }
    // scan-worker.js é gerado pelo Vite ao lado do main.js (ver vite.config.mts).
    const worker = new Worker(path.join(__dirname, 'scan-worker.js'), { workerData: input })
    scanWorker = worker

    worker.on('message', (msg: WorkerMessage) => {
      // Ao terminar, libera para uma nova análise imediatamente.
      if (msg.type !== 'progress' && scanWorker === worker) scanWorker = null
      if (msg.type === 'progress') send('scan:progress', msg.progress)
      if (msg.type === 'done') {
        const { type: _type, ...result } = msg
        lastResult = result
        lastCachedAt = null
        lastDupes = null // resultados da análise anterior não valem mais
        lastSuspects = null
        send('scan:done', msg.summary)
      }
      if (msg.type === 'error') send('scan:error', msg.message)
    })
    worker.on('error', (err: Error) => {
      if (scanWorker === worker) scanWorker = null
      send('scan:error', err.message)
    })
    worker.on('exit', () => {
      if (scanWorker === worker) scanWorker = null
    })
  })

  ipcMain.handle('scan:cancel', () => {
    // Cancelamento "educado": a worker termina o que está fazendo,
    // para e ainda devolve o resumo parcial.
    scanWorker?.postMessage('cancel')
  })

  // ---------------- Resultados ----------------

  // Mapa de espaço: uma pasta por vez. `target` null = raiz da análise.
  ipcMain.handle('space:getFolder', (_e, target: unknown, category: unknown) => {
    if (!lastResult) return null
    const rootPath = lastResult.summary.root
    const p = target == null ? rootPath : assertAbsolutePath(target)
    return folderView(lastResult.tree, rootPath, p, parseCategory(category))
  })

  ipcMain.handle('space:getTopFiles', (_e, category: unknown) => {
    if (!lastResult) return []
    const c = parseCategory(category)
    return c === null ? lastResult.topFiles.all : lastResult.topFiles.byCategory[c]
  })

  ipcMain.handle('junk:get', () => lastResult?.junk ?? null)
  ipcMain.handle('old:get', () => lastResult?.old ?? null)

  // ---------------- Duplicados ----------------

  ipcMain.handle('dupes:info', () => lastResult?.dupeInfo ?? null)
  ipcMain.handle('dupes:get', () => lastDupes)

  ipcMain.handle('dupes:start', () => {
    if (!lastResult) throw new Error('Faça uma análise primeiro.')
    if (scanWorker) throw new Error('Aguarde a análise terminar.')
    if (dupesWorker) throw new Error('A busca de duplicados já está em andamento.')

    const worker = new Worker(path.join(__dirname, 'dupes-worker.js'), {
      workerData: lastResult.dupeCandidates,
    })
    dupesWorker = worker
    lastDupes = null

    worker.on('message', (msg: DupesWorkerMessage) => {
      if (msg.type !== 'progress' && dupesWorker === worker) dupesWorker = null
      if (msg.type === 'progress') send('dupes:progress', msg.progress)
      if (msg.type === 'done') {
        lastDupes = msg.result
        send('dupes:done', msg.result)
      }
      if (msg.type === 'error') send('dupes:error', msg.message)
    })
    worker.on('error', (err: Error) => {
      if (dupesWorker === worker) dupesWorker = null
      send('dupes:error', err.message)
    })
    worker.on('exit', () => {
      if (dupesWorker === worker) dupesWorker = null
    })
  })

  ipcMain.handle('dupes:cancel', () => {
    dupesWorker?.postMessage('cancel')
  })

  // ---------------- Suspeitos ----------------

  ipcMain.handle('suspects:get', () => lastSuspects)

  ipcMain.handle('suspects:start', async () => {
    if (!lastResult) throw new Error('Faça uma análise primeiro.')
    if (suspectsRunning) throw new Error('A verificação já está em andamento.')
    suspectsRunning = true
    suspectsCancel = false
    lastSuspects = null
    // Não usamos "await" aqui: a tela recebe o resultado pelos eventos.
    runSuspects(lastResult.suspectCandidates, lastResult.suspectsDropped, {
      onProgress: (p) => send('suspects:progress', p),
      shouldStop: () => suspectsCancel,
    })
      .then((result) => {
        lastSuspects = result
        send('suspects:done', result) // null = cancelado
      })
      .catch((err: Error) => send('suspects:error', err.message))
      .finally(() => {
        suspectsRunning = false
      })
  })

  ipcMain.handle('suspects:cancel', () => {
    suspectsCancel = true
  })

  // Windows Defender: verifica UM arquivo (sem remover nada).
  ipcMain.handle('defender:scan', (_e, p: unknown) => scanWithDefender(assertAbsolutePath(p)))

  // ---------------- Limpeza ----------------

  const cleaner = new Cleaner({
    dataDir,
    trash: (p) => shell.trashItem(p),
  })

  ipcMain.handle('clean:run', async (_e, req: unknown) => {
    if (cleaning) throw new Error('Já existe uma limpeza em andamento.')
    if (scanWorker || dupesWorker || suspectsRunning) throw new Error('Aguarde a análise em andamento terminar.')
    // Vale também para a simulação: ela mostraria um resultado que pode não ser mais verdade.
    if (lastCachedAt !== null) {
      throw new Error('Este resultado é de uma análise salva. Analise de novo antes de limpar: os arquivos podem ter mudado.')
    }

    // Só caminhos que vieram da última análise, com o tipo certo.
    const allow = buildAllowlist(lastResult, lastDupes, lastSuspects)
    const check = validateRequest(req, allow, lastDupes)
    if (!check.ok) throw new Error(check.error)

    cleaning = true
    cleanCancel = false
    try {
      return await cleaner.run(check.request, {
        onProgress: (p) => send('clean:progress', p),
        shouldStop: () => cleanCancel,
      })
    } finally {
      cleaning = false
    }
  })

  ipcMain.handle('clean:cancel', () => {
    cleanCancel = true
  })

  ipcMain.handle('history:list', () => cleaner.history())
  ipcMain.handle('history:undo', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Pedido inválido.')
    return cleaner.undo(id)
  })
  ipcMain.handle('quarantine:list', () => cleaner.listQuarantine())
  ipcMain.handle('quarantine:restore', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Pedido inválido.')
    return cleaner.restore(id)
  })
}
