# MySyS — Especificação do Projeto

> Documento inicial para o Claude Code. Leia tudo antes de criar qualquer arquivo.
> Trabalhe em **fases** (seção 9). Ao fim de cada fase, pare, mostre o que foi feito e espere minha aprovação.
>
> **Retomando o projeto?** Leia a **seção 11 (Progresso)**: ela diz onde paramos, as decisões já tomadas e o próximo passo.

---

## 1. Objetivo

App desktop para **Windows** (gera um `.exe` instalável) que analisa o SSD e ajuda a limpar. Ele deve:

1. **Mostrar o peso** de pastas e arquivos (o que está ocupando espaço).
2. **Achar arquivos inúteis** (temporários, cache, lixo de instaladores, duplicados).
3. **Achar arquivos antigos** que não são abertos há muito tempo.
4. **Sinalizar arquivos suspeitos** (possivelmente mal-intencionados).
5. **Ajudar a limpar** com segurança — nunca apagar nada sem eu confirmar.

Sou dev iniciante: **explique as decisões importantes em comentários curtos** e mantenha o código simples e legível.

---

## 2. Stack

| Parte | Tecnologia |
|---|---|
| Shell desktop | **Electron** |
| Interface | **React + TypeScript + Vite** |
| Estilo | **Tailwind CSS** |
| Backend (varredura) | **Node.js** no processo main do Electron |
| Duplicados | Hash **xxhash** (rápido) e confirmação por **SHA-256** |
| Gráficos | **Recharts** |
| Empacotamento | **electron-builder** → instalador `.exe` (NSIS) |
| Testes | **Vitest** |

Comunicação UI ↔ backend via **IPC** com `contextBridge` (preload). **Nunca** ativar `nodeIntegration` no renderer.

---

## 3. Estrutura de pastas

Estrutura real (pasta `C:\Dev\DSS`). Itens marcados com ⏳ ainda não existem.

```
DSS/
├── electron/
│   ├── main.ts            # janela (contextIsolation, sem nodeIntegration, sandbox, sem navegar para fora)
│   ├── paths.ts           # caminhos dos dados (%APPDATA%\MySyS)
│   ├── write-file-safe.ts # grava arquivos sem corromper (temporário + renomear)
│   ├── preload.ts         # API exposta ao React (window.api)
│   ├── ipc.ts             # todos os canais IPC; guarda o último resultado da análise
│   ├── settings.ts        # configurações (%APPDATA%\MySyS\configuracoes.json), sempre validadas
│   ├── settings-defaults.ts # padrões e limites (sem Node: o React também usa)
│   ├── drives.ts          # lista de unidades (PowerShell Win32_LogicalDisk)
│   ├── winfiles.ts        # PowerShell somente leitura: assinatura, oculto, inicialização
│   ├── suspects.ts        # orquestra a verificação de suspeitos
│   └── scanner/
│       ├── walker.ts      # percorre o disco (pilha, sem seguir links/junctions)
│       ├── scan.ts        # a análise completa (alimenta todos os coletores)
│       ├── worker.ts      # worker thread da análise (também grava o cache)
│       ├── cache.ts       # cache da última análise (árvore compacta + gzip)
│       ├── cache-worker.ts# worker thread que lê o cache ao abrir o app
│       ├── types.ts       # tipos compartilhados com o React
│       ├── sizes.ts       # árvore de tamanhos por pasta + top 50
│       ├── categories.ts  # tipo de arquivo (vídeo, imagem, jogos…)
│       ├── junk.ts        # regras de lixo/temporários
│       ├── old.ts         # arquivos antigos
│       ├── gamesaves.ts   # detecção de saves e gravações de jogos
│       ├── duplicates.ts  # duplicados (tamanho → xxhash 64 KB → SHA-256)
│       ├── dupes-worker.ts# worker thread dos duplicados
│       ├── suspicious.ts  # heurísticas de risco
│       ├── defender.ts    # integração com Windows Defender
│       ├── protected.ts   # caminhos que NUNCA podem ser tocados
│       └── cleaner.ts     # lixeira, quarentena, apagar, simulação, histórico, desfazer
│   ├── clean-allowlist.ts # o main só limpa caminhos que vieram da última análise
├── src/                   # React
│   ├── pages/             # Painel, Espaço, Lixo, Antigos, Duplicados, Suspeitos, Histórico, Configurações
│   ├── components/        # inclusive space/ e suspects/
│   └── lib/               # formatação, estado global (scan, dupes-job, suspects-job), regras de seleção
├── tests/                 # Vitest (pastas tests/tmp-* são temporárias e ignoradas pelo git)
├── build/                 # ícone do app (icon.ico e icon.png), usado pelo electron-builder
├── scripts/gerar-icone.py # desenha o ícone (Python + Pillow): `npm run icon`
├── release/               # instalador gerado por `npm run dist` (ignorado pelo git)
├── README.md              # apresentação do repositório (público)
├── LICENSE                # PolyForm Noncommercial 1.0.0 (proíbe uso comercial)
├── vite.config.mts        # compila main, preload, workers e React
├── vitest.config.mts      # config separada para os testes não abrirem o Electron
└── package.json
```

