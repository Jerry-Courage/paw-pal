import { authApi, VAPID_PUBLIC_KEY } from './api'

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.')
    return false
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })

    // 2. Request Permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return false
    }

    // 3. Subscribe to Push Manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    // 4. Send to Backend
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
