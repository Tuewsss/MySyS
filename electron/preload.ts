import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  CleanProgress,
  CleanReport,
  CleanRequest,
  QuarantineEntry,
  DefenderResult,
  Drive,
  DupesCandidatesInfo,
  DupesProgress,
  DupesResult,
  FolderView,
  JunkResult,
  OldResult,
  ScanProgress,
  ScanSummary,
  Settings,
  SuspectsProgress,
  SuspectsResult,
  TopFile,
} from './scanner/types'

// Inscreve num evento vindo do main e devolve uma função para cancelar a inscrição
// (o React chama essa função quando o componente sai da tela).
function subscribe<T>(channel: string, callback: (data: T) => void) {
  const listener = (_e: IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// Tudo que o React pode pedir ao backend passa por aqui.
// Expomos funções específicas (nunca o ipcRenderer inteiro),
// assim a interface não consegue chamar canais arbitrários.
const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  listDrives: (): Promise<Drive[]> => ipcRenderer.invoke('drives:list'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  // Devolve o que foi salvo (o main corrige valores fora do limite).
  saveSettings: (s: Settings): Promise<Settings> => ipcRenderer.invoke('settings:set', s),

  // Última análise (pode vir do cache: nesse caso o resumo tem `cachedAt`).
  getLastScan: (): Promise<ScanSummary | null> => ipcRenderer.invoke('scan:getLast'),
  startScan: (root: string): Promise<void> => ipcRenderer.invoke('scan:start', root),
  cancelScan: (): Promise<void> => ipcRenderer.invoke('scan:cancel'),
  onScanProgress: (cb: (p: ScanProgress) => void) => subscribe('scan:progress', cb),
  onScanDone: (cb: (s: ScanSummary) => void) => subscribe('scan:done', cb),
  onScanError: (cb: (message: string) => void) => subscribe('scan:error', cb),

  // category: índice da categoria (ver categories.ts) ou null para todas.
  getFolder: (path: string | null, category: number | null): Promise<FolderView | null> =>
    ipcRenderer.invoke('space:getFolder', path, category),
  getTopFiles: (category: number | null): Promise<TopFile[]> => ipcRenderer.invoke('space:getTopFiles', category),
  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showInFolder', path),

  getJunk: (): Promise<JunkResult | null> => ipcRenderer.invoke('junk:get'),
  getOld: (): Promise<OldResult | null> => ipcRenderer.invoke('old:get'),

  getDupesInfo: (): Promise<DupesCandidatesInfo | null> => ipcRenderer.invoke('dupes:info'),
  getDupes: (): Promise<DupesResult | null> => ipcRenderer.invoke('dupes:get'),
  startDupes: (): Promise<void> => ipcRenderer.invoke('dupes:start'),
  cancelDupes: (): Promise<void> => ipcRenderer.invoke('dupes:cancel'),
  onDupesProgress: (cb: (p: DupesProgress) => void) => subscribe('dupes:progress', cb),
  onDupesDone: (cb: (r: DupesResult) => void) => subscribe('dupes:done', cb),
  onDupesError: (cb: (message: string) => void) => subscribe('dupes:error', cb),

  getSuspects: (): Promise<SuspectsResult | null> => ipcRenderer.invoke('suspects:get'),
  startSuspects: (): Promise<void> => ipcRenderer.invoke('suspects:start'),
  cancelSuspects: (): Promise<void> => ipcRenderer.invoke('suspects:cancel'),
  onSuspectsProgress: (cb: (p: SuspectsProgress) => void) => subscribe('suspects:progress', cb),
  // null = verificação cancelada
  onSuspectsDone: (cb: (r: SuspectsResult | null) => void) => subscribe('suspects:done', cb),
  onSuspectsError: (cb: (message: string) => void) => subscribe('suspects:error', cb),
  scanWithDefender: (path: string): Promise<DefenderResult> => ipcRenderer.invoke('defender:scan', path),

  // Limpeza: o main confere cada caminho antes de agir (ver clean-allowlist.ts).
  runClean: (req: CleanRequest): Promise<CleanReport> => ipcRenderer.invoke('clean:run', req),
  cancelClean: (): Promise<void> => ipcRenderer.invoke('clean:cancel'),
  onCleanProgress: (cb: (p: CleanProgress) => void) => subscribe('clean:progress', cb),
  getHistory: (): Promise<CleanReport[]> => ipcRenderer.invoke('history:list'),
  undoClean: (id: string): Promise<{ restored: number; failed: string[] }> => ipcRenderer.invoke('history:undo', id),
  getQuarantine: (): Promise<QuarantineEntry[]> => ipcRenderer.invoke('quarantine:list'),
  restoreFromQuarantine: (id: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('quarantine:restore', id),
}

contextBridge.exposeInMainWorld('api', api)

// Exportamos o tipo para o React saber quais funções existem.
export type Api = typeof api
