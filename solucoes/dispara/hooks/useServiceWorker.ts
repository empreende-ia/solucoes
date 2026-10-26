'use client'

/**
 * useServiceWorker - Hook para gerenciar Service Worker e Push Notifications
 *
 * Features:
 * - Registro automático do SW
 * - Gerenciamento de permissões de notificação
 * - Subscribe/unsubscribe de push
 * - Status de instalação do PWA
 */

import { useState, useEffect, useCallback } from 'react'

interface ServiceWorkerState {
  isSupported: boolean
  isRegistered: boolean
  isInstallable: boolean
  registration: ServiceWorkerRegistration | null
  updateAvailable: boolean
}

interface PushState {
  isSupported: boolean
  permission: NotificationPermission | 'unsupported'
  subscription: PushSubscription | null
}

interface UseServiceWorkerReturn {
  sw: ServiceWorkerState
  push: PushState
  // Actions
  registerSW: () => Promise<void>
  requestPushPermission: () => Promise<boolean>
  subscribeToPush: () => Promise<PushSubscription | null>
  unsubscribeFromPush: () => Promise<boolean>
  updateSW: () => Promise<void>
  installPWA: () => Promise<void>
}

// Evento de instalação do PWA
let deferredPrompt: BeforeInstallPromptEvent | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [sw, setSW] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isInstallable: false,
    registration: null,
    updateAvailable: false,
  })

  const [push, setPush] = useState<PushState>({
    isSupported: false,
    permission: 'unsupported',
    subscription: null,
  })

  // ==========================================================================
  // Inicialização
  // ==========================================================================

  useEffect(() => {
    const isDev = process.env.NODE_ENV !== 'production'

    // Verificar suporte
    const swSupported = 'serviceWorker' in navigator
    const pushSupported = 'PushManager' in window

    setSW((prev) => ({ ...prev, isSupported: swSupported }))
    setPush((prev) => ({
      ...prev,
      isSupported: pushSupported,
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
    }))

    // Listener para instalação do PWA
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      setSW((prev) => ({ ...prev, isInstallable: true }))
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listener para app instalado
    const handleAppInstalled = () => {
      deferredPrompt = null
      setSW((prev) => ({ ...prev, isInstallable: false }))
      console.log('[PWA] App instalado com sucesso')
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    // Em dev, evita SW para não servir HTML/cache antigo
    if (isDev) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
          .catch((error) => console.warn('[SW] Falha ao desregistrar em dev:', error))
      }
      if ('caches' in window) {
        caches.keys()
          .then((names) => Promise.all(names.map((name) => caches.delete(name))))
          .catch((error) => console.warn('[SW] Falha ao limpar cache em dev:', error))
      }
    } else if (swSupported) {
      // Registrar SW automaticamente se suportado
      registerServiceWorker()
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // ==========================================================================
  // Service Worker
  // ==========================================================================

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })

      console.log('[SW] Registrado com sucesso:', registration.scope)

      setSW((prev) => ({
        ...prev,
        isRegistered: true,
        registration,
      }))

      // Verificar por atualizações
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] Nova versão disponível')
              setSW((prev) => ({ ...prev, updateAvailable: true }))
            }
          })
        }
      })

      // Carregar subscription existente
      if ('PushManager' in window) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          setPush((prev) => ({ ...prev, subscription }))
        }
      }
    } catch (error) {
      console.error('[SW] Erro no registro:', error)
    }
  }

  const registerSW = useCallback(async () => {
    await registerServiceWorker()
  }, [])

  const updateSW = useCallback(async () => {
    if (!sw.registration) return

    try {
      await sw.registration.update()

      // Forçar ativação do novo SW
      if (sw.registration.waiting) {
        sw.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      // Recarregar para aplicar mudanças
      window.location.reload()
    } catch (error) {
      console.error('[SW] Erro na atualização:', error)
    }
  }, [sw.registration])

  // ==========================================================================
  // Push Notifications
  // ==========================================================================

  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('[Push] Notificações não suportadas')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      setPush((prev) => ({ ...prev, permission }))
      return permission === 'granted'
    } catch (error) {
      console.error('[Push] Erro ao solicitar permissão:', error)
      return false
    }
  }, [])

  const subscribeToPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!sw.registration || !push.isSupported) {
      console.warn('[Push] Service Worker não registrado ou Push não suportado')
      return null
    }

    // Primeiro, solicitar permissão se necessário
    if (push.permission !== 'granted') {
      const granted = await requestPushPermission()
      if (!granted) return null
    }

    try {
      // VAPID public key - em produção, isso viria do backend
      // Por enquanto, usamos uma placeholder (será configurada depois)
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      if (!vapidPublicKey) {
        console.warn('[Push] VAPID public key não configurada')
        return null
      }

      const subscription = await sw.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })

      console.log('[Push] Inscrito com sucesso:', subscription.endpoint)

      setPush((prev) => ({ ...prev, subscription }))

      // Enviar subscription para o backend
      await saveSubscriptionToBackend(subscription)

      return subscription
    } catch (error) {
      console.error('[Push] Erro ao inscrever:', error)
      return null
    }
  }, [sw.registration, push.isSupported, push.permission, requestPushPermission])

  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!push.subscription) return true

    try {
      await push.subscription.unsubscribe()

      // Remover do backend
      await removeSubscriptionFromBackend(push.subscription)

      setPush((prev) => ({ ...prev, subscription: null }))

      console.log('[Push] Desinscrito com sucesso')
      return true
    } catch (error) {
      console.error('[Push] Erro ao desinscrever:', error)
      return false
    }
  }, [push.subscription])

  // ==========================================================================
  // PWA Install
  // ==========================================================================

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) {
      console.warn('[PWA] Instalação não disponível')
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === 'accepted') {
        console.log('[PWA] Usuário aceitou a instalação')
      } else {
        console.log('[PWA] Usuário recusou a instalação')
      }

      deferredPrompt = null
      setSW((prev) => ({ ...prev, isInstallable: false }))
    } catch (error) {
      console.error('[PWA] Erro na instalação:', error)
    }
  }, [])

  return {
    sw,
    push,
    registerSW,
    requestPushPermission,
    subscribeToPush,
    unsubscribeFromPush,
    updateSW,
    installPWA,
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Converte VAPID key de base64 para Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Salva subscription no backend
 */
async function saveSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch (error) {
    console.error('[Push] Erro ao salvar subscription:', error)
  }
}

/**
 * Remove subscription do backend
 */
async function removeSubscriptionFromBackend(subscription: PushSubscription): Promise<void> {
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } catch (error) {
    console.error('[Push] Erro ao remover subscription:', error)
  }
}
