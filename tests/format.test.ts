import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration } from '../src/lib/format'

describe('formatBytes', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1.4 * 1024 ** 3)).toBe('1,4 GB')
    expect(formatBytes(320 * 1024 ** 2)).toBe('320 MB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2 TB')
  })
})

describe('formatDuration', () => {
  it('mostra minutos e segundos', () => {
    expect(formatDuration(5000)).toBe('5 s')
    expect(formatDuration(75000)).toBe('1 min 15 s')
  })
})
