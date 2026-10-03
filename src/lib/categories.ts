// Nomes e cores das categorias na interface.
// A ORDEM precisa ser a mesma de electron/scanner/categories.ts (CATEGORIES),
// porque o backend manda os tamanhos como um array indexado por categoria.
//
// As cores vêm de variáveis CSS (src/index.css), uma por tema. A paleta foi
// validada para daltonismo; mesmo assim, toda cor aparece junto do nome da
// categoria, então a informação nunca depende só da cor.

export const CATEGORY_LABELS = ['Vídeo', 'Imagem', 'Jogos', 'Instaladores', 'Compactados', 'Outros']

export const categoryColor = (i: number) => `var(--cat-${i})`

/** Índice da categoria com mais bytes (usada para colorir um bloco do treemap). */
export function dominantCategory(sizes: number[]): number {
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i
  return best
}
