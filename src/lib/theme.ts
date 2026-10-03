import type { Theme } from '../../electron/scanner/types'

// O tema de verdade fica nas configurações (no main). Uma cópia vai para o
// localStorage só para o app já abrir com o tema certo, sem "piscar" escuro
// enquanto as configurações chegam do main.
const KEY = 'mysys-theme'

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // sem localStorage: só perde o atalho, o tema funciona igual
  }
}

/** Chamado uma vez, antes de desenhar a interface. */
export function initTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') applyTheme(saved)
  } catch {
    // ignora
  }
  window.api
    .getSettings()
    .then((s) => applyTheme(s.theme))
    .catch(() => {})
}