---

## 4. Funcionalidades

### 4.1 Painel inicial
- Lista de **unidades** (C:, D:…) com espaço total, usado e livre.
- Botão **"Analisar"** por unidade ou por pasta escolhida.
- Resumo após a análise: quanto dá para liberar em cada categoria.

### 4.2 Mapa de espaço
- Árvore de pastas ordenada por tamanho, navegável (clicar entra na pasta).
- Gráfico **treemap** ou **sunburst** do espaço.
- **Top 50 maiores arquivos**.
- Filtro por tipo: vídeo, imagem, jogos, instaladores, compactados, outros.

### 4.3 Arquivos inúteis
Categorias, cada uma com total em GB e checkbox:

- `%TEMP%` e `C:\Windows\Temp`
- Cache de navegadores (Chrome, Edge, Firefox, Opera GX)
- Cache de miniaturas do Windows
- Arquivos de log antigos (`*.log` com mais de **30 dias**)
- Despejos de erro (`*.dmp`, `CrashDumps`)
- Instaladores esquecidos em Downloads (`*.exe`, `*.msi`, `*.zip`, `*.rar` com mais de **30 dias**)
- Cache de dev: `node_modules` de projetos não modificados há **90 dias**, cache do npm/yarn
- Pasta `Windows.old` (só **informar** e orientar a usar a Limpeza de Disco do Windows)

### 4.4 Arquivos antigos
- Arquivos não acessados/modificados há mais de **180 dias** (valor configurável).
- Agrupar por pasta e mostrar o total.
- Observação na UI: a data de "último acesso" do Windows pode não ser confiável; usar **data de modificação** como padrão.

### 4.5 Duplicados
- Pipeline: agrupar por **tamanho** → hash parcial (primeiros **64 KB**) → hash completo.
- Ignorar arquivos menores que **1 MB** por padrão.
- Na limpeza, sempre manter **pelo menos uma cópia** de cada grupo.

### 4.6 Arquivos suspeitos
**Importante:** o app **não é um antivírus**. Ele faz duas coisas:

**a) Heurísticas (pontuação de risco 0–100):**
- Extensão dupla enganosa (`foto.jpg.exe`, `doc.pdf.scr`)
- Executáveis (`.exe`, `.scr`, `.bat`, `.vbs`, `.ps1`, `.js`) dentro de `%TEMP%`, `AppData\Roaming` ou Downloads
- Executável **sem assinatura digital** (checar com PowerShell `Get-AuthenticodeSignature`)
- Arquivo oculto + executável
- Entradas de **inicialização automática** (pasta Startup e chaves `Run` do registro) apontando para locais estranhos — **só listar**, não alterar

**b) Windows Defender:**
- Botão "Verificar com o Defender" que roda `MpCmdRun.exe -Scan -ScanType 3 -File "<caminho>"` e mostra o resultado.

A UI deve deixar claro: *"Suspeito não significa vírus. Na dúvida, envie para quarentena em vez de apagar."*

### 4.7 Limpeza
- Seleção por checkbox, com o **total a liberar** sempre visível.
- Ações:
  - **Mover para a Lixeira** (padrão) — usar `shell.trashItem` do Electron.
  - **Quarentena** — mover para `%APPDATA%\MySyS\quarentena` guardando o caminho original (para suspeitos).
  - **Apagar permanentemente** — só com confirmação dupla digitando `APAGAR`.
