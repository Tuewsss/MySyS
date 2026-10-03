# DSS

Aplicativo para **Windows** que mostra o que está ocupando espaço no disco e ajuda a limpar **com segurança**: nada é apagado sem a sua confirmação.

## O que ele faz

- **Mapa de espaço**: árvore de pastas, treemap e os 50 maiores arquivos, com filtro por tipo (vídeo, imagem, jogos, instaladores…).
- **Arquivos inúteis**: temporários, cache de navegadores e de miniaturas, logs e despejos de erro antigos, instaladores esquecidos em Downloads, `node_modules` de projetos parados.
- **Arquivos antigos**: sem modificação há mais de 180 dias (configurável), agrupados por pasta. Saves de jogos são identificados e nunca vêm marcados.
- **Duplicados**: comparação por tamanho, depois pelos primeiros 64 KB (xxhash) e por fim pelo arquivo inteiro (SHA-256). Sempre sobra pelo menos uma cópia.
- **Suspeitos**: pontuação de risco de 0 a 100 com os motivos (extensão dupla como `foto.jpg.exe`, executável sem assinatura em Temp/Downloads, programas que iniciam com o Windows) e verificação de um arquivo pelo **Windows Defender**. O DSS **não é um antivírus**.
- **Limpeza**: Lixeira (padrão), quarentena com desfazer, ou apagar permanentemente (exige digitar `APAGAR`). Tem modo **simulação** e **histórico**.
- **Configurações**: tema claro/escuro, critérios da análise e pastas ignoradas. A última análise fica salva para o app abrir rápido.

## Segurança

- **Nada é apagado sem confirmação**, e o padrão é sempre a Lixeira.
- **Caminhos protegidos** nunca são tocados: `C:\Windows`, `Program Files`, `ProgramData\Microsoft`, raiz das unidades, perfis de usuário, `pagefile.sys` etc.
- O processo principal **só limpa caminhos que vieram da última análise** e confere de novo cada um logo antes de agir. Links e junctions nunca são seguidos.
- Resultados abertos do cache (análise de outro dia) servem **só para ver**: para limpar, é preciso analisar de novo.
- Roda **sem administrador** e não pede elevação. A instalação também não pede.
- A interface não tem acesso ao Node (`contextIsolation`, `sandbox`, CSP) e a janela não navega para fora do app.
- **Não envia nada para a internet.** Tudo fica no seu PC, em `%APPDATA%\DSS`.

## Instalação

Baixe o `DSS-Setup-<versão>.exe` na página de *Releases* e execute.

O instalador não tem assinatura digital, então na primeira vez o Windows SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.

## Desenvolvimento

Requisitos: **Windows 10 ou 11** e **Node.js 22** ou mais novo.

```bash
npm install
npm run dev        # abre o app com recarga automática
npm test           # testes (Vitest)
npm run typecheck  # checagem de tipos
npm run dist       # gera o instalador em release/
```

Para redesenhar o ícone (`build/icon.ico`): `npm run icon` (precisa de Python com [Pillow](https://pypi.org/project/pillow/)).

Feito com Electron, React, TypeScript, Vite, Tailwind CSS e Recharts.

### Estrutura

```
electron/            processo principal (Node): janela, IPC, configurações
electron/scanner/    análise do disco, lixo, antigos, duplicados, suspeitos e limpeza
src/                 interface (React)
tests/               testes (Vitest)
build/               ícone usado no instalador
projeto.md           especificação completa, decisões e progresso
```

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE): você pode usar, estudar, modificar e compartilhar o DSS livremente para **fins não comerciais** (uso pessoal, estudo, hobby, escolas, ONGs). **Não é permitido** vendê-lo nem usá-lo para ganhar dinheiro. Para uso comercial, fale com o autor.

Ao compartilhar, mantenha o arquivo [LICENSE](LICENSE), incluindo a linha `Required Notice`.
