import React, { useState } from 'react';
import {
  ArrowRight,
  Gamepad2,
  KeyRound,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiFetch } from '../services/api';
import { UserProfile } from '../types';

interface AuthSuiteProps {
  onAuthenticate: (user: UserProfile, isNewSignup: boolean, authToken?: string | null) => void;
  onPreviewGames: () => void;
}

export const AuthSuite: React.FC<AuthSuiteProps> = ({
  onAuthenticate,
  onPreviewGames,
}) => {
  const [mode, setMode] = useState<'signup' | 'login' | 'forgot'>('signup');
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

  const handleSubmit = async (e: React.FormEvent) => {
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
            }),
          }
        );
        onAuthenticate(res.user, true, res.token);
        return;
      }

      // Login
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ contact: contact.trim(), password }),
      });
      onAuthenticate(res.user, false, res.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleInstantGuest = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/demo', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onAuthenticate(res.user, true, res.token);
    } catch {
      const profile: UserProfile = {
        id: `GS-${Math.floor(10000 + Math.random() * 90000)}`,
        name: 'Guest Player',
        username: `@strike${Math.floor(100 + Math.random() * 899)}`,
        contact: 'guest@gamestrike.io',
        joinedAt: new Date().toLocaleDateString(),
        tier: 'VIP Strike',
      };
      onAuthenticate(profile, true, null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-hero-pane">
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <a href="#/admin" className="mono" style={{ color: '#ffd166', fontWeight: 600 }}>
            Admin Panel App →
          </a>
        </div>
      </div>

      <div className="auth-form-pane">
        <div className="auth-card">
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
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field-input"
                  type="email"
                  placeholder="you@example.com"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
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

            {mode === 'signup' && (
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <div className="auth-divider">or test immediately</div>

          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%' }}
            disabled={loading}
            onClick={handleInstantGuest}
          >
            <Sparkles size={16} color="#ffd166" />
            <span>Continue as Instant Demo Player</span>
          </button>
        </div>
      </div>
    </div>
  );
};