- **Modo simulação** (dry-run): mostra o que seria feito sem tocar em nada.
- **Histórico** com data, arquivos, tamanho e botão **Desfazer** (restaurar da quarentena).

### 4.8 Configurações
- Dias para "antigo" (padrão **180**).
- Tamanho mínimo para duplicados (padrão **1 MB**).
- Pastas a ignorar (lista editável).
- Tema claro/escuro.

---

## 5. Regras de segurança (obrigatórias)

1. **Lista de caminhos protegidos** em `protected.ts`, verificada antes de QUALQUER ação de remoção:
   `C:\Windows` (exceto `Temp`), `C:\Program Files`, `C:\Program Files (x86)`, `C:\ProgramData\Microsoft`, `System Volume Information`, `$Recycle.Bin`, `pagefile.sys`, `hiberfil.sys`, `swapfile.sys`, raiz de qualquer unidade.
2. Nunca apagar nada automaticamente. Toda remoção passa pela tela de confirmação.
3. Padrão é **Lixeira**, nunca exclusão permanente.
4. Arquivos em uso / sem permissão: **pular e registrar**, nunca travar o app.
5. Não seguir **links simbólicos/junctions** durante a varredura (evita loops e sair da pasta).
6. O app roda **sem administrador** por padrão. Se uma pasta exigir admin, mostrar aviso — não pedir elevação sozinho.
7. Escrever **testes** para `protected.ts` e `cleaner.ts` antes de liberar a limpeza.

---

## 6. Desempenho

- Varredura em **worker thread** para a UI não congelar.
- Enviar **progresso** para a UI (arquivos lidos, GB analisados, pasta atual).
- Botão **Cancelar** funcionando a qualquer momento.
- Meta: analisar **500 mil arquivos** sem estourar memória (não guardar tudo em array gigante; agregar por pasta).
- Salvar o resultado da última análise em cache (JSON) para abrir rápido.

---

## 7. Interface

- Barra lateral com: **Painel, Espaço, Lixo, Antigos, Duplicados, Suspeitos, Histórico, Configurações**.
- Tema escuro por padrão, visual limpo e moderno.
- Tamanhos sempre formatados (`1,4 GB`, `320 MB`).
- Cores por risco nos suspeitos: verde (0–30), amarelo (31–69), vermelho (70–100).
- Textos da interface em **português do Brasil**.

---

## 8. Fora do escopo (por enquanto)

- Limpeza agendada automática
- Desfragmentação (não se faz em SSD)
- Limpeza de registro do Windows
- Suporte a macOS/Linux

---

## 9. Fases de desenvolvimento

| Fase | Entrega | Status |
|---|---|---|
| **1** | Projeto Electron + React + TS rodando, barra lateral e páginas vazias | ✅ |
| **2** | Listar unidades e varredura com progresso e cancelamento (só leitura) | ✅ |
| **3** | Mapa de espaço: árvore, treemap e top 50 maiores | ✅ |
| **4** | Arquivos inúteis e antigos (só listagem) | ✅ (+ detecção de saves de jogos) |
| **5** | Duplicados | ✅ |
| **6** | Suspeitos + integração com o Defender | ✅ |
| **7** | `protected.ts` + testes, depois Lixeira, quarentena, dry-run e histórico | ✅ |
| **8** | Configurações e cache da última análise | ✅ |
| **9** | Gerar o instalador `.exe` com electron-builder e ícone | ✅ (aguarda aprovação) |

Até a **Fase 7**, o app **não pode remover nada** — só ler.

---

## 10. Como quero que você trabalhe

- Antes de cada fase, explique em poucas linhas o que vai fazer.
- Ao final, diga como testar (`npm run dev`, o que clicar, o que esperar).
- Se algo for arriscado ou ambíguo, **pergunte antes**.
- Commits pequenos e com mensagem clara em português.

---

## 11. Progresso (atualizado em 02/10/2026)

### Onde paramos
**Fases 1 a 9 concluídas: o protótipo está completo.** A Fase 9 (instalador) aguarda a aprovação do usuário.
Próximo passo: as **Melhorias futuras** (fim desta seção), começando pela leitura rápida pela MFT. Ao retomar, explique o plano e espere aprovação.

- Histórico completo em `git log` (um commit por fase).
- **191 testes** passando (`npm test`), build e checagem de tipos sem erros.
- Testado no PC real (`C:` com 953 GB, ~900 mil arquivos): análise completa em ~72 s, até ~440 MB de memória.

