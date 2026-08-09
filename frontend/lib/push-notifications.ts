import { authApi, VAPID_PUBLIC_KEY } from './api'

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.')
    return false
  }

  try {
    // 1. Register Service Worker (wait for it to be ready/active)
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })
    // Ensure the SW is controlling this page
    await navigator.serviceWorker.ready

    // 2. Check permission — if denied, bail. If default, ask. If granted, continue.
    let permission = Notification.permission
    if (permission === 'denied') {
      console.warn('Push notification permission denied.')
      return false
    }
    if (permission === 'default') {
      permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
    }

    // 3. Check if we already have an active subscription
    let subscription = await registration.pushManager.getSubscription()

    // 4. If subscription exists, check if it needs updating (re-register with backend)
    if (subscription) {
      // Always ensure backend has the latest subscription
      await authApi.registerPushSubscription(subscription.toJSON())
      return true
    }

    // 5. Create new subscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    // 6. Send to Backend
    await authApi.registerPushSubscription(subscription.toJSON())
    return true
  } catch (error) {
    console.error('Push registration failed:', error)
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
