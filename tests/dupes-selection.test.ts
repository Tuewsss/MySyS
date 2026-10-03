import { describe, expect, it } from 'vitest'
import { canSelect, initialSelection, pickKeeper, selectedBytes } from '../src/lib/dupes'
import type { DupeFile, DupeGroup } from '../electron/scanner/types'

const f = (path: string, mtimeMs: number, gameData: DupeFile['gameData'] = null): DupeFile => ({ path, mtimeMs, gameData })

describe('pickKeeper', () => {
  it('prefere a cópia fora de Downloads', () => {
    expect(pickKeeper([f('C:\\Users\\a\\Downloads\\x.mp4', 1), f('C:\\Users\\a\\Videos\\x.mp4', 9)])).toBe(1)
  })

  it('depois a mais antiga, depois o caminho mais curto', () => {
    expect(pickKeeper([f('C:\\b\\x.mp4', 5), f('C:\\a\\x.mp4', 2)])).toBe(1)
    expect(pickKeeper([f('C:\\pasta\\funda\\x.mp4', 2), f('C:\\a\\x.mp4', 2)])).toBe(1)
  })
})

describe('seleção', () => {
  const g: DupeGroup = {
    size: 100,
    hash: 'h',
    files: [f('C:\\Videos\\x.mp4', 1), f('C:\\Copia\\x.mp4', 5), f('C:\\Copia2\\x.mp4', 6)],
  }

  it('marca todas menos a cópia mantida', () => {
    const sel = initialSelection([g])
    expect([...sel].sort()).toEqual(['C:\\Copia2\\x.mp4', 'C:\\Copia\\x.mp4'])
    expect(selectedBytes([g], sel)).toBe(200)
  })

  it('nunca deixa marcar a última cópia restante', () => {
    const sel = initialSelection([g])
    expect(canSelect(g, sel, 'C:\\Videos\\x.mp4')).toBe(false)
    // Desmarcando uma, a outra passa a poder ser marcada.
    sel.delete('C:\\Copia\\x.mp4')
    expect(canSelect(g, sel, 'C:\\Videos\\x.mp4')).toBe(true)
    // Desmarcar é sempre permitido.
    expect(canSelect(g, sel, 'C:\\Copia2\\x.mp4')).toBe(true)
  })

  it('não marca saves de jogos automaticamente', () => {
    const saves: DupeGroup = {
      size: 10,
      hash: 's',
      files: [f('C:\\Saved Games\\J\\saves\\a.sav', 1, 'save'), f('C:\\Saved Games\\J\\saves\\backup\\a.sav', 2, 'save')],
    }
    expect(initialSelection([saves]).size).toBe(0)
  })

  it('não marca arquivos do OneDrive automaticamente', () => {
    const od: DupeGroup = {
      size: 10,
      hash: 'o',
      files: [f('C:\\Users\\a\\Videos\\x.mp4', 1), f('C:\\Users\\a\\OneDrive\\Videos\\x.mp4', 2)],
    }
    expect(initialSelection([od]).size).toBe(0)
  })

  it('não marca arquivos de projetos de código automaticamente', () => {
    const proj: DupeGroup = {
      size: 10,
      hash: 'p',
      files: [
        { ...f('C:\\Dev\\Got\\media\\a.png', 1), inProject: true },
        { ...f('C:\\Dev\\Got\\media_seed\\a.png', 2), inProject: true },
      ],
    }
    expect(initialSelection([proj]).size).toBe(0)
  })
})