### Comandos
| Comando | O que faz |
|---|---|
| `npm run dev` | abre o app com recarga automática |
| `npm test` | roda os testes (Vitest) |
| `npm run build` | checa os tipos e gera `dist/` e `dist-electron/` |
| `npm run typecheck` | só a checagem de tipos |
| `npm run dist` | limpa, compila e gera o instalador `release\MySyS-Setup-<versão>.exe` |
| `npm run icon` | redesenha o ícone em `build/` (precisa de Python com Pillow) |

### O que cada página já faz
- **Painel**: unidades com barra de uso; "Analisar" por unidade ou pasta; progresso, Cancelar e resumo do que dá para liberar.
- **Espaço**: treemap clicável, caminho clicável, lista de subpastas com barra por tipo, filtro por tipo, 50 maiores arquivos.
- **Lixo**: 8 categorias com total e caixa de seleção; itens com "Mostrar no Explorador"; **Limpar** (Lixeira ou apagar).
- **Antigos**: +180 dias (data de modificação), por pasta, 100 maiores; selos de saves de jogos e opção de escondê-los; seleção (nada vem marcado) e **Limpar**.
- **Duplicados**: busca sob demanda; sugere qual cópia manter; seleção nunca deixa marcar todas as cópias; **Limpar**.
- **Suspeitos**: pontuação 0–100 com motivos; botão do Defender; **Enviar para quarentena** por arquivo; lista da inicialização automática.
- **Histórico**: limpezas feitas (com Desfazer para a quarentena) e a quarentena (com Restaurar).
- **Configurações**: tema claro/escuro (muda e salva na hora); dias para "antigo", tamanho mínimo dos duplicados e pastas ignoradas (botão Salvar; valem a partir da próxima análise); Restaurar padrões.
- **Ao abrir o app**: mostra a última análise salva, com o aviso "Última análise salva — resultado da análise de dd/mm às hh:mm" e o botão **Analisar de novo**.

### Como a limpeza funciona (Fase 7)
- **Tela de confirmação única** (`src/components/CleanDialog.tsx`) para todas as páginas: escolher a ação → [digitar `APAGAR`] → andamento com Cancelar → resultado.
- Ações: **Lixeira** (padrão, `shell.trashItem`), **Quarentena** (só arquivos), **Apagar permanentemente** (exige digitar `APAGAR`). Botão **Simular** mostra o que aconteceria sem tocar em nada (não vai para o histórico).
- **Quarentena**: `%APPDATA%\MySyS\quarentena\<id>.quarentena` (a extensão impede abrir por engano) + `indice.json`. **Histórico**: `%APPDATA%\MySyS\historico.json` (últimas 300 limpezas).
- Pastas de lixo (Temp, caches) são **esvaziadas**, nunca removidas; `node_modules` sai inteira; em Antigos, uma pasta marcada remove só os arquivos antigos direto nela.
- Arquivos em uso ou sem permissão são pulados e contados (status "parcial").
- A Lixeira do Windows só libera espaço quando é esvaziada (a tela avisa).
- **Camadas de segurança**, em ordem:
  1. `clean-allowlist.ts`: o main só aceita caminhos (e tipos) que vieram da última análise; a data limite dos antigos é calculada no main; confere de novo "sempre sobra 1 cópia" dos duplicados;
  2. `cleaner.ts`: `isProtected()` antes de cada alvo e `canEmptyFolder()` para esvaziar pastas (recusa raiz da unidade, `C:\Users`, perfis e pastas principais do perfil);
  3. `guard()` imediatamente antes de cada operação destrutiva (unlink, rmdir, mover, Lixeira); links/junctions nunca são seguidos.
