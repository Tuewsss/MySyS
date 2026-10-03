import path from 'node:path'
import type { ScanResult } from './scanner/scan'
import type { CleanAction, CleanRequest, CleanTarget, DupesResult, SuspectsResult } from './scanner/types'

// Defesa extra: o processo main só aceita limpar caminhos que ELE MESMO
// encontrou na última análise. Mesmo que a interface tenha um bug (ou seja
// adulterada), ela não consegue pedir para apagar um caminho qualquer.

const DAY = 24 * 60 * 60 * 1000
const ACTIONS: CleanAction[] = ['lixeira', 'quarentena', 'apagar']

const key = (kind: string, p: string) => `${kind}|${path.resolve(p).toLowerCase()}`

export function buildAllowlist(
  scan: ScanResult | null,
  dupes: DupesResult | null,
  suspects: SuspectsResult | null,
  now = Date.now(),
): Map<string, CleanTarget> {
  const allow = new Map<string, CleanTarget>()
  const put = (t: CleanTarget) => allow.set(key(t.kind, t.path), t)

  if (scan) {
    for (const cat of scan.junk.categories) {
      if (cat.id === 'windowsOld') continue // só informativo
      for (const item of cat.items) {
        if (item.kind === 'file') put({ path: item.path, kind: 'file' })
        // node_modules sai inteiro; as demais pastas de lixo só são esvaziadas.
        else if (path.basename(item.path).toLowerCase() === 'node_modules') put({ path: item.path, kind: 'folder' })
        else put({ path: item.path, kind: 'contents' })
      }
    }
    // Antigos: a data limite é calculada AQUI, nunca vem da interface.
    const olderThanMs = now - scan.old.days * DAY
    for (const f of scan.old.folders) put({ path: f.path, kind: 'old-files', olderThanMs })
    for (const f of scan.old.largest) put({ path: f.path, kind: 'file' })
  }
  for (const g of dupes?.groups ?? []) for (const f of g.files) put({ path: f.path, kind: 'file' })
  for (const s of suspects?.items ?? []) put({ path: s.path, kind: 'file' })
  return allow
}

/** Confere o pedido da interface. Devolve os alvos "oficiais" ou um erro. */
export function validateRequest(
  req: unknown,
  allow: Map<string, CleanTarget>,
  dupes: DupesResult | null,
): { ok: true; request: CleanRequest } | { ok: false; error: string } {
  const r = req as Partial<CleanRequest> | null
  if (!r || typeof r !== 'object') return { ok: false, error: 'Pedido inválido.' }
  if (!ACTIONS.includes(r.action as CleanAction)) return { ok: false, error: 'Ação inválida.' }
  if (typeof r.dryRun !== 'boolean') return { ok: false, error: 'Pedido inválido.' }
  if (!Array.isArray(r.targets) || r.targets.length === 0) return { ok: false, error: 'Nada selecionado.' }

  const targets: CleanTarget[] = []
  const seen = new Set<string>()
  for (const t of r.targets) {
    if (!t || typeof t.path !== 'string' || typeof t.kind !== 'string') return { ok: false, error: 'Pedido inválido.' }
    const k = key(t.kind, t.path)
    const official = allow.get(k)
    if (!official) return { ok: false, error: `Este item não veio da última análise: ${t.path}` }
    if (!seen.has(k)) targets.push(official)
    seen.add(k)
  }

  // Duplicados: pelo menos uma cópia de cada grupo precisa ficar.
  const chosen = new Set(targets.filter((t) => t.kind === 'file').map((t) => path.resolve(t.path).toLowerCase()))
  for (const g of dupes?.groups ?? []) {
    if (g.files.every((f) => chosen.has(path.resolve(f.path).toLowerCase()))) {
      return { ok: false, error: 'Pelo menos uma cópia de cada grupo de duplicados precisa ficar.' }
    }
  }

  return {
    ok: true,
    request: { action: r.action as CleanAction, dryRun: r.dryRun, targets, source: String(r.source ?? '') },
  }
}
