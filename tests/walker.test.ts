import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { walk, type FileInfo } from '../electron/scanner/walker'

// Cria uma pasta temporária com esta estrutura:
//   raiz/
//     a.txt          (10 bytes)
//     sub/b.txt      (20 bytes)
//     sub/deep/c.txt (30 bytes)
//     ignorada/x.txt (40 bytes)
//     externa-link → junction para uma pasta FORA da raiz (não pode ser seguida)
let tmp: string
let root: string

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dss-walker-'))
  root = path.join(tmp, 'raiz')
  const outside = path.join(tmp, 'fora')

  fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true })
  fs.mkdirSync(path.join(root, 'ignorada'))
  fs.mkdirSync(outside)

  fs.writeFileSync(path.join(root, 'a.txt'), 'x'.repeat(10))
  fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'x'.repeat(20))
  fs.writeFileSync(path.join(root, 'sub', 'deep', 'c.txt'), 'x'.repeat(30))
  fs.writeFileSync(path.join(root, 'ignorada', 'x.txt'), 'x'.repeat(40))
  fs.writeFileSync(path.join(outside, 'segredo.txt'), 'x'.repeat(1000))

  // Junction não exige administrador no Windows.
  fs.symlinkSync(outside, path.join(root, 'externa-link'), 'junction')
})

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function collect(opts: Parameters<typeof walk>[1] = {}) {
  const files: FileInfo[] = []
  const links: string[] = []
  const finished = await walk(root, {
    ...opts,
    onFile: (f) => files.push(f),
    onSkipLink: (p) => links.push(p),
  })
  return { files, links, finished }
}

describe('walk', () => {
  it('encontra todos os arquivos com o tamanho certo', async () => {
    const { files, finished } = await collect()
    expect(finished).toBe(true)
    const names = files.map((f) => f.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt', 'x.txt'])
    expect(files.reduce((s, f) => s + f.size, 0)).toBe(100)
  })

  it('não segue junctions/links simbólicos', async () => {
    const { files, links } = await collect()
    expect(files.some((f) => f.name === 'segredo.txt')).toBe(false)
    expect(links).toEqual([path.join(root, 'externa-link')])
  })

  it('respeita a lista de pastas ignoradas (sem diferenciar maiúsculas)', async () => {
    const { files } = await collect({ ignore: [path.join(root, 'IGNORADA')] })
    expect(files.map((f) => f.name).sort()).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it('para quando shouldStop retorna true', async () => {
    const { files, finished } = await collect({ shouldStop: () => true })
    expect(finished).toBe(false)
    expect(files).toHaveLength(0)
  })

  it('registra erro e continua quando a pasta não existe', async () => {
    const errors: string[] = []
    const finished = await walk(path.join(tmp, 'nao-existe'), {
      onError: (_p, err) => errors.push(err.code ?? ''),
    })
    expect(finished).toBe(true)
    expect(errors).toEqual(['ENOENT'])
  })

  it('conta arquivos com hard link uma vez só', async () => {
    const hl = path.join(root, 'sub', 'hardlink-de-a.txt')
    fs.linkSync(path.join(root, 'a.txt'), hl)
    try {
      const { files } = await collect()
      expect(files.reduce((s, f) => s + f.size, 0)).toBe(100)
    } finally {
      fs.unlinkSync(hl)
    }
  })
})
