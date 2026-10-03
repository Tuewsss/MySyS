import path from 'node:path'
import type { FileInfo } from './walker'
import type { AutostartEntry, RiskReason, SuspectCandidate, SuspectLocation } from './types'

// IMPORTANTE: isto NÃO é um antivírus. São sinais de alerta comuns em
// arquivos mal-intencionados. Um arquivo pode ter vários sinais e ser
// inofensivo, ou nenhum e ser perigoso. Por isso mostramos os MOTIVOS e
// oferecemos a verificação com o Windows Defender.

// Executáveis e scripts que o Windows roda com um clique duplo.
const EXECUTABLE_EXT = new Set([
  'exe', 'scr', 'com', 'pif', 'msi', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'hta', 'ps1',
])
// Scripts que só são risco em certos lugares (ver SuspectCollector.add).
const WEAK_SCRIPT_EXT = new Set(['js', 'jse', 'ps1'])
// Pastas de gerenciadores de pacotes de programação: seus executáveis
// costumam não ter assinatura, mas vêm de fontes conhecidas.
const PACKAGE_MANAGER_DIR = /\\(node_modules|site-packages|uv\\tools|pipx\\venvs|\.cargo\\bin|appdata\\roaming\\npm)(\\|$)/i
// Programas de verdade (formato PE). Para eles, a assinatura digital é esperada.
const PE_EXT = new Set(['exe', 'scr', 'com', 'pif', 'msi'])
// Extensões que um golpista usa como "disfarce": foto.jpg.exe parece uma foto.
const DECOY_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
  'rtf', 'mp3', 'mp4', 'avi', 'mkv', 'mov', 'wav', 'zip', 'rar', '7z', 'csv',
])
// Caractere Unicode que inverte a direção do texto: "foto\u202Egpj.exe" aparece como "fotoexe.jpg".
const RTLO = '\u202E'

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase().trim() : ''
}

/** Se o nome tem extensão dupla enganosa, devolve a extensão "disfarce" (ex.: "jpg"). */
export function decoyExtension(name: string): string | null {
  const parts = name.toLowerCase().split('.')
  if (parts.length < 3) return null
  const last = parts[parts.length - 1].trim()
  const prev = parts[parts.length - 2].trim()
  return EXECUTABLE_EXT.has(last) && DECOY_EXT.has(prev) ? prev : null
}

/** Locais onde executáveis são mais arriscados. */
export function suspectLocation(dir: string): SuspectLocation | null {
  const d = dir.toLowerCase()
  if (/\\appdata\\local\\temp(\\|$)/.test(d) || /^[a-z]:\\windows\\temp(\\|$)/.test(d)) return 'temp'
  if (/\\start menu\\programs\\startup(\\|$)/.test(d)) return 'startup'
  if (/\\appdata\\roaming(\\|$)/.test(d)) return 'roaming'
  if (/\\downloads(\\|$)/.test(d)) return 'downloads'
  return null
}

// ---------------------------------------------------------------------------
// Coleta durante a análise
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 3000

/** Separa os arquivos que merecem uma verificação mais cuidadosa. */
export class SuspectCollector {
  private items: SuspectCandidate[] = []
  private dropped = 0

  /**
   * `location` vem da pasta (suspectLocation). A worker não chama isto para
   * áreas protegidas nem jogos instalados.
   */
  add(file: FileInfo, location: SuspectLocation | null): void {
    const ext = extOf(file.name)
    if (!EXECUTABLE_EXT.has(ext)) return

    // Scripts dentro de node_modules são bibliotecas de programação. Nomes como
    // "Iterator.zip.js" são nomes de funções, não disfarces.
    if (WEAK_SCRIPT_EXT.has(ext) && /\\node_modules(\\|$)/i.test(file.dir)) return

    const decoy = decoyExtension(file.name)
    const rtlo = file.name.includes(RTLO)
    if (!decoy && !rtlo) {
      if (!location) return
      // .js e .ps1 em Temp/AppData são código interno de programas (milhares
      // de arquivos de apps como navegadores e editores). Viram risco quando
      // chegam por Downloads ou ficam na pasta Inicializar.
      if (WEAK_SCRIPT_EXT.has(ext) && location !== 'downloads' && location !== 'startup') return
    }

    if (this.items.length >= MAX_CANDIDATES) {
      this.dropped++
      return
    }
    this.items.push({ path: file.path, size: file.size, mtimeMs: file.mtimeMs, location, decoyExt: decoy, rtlo })
  }

