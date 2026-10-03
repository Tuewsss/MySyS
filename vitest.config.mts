import { defineConfig } from 'vitest/config'

// Config separada para os testes: assim o Vitest não carrega o plugin
// do Electron (que tentaria abrir a janela do app).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
