// Classifica cada arquivo em um "tipo" para o filtro do mapa de espaço.
// A ordem dos índices importa: as somas por pasta são guardadas num
// array [video, imagem, jogos, instaladores, compactados, outros].

export const CATEGORIES = ['video', 'imagem', 'jogos', 'instaladores', 'compactados', 'outros'] as const
export type Category = (typeof CATEGORIES)[number]

export const CAT = {
  video: 0,
  imagem: 1,
  jogos: 2,
  instaladores: 3,
  compactados: 4,
  outros: 5,
} as const satisfies Record<Category, number>

const VIDEO = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'm2ts', 'vob'])
const IMAGEM = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'tif', 'tiff',
  'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'psd', 'svg', 'ico', 'avif',
])
const COMPACTADOS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'cab'])
// Pacotes de instalação. Um .exe comum é um PROGRAMA, não instalador,
// por isso o .exe tem regra própria abaixo.
const INSTALADORES = new Set(['msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'iso'])

// Jogos não têm uma extensão própria (são .exe, .pak, .dll…), então
// reconhecemos pelas pastas das lojas/launchers mais comuns.
const GAME_FOLDERS = [
  '\\steamapps\\',
  '\\epic games\\',
  '\\riot games\\',
  '\\xboxgames\\',
  '\\gog galaxy\\games\\',
  '\\gog games\\',
  '\\ea games\\',
  '\\origin games\\',
  '\\ubisoft game launcher\\games\\',
  '\\rockstar games\\',
  '\\battle.net\\games\\',
]

// Pacotes de dados de jogos (Unreal, Source, Bethesda…). Pegam jogos
// instalados fora das pastas das lojas.
const GAME_EXT = new Set(['pak', 'ucas', 'utoc', 'vpk', 'bsa', 'ba2', 'forge'])

/** Pasta pertence a uma loja de jogos? (calculado uma vez por pasta, não por arquivo) */
export function isGameFolder(dir: string): boolean {
  const d = dir.toLowerCase() + '\\'
  return GAME_FOLDERS.some((g) => d.includes(g))
}

/** Pasta é (ou está dentro de) um Downloads? */
export function isDownloadsFolder(dir: string): boolean {
  return /\\downloads(\\|$)/i.test(dir)
}

/**
 * Descobre a categoria de um arquivo.
 * `inGames` e `inDownloads` vêm da pasta, para não recalcular a cada arquivo.
 */
export function categorize(name: string, inGames: boolean, inDownloads: boolean): number {
  if (inGames) return CAT.jogos

  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''

  if (GAME_EXT.has(ext)) return CAT.jogos
  if (VIDEO.has(ext)) return CAT.video
  if (IMAGEM.has(ext)) return CAT.imagem
  if (COMPACTADOS.has(ext)) return CAT.compactados
  if (INSTALADORES.has(ext)) return CAT.instaladores
  // .exe só conta como instalador se estiver em Downloads ou tiver cara de instalador.
  if (ext === 'exe' && (inDownloads || /setup|install/i.test(name))) return CAT.instaladores
  return CAT.outros
}
