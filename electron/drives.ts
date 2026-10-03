import { execFile } from 'node:child_process'
import type { Drive } from './scanner/types'
import { powershellEnv } from './winfiles'

// Pedimos ao Windows a lista de unidades via PowerShell (CIM).
// Só leitura: este comando não altera nada no sistema.
const PS_COMMAND =
  'Get-CimInstance Win32_LogicalDisk | ' +
  'Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType | ConvertTo-Json -Compress'

interface RawDisk {
  DeviceID: string
  VolumeName: string | null
  Size: number | null
  FreeSpace: number | null
  DriveType: number
}

// Códigos de DriveType do Windows.
const KINDS: Record<number, Drive['kind']> = { 2: 'removivel', 3: 'local', 4: 'rede', 5: 'cd' }

export function listDrives(): Promise<Drive[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_COMMAND],
      { windowsHide: true, timeout: 15000, env: powershellEnv() },
      (err, stdout) => {
        if (err) return reject(err)
        try {
          resolve(parseDrives(stdout))
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

export function parseDrives(json: string): Drive[] {
  if (!json.trim()) return []
  const parsed = JSON.parse(json) as RawDisk | RawDisk[]
  // Com uma unidade só, o PowerShell devolve um objeto em vez de lista.
  const list = Array.isArray(parsed) ? parsed : [parsed]

  return list
    .filter((d) => d.Size && d.Size > 0) // ignora leitor de CD vazio etc.
    .map((d) => ({
      letter: d.DeviceID,
      label: d.VolumeName || '',
      kind: KINDS[d.DriveType] ?? 'outro',
      total: d.Size ?? 0,
      free: d.FreeSpace ?? 0,
    }))
}
