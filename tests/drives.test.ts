import { describe, expect, it } from 'vitest'
import { parseDrives } from '../electron/drives'

describe('parseDrives', () => {
  it('converte a lista do PowerShell e ignora unidades vazias', () => {
    const json = JSON.stringify([
      { DeviceID: 'C:', VolumeName: 'Windows', Size: 500, FreeSpace: 100, DriveType: 3 },
      { DeviceID: 'D:', VolumeName: null, Size: null, FreeSpace: null, DriveType: 5 },
      { DeviceID: 'E:', VolumeName: 'PEN', Size: 64, FreeSpace: 60, DriveType: 2 },
    ])
    expect(parseDrives(json)).toEqual([
      { letter: 'C:', label: 'Windows', kind: 'local', total: 500, free: 100 },
      { letter: 'E:', label: 'PEN', kind: 'removivel', total: 64, free: 60 },
    ])
  })

  it('aceita um objeto único (quando só há uma unidade)', () => {
    const json = JSON.stringify({ DeviceID: 'C:', VolumeName: '', Size: 10, FreeSpace: 5, DriveType: 3 })
    expect(parseDrives(json)).toHaveLength(1)
  })
})
