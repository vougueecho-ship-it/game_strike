import { io, Socket } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

function resolveApiBase(): string {
  const fromEnv = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (fromEnv) return fromEnv;
  if (Capacitor.isNativePlatform()) return 'https://gamestrike.io';
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000';
  return window.location.origin;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${resolveApiBase()}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Could not reach GameStrike. Check your internet and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export function createRealtimeSocket(token: string): Socket {
  const socket = io(resolveApiBase(), {
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => {
    socket.emit('auth:join', { token });
  });
  return socket;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let nativePushHooked = false;

export async function enableNativePushOnLaunch(authToken?: string | null): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive !== 'granted') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted' || !authToken) return false;
  const res = await enableLockScreenPush(authToken);
  return res.ok;
}

/**
 * Registers either Native Capacitor Firebase Push Notifications (Android APK / iOS App)
 * OR PWA Service Worker Web Push Lock-Screen Notifications and sends the token/subscription
 * to the backend.
 */
export async function enableLockScreenPush(token: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  // 1. Native Android APK / iOS Capacitor App (Firebase FCM via google-services.json)
  if (Capacitor.isNativePlatform()) {
    if (nativePushHooked) return { ok: true };
    nativePushHooked = true;
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        return { ok: false, reason: 'Notification permission was denied on device.' };
      }

      return await new Promise((resolve) => {
        let settled = false;
        const finish = (res: { ok: boolean; reason?: string }) => {
          if (!settled) {
            settled = true;
            resolve(res);
          }
        };

        PushNotifications.addListener('registration', async (fcm) => {
          try {
            await apiFetch(
              '/api/push/subscribe',
              {
                method: 'POST',
                body: JSON.stringify({ fcmToken: fcm.value }),
              },
              token
            );
            finish({ ok: true });
          } catch (err) {
            finish({ ok: false, reason: (err as Error).message });
          }
        });

        PushNotifications.addListener('registrationError', (err) => {
          finish({ ok: false, reason: JSON.stringify(err) });
        });

        PushNotifications.register();
        setTimeout(() => finish({ ok: true }), 4000);
      });
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  // 2. Web / PWA Browser (Chrome, Edge, Safari Home Screen)
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return { ok: false, reason: 'Push notifications are not supported in this browser.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission was denied.' };
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  if ('PushManager' in window) {
    try {
      const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/vapid-public-key');
      if (publicKey) {
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        await apiFetch(
          '/api/push/subscribe',
          {
            method: 'POST',
            body: JSON.stringify({ subscription }),
          },
          token
        );
      }
    } catch {
      // Fallback: local SW notification still works on supported browsers
    }
  }

  // Show an immediate confirmation lock-screen notification
  registration.showNotification('GameStrike.io Notifications Active ⚡', {
    body: 'You will now receive instant lock-screen alerts for chats, deposits & cashouts.',
    icon: '/gamestrike-logo.jpg',
    badge: '/gamestrike-logo.jpg',
  });

  return { ok: true };
}

