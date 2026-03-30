/// <reference types="vite/client" />

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOffline?: () => void
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: Error) => void
  }): (reloadPage?: boolean) => Promise<void>
}
