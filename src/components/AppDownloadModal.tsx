import React, { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Download,
  ExternalLink,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface AppDownloadModalProps {
  open: boolean;
  onClose: () => void;
}

function detectInitialPlatform(): 'android' | 'ios' {
  if (typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  return 'android';
}

export const AppDownloadModal: React.FC<AppDownloadModalProps> = ({ open, onClose }) => {
  const [platform, setPlatform] = useState<'android' | 'ios'>(detectInitialPlatform);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!open) return null;

  const handlePwaInstall = async () => {
    if (!deferredPrompt) {
      setInstallNotice(
        'Open Chrome menu (⋮) at top-right and tap "Install app" or "Add to Home screen".'
      );
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallNotice('GameStrike.io is installing to your Home Screen!');
    }
    setDeferredPrompt(null);
  };

  return (
    <div
      className="nx-modal-overlay"
      onClick={onClose}
      style={{ zIndex: 120 }}
    >
      <div
        className="nx-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '94vw', padding: 22 }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <BrandLogo size="sm" subtitle="OFFICIAL MOBILE APP" />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close download modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero Badge */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255,31,75,0.14), rgba(255,209,102,0.08))',
            border: '1px solid rgba(255,31,75,0.32)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1.5px solid #ffd166',
              flexShrink: 0,
            }}
          >
            <img
              src="/gamestrike-logo.jpg"
              alt="GameStrike App"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#fff' }}>
              GameStrike.io Official App
            </div>
            <div style={{ fontSize: '0.76rem', color: '#b4b9ce', marginTop: 2 }}>
              24/7 Live Chat • Instant Deposits • Lock-Screen Push Alerts
            </div>
          </div>
        </div>

        {/* OS Switcher Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            background: 'rgba(255,255,255,0.04)',
            padding: 5,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPlatform('android');
              setInstallNotice(null);
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              background: platform === 'android' ? '#ff1f4b' : 'transparent',
              color: platform === 'android' ? '#fff' : '#9ca3b8',
              transition: 'all 0.2s',
            }}
          >
            <Smartphone size={15} />
            <span>Android (APK)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPlatform('ios');
              setInstallNotice(null);
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              background: platform === 'ios' ? '#ff1f4b' : 'transparent',
              color: platform === 'ios' ? '#fff' : '#9ca3b8',
              transition: 'all 0.2s',
            }}
          >
            <Sparkles size={15} />
            <span>iOS (iPhone / iPad)</span>
          </button>
        </div>

        {platform === 'android' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="/downloads/GameStrike.apk"
              download="GameStrike.apk"
              className="nx-btn-crimson"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '13px 16px',
                textDecoration: 'none',
                fontSize: '0.92rem',
              }}
            >
              <Download size={17} />
              <span>Download Android APK (Official)</span>
            </a>

            <button
              type="button"
              className="nx-btn-glass"
              onClick={handlePwaInstall}
              style={{ width: '100%', justifyContent: 'center', padding: '11px 14px' }}
            >
              <ExternalLink size={15} />
              <span>Instant 1-Tap Chrome App Install</span>
            </button>

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: '0.78rem',
                color: '#c8ccd8',
                lineHeight: 1.65,
              }}
            >
              <div style={{ fontWeight: 700, color: '#ffd166', marginBottom: 6 }}>
                How to install Android APK (15 seconds):
              </div>
              <div>1. Tap <strong>Download Android APK</strong> above.</div>
              <div>2. Open the downloaded <strong>GameStrike.apk</strong> file.</div>
              <div>3. If prompted, tap <strong>Allow from this source</strong> → <strong>Install</strong>.</div>
              <div>4. Open GameStrike.io &amp; allow notifications for instant lock-screen alerts.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="/downloads/GameStrike.mobileconfig"
              download="GameStrike.mobileconfig"
              className="nx-btn-crimson"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '13px 16px',
                textDecoration: 'none',
                fontSize: '0.92rem',
              }}
            >
              <Download size={17} />
              <span>Install iOS App Profile (1-Tap)</span>
            </a>

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: '0.78rem',
                color: '#c8ccd8',
                lineHeight: 1.65,
              }}
            >
              <div style={{ fontWeight: 700, color: '#ffd166', marginBottom: 6 }}>
                Option A — iOS Profile Install (Recommended):
              </div>
              <div>1. Tap <strong>Install iOS App Profile</strong> in Safari → tap <strong>Allow</strong>.</div>
              <div>2. Open iPhone <strong>Settings</strong> → tap <strong>Profile Downloaded</strong> → <strong>Install</strong>.</div>
              <div>3. GameStrike.io icon appears on your Home Screen full-screen!</div>

              <div
                style={{
                  height: 1,
                  background: 'rgba(255,255,255,0.08)',
                  margin: '10px 0',
                }}
              />

              <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Share size={13} />
                <span>Option B — Direct Safari Add to Home Screen:</span>
              </div>
              <div>1. Open GameStrike.io in <strong>Safari</strong>.</div>
              <div>2. Tap the <strong>Share (↑)</strong> button at the bottom bar.</div>
              <div>3. Tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.</div>
            </div>
          </div>
        )}

        {installNotice && (
          <div
            style={{
              marginTop: 12,
              padding: '9px 12px',
              borderRadius: 10,
              background: 'rgba(74, 222, 128, 0.12)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              color: '#86efac',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={15} />
            <span>{installNotice}</span>
          </div>
        )}

        {/* Footer Trust Row */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#8e94a8',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={14} color="#4ade80" /> Verified Safe Build
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <BellRing size={14} color="#ffd166" /> Lock-Screen Push Ready
          </span>
        </div>
      </div>
    </div>
  );
};

