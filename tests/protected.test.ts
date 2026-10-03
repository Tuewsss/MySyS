import { describe, expect, it } from 'vitest'
import { isDriveRoot, isProtected, isProtectedArea } from '../electron/scanner/protected'

describe('isProtected', () => {
  it.each([
    'C:\\',
    'C:',
    'D:\\',
    'C:\\Windows',
    'C:\\Windows\\',
    'c:\\windows\\system32\\kernel32.dll',
    'C:\\Windows\\Temp', // a pasta em si fica
    'C:\\Program Files',
    'C:\\Program Files\\App\\app.exe',
    'C:\\Program Files (x86)\\Steam',
    'C:\\ProgramData\\Microsoft\\Windows Defender',
    'C:\\System Volume Information',
    'D:\\System Volume Information\\x',
    'C:\\$Recycle.Bin\\S-1-5-21\\arquivo',
    'C:\\pagefile.sys',
    'C:\\hiberfil.sys',
    'D:\\swapfile.sys',
    'C:\\Windows.old\\Users',
    'C:\\$SysReset\\Logs\\setupact.log',
    'C:\\$WinREAgent',
    'C:\\$Windows.~BT\\Sources',
    // Truques de caminho que tentam "escapar" da verificação:
    'C:\\Users\\..\\Windows\\notepad.exe',
    'C:\\WINDOWS\\SYSTEM32',
    'C:\\Program Files\\..\\Program Files\\x',
  ])('protege %s', (p) => {
    expect(isProtected(p)).toBe(true)
  })

  it.each([
    'C:\\Windows\\Temp\\arquivo.tmp',
    'C:\\Windows\\Temp\\sub\\x.log',
    'C:\\Users\\ana\\AppData\\Local\\Temp\\x.tmp',
    'C:\\Users\\ana\\Downloads\\setup.exe',
    'C:\\ProgramData\\OutroApp\\cache.bin',
    'D:\\Jogos\\jogo.pak',
    'C:\\WindowsApps-falso\\x', // só parece com "Windows"
    'C:\\Program Files Backup\\x', // só parece com "Program Files"
    'C:\\Users\\ana\\$pasta\\x', // "$" só conta na raiz da unidade
  ])('libera %s', (p) => {
    expect(isProtected(p)).toBe(false)
  })

  it('considera protegido qualquer valor inválido', () => {
    expect(isProtected('')).toBe(true)
    expect(isProtected('   ')).toBe(true)
    expect(isProtected('pasta\\relativa')).toBe(true)
    expect(isProtected('C:pasta')).toBe(true)
    expect(isProtected('\\\\servidor\\compartilhado\\x')).toBe(true)
    expect(isProtected(undefined as unknown as string)).toBe(true)
  })
})

describe('isProtectedArea', () => {
  it('conteúdo de C:\\Windows\\Temp não é protegido, o resto do Windows é', () => {
    expect(isProtectedArea('C:\\Windows\\Temp')).toBe(false)
    expect(isProtectedArea('C:\\Windows\\Logs')).toBe(true)
  })
})

describe('isDriveRoot', () => {
  it('reconhece raízes de unidade', () => {
    expect(isDriveRoot('C:\\')).toBe(true)
    expect(isDriveRoot('e:')).toBe(true)
    expect(isDriveRoot('C:\\Users')).toBe(false)
  })
})
