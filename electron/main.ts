import { app, BrowserWindow, session } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc'
import { loadSettings } from './settings'
import { settingsFile } from './paths'

// Em modo dev o Vite serve a interface nesta URL; no app instalado
// carregamos o index.html gerado em dist/.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// Cor de fundo enquanto o React carrega (a mesma do <body> em cada tema),
// para a janela não "piscar" na cor errada.
const BACKGROUND = { dark: '#0b0f17', light: '#f8fafc' }

async function createWindow() {
  const { theme } = await loadSettings(settingsFile())

  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: BACKGROUND[theme],
    title: 'DSS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Segurança: o React NÃO tem acesso ao Node. Ele só enxerga
      // o que o preload expõe via contextBridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Segurança: a janela só mostra o próprio app. Se algo tentar levá-la para
  // outro endereço ou abrir janelas novas (ex.: um link), é bloqueado.
  win.webContents.on('will-navigate', (event, url) => {
    if (!DEV_SERVER_URL || !url.startsWith(DEV_SERVER_URL)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.setMenuBarVisibility(false)
  registerIpc(win)

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // O DSS não usa câmera, microfone, localização, notificações etc.: nega tudo.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  return createWindow()
})

app.on('window-all-closed', () => app.quit())
