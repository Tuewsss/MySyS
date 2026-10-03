import type { DupeFile, DupeGroup } from '../../electron/scanner/types'
import { isInOneDrive } from './onedrive'

// Regras de seleção dos duplicados. Ficam separadas da tela para poder
// serem testadas (tests/dupes-selection.test.ts).

const isSaveLike = (f: DupeFile) => f.gameData === 'save' || f.gameData === 'possivel-save'
const inDownloads = (f: DupeFile) => /\\downloads(\\|$)/i.test(f.path)

/**
 * Qual cópia sugerir MANTER. Todas têm o mesmo conteúdo, então escolhemos a
 * que parece ser o "original":
 *  1. fora de Downloads (cópias baixadas de novo costumam ficar lá);
 *  2. a mais antiga (o original veio antes das cópias);
 *  3. o caminho mais curto (mais perto de onde a pessoa organiza as coisas).
 */
export function pickKeeper(files: DupeFile[]): number {
  let best = 0
  for (let i = 1; i < files.length; i++) {
    const a = files[i]
    const b = files[best]
    const score = (f: DupeFile) => [inDownloads(f) ? 1 : 0, f.mtimeMs, f.path.length]
    const sa = score(a)
    const sb = score(b)
    for (let k = 0; k < sa.length; k++) {
      if (sa[k] !== sb[k]) {
        if (sa[k] < sb[k]) best = i
        break
      }
    }
  }
  return best
}

/**
 * Seleção inicial: todas as cópias, menos a que vamos manter.
 * Nunca vêm marcados: saves de jogos e arquivos de projetos de código (a cópia
 * costuma ser de propósito) e arquivos do OneDrive (apagar sai da nuvem também).
 */
export function initialSelection(groups: DupeGroup[]): Set<string> {
  const selected = new Set<string>()
  for (const g of groups) {
    const keep = pickKeeper(g.files)
    g.files.forEach((f, i) => {
      if (i !== keep && !isSaveLike(f) && !f.inProject && !isInOneDrive(f.path)) selected.add(f.path)
    })
  }
  return selected
}

/**
 * Pode marcar este arquivo? Só se continuar sobrando pelo menos UMA cópia
 * desmarcada no grupo (regra de segurança: nunca apagar todas as cópias).
 */
export function canSelect(group: DupeGroup, selected: Set<string>, path: string): boolean {
  if (selected.has(path)) return true // desmarcar é sempre permitido
  const unselected = group.files.filter((f) => !selected.has(f.path)).length
  return unselected > 1
}

/** Bytes que seriam liberados com a seleção atual. */
export function selectedBytes(groups: DupeGroup[], selected: Set<string>): number {
  let total = 0
  for (const g of groups) for (const f of g.files) if (selected.has(f.path)) total += g.size
  return total
}
