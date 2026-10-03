import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FileFacts } from './scanner/suspicious'

// Consultas ao Windows que o Node não sabe fazer sozinho (assinatura digital,
// atributo "oculto", registro). Usamos o PowerShell, SOMENTE LEITURA.

/**
 * Roda um script do PowerShell e devolve o JSON que ele imprimir.
 * O script vai codificado (-EncodedCommand) para não depender de arquivos
 * .ps1 nem da política de execução de scripts do Windows.
 */
function runPowerShellJson<T>(script: string, timeoutMs = 120_000): Promise<T> {
  // Saída em UTF-8 para não estragar acentos nos caminhos ("Vídeos").
  const full = `$ErrorActionPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`
  const encoded = Buffer.from(full, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(err)
        const text = stdout.trim()
        if (!text) return resolve([] as T)
        try {
          resolve(JSON.parse(text) as T)
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

// Aspas simples no PowerShell: escapa ' como ''.
const psString = (s: string) => `'${s.replace(/'/g, "''")}'`

const INSPECT_BATCH = 150

/**
 * Para cada arquivo: existe? está oculto? qual o status da assinatura digital?
 * Os caminhos vão num arquivo JSON temporário (pode haver milhares).
 */
export async function inspectFiles(
  paths: string[],
  onBatch?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<Map<string, FileFacts>> {
  const facts = new Map<string, FileFacts>()
  const tmpFile = path.join(os.tmpdir(), `dss-inspect-${process.pid}-${Date.now()}.json`)

  try {
    for (let i = 0; i < paths.length; i += INSPECT_BATCH) {
      if (shouldStop?.()) break
      const batch = paths.slice(i, i + INSPECT_BATCH)
      fs.writeFileSync(tmpFile, JSON.stringify(batch), 'utf8')
      const script = `
        $paths = Get-Content -LiteralPath ${psString(tmpFile)} -Raw -Encoding UTF8 | ConvertFrom-Json
        $out = foreach ($p in $paths) {
          $i = Get-Item -LiteralPath $p -Force
          if (-not $i) { [pscustomobject]@{ p = $p; e = $false }; continue }
          $s = Get-AuthenticodeSignature -LiteralPath $p
          $n = $null
          if ($s.SignerCertificate) { $n = $s.SignerCertificate.GetNameInfo('SimpleName', $false) }
          [pscustomobject]@{ p = $p; e = $true; h = [bool]($i.Attributes -band [IO.FileAttributes]::Hidden); s = [string]$s.Status; n = $n }
        }
        ConvertTo-Json -InputObject @($out) -Compress`
      const rows = await runPowerShellJson<{ p: string; e: boolean; h?: boolean; s?: string; n?: string | null }[]>(script)
      for (const r of rows) {
        facts.set(r.p.toLowerCase(), { exists: r.e, hidden: !!r.h, signature: r.s || null, signer: r.n ?? null })
      }
      onBatch?.(Math.min(i + INSPECT_BATCH, paths.length), paths.length)
    }
  } finally {
    fs.rmSync(tmpFile, { force: true })
  }
  return facts
}

export interface RawAutostart {
  source: string
  name: string
  command: string
  enabled: boolean | null
}

/**
 * Lê (sem alterar) o que roda sozinho ao ligar o Windows:
 * chaves Run/RunOnce do registro e as pastas "Inicializar".
 */
export function readAutostart(): Promise<RawAutostart[]> {
  const script = `
    $run = 'Software\\Microsoft\\Windows\\CurrentVersion'
    $keys = @(
      @{ k = "HKCU:\\$run\\Run"; a = "HKCU:\\$run\\Explorer\\StartupApproved\\Run" },
      @{ k = "HKCU:\\$run\\RunOnce"; a = $null },
      @{ k = "HKLM:\\$run\\Run"; a = "HKLM:\\$run\\Explorer\\StartupApproved\\Run" },
      @{ k = "HKLM:\\$run\\RunOnce"; a = $null },
      @{ k = "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"; a = "HKLM:\\$run\\Explorer\\StartupApproved\\Run32" }
    )
    $out = @()
    foreach ($key in $keys) {
      $item = Get-ItemProperty -LiteralPath $key.k
      if (-not $item) { continue }
      $approved = if ($key.a) { Get-ItemProperty -LiteralPath $key.a } else { $null }
      foreach ($prop in $item.PSObject.Properties) {
        if ($prop.Name -like 'PS*') { continue }
        $en = $null
        if ($approved -and $approved.($prop.Name)) { $en = (($approved.($prop.Name)[0]) % 2) -eq 0 }
        $out += [pscustomobject]@{ source = "Registro: " + ($key.k -replace ':', ''); name = $prop.Name; command = [string]$prop.Value; enabled = $en }
      }
    }
    $shell = New-Object -ComObject WScript.Shell
    $approvedFolder = Get-ItemProperty -LiteralPath "HKCU:\\$run\\Explorer\\StartupApproved\\StartupFolder"
    foreach ($dir in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) {
      if (-not $dir) { continue }
      foreach ($f in Get-ChildItem -LiteralPath $dir -File -Force) {
        if ($f.Name -eq 'desktop.ini') { continue }
        $cmd = $f.FullName
        if ($f.Extension -eq '.lnk') {
          $l = $shell.CreateShortcut($f.FullName)
          $cmd = ('"' + $l.TargetPath + '" ' + $l.Arguments).Trim()
        }
        $en = $null
        if ($approvedFolder -and $approvedFolder.($f.Name)) { $en = (($approvedFolder.($f.Name)[0]) % 2) -eq 0 }
        $out += [pscustomobject]@{ source = 'Pasta Inicializar'; name = $f.Name; command = $cmd; enabled = $en }
      }
    }
    ConvertTo-Json -InputObject @($out) -Compress`
  return runPowerShellJson<RawAutostart[]>(script)
}
