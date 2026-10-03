import { describe, expect, it } from 'vitest'
import { classifyGameDir, classifyGameFile, strongerGameData } from '../electron/scanner/gamesaves'

const U = 'C:\\Users\\ana'

describe('classifyGameDir', () => {
  it.each([
    // Casos reais encontrados no PC
    [`${U}\\Saved Games\\KingdomCome\\saves\\playline0`, 'save'],
    [`${U}\\OneDrive\\Documentos\\Electronic Arts\\The Sims 4\\saves`, 'save'],
    [`${U}\\OneDrive\\Documentos\\Electronic Arts\\The Sims 4\\Vídeos Gravados`, 'gravacao'],
    [`${U}\\OneDrive\\Documentos\\My Games\\F1 25\\replays`, 'gravacao'],
    [`${U}\\AppData\\Local\\FortniteGame\\Saved\\Demos`, 'gravacao'],
    [`${U}\\OneDrive\\Documentos\\WB Games\\Batman Arkham Knight\\765611\\SaveData\\backup`, 'save'],
    [`${U}\\OneDrive\\Documentos\\The Witcher 3\\gamesaves`, 'save'],
    // Cache de launchers (navegador embutido) não é save
    [`${U}\\OneDrive\\Documentos\\Rockstar Games\\Social Club\\Launcher\\Renderer\\Code Cache\\js`, null],
    [`${U}\\OneDrive\\Documentos\\Rockstar Games\\Social Club\\Renderer\\Cache\\Cache_Data`, null],
    [`${U}\\OneDrive\\Documentos\\Rockstar Games\\Social Club\\Launcher\\Renderer\\Service Worker\\CacheStorage\\7c12`, null],
    // Unreal Engine
    [`${U}\\AppData\\Local\\HogwartsLegacy\\Saved\\SaveGames`, 'save'],
    [`${U}\\AppData\\Local\\HogwartsLegacy\\Saved\\Logs`, null],
    [`${U}\\AppData\\Local\\HogwartsLegacy\\Saved\\Crashes\\abc`, null],
    // Unity (LocalLow)
    [`${U}\\AppData\\LocalLow\\Team Cherry\\Hollow Knight`, 'possivel-save'],
    // Pasta oficial de saves do Windows, sem subpasta "saves"
    [`${U}\\Saved Games\\CD Projekt Red\\Cyberpunk 2077\\AutoSave-0`, 'save'],
    [`${U}\\Saved Games\\Jogo\\Screenshots`, 'gravacao'],
    // Rockstar
    [`${U}\\Documents\\Rockstar Games\\GTA V\\Profiles\\ABC123`, 'save'],
    // My Games sem pista específica
    [`${U}\\Documents\\My Games\\Terraria`, 'possivel-save'],
    [`${U}\\Documents\\My Games\\Skyrim Special Edition\\Logs`, null],
    // Jogos instalados: só a pasta de saves conta
    ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Jogo\\data', null],
    ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Jogo\\saves', 'save'],
    ['D:\\SteamLibrary\\steamapps\\common\\Jogo\\Replays', 'gravacao'],
    // Coisas que NÃO são de jogo
    [`${U}\\Videos`, null],
    [`${U}\\Pictures\\Screenshots`, null],
    [`${U}\\Documents\\trabalho\\relatorios`, null],
    [`${U}\\Downloads`, null],
  ])('%s → %s', (dir, expected) => {
    expect(classifyGameDir(dir)).toBe(expected)
  })
})

describe('classifyGameFile', () => {
  it('extensão de save vale em qualquer pasta', () => {
    expect(classifyGameFile('progresso.sav', null)).toBe('save')
    expect(classifyGameFile('ER0000.sl2', null)).toBe('save')
    expect(classifyGameFile('Save 12.ess', 'possivel-save')).toBe('save')
  })

  it('outros arquivos herdam a classificação da pasta', () => {
    expect(classifyGameFile('foto.jpg', null)).toBeNull()
    expect(classifyGameFile('slot1.dat', 'possivel-save')).toBe('possivel-save')
    expect(classifyGameFile('replay.sav', 'gravacao')).toBe('gravacao')
  })
})

describe('strongerGameData', () => {
  it('fica com o sinal mais forte', () => {
    expect(strongerGameData('possivel-save', 'save')).toBe('save')
    expect(strongerGameData('gravacao', null)).toBe('gravacao')
    expect(strongerGameData(null, null)).toBeNull()
  })
})
