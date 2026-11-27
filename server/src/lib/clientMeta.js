export function detectBrowserLabel(userAgent = '') {
  const ua = String(userAgent || '');
  if (/CriOS/i.test(ua)) return 'Chrome (iOS)';
  if (/EdgiOS|Edg\//i.test(ua)) return 'Edge';
  if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Instagram/i.test(ua)) return 'Instagram in-app';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook in-app';
  return ua.slice(0, 80) || 'Unknown';
}

export function normalizeClientMeta(body = {}) {
  const platform = String(body.platform || body.clientPlatform || 'web').slice(0, 80);
  const userAgent = String(body.userAgent || '').slice(0, 500);
  return {
    deviceId: String(body.deviceId || '').trim().slice(0, 120),
    deviceFingerprint: String(body.deviceFingerprint || '').trim().slice(0, 200),
    userAgent,
    platform,
    browser: String(body.browser || detectBrowserLabel(userAgent)).slice(0, 120),
  };
}

export function clientMetaDbPatch(meta) {
  const patch = { lastSeenAt: new Date() };
  if (meta.deviceId) patch.deviceId = meta.deviceId;
  if (meta.deviceFingerprint) patch.deviceFingerprint = meta.deviceFingerprint;
  if (meta.userAgent) patch.lastUserAgent = meta.userAgent;
  if (meta.platform) patch.lastClientPlatform = meta.platform;
  if (meta.browser) patch.lastBrowserLabel = meta.browser;
  return patch;
}