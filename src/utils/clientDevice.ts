const DEVICE_ID_KEY = 'gs_device_id_v1';

function randomId() {
  return `gsd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getStableDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

export function getDeviceFingerprint(): string {
  const ua = navigator.userAgent || '';
  const lang = navigator.language || '';
  const platform = navigator.platform || '';
  const screen = `${window.screen?.width || 0}x${window.screen?.height || 0}`;
  const raw = [ua, lang, platform, screen].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

export function getClientPlatform(): string {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
    .Capacitor;
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.() || 'native';
  if (p === 'android') return 'android-app';
    if (p === 'ios') return 'ios-app';
    return `capacitor-${p}`;
  }
  return 'web-browser';
}

export function detectBrowserLabel(): string {
  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'Chrome (iOS)';
  if (/EdgiOS|Edg\//i.test(ua)) return 'Edge';
  if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Instagram/i.test(ua)) return 'Instagram in-app';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook in-app';
  return 'Browser';
}

export function getClientDevicePayload() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    deviceId: getStableDeviceId(),
    deviceFingerprint: getDeviceFingerprint(),
    userAgent,
    platform: getClientPlatform(),
    browser: detectBrowserLabel(),
  };
}