  result(): { candidates: SuspectCandidate[]; dropped: number } {
    return { candidates: this.items, dropped: this.dropped }
  }
}

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------

/** O que o Windows informa sobre um arquivo (ver winfiles.ts). */
export interface FileFacts {
  exists: boolean
  hidden: boolean
  // Status do Get-AuthenticodeSignature: Valid, NotSigned, HashMismatch, UnknownError…
  signature: string | null
  signer: string | null
}

const LOCATION_TEXT: Record<SuspectLocation, string> = {
  temp: 'Está na pasta de temporários (Temp), onde programas legítimos raramente ficam',
  roaming: 'Está em AppData\\Roaming, um esconderijo comum',
  downloads: 'Está em Downloads (veio da internet)',
  startup: 'Está na pasta de Inicializar: roda sozinho quando o Windows liga',
}
const LOCATION_POINTS: Record<SuspectLocation, number> = { temp: 30, roaming: 20, downloads: 10, startup: 30 }

const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** Pontua um arquivo de 0 a 100 e explica o porquê. */
export function scoreFile(c: SuspectCandidate, facts: FileFacts | undefined): { score: number; reasons: RiskReason[] } {
  const reasons: RiskReason[] = []
  const ext = extOf(path.basename(c.path))

  if (c.decoyExt) {
    reasons.push({ points: 60, text: `Extensão dupla enganosa: parece .${c.decoyExt}, mas é um .${ext} (programa)` })
  }
  if (c.rtlo) {
    reasons.push({ points: 60, text: 'O nome usa um caractere invisível que inverte o texto para esconder a extensão real' })
  }
  if (c.location) reasons.push({ points: LOCATION_POINTS[c.location], text: LOCATION_TEXT[c.location] })
  if (ext === 'scr') reasons.push({ points: 15, text: 'Arquivo .scr (proteção de tela) é um programa e é muito usado em golpes' })
  if (!c.decoyExt && !c.rtlo && PACKAGE_MANAGER_DIR.test(c.path)) {
    reasons.push({ points: -20, text: 'Instalado por um gerenciador de pacotes de programação (npm, pip, uv…)' })
  }
  // O Windows Installer guarda ÍCONES de programas instalados com extensão .exe
  // em AppData\Roaming\Microsoft\Installer\{código}. Não são programas.
  if (/\\appdata\\roaming\\microsoft\\installer\\\{[0-9a-f-]+\}\\[^\\]+$/i.test(c.path)) {
    reasons.push({ points: -25, text: 'Ícone de programa instalado, guardado pelo Windows Installer' })
  }

  if (facts?.exists) {
    if (facts.hidden) reasons.push({ points: 25, text: 'Executável marcado como oculto' })
    if (PE_EXT.has(ext)) reasons.push(...signatureReasons(facts))
  }

  const score = clamp(reasons.reduce((s, r) => s + r.points, 0))
  return { score, reasons }
}

function signatureReasons(facts: FileFacts): RiskReason[] {
  switch (facts.signature) {
    case 'Valid':
      return [{ points: -20, text: `Assinatura digital válida${facts.signer ? ` de "${facts.signer}"` : ''}` }]
    case 'NotSigned':
      return [{ points: 30, text: 'Programa sem assinatura digital (não dá para saber quem o criou)' }]
    case 'HashMismatch':
      return [{ points: 50, text: 'Assinatura digital inválida: o arquivo foi alterado depois de assinado' }]
    case null:
    case undefined:
      return []
    default:
      return [{ points: 15, text: `Não foi possível confirmar a assinatura digital (${facts.signature})` }]
  }
}

// ---------------------------------------------------------------------------
// Inicialização automática
// ---------------------------------------------------------------------------

