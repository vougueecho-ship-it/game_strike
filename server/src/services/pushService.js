import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
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
  loadServiceAccount();
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

let serviceAccount = null;
let cachedFcmToken = '';
let cachedFcmTokenExp = 0;

function loadServiceAccount() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = [
    configured ? path.resolve(process.cwd(), configured) : '',
    path.resolve(process.cwd(), '../gamestrike-f1060-firebase-adminsdk-fbsvc-2f55828df4.json'),
    path.resolve(process.cwd(), 'gamestrike-f1060-firebase-adminsdk-fbsvc-2f55828df4.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      serviceAccount = JSON.parse(fs.readFileSync(file, 'utf8'));
      console.log(`[PushService] FCM service account loaded for ${serviceAccount.project_id}.`);
      return;
    } catch (err) {
      console.error('[PushService] Could not read the Firebase service account file.');
    }
  }
}

async function getFcmAccessToken() {
  if (!serviceAccount?.private_key || !serviceAccount?.client_email) return '';
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcmToken && cachedFcmTokenExp - 60 > now) return cachedFcmToken;
  const assertion = jwt.sign(
    {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    },
    serviceAccount.private_key,
    { algorithm: 'RS256' }
  );
  const res = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'Firebase messaging auth failed.');
  }
  cachedFcmToken = data.access_token;
  cachedFcmTokenExp = now + Number(data.expires_in || 3600);
  return cachedFcmToken;
}

async function sendFcmMessage(token, payload) {
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !serviceAccount?.project_id) return false;
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title || 'GameStrike.io',
            body: payload.body || 'New message from GameStrike Support',
          },
          data: {
            url: payload.url || '/#/chat',
            tag: payload.tag || 'gamestrike-alert',
          },
          android: { priority: 'HIGH' },
        },
      }),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || 'FCM send failed.');
  }
  return true;
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
  const fcmTokens = user?.fcmTokens || [];
  if (fcmTokens.length > 0 && (serviceAccount || process.env.FCM_SERVER_KEY)) {
    for (const token of fcmTokens) {
      try {
        if (serviceAccount) {
          await sendFcmMessage(token, payload);
        } else {
          const res = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `key=${process.env.FCM_SERVER_KEY}`,
            },
            body: JSON.stringify({
              to: token,
              priority: 'high',
              notification: {
                title: payload.title || 'GameStrike.io',
                body: payload.body,
                sound: 'default',
              },
              data: {
                url: payload.url || '/#/chat',
                tag: payload.tag || 'gamestrike-alert',
              },
            }),
          });
          if (!res.ok) throw new Error('FCM send failed.');
        }
        results.fcmSent += 1;
      } catch (err) {
        results.errors.push(err?.message || 'fcm error');
      }
    }
  }

  return results;
}

