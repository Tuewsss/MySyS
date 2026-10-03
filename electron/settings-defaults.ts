// Padrões e limites das configurações. Fica num arquivo separado, sem nada do
// Node, porque a interface (React) também precisa deles: para "Restaurar
// padrões" e para mostrar os limites nos campos.
import type { Settings } from './scanner/types'

export const DEFAULT_SETTINGS: Settings = {
  oldDays: 180,
  dupeMinSizeMB: 1,
  ignore: [],
  theme: 'dark',
}

// Limites aceitos. Fora deles, o valor é ajustado ao limite.
export const LIMITS = {
  oldDays: { min: 30, max: 3650 },
  // Menos de 0,1 MB geraria candidatos demais (milhões de arquivos pequenos).
  dupeMinSizeMB: { min: 0.1, max: 10240 },
  ignoreMax: 100,
}
