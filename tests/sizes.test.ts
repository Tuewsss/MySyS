import { describe, expect, it } from 'vitest'
import { SizeTree, TopFiles, findNode, folderView, MAX_ENTRIES } from '../electron/scanner/sizes'
import { CAT } from '../electron/scanner/categories'

// Árvore de exemplo:
//   C:\           solto.txt 5 (outros)
//   C:\Videos     filme.mp4 100 (vídeo)
//   C:\Videos\Ferias  praia.mp4 50 (vídeo), foto.jpg 10 (imagem)
//   C:\Docs       a.pdf 20 (outros)
function buildSample() {
  const t = new SizeTree('C:\\')
  t.addDir('C:\\')
  t.addFile('C:\\', 5, CAT.outros)
  t.addDir('C:\\Videos')
  t.addDir('C:\\Docs')
  t.addFile('C:\\Videos', 100, CAT.video)
  t.addDir('C:\\Videos\\Ferias')
  t.addFile('C:\\Videos\\Ferias', 50, CAT.video)
  t.addFile('C:\\Videos\\Ferias', 10, CAT.imagem)
  t.addFile('C:\\Docs', 20, CAT.outros)
  return t.finalize()
}

const total = (s: number[]) => s.reduce((a, b) => a + b, 0)

describe('SizeTree', () => {
  it('soma subpastas nas pastas-mãe', () => {
    const root = buildSample()
    expect(total(root.sizes)).toBe(185)
    expect(root.files).toBe(5)
    const videos = findNode(root, 'C:\\', 'C:\\Videos')!
    expect(total(videos.sizes)).toBe(160)
    expect(videos.sizes[CAT.video]).toBe(150)
    expect(videos.sizes[CAT.imagem]).toBe(10)
  })

  it('ordena as subpastas da maior para a menor', () => {
    const root = buildSample()
    expect(root.children.map((c) => c.name)).toEqual(['Videos', 'Docs'])
  })

  it('acha pastas sem diferenciar maiúsculas e recusa caminhos de fora', () => {
    const root = buildSample()
    expect(findNode(root, 'C:\\', 'c:\\videos\\FERIAS')?.name).toBe('Ferias')
    expect(findNode(root, 'C:\\', 'C:\\NaoExiste')).toBeNull()
    expect(findNode(root, 'C:\\Videos', 'C:\\Docs')).toBeNull()
  })
})

describe('folderView', () => {
  it('lista subpastas e os arquivos soltos, do maior para o menor', () => {
    const v = folderView(buildSample(), 'C:\\', 'C:\\', null)!
    expect(v.size).toBe(185)
    expect(v.entries.map((e) => [e.kind, e.name, e.size])).toEqual([
      ['dir', 'Videos', 160],
      ['dir', 'Docs', 20],
      ['files', 'Arquivos nesta pasta', 5],
    ])
    expect(v.entries[0].path).toBe('C:\\Videos')
  })

  it('filtra por categoria e esconde o que fica com 0 bytes', () => {
    const v = folderView(buildSample(), 'C:\\', 'C:\\', CAT.video)!
    expect(v.size).toBe(150)
    expect(v.entries.map((e) => [e.name, e.size])).toEqual([['Videos', 150]])
  })

  it('agrupa o excesso de itens numa linha "Outros"', () => {
    const t = new SizeTree('C:\\')
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      t.addDir(`C:\\p${i}`)
      t.addFile(`C:\\p${i}`, i + 1, CAT.outros)
    }
    const v = folderView(t.finalize(), 'C:\\', 'C:\\', null)!
    expect(v.entries).toHaveLength(MAX_ENTRIES + 1)
    const rest = v.entries[MAX_ENTRIES]
    expect(rest.kind).toBe('rest')
    expect(rest.size).toBe(55) // as 10 menores: 1 + 2 + … + 10
  })
})

describe('TopFiles', () => {
  it('mantém só os N maiores, do maior para o menor', () => {
    const top = new TopFiles(3)
    for (const size of [5, 1, 9, 3, 7, 2]) top.add({ path: `f${size}`, size, mtimeMs: 0, category: 0 })
    expect(top.list().map((f) => f.size)).toEqual([9, 7, 5])
  })
})
