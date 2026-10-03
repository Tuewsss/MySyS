import type { Api } from '../electron/preload'

// Diz ao TypeScript que window.api existe (criado pelo preload).
declare global {
  interface Window {
    api: Api
  }
}

export {}