- **Lição aprendida**: na primeira versão dos testes, esvaziar `C:\` não foi barrado (nada foi apagado: o teste estourou o tempo ainda medindo `C:\Dev`). Daí vieram o `canEmptyFolder()` e a trava `beforeDestroy` nos testes, que transforma qualquer tentativa de remover algo fora da pasta de teste em erro. **Todo teste que remove arquivos deve usar essa trava.**

### Decisões tomadas (além da especificação)
- **Nome**: o app se chama **MySyS** (pacote `mysys`). Os dados dele ficam em `%APPDATA%\MySyS`.
  - Até a v0.1.0 se chamava **DSS** (dados em `%APPDATA%\DSS`). Ao abrir, `migrate-data.ts` move configurações, histórico, cache e quarentena para a pasta nova, sem sobrescrever nada; a restauração da quarentena procura o arquivo na pasta atual, não no caminho gravado.
  - O `appId` continua `com.mateusmendes.dss` de propósito: é o que faz o instalador novo reconhecer e atualizar a instalação antiga. Não aparece para o usuário.
- **Pasta**: o projeto fica direto em `C:\Dev\DSS` (não numa subpasta `zelador-ssd/`).
- **Build**: Vite + `vite-plugin-electron`. O `package.json` é `"type": "commonjs"` (o preload precisa ser CommonJS por causa do `sandbox: true`).
- **`ELECTRON_RUN_AS_NODE`**: alguns terminais (inclusive o do VS Code) definem essa variável, que impede a janela de abrir. O `vite.config.mts` a remove.
- **`protected.ts` antecipado para a Fase 4** (com testes), usado para filtrar as listas. Além da lista da seção 5, também protege pastas `$…` na raiz (`$SysReset`, `$WinREAgent`…), caminhos de rede e caminhos relativos ou ambíguos ("na dúvida, protegido").
- **O que fica de fora das listas** (apagar quebraria algo):
  - `node_modules` de programas instalados (AppData, `.vscode`, Program Files): só entram os de projetos do usuário parados há 90 dias;
  - "instaladores" em subpastas de Downloads (costumam ser programas portáteis);
  - em Antigos: AppData, ProgramData e pastas com ponto (dados internos de programas);
  - em Duplicados: jogos instalados, AppData, sistema e programas.
- **Saves de jogos** (`gamesaves.ts`): detectados por pasta (Saved Games, My Games, LocalLow, `Saved` da Unreal, pastas de publicadoras), nome de pasta (`saves`, `SaveData`, `Profiles`…) e extensão (`.sav`, `.sl2`, `.ess`…). Gravações e replays são separados. **Saves nunca vêm pré-selecionados para limpeza.**
- **Projetos de código** (`.git`, `package.json`, `manage.py`…): nos duplicados ganham selo e não vêm pré-selecionados (cópias ali costumam ser de propósito).
- **OneDrive**: arquivos que estão só na nuvem (0 blocos alocados no disco) não são lidos, porque ler faria o OneDrive baixá-los. Na limpeza, arquivos do OneDrive **podem** ser removidos, mas vêm desmarcados e a confirmação avisa que também saem da nuvem (decisão do usuário).
- **Duplicados**: etapa 1 = xxhash dos primeiros 64 KB; etapa 2 = SHA-256 do arquivo inteiro. Rodam numa worker separada, sob demanda.
- **Suspeitos**: `.js`/`.ps1` só contam em Downloads ou Inicializar; programas de gerenciadores de pacotes (npm, pip, uv) e ícones `.exe` do Windows Installer reduzem a pontuação. Executável oculto fora dos locais de risco **não** é detectado (limitação conhecida).
- **Defender**: roda com `-DisableRemediation` (só verifica, não remove nada sozinho). Funciona sem administrador.

### Como as configurações e o cache funcionam (Fase 8)
- **Configurações** em `%APPDATA%\MySyS\configuracoes.json`. Tudo passa por `sanitizeSettings()`: arquivo corrompido ou valor absurdo volta ao padrão ou ao limite (dias 30–3650; duplicados 0,1 MB–10 GB; até 100 pastas ignoradas, só caminhos absolutos).
- O tema tem uma cópia no `localStorage` só para o app abrir sem "piscar" no tema errado; quem manda são as configurações.
- **Cache** em `%APPDATA%\MySyS\ultima-analise.json.gz`: a árvore é guardada "achatada" (listas paralelas em pré-ordem) e comprimida com gzip. Gravado pela worker da análise depois de entregar o resultado; lido por outra worker ao abrir o app. Medido com ~177 mil pastas: 1,3 MB, 173 ms para gravar e 65 ms para ler.
- Análise **cancelada não substitui** o cache. Cache de outra versão (`CACHE_VERSION`) ou estragado é ignorado.
- **Resultado do cache é só para ver.** O main recusa limpar (inclusive simular) e a tela de limpeza oferece "Analisar de novo": os arquivos podem ter mudado desde a análise salva. Duplicados e suspeitos podem ser buscados a partir dele (só leem arquivos).

### Como o instalador funciona (Fase 9)
- **electron-builder** com NSIS em assistente (escolher pasta, atalhos na Área de Trabalho e no Menu Iniciar). Configuração no campo `"build"` do `package.json`.
- **Instala só para o usuário atual** (`%LOCALAPPDATA%\Programs\MySyS`), sem pedir administrador (`allowElevation: false`), e o app roda como `asInvoker`: regra 6.
- **Desinstalar mantém `%APPDATA%\MySyS`** (quarentena, histórico, configurações, cache), para não apagar nada por engano.
- Todo o código do app (React, recharts, xxhash…) vai **embutido** nos arquivos gerados pelo Vite. Por isso todas as dependências estão em `devDependencies`: o pacote `app.asar` fica com ~750 KB, sem `node_modules`. Se um dia uma dependência precisar existir em tempo de execução (ex.: módulo nativo), ela volta para `dependencies`.
- As 3 workers rodam de dentro do `app.asar` sem ajustes (testado: análise, duplicados com xxhash/SHA-256 e cache).
- `"electronDist": "node_modules/electron/dist"`: usa o Electron já instalado. Sem isso, o electron-builder extrai o Electron e falha ao renomear a pasta (`EPERM`; algo do Windows, provavelmente o antivírus, segura os arquivos).
- O `.exe` **não tem assinatura digital**: na primeira execução o SmartScreen mostra "O Windows protegeu o computador" → "Mais informações" → "Executar assim mesmo".
- Testado: instalação silenciosa (`/S`), atalhos, registro em "Aplicativos instalados", desinstalação silenciosa e `%APPDATA%\MySyS` preservada.
- **Fusíveis do Electron** (`electronFuses`): o `MySyS.exe` instalado não pode ser usado como Node.js genérico (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` e `--inspect` desligados), só carrega o app de dentro do `app.asar` e confere a integridade dele. Efeito colateral bom: abre normalmente mesmo de um terminal com `ELECTRON_RUN_AS_NODE=1`. `GrantFileProtocolExtraPrivileges` fica ligado porque a interface é carregada de `file://`.

