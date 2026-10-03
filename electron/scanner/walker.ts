import fs from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import path from 'node:path'

export interface FileInfo {
  path: string
  name: string
  dir: string
  size: number
  // Espaço alocado no disco, em blocos de 512 bytes. É 0 para arquivos do
  // OneDrive que estão só na nuvem (ver duplicates.ts).
  blocks: number
  mtimeMs: number
  atimeMs: number
}

export interface WalkOptions {
  /** Pastas que não devem ser visitadas (comparação sem diferenciar maiúsculas). */
  ignore?: string[]
  /** Chamado com frequência; se retornar true, a varredura para. */
  shouldStop?: () => boolean
  /** Arquivo encontrado. Não guardamos os arquivos aqui: quem chama decide o que agregar. */
  onFile?: (file: FileInfo) => void
  /** Pasta prestes a ser lida (usado para mostrar a "pasta atual"). */
  onDir?: (dir: string) => void
  /** Erro de leitura (sem permissão, em uso…). A varredura continua. */
  onError?: (path: string, err: NodeJS.ErrnoException) => void
  /** Link simbólico/junction ignorado. */
  onSkipLink?: (path: string) => void
}

// Quantos arquivos pedimos o "stat" ao mesmo tempo. Paralelizar acelera
// muito no SSD, mas número alto demais só gasta memória.
const STAT_BATCH = 64

/**
 * Percorre `root` e todas as subpastas, sem seguir links/junctions.
 *
 * Usa uma pilha (stack) em vez de recursão: com pastas muito profundas,
 * recursão poderia estourar a pilha de chamadas. A pilha guarda só os
 * caminhos das pastas que faltam visitar, então a memória fica pequena.
 *
 * Retorna `true` se terminou e `false` se foi cancelada.
 */
export async function walk(root: string, opts: WalkOptions = {}): Promise<boolean> {
  const ignore = (opts.ignore ?? []).map(normalize)
  // Arquivos com "hard link" aparecem em vários lugares mas ocupam espaço
  // uma vez só (o Windows usa muito isso em C:\Windows\WinSxS).
  // Guardamos a identidade deles para não somar duas vezes.
  const seenHardLinks = new Set<string>()

  const stack: string[] = [root]

  while (stack.length > 0) {
    if (opts.shouldStop?.()) return false

    const dir = stack.pop()!
    if (isIgnored(dir, ignore)) continue
    opts.onDir?.(dir)

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      // Sem permissão, pasta sumiu etc.: registra e segue em frente.
      opts.onError?.(dir, err as NodeJS.ErrnoException)
      continue
    }

    const files: string[] = []
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        // No Windows, o readdir marca como "link" qualquer ponto de nova análise
        // (reparse point). Isso inclui arquivos do OneDrive que são normais.
        // Confirmamos com lstat, que só diz "link" para symlinks e junctions de verdade.
        files.push(full)
      } else if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }

    // Faz o stat dos arquivos em lotes, em paralelo.
    for (let i = 0; i < files.length; i += STAT_BATCH) {
      if (opts.shouldStop?.()) return false
      const batch = files.slice(i, i + STAT_BATCH)
      const stats = await Promise.all(batch.map((p) => safeLstat(p, opts)))

      batch.forEach((filePath, j) => {
        const st = stats[j]
        if (!st) return

        if (st.isSymbolicLink()) {
          // Symlink ou junction: NÃO seguimos (evita loops e sair da pasta).
          opts.onSkipLink?.(filePath)
          return
        }
        if (st.isDirectory()) {
          // Era um reparse point que, no fim, é uma pasta comum.
          stack.push(filePath)
          return
        }
        if (!st.isFile()) return

        if (st.nlink > 1) {
          const id = `${st.dev}:${st.ino}`
          if (seenHardLinks.has(id)) return
          seenHardLinks.add(id)
        }

        opts.onFile?.({
          path: filePath,
          name: path.basename(filePath),
          dir,
          size: st.size,
          blocks: st.blocks,
          mtimeMs: st.mtimeMs,
          atimeMs: st.atimeMs,
        })
      })
    }
  }

  return true
}

async function safeLstat(p: string, opts: WalkOptions): Promise<Stats | null> {
  try {
    return await fs.lstat(p)
  } catch (err) {
    opts.onError?.(p, err as NodeJS.ErrnoException)
    return null
  }
}

// No Windows, caminhos não diferenciam maiúsculas: "C:\Users" == "c:\users".
function normalize(p: string): string {
  return path.resolve(p).toLowerCase().replace(/[\\/]+$/, '')
}

function isIgnored(dir: string, ignore: string[]): boolean {
  if (ignore.length === 0) return false
  const d = normalize(dir)
  return ignore.some((ig) => d === ig || d.startsWith(ig + path.sep))
}
