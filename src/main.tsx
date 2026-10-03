import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ScanProvider } from './lib/scan'
import { DupesProvider } from './lib/dupes-job'
import { SuspectsProvider } from './lib/suspects-job'
import { CleanProvider } from './lib/clean'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()

// HashRouter (URLs tipo index.html#/lixo) funciona tanto no dev
// quanto no app instalado, que abre o HTML direto do disco.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ScanProvider>
        <DupesProvider>
          <SuspectsProvider>
            <CleanProvider>
              <App />
            </CleanProvider>
          </SuspectsProvider>
        </DupesProvider>
      </ScanProvider>
    </HashRouter>
  </StrictMode>,
)
