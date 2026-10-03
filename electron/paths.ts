import { app } from 'electron'
import path from 'node:path'

// Onde o DSS guarda os dados dele: %APPDATA%\DSS.
// Funções (e não constantes) porque o app.getPath só funciona com o Electron rodando.
export const dataDir = () => path.join(app.getPath('appData'), 'DSS')
export const settingsFile = () => path.join(dataDir(), 'configuracoes.json')
export const cacheFile = () => path.join(dataDir(), 'ultima-analise.json.gz')
