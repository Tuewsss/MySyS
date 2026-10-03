import type { JunkCategoryId } from '../../electron/scanner/types'

// Textos de cada categoria de lixo mostrados na tela.
export const JUNK_INFO: Record<JunkCategoryId, { title: string; description: string; infoOnly?: boolean }> = {
  temp: {
    title: 'Arquivos temporários',
    description: 'Pastas %TEMP% e C:\\Windows\\Temp. Programas criam esses arquivos e muitas vezes esquecem de apagar.',
  },
  navegadores: {
    title: 'Cache de navegadores',
    description: 'Chrome, Edge, Firefox e Opera GX. São recriados conforme você navega (as páginas podem abrir um pouco mais devagar na primeira vez).',
  },
  miniaturas: {
    title: 'Cache de miniaturas',
    description: 'Prévias de imagens e vídeos do Explorador. O Windows recria quando precisa.',
  },
  logs: {
    title: 'Logs antigos',
    description: 'Arquivos .log com mais de 30 dias.',
  },
  despejos: {
    title: 'Despejos de erro',
    description: 'Arquivos .dmp e a pasta CrashDumps, gerados quando um programa trava. Só servem para diagnóstico.',
  },
  instaladores: {
    title: 'Instaladores esquecidos',
    description: 'Arquivos .exe, .msi, .zip e .rar em Downloads com mais de 30 dias.',
  },
  dev: {
    title: 'Cache de desenvolvimento',
    description: 'Cache do npm/yarn e pastas node_modules de projetos sem alterações há 90 dias (dá para recriar com "npm install").',
  },
  windowsOld: {
    title: 'Instalação anterior do Windows (Windows.old)',
    description: 'O DSS não remove esta pasta. Use a Limpeza de Disco do Windows.',
    infoOnly: true,
  },
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
export const formatDate = (ms: number) => dateFmt.format(ms)
