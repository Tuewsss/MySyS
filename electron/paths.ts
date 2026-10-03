import { app } from 'electron'
import path from 'node:path'

// Onde o MySyS guarda os dados dele: %APPDATA%\MySyS.
// Funções (e não constantes) porque o app.getPath só funciona com o Electron rodando.
export const dataDir = () => path.join(app.getPath('appData'), 'MySyS')
// Pasta do tempo em que o app se chamava DSS (ver migrate-data.ts).
export const legacyDataDir = () => path.join(app.getPath('appData'), 'DSS')
export const settingsFile = () => path.join(dataDir(), 'configuracoes.json')
export const cacheFile = () => path.join(dataDir(), 'ultima-analise.json.gz')
