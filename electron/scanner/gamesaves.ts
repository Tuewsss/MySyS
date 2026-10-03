import { isGameFolder } from './categories'

// Detecta saves de jogos (e gravações de jogos) pelo caminho e pela extensão.
// Não existe um padrão único: cada jogo guarda em um lugar. Por isso juntamos
// vários sinais. Na dúvida, preferimos marcar como save: errar para o lado
// de proteger o progresso de alguém é melhor que o contrário.

export type GameDataKind =
  | 'save' // com certeza é save
  | 'possivel-save' // está numa pasta de dados de jogo, mas sem sinal claro
  | 'gravacao' // replays, gravações, capturas: não é progresso

// Nomes de pasta que indicam save (comparados em minúsculas, pasta inteira).
const SAVE_SEGMENTS = new Set([
  'save', 'saves', 'savegame', 'savegames', 'savedata', 'save data', 'savefile', 'savefiles',
  'gamesave', 'gamesaves', 'saved games', 'jogos salvos', 'savegame data',
])

// Nomes de pasta de gravações/replays (só valem dentro de pastas de jogo,
// senão a pasta "Vídeos" do usuário viraria "gravação de jogo").
const MEDIA_SEGMENTS = new Set([
  'replay', 'replays', 'screenshot', 'screenshots', 'capturas', 'capturas de tela', 'captures',
  'recordings', 'gravações', 'gravacoes', 'vídeos gravados', 'videos gravados', 'recorded videos',
  'videos', 'vídeos', 'clips', 'demos', 'photos', 'fotos',
])

// Dentro de pastas de jogo, estas NÃO são saves (logs, travamentos, cache…).
const NOT_SAVE_SEGMENTS = new Set([
  'logs', 'log', 'crashes', 'crashdumps', 'crashreports', 'shaders', 'temp', 'tmp', 'mods', 'downloads',
  // Launchers (Rockstar, EA…) embutem um navegador; "Renderer" guarda o cache dele.
  'renderer', 'service worker',
])
// Qualquer pasta com "cache" no nome (Cache, Code Cache, Cache_Data, ShaderCache…).
const isCacheSegment = (s: string) => s.includes('cache')

// Pastas das publicadoras em Documentos (guardam saves e configurações).
const PUBLISHER_SEGMENTS = new Set([
  'electronic arts', 'rockstar games', 'ubisoft', 'paradox interactive', 'cd projekt red',
  'larian studios', 'bethesda softworks', 'bioware', 'square enix', '2k games', 'klei',
  'eidos montreal', 'warhorse studios', 'fromsoftware', 'capcom', 'bandai namco',
  'activision', 'blizzard entertainment', 'sega', 'codemasters', 'frontier developments',
  'wb games', 'warner bros. interactive entertainment', 'cd projekt', 'gog.com',
])

// Extensões de arquivo de save conhecidas.
const SAVE_EXTENSIONS = new Set([
  'sav', 'save', 'savegame', 'sl2', 'ess', 'fos', 'lsv', 'rpgsave', 'rmmzsave',
])

/** Classifica uma PASTA. Retorna null se não parece dado de jogo. */
export function classifyGameDir(dir: string): GameDataKind | null {
  const lower = dir.toLowerCase()
  const segs = lower.split('\\')

  // "Contexto de saves": lugares feitos para guardar dados de jogo.
  const saveRoot =
    segs.includes('saved games') ||
    segs.includes('jogos salvos') ||
    segs.includes('my games') ||
    segs.includes('locallow') ||
    segs.some((s) => PUBLISHER_SEGMENTS.has(s)) ||
    /\\appdata\\local\\[^\\]+\\saved(\\|$)/.test(lower) // padrão da Unreal Engine
  // Contexto mais amplo: inclui as pastas de instalação dos jogos.
  const gameContext = saveRoot || isGameFolder(dir)

  // Ordem importa: gravações e "não-saves" são checados antes, para que
  // "Saved Games\Jogo\Replays" vire gravação e não save.
  if (gameContext && segs.some((s) => MEDIA_SEGMENTS.has(s))) return 'gravacao'
  if (segs.some((s) => SAVE_SEGMENTS.has(s) && s !== 'saved games' && s !== 'jogos salvos')) return 'save'
  if (gameContext && segs.some((s) => NOT_SAVE_SEGMENTS.has(s) || isCacheSegment(s))) return null
  // A Rockstar guarda os saves em "Profiles".
  if (gameContext && segs.includes('profiles')) return 'save'
  // "Saved Games" é a pasta oficial do Windows para saves.
  if (segs.includes('saved games') || segs.includes('jogos salvos')) return 'save'
  if (saveRoot) return 'possivel-save'
  return null
}

/** Classifica um ARQUIVO, usando a classificação da pasta dele. */
export function classifyGameFile(name: string, dirKind: GameDataKind | null): GameDataKind | null {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  // Extensão de save é sinal forte, exceto dentro de pastas de gravação.
  if (SAVE_EXTENSIONS.has(ext) && dirKind !== 'gravacao') return 'save'
  return dirKind
}

// Quando juntamos vários arquivos (ex.: numa pasta), vale o sinal mais forte.
const RANK: Record<GameDataKind, number> = { gravacao: 1, 'possivel-save': 2, save: 3 }
export function strongerGameData(a: GameDataKind | null, b: GameDataKind | null): GameDataKind | null {
  if (!a) return b
  if (!b) return a
  return RANK[a] >= RANK[b] ? a : b
}
