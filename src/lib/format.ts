const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/**
 * Formata bytes no padrão brasileiro: 1503238553 → "1,4 GB".
 * Usa base 1024, igual ao Explorador de Arquivos do Windows,
 * para os números baterem com o que você vê lá.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  // Uma casa decimal só para valores pequenos (1,4 GB); 320 MB fica sem.
  const digits = unit === 0 || value >= 100 ? 0 : 1
  const text = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
  return `${text} ${UNITS[unit]}`
}

/** 12345 → "12.345" */
export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** 75000 → "1 min 15 s" */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const min = Math.floor(total / 60)
  const s = total % 60
  return min > 0 ? `${min} min ${s} s` : `${s} s`
}

/** Data e hora curtas: "02/10 às 14:30" (com o ano se não for o atual). */
export function formatDateTime(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const date = d.toLocaleDateString('pt-BR', sameYear ? { day: '2-digit', month: '2-digit' } : undefined)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} às ${time}`
}
