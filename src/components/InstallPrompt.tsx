import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Check if running as standalone (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowBanner(false)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-white p-3 shadow-lg md:bottom-4 md:left-auto md:right-4 md:w-80">
      <Download className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Install app</p>
        <p className="text-muted-foreground">Add to your home screen for quick access</p>
      </div>
      <Button size="sm" onClick={handleInstall}>
        Install
      </Button>
      <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
