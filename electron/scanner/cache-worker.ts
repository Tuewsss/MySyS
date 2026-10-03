// Worker thread que lê o cache da última análise ao abrir o app.
// Descomprimir e montar a árvore do C: leva um tempinho; fora do processo
// main, a janela abre e responde normalmente enquanto isso.
import { parentPort, workerData } from 'node:worker_threads'
import { loadCache } from './cache'

loadCache(workerData as string)
  .then((cached) => parentPort!.postMessage(cached))
  .catch(() => parentPort!.postMessage(null))
