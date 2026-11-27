import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  Gamepad2,
  KeyRound,
  Mail,
  MessageSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiFetch } from '../services/api';
import { getClientDevicePayload } from '../utils/clientDevice';
import { UserProfile } from '../types';

interface AuthSuiteProps {
  onAuthenticate: (user: UserProfile, isNewSignup: boolean, authToken?: string | null) => void;
  onPreviewGames?: () => void;
  variant?: 'page' | 'modal';
  initialMode?: 'signup' | 'login';
  onClose?: () => void;
}

export const AuthSuite: React.FC<AuthSuiteProps> = ({
  onAuthenticate,
  onPreviewGames,
  variant = 'page',
  initialMode = 'signup',
  onClose,
}) => {
  const [mode, setMode] = useState<'signup' | 'login' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('ref') || '';
    } catch {
      return '';
    }
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otpBanner, setOtpBanner] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const onAuthRef = React.useRef(onAuthenticate);
  onAuthRef.current = onAuthenticate;
  const googleDoneRef = React.useRef(false);
  useEffect(() => {
    if (variant !== 'modal') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant, onClose]);

  useEffect(() => {
    const saved = sessionStorage.getItem('gs_google_error') || sessionStorage.getItem('gs_session_notice');
    if (!saved) return;
    sessionStorage.removeItem('gs_google_error');
    sessionStorage.removeItem('gs_session_notice');
    setErrorMsg(saved);
  }, []);

  useEffect(() => {
    const payload = getClientDevicePayload();
    apiFetch<{ blocked?: boolean; reason?: string }>('/api/device/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (res.blocked) {
          setErrorMsg(res.reason || 'This device cannot use GameStrike.');
        }
      })
      .catch(() => {});
  }, []);

  // Load Google Client ID. Sign-in itself uses the same popup flow as Winning Heaven.
  useEffect(() => {
    apiFetch<{ clientId: string }>('/api/auth/google-client-id')
      .then((res) => {
        const id = res.clientId || '893262340852-97ed0j09h8mdadc60oj2dslcb5fibbcv.apps.googleusercontent.com';
        if (id) setGoogleClientId(id);
      })
      .catch(() => {
        setGoogleClientId('893262340852-97ed0j09h8mdadc60oj2dslcb5fibbcv.apps.googleusercontent.com');
      });
  }, []);

  const finishGoogle = (user: UserProfile, isNewUser: boolean, authToken: string) => {
    if (googleDoneRef.current) return;
    googleDoneRef.current = true;
    onAuthRef.current(user, isNewUser, authToken);
  };

  const triggerGooglePrompt = async () => {
    setErrorMsg('');
    if (!googleClientId) {
      setErrorMsg('Google sign-in is still loading. Please try again in a second.');
      return;
    }
    setLoading(true);
    try {
      const session = await apiFetch<{ sid: string }>('/api/auth/google/session', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      oauthUrl.searchParams.set('client_id', googleClientId);
      oauthUrl.searchParams.set('redirect_uri', window.location.origin);
      oauthUrl.searchParams.set('response_type', 'code');
      oauthUrl.searchParams.set('scope', 'openid email profile');
      oauthUrl.searchParams.set('prompt', 'select_account');
      oauthUrl.searchParams.set('include_granted_scopes', 'true');
      oauthUrl.searchParams.set('state', session.sid);

      const nativeApp = Boolean(
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
      );
      const narrowScreen = window.matchMedia('(max-width: 860px)').matches;

      // The in-app page has no saved Google accounts. Chrome does.
      if (nativeApp) {
        const cap = (window as unknown as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
        if (cap?.isPluginAvailable?.('Browser')) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: oauthUrl.toString(), presentationStyle: 'popover' });
        } else {
          const parsed = new URL(oauthUrl.toString());
          const fallback = encodeURIComponent(parsed.toString());
          window.location.href = `intent://${parsed.host}${parsed.pathname}${parsed.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
        }
        const poll = window.setInterval(async () => {
          try {
            const status = await apiFetch<{
              status: string;
              token?: string;
              user?: UserProfile;
              isNewUser?: boolean;
            }>(`/api/auth/google/session/${session.sid}`);
            if (status.status === 'ready' && status.token && status.user) {
              window.clearInterval(poll);
              try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.close();
              } catch {
                /* Chrome was opened without the plugin, or the tab is already closed */
              }
              finishGoogle(status.user, Boolean(status.isNewUser), status.token);
              setLoading(false);
            }
          } catch {
            /* keep polling until the session is ready or expires */
          }
        }, 500);
        window.setTimeout(() => {
          window.clearInterval(poll);
          setLoading(false);
        }, 180000);
        return;
      }

      if (narrowScreen) {
        window.location.assign(oauthUrl.toString());
        return;
      }

      const popup = window.open(
        oauthUrl.toString(),
        'gamestrike_google',
        'popup=yes,width=500,height=680,left=80,top=80'
      );

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string; token?: string; user?: UserProfile; isNewUser?: boolean };
        if (data?.type !== 'gamestrike-google' || !data.token || !data.user) return;
        window.removeEventListener('message', onMessage);
        finishGoogle(data.user, Boolean(data.isNewUser), data.token);
        setLoading(false);
      };
      window.addEventListener('message', onMessage);

      const poll = window.setInterval(async () => {
        try {
          const status = await apiFetch<{
            status: string;
            token?: string;
            user?: UserProfile;
            isNewUser?: boolean;
          }>(`/api/auth/google/session/${session.sid}`);
          if (status.status === 'ready' && status.token && status.user) {
            window.clearInterval(poll);
            window.removeEventListener('message', onMessage);
            finishGoogle(status.user, Boolean(status.isNewUser), status.token);
            setLoading(false);
            try {
              popup?.close();
            } catch {
              /* popup may already be closed */
            }
          }
        } catch {
          /* keep polling until the session is ready or expires */
        }
      }, 500);

      window.setTimeout(() => {
        window.clearInterval(poll);
        window.removeEventListener('message', onMessage);
        setLoading(false);
      }, 180000);

      if (!popup) {
        window.location.assign(oauthUrl.toString());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not open Google sign-in.');
      setLoading(false);
    }
  };

  const handleSendOtp = async (purpose: 'signup' | 'reset') => {
    setErrorMsg('');
    setOtpBanner('');
    if (!contact.trim() || !contact.includes('@')) {
      setErrorMsg('Please enter a valid email address first.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; devOtp?: string }>(
        '/api/auth/send-otp',
        {
          method: 'POST',
          body: JSON.stringify({ email: contact.trim(), purpose }),
        }
      );
      setOtpSent(true);
      setOtpBanner(res.message);
      if (res.devOtp) setOtp(res.devOtp);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send OTP email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const res = await apiFetch<{ ok: boolean; message: string }>(
          '/api/auth/reset-password',
          {
            method: 'POST',
            body: JSON.stringify({
              email: contact.trim(),
              otp: otp.trim(),
              newPassword: password,
            }),
          }
        );
        setOtpBanner(res.message);
        setMode('login');
        setOtp('');
        setOtpSent(false);
        return;
      }

      if (mode === 'signup') {
        if (!otp.trim()) {
          setErrorMsg('Please click "Send OTP" and enter the 6-digit email OTP first.');
          return;
        }
        const res = await apiFetch<{ token: string; user: UserProfile }>(
          '/api/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({
              name: name.trim(),
              contact: contact.trim(),
              password,
              otp: otp.trim(),
              referredBy: referralCode.trim(),
              ...getClientDevicePayload(),
            }),
          }
        );
        onAuthenticate(res.user, true, res.token);
        return;
      }

      // Login — read the live input values so Android autofill is included.
      const form = e.currentTarget;
      const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
      const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
      const email = (emailInput?.value || contact).trim();
      const pass = passwordInput?.value || password;
      if (!email || !pass) {
        setErrorMsg('Enter your email and password.');
        return;
      }
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ contact: email, password: pass, ...getClientDevicePayload() }),
      });
      onAuthenticate(res.user, false, res.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <>
      {variant !== 'modal' && (
      <div className="auth-hero-pane">
        <div className="auth-hero-bar">
          <BrandLogo size="md" subtitle="24/7 GAMING SUPPORT SUITE" />
          <button
            type="button"
            onClick={onPreviewGames}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#e2e8f0',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <Gamepad2 size={14} />
            Games Page
          </button>
        </div>

        <div className="auth-hero-content">
          <div className="auth-pill">
            <span className="live-dot" />
            Live Gaming Concierge • Verified Email OTP
          </div>

          <h1 className="auth-hero-title">
            Your Direct <span className="gs-gradient-text">Gaming Suite</span> for Instant Play &amp; Payouts.
          </h1>
          <p className="auth-hero-desc">
            Sign in with Email OTP to open your private GameStrike.io Messenger Desk — get Game IDs, deposit via CashTap or Chime, claim Welcome &amp; Reload bonuses, and cash out 24/7.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <MessageSquare size={18} />
              </div>
              <div>
                <strong>Business Suite Chat Experience</strong>
                <span>Instant auto-welcome, 1-click Game IDs &amp; permanent credentials vault</span>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <Zap size={18} />
              </div>
              <div>
                <strong>Auto CashTap + Manual Chime Gateways</strong>
                <span>Auto Welcome &amp; Reload bonus calculation on every deposit</span>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong>Hostinger Email OTP Security</strong>
                <span>Verified email signup &amp; instant OTP password recovery</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-hero-footer">
          <span>gamestrike.io • Verified 24/7 Support Desk</span>
        </div>
      </div>
      )}

      <div className="auth-form-pane">
        <div className="auth-card">
          <div className="auth-google-block">
            <div className="auth-divider auth-divider-top">or continue with</div>
            <button
              type="button"
              className="btn-secondary auth-google-btn"
              onClick={triggerGooglePrompt}
              disabled={!googleClientId}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.77-4.59l-7.98-6.19A23.998 23.998 0 000 24c0 3.77.9 7.35 2.56 10.52l7.97-5.93z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.93C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
            <a
              className="auth-apk-link"
              href="/downloads/GameStrike.apk"
              download="GameStrike.apk"
            >
              <Download size={16} />
              <span>Download Android APK</span>
            </a>
            <div className="auth-divider auth-divider-bottom">or use your email</div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
                setOtpBanner('');
              }}
            >
              Create Account
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setOtpBanner('');
              }}
            >
              Sign In
            </button>
          </div>

          <div className="auth-card-fields">
          <h2 className="auth-heading">
            {mode === 'signup'
              ? 'Open your Support Suite'
              : mode === 'forgot'
              ? 'Reset Password via OTP'
              : 'Welcome back to GameStrike'}
          </h2>
          <p className="auth-sub">
            {mode === 'signup'
              ? 'Verify your email with a 6-digit OTP to launch your live Messenger desk.'
              : mode === 'forgot'
              ? 'Enter your email to receive a 6-digit password reset OTP.'
              : 'Log in to continue your chat, deposits, and saved Game IDs.'}
          </p>

          {errorMsg && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,31,75,0.14)', color: '#ff6b86', fontSize: '0.82rem', marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          {otpBanner && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.14)', color: '#4ade80', fontSize: '0.82rem', marginBottom: 12 }}>
              {otpBanner}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="field-group">
                <label className="field-label">Full Name</label>
                <input
                  className="field-input"
                  type="text"
                  placeholder="e.g. Jordan Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="field-group">
              <label className="field-label">Email Address</label>
              <div className="auth-email-row">
                <input
                  className="field-input"
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="you@example.com"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onInput={(e) => setContact(e.currentTarget.value)}
                  required
                />
                {(mode === 'signup' || mode === 'forgot') && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '0.78rem' }}
                    disabled={loading}
                    onClick={() => handleSendOtp(mode === 'forgot' ? 'reset' : 'signup')}
                  >
                    <Mail size={14} />
                    <span>{otpSent ? 'Resend' : 'Send OTP'}</span>
                  </button>
                )}
              </div>
            </div>

            {(mode === 'signup' || mode === 'forgot') && (
              <div className="field-group">
                <label className="field-label">6-Digit Email OTP</label>
                <input
                  className="field-input mono"
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
            )}

            {mode === 'signup' && variant !== 'modal' && (
              <div className="field-group">
                <label className="field-label">Referral Code (Optional — Get $10 Freeplay)</label>
                <input
                  className="field-input mono"
                  type="text"
                  placeholder="e.g. GS-53667"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                />
              </div>
            )}

            <div className="field-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="field-label">
                  {mode === 'forgot' ? 'New Password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    style={{ fontSize: '0.76rem', color: '#ffd166', fontWeight: 600 }}
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg('');
                      setOtpBanner('');
                      setOtpSent(false);
                    }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                className="field-input"
                type="password"
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: 6 }}
              disabled={loading}
            >
              {mode === 'forgot' ? <KeyRound size={16} /> : <ArrowRight size={17} />}
              <span>
                {loading
                  ? 'Please wait...'
                  : mode === 'signup'
                  ? 'Verify OTP & Launch Suite'
                  : mode === 'forgot'
                  ? 'Reset Password'
                  : 'Open Chat Support'}
              </span>
            </button>
          </form>

          {mode === 'forgot' && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => setMode('login')}
            >
              Back to Sign In
            </button>
          )}
          </div>

        </div>
      </div>
    </>
  );

  if (variant === 'modal') {
    return (
      <div className="auth-modal-backdrop" onClick={onClose}>
        <div
          className="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to GameStrike"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          {card}
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-shell${mode === 'signup' ? '' : ' auth-shell-short'}`}>
      {card}
    </div>
  );
};
