import { inspectFiles, readAutostart } from './winfiles'
import { analyzeAutostart, commandTarget, expandEnv, scoreFile, type FileFacts } from './scanner/suspicious'
import type { AutostartEntry, SuspectCandidate, SuspectItem, SuspectsProgress, SuspectsResult } from './scanner/types'

/**
 * Verificação dos suspeitos, em 3 passos (tudo só leitura):
 *  1. lê o que roda na inicialização do Windows;
 *  2. pergunta ao Windows a assinatura digital e o atributo "oculto" de cada arquivo;
 *  3. calcula a pontuação de risco com os motivos.
 * Roda no processo main porque o trabalho pesado é do PowerShell (outro processo).
 */
export async function runSuspects(
  candidates: SuspectCandidate[],
  dropped: number,
  opts: { onProgress?: (p: SuspectsProgress) => void; shouldStop?: () => boolean } = {},
): Promise<SuspectsResult | null> {
  const start = Date.now()
  const report = (step: string, done = 0, total = 0) => opts.onProgress?.({ step, done, total })

  report('Lendo os programas da inicialização automática…')
  const rawAutostart = await readAutostart().catch(() => [])
  if (opts.shouldStop?.()) return null

  // Todos os arquivos que precisam de consulta: candidatos + alvos da inicialização.
  const targets = rawAutostart.map((a) => expandEnv(commandTarget(expandEnv(a.command))))
  const toInspect = [...new Set([...candidates.map((c) => c.path), ...targets])]

  report('Verificando assinaturas digitais…', 0, toInspect.length)
  let facts = new Map<string, FileFacts>()
  try {
    facts = await inspectFiles(
      toInspect,
      (done, total) => report('Verificando assinaturas digitais…', done, total),
      opts.shouldStop,
    )
  } catch {
    // Sem PowerShell: segue só com as regras de nome e local.
  }
  if (opts.shouldStop?.()) return null

  const factsOf = (p: string) => facts.get(p.toLowerCase())

  const items: SuspectItem[] = candidates
    .map((c) => {
      const f = factsOf(c.path)
      const { score, reasons } = scoreFile(c, f)
      return { ...c, score, reasons, signer: f?.signer ?? null }
    })
    .sort((a, b) => b.score - a.score)

  const autostart: AutostartEntry[] = rawAutostart
    .map((a) => ({ ...a, ...analyzeAutostart(a, factsOf) }))
    .sort((a, b) => b.score - a.score)

  return { items, autostart, dropped, durationMs: Date.now() - start }
}
