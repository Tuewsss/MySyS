import fs from 'node:fs'
import path from 'node:path'

// O app se chamava DSS e guardava os dados em %APPDATA%\DSS. Agora é MySyS
// (%APPDATA%\MySyS). Ao abrir, movemos os dados do DSS para a pasta nova.
// Só os arquivos do app: o resto da pasta antiga é cache do Electron.
const ITEMS = ['configuracoes.json', 'historico.json', 'ultima-analise.json.gz', 'quarentena']

/**
 * Move cada item de `oldDir` para `newDir`, se ele existir lá e ainda não
 * existir aqui. Nunca sobrescreve nem apaga nada. Devolve o que foi movido.
 */
export function migrateDataDir(oldDir: string, newDir: string): string[] {
  const moved: string[] = []
  for (const item of ITEMS) {
    const from = path.join(oldDir, item)
    const to = path.join(newDir, item)
    if (!fs.existsSync(from) || fs.existsSync(to)) continue
    try {
      fs.mkdirSync(newDir, { recursive: true })
      fs.renameSync(from, to)
      moved.push(item)
    } catch {
      // Se não deu para mover (arquivo em uso etc.), o item fica onde estava.
    }
  }
  return moved
}
