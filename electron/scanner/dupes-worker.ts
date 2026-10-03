// Worker thread da busca de duplicados. Separada da análise porque precisa
// LER o conteúdo dos arquivos e pode demorar alguns minutos.
import { parentPort, workerData } from 'node:worker_threads'
import { findDuplicates } from './duplicates'
import type { DupeCandidateGroup, DupesWorkerMessage } from './types'

const candidates = workerData as DupeCandidateGroup[]

let cancelled = false
parentPort!.on('message', (msg) => {
  if (msg === 'cancel') cancelled = true
})

const send = (msg: DupesWorkerMessage) => parentPort!.postMessage(msg)

findDuplicates(candidates, {
  shouldStop: () => cancelled,
  onProgress: (progress) => send({ type: 'progress', progress }),
})
  .then((result) => send({ type: 'done', result }))
  .catch((err) => send({ type: 'error', message: String(err?.message ?? err) }))
  .finally(() => parentPort!.close())