### Repositório público (preparação de 02/10/2026)
- Revisado para não vazar nada: sem segredos, sem chamadas de rede no app, sem caminhos pessoais. `CLAUDE.md`, `.claude/` e `graphify-out/` (ferramentas locais, com caminhos desta máquina) ficam fora do git **sem aparecer no `.gitignore` público**: são ignorados por `C:\Dev\DSS.gitignore-local`, ligado só neste repositório com `git config core.excludesFile C:/Dev/DSS.gitignore-local` (fica em `.git/config`). Num clone novo, essa configuração precisa ser refeita.
- Segurança extra na janela (`main.ts`): bloqueia navegação para fora do app e janelas novas; nega pedidos de permissão (câmera, microfone etc.). A cor de fundo inicial segue o tema salvo.
- `README.md` para quem chega ao repositório.
- **Licença: PolyForm Noncommercial 1.0.0** (decisão do usuário): uso, estudo e modificação livres, mas **proibido vender ou usar comercialmente**. Os primeiros commits publicados (até `f403249`) saíram com MIT; a troca vale a partir do commit que muda a licença.

### Melhorias futuras (depois do protótipo)
- **Leitura rápida pela MFT** (como o WizTree): ler a tabela de arquivos do NTFS direto do disco (`\\.\C:`) em vez de pasta por pasta (hoje ~72 s no `C:`; a meta é poucos segundos).
  - Plano: leitor da MFT em TypeScript puro (registros com fixup, data runs, `$FILE_NAME`, `$DATA`, registros de extensão, hard links contados uma vez, links/junctions ignorados, OneDrive só na nuvem com 0 alocado) que gera os mesmos eventos `onDir`/`onFile` do `walker.ts`. Assim o `runScan()` e os coletores não mudam. Se não for NTFS ou der erro, volta para a leitura atual.
  - **Decisão em aberto:** ler o disco direto exige administrador, o que esbarra na regra 6 (seção 5). Opção preferida: um ajudante pequeno, que só lê, elevado sob demanda por um botão "Análise rápida" (o app continua sem administrador).