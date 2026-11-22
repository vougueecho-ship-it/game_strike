import webpush from 'web-push';

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@gamestrike.io';

export function initPushService() {
  if (!vapidPublicKey || !vapidPrivateKey) {
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
    console.log('[PushService] Auto-generated VAPID keys for Web/Lock-Screen Push.');
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

/**
 * Sends a Lock-Screen Push Notification via Web Push (PWA/Mobile Browser)
 * AND via Firebase Cloud Messaging (FCM) for native Capacitor Android/iOS builds.
 */
export async function sendPushToUser(user, payload) {
  const notificationPayload = JSON.stringify({
    title: payload.title || 'GameStrike.io',
    body: payload.body || 'New message from GameStrike Support',
    icon: '/gamestrike-logo.jpg',
    badge: '/gamestrike-logo.jpg',
    tag: payload.tag || 'gamestrike-alert',
    url: payload.url || '/#/chat',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    timestamp: Date.now(),
  });

  const results = { webPushSent: 0, fcmSent: 0, errors: [] };

  // 1. Web Push (PWA & Mobile/Desktop Lock-Screen Notifications)
  const subs = user?.pushSubscriptions || [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, notificationPayload, {
        TTL: 60 * 60,
        urgency: 'high',
      });
      results.webPushSent += 1;
    } catch (err) {
      results.errors.push(err?.message || 'web-push error');
    }
  }

  // 2. Native Capacitor FCM Push (Android/iOS Lock-Screen Notifications)
  const fcmKey = process.env.FCM_SERVER_KEY;
  const fcmTokens = user?.fcmTokens || [];
  if (fcmKey && fcmTokens.length > 0) {
    for (const token of fcmTokens) {
      try {
        const res = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmKey}`,
          },
          body: JSON.stringify({
            to: token,
            priority: 'high',
            notification: {
              title: payload.title || 'GameStrike.io',
              body: payload.body,
              sound: 'default',
              android_channel_id: 'gamestrike_high_priority',
            },
            data: {
              url: payload.url || '/#/chat',
              tag: payload.tag || 'gamestrike-alert',
            },
          }),
        });
        if (res.ok) results.fcmSent += 1;
      } catch (err) {
        results.errors.push(err?.message || 'fcm error');
      }
    }
  }

  return results;
}

