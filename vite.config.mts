import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// Alguns terminais (ex.: dentro do VS Code) definem ELECTRON_RUN_AS_NODE=1,
// o que faz o Electron rodar como Node puro, sem janela. Removemos aqui
// para o `npm run dev` funcionar em qualquer terminal.
delete process.env.ELECTRON_RUN_AS_NODE

// CSP: só permite scripts do próprio app (bloqueia código injetado).
// Entra apenas no build final, porque o hot reload do Vite (dev) usa scripts inline.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"

const cspPlugin: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

// Um único Vite compila as 3 partes do app:
// - main (electron/main.ts): processo Node que cria a janela
// - preload (electron/preload.ts): ponte segura entre Node e React
// - renderer (src/): a interface React
export default defineConfig({
  // Caminhos relativos no build: o app instalado abre o HTML direto do disco.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin,
    electron({
      // A worker da varredura vira um arquivo separado (scan-worker.js),
      // porque o Node precisa de um arquivo próprio para cada worker thread.
      main: {
        entry: {
          main: 'electron/main.ts',
          'scan-worker': 'electron/scanner/worker.ts',
          'dupes-worker': 'electron/scanner/dupes-worker.ts',
          'cache-worker': 'electron/scanner/cache-worker.ts',
        },
      },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
})
