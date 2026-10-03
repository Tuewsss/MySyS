import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { DefenderResult } from './types'

// Verificação de UM arquivo com o Windows Defender (antivírus do Windows).
// Usamos -DisableRemediation: o Defender só VERIFICA e não apaga nem move o
// arquivo por conta própria. Quem decide o que fazer é você.

/** Acha o MpCmdRun.exe (a versão mais nova fica em ProgramData\…\Platform). */
export function findMpCmdRun(env: NodeJS.ProcessEnv = process.env): string | null {
  const programData = env.ProgramData ?? 'C:\\ProgramData'
  const platform = path.join(programData, 'Microsoft', 'Windows Defender', 'Platform')
  try {
    const versions = fs
      .readdirSync(platform)
      .filter((v) => fs.existsSync(path.join(platform, v, 'MpCmdRun.exe')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (versions.length) return path.join(platform, versions[versions.length - 1], 'MpCmdRun.exe')
  } catch {
    // pasta não existe: tenta o local antigo
  }
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const classic = path.join(programFiles, 'Windows Defender', 'MpCmdRun.exe')
  return fs.existsSync(classic) ? classic : null
}

/** Lê a saída do MpCmdRun. Código 0 = nada encontrado; 2 = ameaça encontrada. */
export function parseDefenderOutput(exitCode: number | null, output: string): DefenderResult {
  const threats = [...output.matchAll(/^\s*Threat\s*:\s*(.+)$/gim)].map((m) => m[1].trim())
  if (exitCode === 2 || threats.length > 0) {
    return { status: 'ameaca', threats, message: 'O Windows Defender encontrou uma ameaça neste arquivo.' }
  }
  if (exitCode === 0) {
    return { status: 'limpo', threats: [], message: 'O Windows Defender não encontrou ameaças.' }
  }
  const line = output.split(/\r?\n/).find((l) => /fail|error|erro/i.test(l))
  return { status: 'erro', threats: [], message: line?.trim() || `O Defender terminou com código ${exitCode}.` }
}

export function scanWithDefender(file: string): Promise<DefenderResult> {
  const exe = findMpCmdRun()
  if (!exe) {
    return Promise.resolve({
      status: 'erro',
      threats: [],
      message: 'Windows Defender não encontrado. Talvez outro antivírus esteja instalado no lugar dele.',
    })
  }
  return new Promise((resolve) => {
    execFile(
      exe,
      ['-Scan', '-ScanType', '3', '-File', file, '-DisableRemediation'],
      { windowsHide: true, timeout: 5 * 60_000 },
      (err, stdout, stderr) => {
        // execFile trata código de saída ≠ 0 como erro, mas aqui o código É a
        // resposta (2 = ameaça). Erro de verdade é quando nem há código numérico.
        const raw = (err as { code?: unknown } | null)?.code
        const code = !err ? 0 : typeof raw === 'number' ? raw : null
        if (code === null) {
          resolve({ status: 'erro', threats: [], message: `Não foi possível rodar o Defender: ${err?.message}` })
          return
        }
        resolve(parseDefenderOutput(code, `${stdout}\n${stderr}`))
      },
    )
  })
}
