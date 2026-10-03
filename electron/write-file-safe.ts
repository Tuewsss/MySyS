import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Grava um arquivo sem nunca deixar uma versão pela metade no lugar da antiga:
 * escreve num arquivo temporário ao lado e depois renomeia (a troca é
 * instantânea). Se o PC desligar no meio, o arquivo antigo continua inteiro.
 * O nome temporário é único: duas gravações ao mesmo tempo não se atrapalham.
 */
export async function writeFileSafe(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}
