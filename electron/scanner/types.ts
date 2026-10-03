// Tipos compartilhados entre o backend (Electron) e a interface (React).
// O React importa só os TIPOS daqui (import type), nunca código do Node.

export interface Drive {
  letter: string // ex.: "C:"
  label: string // nome do volume, ex.: "Windows"
  kind: 'local' | 'removivel' | 'rede' | 'cd' | 'outro'
  total: number // bytes
  free: number // bytes
}

export interface ScanProgress {
  files: number
  dirs: number
  bytes: number
  currentPath: string
  elapsedMs: number
}

export interface ScanErrorSample {
  path: string
  code: string // ex.: "EPERM", "EACCES", "EBUSY"
}

export interface ScanSummary {
  root: string
  files: number
  dirs: number
  bytes: number
  skippedLinks: number // links/junctions que NÃO seguimos
  errorCount: number
  errorSamples: ScanErrorSample[] // só os primeiros, para não pesar
  needsAdmin: boolean // alguma pasta negou acesso
  cancelled: boolean
  durationMs: number
  // Preenchido quando o resultado veio da análise salva (cache) e não de uma
  // análise feita agora: data em que ela foi salva. Nesse caso não dá para limpar.
  cachedAt?: number
}

// ---------- Configurações (settings.ts) ----------

export type Theme = 'dark' | 'light'

export interface Settings {
  oldDays: number // dias sem modificação para um arquivo ser "antigo"
  dupeMinSizeMB: number // duplicados: ignora arquivos menores que isso
  ignore: string[] // pastas que a análise não visita
  theme: Theme
}

/**
 * Uma pasta na árvore de tamanhos (montada em sizes.ts).
 * Guardamos só números por pasta (nunca a lista de arquivos), e é isso
 * que mantém a memória baixa mesmo com centenas de milhares de arquivos.
 */
export interface DirNode {
  name: string
  files: number // quantidade de arquivos, incluindo subpastas
  sizes: number[] // bytes por categoria, incluindo subpastas
  mtime: number // data de modificação do arquivo mais recente DIRETO nesta pasta (0 se não tem)
  children: DirNode[]
}

// ---------- Lixo (junk.ts) ----------

export type JunkCategoryId =
  | 'temp'
  | 'navegadores'
  | 'miniaturas'
  | 'logs'
  | 'despejos'
  | 'instaladores'
  | 'dev'
  | 'windowsOld'

export interface JunkItem {
  path: string
  kind: 'folder' | 'file'
  size: number
  files: number
  // Arquivo: data de modificação. node_modules: última alteração do projeto.
  mtimeMs: number | null
}

export interface JunkCategoryResult {
  id: JunkCategoryId
  size: number
  files: number
  items: JunkItem[] // do maior para o menor (limitado; ver `truncated`)
  truncated: number // quantos itens ficaram de fora da lista (mas estão no total)
}

export interface JunkResult {
  categories: JunkCategoryResult[]
}

// ---------- Antigos (old.ts) ----------

export interface OldFolder {
  path: string
  size: number // só os arquivos antigos DIRETO nesta pasta
  files: number
  newestMtimeMs: number // o mais recente entre os antigos
  gameData: GameDataKind | null
}

export interface OldResult {
  days: number
  size: number
  files: number
  // Quanto dos antigos é dado de jogo, por tipo.
  games: Record<GameDataKind, { size: number; files: number }>
  folders: OldFolder[] // do maior para o menor
  foldersTruncated: number
  largest: TopFile[]
}

export type { GameDataKind } from './gamesaves'
import type { GameDataKind } from './gamesaves'

export interface TopFile {
  path: string
  size: number
  mtimeMs: number
  category: number // índice em CATEGORIES (categories.ts)
  gameData?: GameDataKind | null // save/gravação de jogo (ver gamesaves.ts)
}

/** Os maiores arquivos: geral e por categoria (mesma ordem de CATEGORIES). */
export interface TopFilesResult {
  all: TopFile[]
  byCategory: TopFile[][]
}

/** Uma linha na lista de uma pasta do mapa de espaço. */
export interface FolderEntry {
  // dir = subpasta (clicável) · files = arquivos soltos na pasta · rest = itens menores agrupados
  kind: 'dir' | 'files' | 'rest'
  name: string
  path: string
  size: number // já filtrado pela categoria escolhida
  files: number
  sizes: number[] // bytes por categoria (para a barra colorida)
  hasChildren: boolean
}

/** Tudo que a tela precisa para mostrar uma pasta. */
export interface FolderView {
  path: string
  rootPath: string
  size: number
  files: number
  sizes: number[]
  entries: FolderEntry[]
}

// ---------- Duplicados (duplicates.ts) ----------

export interface DupeFile {
  path: string
  mtimeMs: number
  gameData: GameDataKind | null
  inProject?: boolean // dentro de um projeto de código (pode ser cópia de propósito)
}

/** Arquivos com o mesmo tamanho (candidatos, ainda não comparados). */
export interface DupeCandidateGroup {
  size: number
  files: DupeFile[]
}

