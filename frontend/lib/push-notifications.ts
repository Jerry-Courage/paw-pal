import { authApi, VAPID_PUBLIC_KEY } from './api'

export async function registerPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Not supported in this browser.')
    return false
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Wait until the SW is actually activated and controlling this page
    await navigator.serviceWorker.ready

    // 2. Check permission
    let permission = Notification.permission
    if (permission === 'denied') {
      console.warn('[Push] Permission denied by user.')
      return false
    }
    if (permission === 'default') {
      permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.warn('[Push] Permission not granted after request.')
        return false
      }
    }

    // 3. Get existing subscription or create new one
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // Create new subscription — this can fail if VAPID key is wrong
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
    }

    // 4. Send to backend (always, even if subscription already existed)
    const payload = subscription.toJSON()
    await authApi.registerPushSubscription(payload)
    console.log('[Push] Subscription registered with backend.')
    return true
  } catch (error: any) {
    // Log specific error info for debugging
    console.error('[Push] Registration failed:', error?.message || error)
    return false
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function checkNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}
