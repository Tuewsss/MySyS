// Este arquivo roda numa WORKER THREAD, separada do processo main.
// Assim, mesmo varrendo centenas de milhares de arquivos, a janela continua
// respondendo. A comunicação é só por mensagens (postMessage).
// A análise em si está em scan.ts.
import { parentPort, workerData } from 'node:worker_threads'
import { runScan } from './scan'
import { saveCache } from './cache'
import type { WorkerMessage } from './types'

export interface WorkerInput {
  root: string
  ignore: string[]
  oldDays: number
  dupeMinSize: number
  cacheFile: string // onde salvar o resultado para abrir rápido da próxima vez
}

const { cacheFile, ...input } = workerData as WorkerInput

let cancelled = false
parentPort!.on('message', (msg) => {
  if (msg === 'cancel') cancelled = true
})

function send(msg: WorkerMessage) {
  parentPort!.postMessage(msg)
}

runScan({
  ...input,
  tempDir: process.env.TEMP,
  shouldStop: () => cancelled,
  onProgress: (progress) => send({ type: 'progress', progress }),
})
  .then(async (result) => {
    // Primeiro entrega o resultado (a tela não espera a gravação)...
    send({ type: 'done', ...result })
    // ...depois salva o cache, aqui mesmo, para não pesar no processo main.
    // Análise cancelada é parcial: não substitui a última completa.
    if (!result.summary.cancelled) {
      try {
        await saveCache(cacheFile, result)
      } catch (err) {
        console.error('Não foi possível salvar o cache da análise:', err)
      }
    }
  })
  .catch((err) => send({ type: 'error', message: String(err?.message ?? err) }))
  // O ouvinte de 'message' (do cancelar) manteria a worker viva para sempre.
  // Fechar a porta deixa a thread terminar sozinha.
  .finally(() => parentPort!.close())
