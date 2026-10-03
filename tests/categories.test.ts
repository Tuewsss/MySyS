import { describe, expect, it } from 'vitest'
import { CAT, categorize, isDownloadsFolder, isGameFolder } from '../electron/scanner/categories'

describe('categorize', () => {
  it('classifica pela extensão, sem diferenciar maiúsculas', () => {
    expect(categorize('Filme.MKV', false, false)).toBe(CAT.video)
    expect(categorize('foto.jpeg', false, false)).toBe(CAT.imagem)
    expect(categorize('backup.7z', false, false)).toBe(CAT.compactados)
    expect(categorize('office.msi', false, false)).toBe(CAT.instaladores)
    expect(categorize('notas.txt', false, false)).toBe(CAT.outros)
    expect(categorize('SEM_EXTENSAO', false, false)).toBe(CAT.outros)
  })

  it('só considera .exe instalador em Downloads ou com nome de instalador', () => {
    expect(categorize('chrome.exe', false, false)).toBe(CAT.outros)
    expect(categorize('qualquer.exe', false, true)).toBe(CAT.instaladores)
    expect(categorize('NodeSetup-x64.exe', false, false)).toBe(CAT.instaladores)
  })

  it('tudo dentro de pasta de jogo conta como jogo', () => {
    expect(categorize('intro.mp4', true, false)).toBe(CAT.jogos)
  })

  it('pacotes de dados de jogos contam como jogo em qualquer pasta', () => {
    expect(categorize('Game-WindowsNoEditor.pak', false, false)).toBe(CAT.jogos)
  })
})

describe('pastas especiais', () => {
  it('reconhece pastas de lojas de jogos', () => {
    expect(isGameFolder('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hades')).toBe(true)
    expect(isGameFolder('D:\\Epic Games')).toBe(true)
    expect(isGameFolder('C:\\Users\\ana\\Documents')).toBe(false)
  })

  it('reconhece a pasta Downloads e subpastas', () => {
    expect(isDownloadsFolder('C:\\Users\\ana\\Downloads')).toBe(true)
    expect(isDownloadsFolder('C:\\Users\\ana\\Downloads\\prog')).toBe(true)
    expect(isDownloadsFolder('C:\\Users\\ana\\MeusDownloadsAntigos')).toBe(false)
  })
})
