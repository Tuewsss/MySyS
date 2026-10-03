import { TopFiles } from './sizes'
import { classifyGameFile, strongerGameData, type GameDataKind } from './gamesaves'
import type { OldFolder, OldResult } from './types'
import type { FileInfo } from './walker'

const DAY = 24 * 60 * 60 * 1000

// Usamos a DATA DE MODIFICAÇÃO. A de "último acesso" do Windows não é
// confiável: ele pode nem atualizar (por desempenho) ou atualizar quando
// um antivírus/indexador lê o arquivo.

/** Junta os arquivos antigos, agrupados por pasta. */
export class OldCollector {
  private readonly limit: number
  private readonly byDir = new Map<string, OldFolder>()
  private readonly largest = new TopFiles(100)
  private readonly games: OldResult['games'] = {
    save: { size: 0, files: 0 },
    'possivel-save': { size: 0, files: 0 },
    gravacao: { size: 0, files: 0 },
  }
  private size = 0
  private files = 0

  constructor(
    now: number,
    private readonly days = 180,
  ) {
    this.limit = now - days * DAY
  }

  /**
   * A worker só chama isto para arquivos fora de lixo e de áreas protegidas.
   * `dirGameData` é a classificação da pasta (ver gamesaves.ts).
   */
  add(file: FileInfo, category: number, dirGameData: GameDataKind | null = null): void {
    if (file.mtimeMs > this.limit) return
    this.size += file.size
    this.files++

    const gameData = classifyGameFile(file.name, dirGameData)
    if (gameData) {
      this.games[gameData].size += file.size
      this.games[gameData].files++
    }

    let folder = this.byDir.get(file.dir)
    if (!folder) {
      folder = { path: file.dir, size: 0, files: 0, newestMtimeMs: 0, gameData: null }
      this.byDir.set(file.dir, folder)
    }
    folder.size += file.size
    folder.files++
    if (file.mtimeMs > folder.newestMtimeMs) folder.newestMtimeMs = file.mtimeMs
    folder.gameData = strongerGameData(folder.gameData, gameData)

    this.largest.add({ path: file.path, size: file.size, mtimeMs: file.mtimeMs, category, gameData })
  }

  result(maxFolders = 300): OldResult {
    const folders = [...this.byDir.values()].sort((a, b) => b.size - a.size)
    return {
      days: this.days,
      size: this.size,
      files: this.files,
      games: this.games,
      folders: folders.slice(0, maxFolders),
      foldersTruncated: Math.max(0, folders.length - maxFolders),
      largest: this.largest.list(),
    }
  }
}
