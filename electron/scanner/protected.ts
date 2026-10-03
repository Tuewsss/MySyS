import path from 'node:path'

// Caminhos que o MySyS NUNCA pode remover. Esta verificação é a última linha
// de defesa: mesmo que alguma tela tenha um bug, a limpeza consulta isto antes.
// Na dúvida, um caminho é considerado protegido.

// Arquivos de sistema que podem estar em qualquer unidade.
const SPECIAL_FILES = new Set(['pagefile.sys', 'hiberfil.sys', 'swapfile.sys'])

// Pastas especiais que aparecem na raiz de cada unidade.
const SPECIAL_SEGMENTS = new Set(['system volume information', '$recycle.bin'])

// Normaliza: caminho absoluto, minúsculas (o Windows não diferencia), sem barra no fim.
function normalize(p: string): string {
  // Cuidado: resolve("C:") devolve a pasta ATUAL da unidade C, não a raiz.
  if (/^[a-z]:$/i.test(p.trim())) return p.trim().toLowerCase() + '\\'
  const resolved = path.win32.resolve(p).toLowerCase()
  return resolved.length > 3 ? resolved.replace(/\\+$/, '') : resolved
}

/** É a raiz de uma unidade, como "C:\"? */
export function isDriveRoot(p: string): boolean {
  return /^[a-z]:\\?$/.test(normalize(p))
}

/**
 * Tudo DENTRO deste caminho é protegido?
 * Serve para pastas (e arquivos dentro delas): C:\Windows\System32\x.dll → true.
 * Exceção: o conteúdo de C:\Windows\Temp pode ser limpo.
 */
export function isProtectedArea(p: string): boolean {
  const n = normalize(p)
  const segments = n.split('\\')
  if (segments.some((s) => SPECIAL_SEGMENTS.has(s))) return true
  // Pastas da raiz que começam com "$" são do Windows ($SysReset, $WinREAgent,
  // $Windows.~BT…): usadas em atualizações e restauração do sistema.
  if (segments[1]?.startsWith('$')) return true

  if (/^[a-z]:\\windows(\\|$)/.test(n)) {
    const insideTemp = /^[a-z]:\\windows\\temp(\\|$)/.test(n)
    return !insideTemp
  }
  if (/^[a-z]:\\program files( \(x86\))?(\\|$)/.test(n)) return true
  if (/^[a-z]:\\programdata\\microsoft(\\|$)/.test(n)) return true
  // Windows.old só é removido pela Limpeza de Disco do próprio Windows.
  if (/^[a-z]:\\windows\.old(\\|$)/.test(n)) return true
  return false
}

/**
 * Este caminho pode ser removido? Retorna true se for PROTEGIDO.
 * Use antes de QUALQUER remoção.
 */
export function isProtected(p: string): boolean {
  if (typeof p !== 'string' || p.trim() === '') return true
  if (isDriveRoot(p)) return true
  // Só aceitamos caminhos locais completos ("C:\..."). "C:pasta" (relativo) e
  // caminhos de rede ("\\servidor\...") ficam protegidos.
  if (!/^[a-z]:\\/i.test(p.trim())) return true
  const n = normalize(p)
  if (isDriveRoot(n)) return true
  if (SPECIAL_FILES.has(path.win32.basename(n))) return true
  // A pasta C:\Windows\Temp em si fica; só o que está dentro dela pode sair.
  if (/^[a-z]:\\windows\\temp$/.test(n)) return true
  return isProtectedArea(n)
}