/** Resumo dos candidatos encontrados na análise. */
export interface DupesCandidatesInfo {
  groups: number
  files: number
  bytes: number
  cloudSkipped: number // arquivos só na nuvem (OneDrive) que não serão lidos
  minSize: number
}

/** Arquivos com conteúdo idêntico (confirmado por SHA-256). */
export interface DupeGroup {
  size: number // tamanho de CADA cópia
  hash: string
  files: DupeFile[]
}

export interface DupesProgress {
  stage: 1 | 2 // 1 = começo dos arquivos (xxhash) · 2 = arquivo inteiro (SHA-256)
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  currentPath: string
  elapsedMs: number
}

export interface DupesResult {
  groups: DupeGroup[] // do que mais desperdiça espaço para o que menos
  wasted: number // bytes que seriam liberados mantendo 1 cópia de cada grupo
  errorCount: number // arquivos que não puderam ser lidos
  cancelled: boolean
  durationMs: number
}

export type DupesWorkerMessage =
  | { type: 'progress'; progress: DupesProgress }
  | { type: 'done'; result: DupesResult }
  | { type: 'error'; message: string }

// ---------- Suspeitos (suspicious.ts) ----------

export type SuspectLocation = 'temp' | 'roaming' | 'downloads' | 'startup'

/** Arquivo separado na análise para verificação mais cuidadosa. */
export interface SuspectCandidate {
  path: string
  size: number
  mtimeMs: number
  location: SuspectLocation | null
  decoyExt: string | null // extensão "disfarce" em nomes como foto.jpg.exe
  rtlo: boolean // nome com caractere que inverte o texto
}

/** Um motivo que soma (ou subtrai) pontos de risco. */
export interface RiskReason {
  points: number
  text: string
}

export interface SuspectItem extends SuspectCandidate {
  score: number // 0 a 100
  reasons: RiskReason[]
  signer: string | null // quem assinou o programa, se assinado
}

/** Programa que roda sozinho quando o Windows inicia. Só listamos. */
export interface AutostartEntry {
  source: string // ex.: "Registro: HKCU\…\Run" ou "Pasta Inicializar"
  name: string
  command: string
  target: string // programa (ou script) que de fato roda
  launcher: string | null // intermediário, ex.: wscript.exe
  enabled: boolean | null // desativado no Gerenciador de Tarefas? (null = não sabemos)
  score: number
  reasons: RiskReason[]
}

export interface SuspectsProgress {
  step: string
  done: number
  total: number
}

export interface SuspectsResult {
  items: SuspectItem[] // do mais arriscado para o menos
  autostart: AutostartEntry[]
  dropped: number // candidatos além do limite, não verificados
  durationMs: number
}

export interface DefenderResult {
  status: 'limpo' | 'ameaca' | 'erro'
  threats: string[]
  message: string
}

// ---------- Limpeza (cleaner.ts) ----------

export type CleanAction = 'lixeira' | 'quarentena' | 'apagar'

/**
 * O que limpar em cada caminho:
 *  file      → o arquivo
 *  folder    → a pasta inteira (ex.: node_modules)
 *  contents  → só o CONTEÚDO da pasta; a pasta fica (ex.: Temp, caches)
 *  old-files → os arquivos antigos que estão direto na pasta
 */
export type CleanKind = 'file' | 'folder' | 'contents' | 'old-files'

export interface CleanTarget {
  path: string
  kind: CleanKind
  olderThanMs?: number // só para old-files (definido pelo processo main)
}

export interface CleanRequest {
  action: CleanAction
  targets: CleanTarget[]
  dryRun: boolean // simulação: mostra o que seria feito sem tocar em nada
  source: string // página de origem, ex.: "Lixo"
}

export interface CleanItemResult {
  path: string
  kind: CleanKind
  // ok = tudo certo · parcial = parte não pôde ser removida · pulado = nada foi feito · erro = falhou
  status: 'ok' | 'parcial' | 'pulado' | 'erro'
  bytes: number // liberados (ou que seriam, na simulação)
  files: number
  failed: number // arquivos que não puderam ser removidos (em uso, sem permissão…)
  reason?: string
  quarantineId?: string // para Desfazer
  restored?: boolean
}

export interface CleanReport {
  id: string
  date: number
  source: string
  action: CleanAction
  dryRun: boolean
  cancelled: boolean
  items: CleanItemResult[]
  bytes: number
  files: number
  failed: number
}

export interface QuarantineEntry {
  id: string
  originalPath: string
  storedPath: string
  size: number
  date: number
}

export interface CleanProgress {
  done: number
  total: number
  currentPath: string
}

// Mensagens que a worker thread envia para o processo main.
// O "done" leva a árvore completa: ela fica no main, e a interface
// pede só a pasta que está exibindo.
export type WorkerMessage =
  | { type: 'progress'; progress: ScanProgress }
  | {
      type: 'done'
      summary: ScanSummary
      tree: DirNode
      topFiles: TopFilesResult
      junk: JunkResult
      old: OldResult
      dupeCandidates: DupeCandidateGroup[]
      dupeInfo: DupesCandidatesInfo
      suspectCandidates: SuspectCandidate[]
      suspectsDropped: number
    }
  | { type: 'error'; message: string }