// Programas "intermediários" usados para rodar scripts escondidos.
const LAUNCHERS = new Set(['wscript.exe', 'cscript.exe', 'mshta.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'rundll32.exe', 'regsvr32.exe'])

/** Troca %APPDATA%, %TEMP% etc. pelos caminhos reais. */
export function expandEnv(s: string, env: NodeJS.ProcessEnv = process.env): string {
  return s.replace(/%([^%]+)%/g, (m, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase())
    return key ? (env[key] as string) : m
  })
}

/**
 * Extrai o programa de uma linha de comando do registro, por exemplo:
 *   "C:\Program Files\App\app.exe" --minimized  →  C:\Program Files\App\app.exe
 *   C:\Users\ana\AppData\Roaming\x\y.exe -s      →  C:\Users\ana\AppData\Roaming\x\y.exe
 */
export function commandTarget(command: string): string {
  const cmd = command.trim()
  if (cmd.startsWith('"')) {
    const end = cmd.indexOf('"', 1)
    return end > 0 ? cmd.slice(1, end) : cmd.slice(1)
  }
  const m = cmd.match(/^(.+?\.(exe|com|bat|cmd|scr|vbs|js|ps1|lnk))(\s|$)/i)
  return m ? m[1] : cmd.split(/\s+/)[0]
}

/** Para comandos tipo "wscript.exe C:\x\script.vbs", acha o script dentro dos argumentos. */
function scriptInArgs(command: string): string | null {
  const m = command.match(/"?([a-z]:\\[^"]+?\.(vbs|vbe|js|jse|ps1|bat|cmd|hta|dll))"?/i)
  return m ? m[1] : null
}

/** Completa a entrada (programa de verdade, intermediário) e pontua. */
export function analyzeAutostart(
  entry: Pick<AutostartEntry, 'command'>,
  facts: (p: string) => FileFacts | undefined,
): Pick<AutostartEntry, 'target' | 'launcher' | 'score' | 'reasons'> {
  const command = expandEnv(entry.command)
  let target = expandEnv(commandTarget(command))
  let launcher: string | null = null

  const base = path.win32.basename(target).toLowerCase()
  if (LAUNCHERS.has(base)) {
    launcher = base
    target = scriptInArgs(command.slice(command.toLowerCase().indexOf(base) + base.length)) ?? target
  }

  const reasons: RiskReason[] = []
  if (launcher) reasons.push({ points: 20, text: `Roda por meio de um programa intermediário (${launcher})` })
  if (/\s-(e|en|enc|encodedcommand)\s/i.test(` ${command} `)) {
    reasons.push({ points: 40, text: 'Usa um comando codificado (escondido) do PowerShell' })
  }

  const loc = suspectLocation(path.win32.dirname(target))
  if (loc === 'temp' || loc === 'downloads') {
    reasons.push({ points: 40, text: `Aponta para ${loc === 'temp' ? 'a pasta Temp' : 'Downloads'}: lugar estranho para algo que roda sempre` })
  } else if (loc === 'roaming') {
    reasons.push({ points: 10, text: 'Aponta para AppData\\Roaming (alguns programas legítimos usam, mas vírus também)' })
  }
  if (/\\users\\public\\/i.test(target)) reasons.push({ points: 30, text: 'Aponta para a pasta Pública, acessível por qualquer usuário' })

  // Alguns programas guardam dados (não comandos) nessas chaves do registro.
  if (!/^[a-z]:\\/i.test(target)) {
    reasons.push({ points: 5, text: 'O valor não é o caminho de um programa (pode ser um dado guardado por outro programa)' })
    return { target, launcher, score: clamp(reasons.reduce((s, r) => s + r.points, 0)), reasons }
  }

  const f = facts(target)
  if (f && !f.exists) {
    reasons.push({ points: 5, text: 'O arquivo não existe mais (sobra de programa desinstalado)' })
  } else if (f && PE_EXT.has(extOf(target))) {
    reasons.push(...signatureReasons(f))
  }

  return { target, launcher, score: clamp(reasons.reduce((s, r) => s + r.points, 0)), reasons }
}
