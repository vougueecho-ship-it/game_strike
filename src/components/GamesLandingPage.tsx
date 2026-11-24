import React, { useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Gamepad2,
  Home,
  ImagePlus,
  MessageSquare,
  Plug,
  Search,
  ShieldCheck,
  Smartphone,
  Trophy,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { AppDownloadModal } from './AppDownloadModal';
import { AuthSuite } from './AuthSuite';
import { paymentMethodName } from '../data/catalog';
import { GameItem, PaymentGateway, PlatformSettings, UserProfile } from '../types';

interface GamesLandingPageProps {
  games: GameItem[];
  gateways: PaymentGateway[];
  settings: PlatformSettings;
  darkMode: boolean;
  onToggleTheme: () => void;
  onBackToChat: () => void;
  onRequestGameIdInChat: (gameName: string) => void;
  onSubmitDepositFromPage: (data: {
    game: string;
    amount: number;
    method: string;
    handle: string;
    receiptScreenshotUrl?: string;
  }) => Promise<{ checkoutUrl?: string; error?: string } | void>;
  onSubmitWithdrawFromPage: (data: {
    game: string;
    gameUser: string;
    amount: number;
    method: string;
    payoutTag: string;
  }) => Promise<{ error?: string } | void> | { error?: string } | void;
  onClaimPromoInChat: (title: string, code: string) => void;
  isLoggedIn: boolean;
  onAuthenticate: (user: UserProfile, isNewSignup: boolean, authToken?: string | null) => void;
}

interface FeedRow {
  id: string;
  player: string;
  game: string;
  action: 'Cashout' | 'Auto Load';
  method: string;
  amount: string;
  secondsAgo: number;
}

const MASKED_FIRST = ['A', 'M', 'K', 'D', 'R', 'S', 'J', 'T', 'B', 'C', 'N', 'Z', 'L', 'H'];
const MASKED_LAST = ['n', 'a', 'v', 'x', 'e', 'k', 'r', 'm', 's', 'p', 'd', 'y'];
const FEED_METHODS = ['CashApp Pay', 'Chime', 'Card / Apple Pay', 'USDC Base'];
const LOAD_AMOUNTS = [20, 25, 30, 50, 75, 100, 150, 200];
const CASHOUT_AMOUNTS = [85, 120, 175, 240, 265, 340, 420, 580, 740, 890];

function formatSecondsAgo(sec: number) {
  if (sec < 6) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function generateLiveFeedRow(gameNames: string[]): FeedRow {
  const f = MASKED_FIRST[Math.floor(Math.random() * MASKED_FIRST.length)];
  const l = MASKED_LAST[Math.floor(Math.random() * MASKED_LAST.length)];
  const num = Math.floor(11 + Math.random() * 88);
  const pool = gameNames.length > 0 ? gameNames : ['Juwa 777', 'Game Vault 999'];
  const game = pool[Math.floor(Math.random() * pool.length)];
  const isCashout = Math.random() > 0.45;
  const amtList = isCashout ? CASHOUT_AMOUNTS : LOAD_AMOUNTS;
  const amt = amtList[Math.floor(Math.random() * amtList.length)];
  const method = FEED_METHODS[Math.floor(Math.random() * FEED_METHODS.length)];

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    player: `${f}***${l}${num}`,
    game,
    action: isCashout ? 'Cashout' : 'Auto Load',
    method,
    amount: `$${amt.toFixed(2)}`,
    secondsAgo: 0,
  };
}

const INITIAL_FEED_ROWS: FeedRow[] = [
  { id: 'init-1', player: 'M***n92', game: 'Juwa 777', action: 'Cashout', method: 'CashApp Pay', amount: '$420.00', secondsAgo: 4 },
  { id: 'init-2', player: 'K***a77', game: 'Game Vault 999', action: 'Auto Load', method: 'Card / Apple Pay', amount: '$100.00', secondsAgo: 18 },
  { id: 'init-3', player: 'D***v08', game: 'Juwa 777', action: 'Cashout', method: 'USDC Base', amount: '$890.00', secondsAgo: 42 },
  { id: 'init-4', player: 'R***x41', game: 'Game Vault 999', action: 'Cashout', method: 'CashApp Pay', amount: '$265.00', secondsAgo: 65 },
  { id: 'init-5', player: 'S***e19', game: 'Juwa 777', action: 'Auto Load', method: 'CashApp Pay', amount: '$50.00', secondsAgo: 112 },
];

export const GamesLandingPage: React.FC<GamesLandingPageProps> = ({
  games,
  gateways,
  settings,
  onBackToChat,
  onRequestGameIdInChat,
  onSubmitDepositFromPage,
  onSubmitWithdrawFromPage,
  onClaimPromoInChat,
  isLoggedIn,
  onAuthenticate,
}) => {
  const [search, setSearch] = useState('');
  const [jackpot, setJackpot] = useState<number>(52840.75);
  const [feedRows, setFeedRows] = useState<FeedRow[]>(INITIAL_FEED_ROWS);
  const [feedFilter, setFeedFilter] = useState<'all' | 'Cashout' | 'Auto Load'>('all');

  // Cashier & App Download Modal state
  const [cashierOpen, setCashierOpen] = useState(false);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [walletTab, setWalletTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [selectedGame, setSelectedGame] = useState(
    games.length > 0 ? games[0].name : 'GameStrike Wallet'
  );
  const [amount, setAmount] = useState<number>(20);
  const [gatewayId, setGatewayId] = useState(gateways[0]?.id || 'cashtap');
  const [gameUser, setGameUser] = useState('');
  const [payoutTag, setPayoutTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [copiedTag, setCopiedTag] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const requireLogin = () => {
    setAuthOpen(true);
  };

  useEffect(() => {
    const section = sessionStorage.getItem('gs_open_section');
    if (!section) return;
    sessionStorage.removeItem('gs_open_section');
    const jump = () => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    };
    requestAnimationFrame(jump);
    window.setTimeout(jump, 60);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      setJackpot((prev) => Number((prev + Math.random() * 1.45).toFixed(2)));
    }, 6000);
    return () => clearInterval(id);
  }, []);

  // Auto-updating Live Cashouts & Auto Loads feed (adds a fresh entry every ~12s)
  useEffect(() => {
    const gameNames = games.map((g) => g.name);
    const id = setInterval(() => {
      setFeedRows((prev) => {
        const aged = prev.map((r) => ({ ...r, secondsAgo: r.secondsAgo + 12 }));
        const nextRow = generateLiveFeedRow(gameNames);
        return [nextRow, ...aged].slice(0, 6);
      });
    }, 12000);
    return () => clearInterval(id);
  }, [games]);

  const filteredGames = games.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeGateway =
    gateways.find((g) => g.id === gatewayId) || gateways[0];

  const openChat = () => {
    if (!isLoggedIn) {
      requireLogin();
      return;
    }
    onBackToChat();
  };

  const requestGameId = (gameName: string) => {
    if (!isLoggedIn) {
      requireLogin();
      return;
    }
    onRequestGameIdInChat(gameName);
  };

  const claimPromo = (title: string, code: string) => {
    if (!isLoggedIn) {
      requireLogin();
      return;
    }
    onClaimPromoInChat(title, code);
  };

  const openCashier = (tab: 'deposit' | 'withdraw', gameName?: string) => {
    if (!isLoggedIn) {
      requireLogin();
      return;
    }
    if (gameName) setSelectedGame(gameName);
    else if (games.length > 0 && selectedGame === 'GameStrike Wallet') {
      setSelectedGame(games[0].name);
    }
    setWalletTab(tab);
    setErrorMsg(null);
    setCheckoutUrl(null);
    setCashierOpen(true);
  };

  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCheckoutUrl(null);
    setSubmitting(true);

    try {
      if (walletTab === 'deposit') {
        const res = await onSubmitDepositFromPage({
          game: games.length > 0 ? selectedGame : 'GameStrike Wallet',
          amount: Math.max(0.5, amount),
          method: activeGateway?.id || 'cashtap',
          handle: activeGateway?.handle || 'pay.cashtap.cash',
          receiptScreenshotUrl: receiptUrl || undefined,
        });
        if (res && res.error) {
          setErrorMsg(res.error);
        } else if (res && res.checkoutUrl) {
          setCheckoutUrl(res.checkoutUrl);
          setToastMsg(`CashTap Checkout ready for $${amount}!`);
        } else {
          setToastMsg(`Deposit request for $${amount} sent to Chat Support!`);
        }
      } else {
        const res = await onSubmitWithdrawFromPage({
          game: games.length > 0 ? selectedGame : 'GameStrike Wallet',
          gameUser: gameUser.trim() || 'Active Player ID',
          amount: Math.max(10, amount),
          method: activeGateway?.name || 'CashApp Pay',
          payoutTag: payoutTag.trim() || 'Verified Payout Tag',
        });
        if (res && res.error) {
          setErrorMsg(res.error);
        } else {
          setToastMsg(`Cashout request for $${Math.max(10, amount)} logged to Chat Support!`);
          setCashierOpen(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="nx-page">
      {/* FLOATING GLASS WIDESCREEN HEADER */}
      <header className="nx-header">
        <div className="nx-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <BrandLogo size="sm" />
            <nav className="nx-nav-links">
              <button type="button" onClick={() => scrollToSection('nx-games')}>
                Games
              </button>
              <button type="button" onClick={() => scrollToSection('nx-live')}>
                Live Payouts
              </button>
              <button type="button" onClick={() => scrollToSection('nx-bonuses')}>
                VIP Bonuses
              </button>
              <button type="button" onClick={openChat}>
                24/7 Chat Support
              </button>
              <button type="button" onClick={() => setAppModalOpen(true)} style={{ color: '#ffd166', fontWeight: 700 }}>
                Download App
              </button>
            </nav>
          </div>

          <div className="nx-header-actions">
            <button
              type="button"
              className="nx-btn-ghost"
              onClick={() => openCashier('withdraw')}
            >
              Withdraw
            </button>
            <button
              type="button"
              className="nx-btn-crimson"
              onClick={() => openCashier('deposit')}
            >
              <Zap size={15} />
              <span>Deposit</span>
            </button>
          </div>
        </div>
      </header>

      <div className="nx-offer-bar" aria-label="Today's offer">
        <div className="nx-offer-track">
          {[0, 1].map((copy) => (
            <div className="nx-offer-set" key={copy}>
              {[0, 1, 2, 3].map((item) => (
                <span className="nx-offer-item" key={item}>
                  <span>
                    {settings.dailyOfferText?.trim() ||
                      `${settings.dailyBonusPercent || 0}% ${settings.dailyBonusLabel || "Today's offer"}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      claimPromo(
                        `${settings.dailyBonusPercent || 0}% ${settings.dailyBonusLabel || "Today's Bonus"}`,
                        'DAILY'
                      )
                    }
                  >
                    Claim
                  </button>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* CINEMATIC FULL-BLEED ARENA HERO */}
      <section className="nx-hero">
        <div className="nx-hero-spotlight" />
        <div className="nx-hero-grid-bg" />

        <div className="nx-hero-inner">
          <div className="nx-hero-badge">
            <span className="live-dot" />
            <span>OFFICIAL API GAMING ARENA • INSTANT CASHTAP PAYOUTS</span>
          </div>

          <h1 className="nx-hero-title">
            NEXT-GEN ARCADE.
            <br />
            <span className="nx-gold-text">ZERO WAIT PAYOUTS.</span>
          </h1>

          <p className="nx-hero-sub">
            Instant Game IDs, automated CashTap Checkout (CashApp Pay, Card, Apple Pay &amp; USDC), and 24/7 live VIP concierge in one unified platform.
          </p>

          <div className="nx-hero-cta-group">
            <button
              type="button"
              className="nx-btn-crimson nx-btn-lg"
              onClick={() => openCashier('deposit')}
            >
              <Zap size={18} />
              <span>Instant Deposit</span>
            </button>
            <button
              type="button"
              className="nx-btn-glass nx-btn-lg"
              onClick={openChat}
            >
              <MessageSquare size={18} />
              <span>Live Chat</span>
            </button>
            <button
              type="button"
              className="nx-btn-glass nx-btn-lg"
              onClick={() => setAppModalOpen(true)}
              style={{ borderColor: 'rgba(255, 209, 102, 0.35)', color: '#ffd166' }}
            >
              <Smartphone size={18} />
              <span>Download App (APK / iOS)</span>
            </button>
          </div>

          <div id="nx-bonuses" className="nx-bonus-rail" aria-label="Live bonuses">
            {[
              {
                id: 'freeplay',
                code: 'FREEPLAY',
                kicker: 'Once',
                value: `$${Number(settings.freeplayAmount || 0).toFixed(0)}`,
                label: 'Freeplay',
                title: `$${Number(settings.freeplayAmount || 0).toFixed(0)} Freeplay`,
              },
              {
                id: 'welcome',
                code: 'WELCOME',
                kicker: 'First',
                value: `${settings.welcomeBonusPercent}%`,
                label: 'Welcome',
                title: `${settings.welcomeBonusPercent}% Welcome`,
              },
              {
                id: 'regular',
                code: 'REGULAR',
                kicker: 'Every',
                value: `${settings.regularBonusPercent}%`,
                label: 'Regular',
                title: `${settings.regularBonusPercent}% Regular`,
              },
            ].map((offer) => (
              <button
                key={offer.id}
                type="button"
                className="nx-bonus-chip"
                onClick={() => claimPromo(offer.title, offer.code)}
              >
                <span>{offer.kicker}</span>
                <strong>{offer.value}</strong>
                <em>{offer.label}</em>
              </button>
            ))}
          </div>

          {/* Live Jackpot & Instant Metrics Strip */}
          <div className="nx-jackpot-bar">
            <div className="nx-jackpot-item">
              <Trophy size={18} color="#ffd166" />
              <div>
                <span className="nx-jackpot-label">COMMUNITY JACKPOT POOL</span>
                <strong className="nx-jackpot-value mono">
                  ${jackpot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <div className="nx-jackpot-divider" />

            <div className="nx-jackpot-item">
              <Flame size={18} color="#ff1f4b" />
              <div>
                <span className="nx-jackpot-label">WELCOME BONUS</span>
                <strong className="nx-jackpot-value">100% MATCH</strong>
              </div>
            </div>

            <div className="nx-jackpot-divider" />

            <div className="nx-jackpot-item">
              <ShieldCheck size={18} color="#22c55e" />
              <div>
                <span className="nx-jackpot-label">SETTLEMENT</span>
                <strong className="nx-jackpot-value">AUTO INSTANT</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="nx-main">
        {toastMsg && (
          <div className="lobby-toast" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} />
              <span>{toastMsg}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nx-btn-crimson"
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  <span>Pay Now</span>
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                className="nx-btn-ghost"
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                onClick={openChat}
              >
                Open Chat →
              </button>
            </div>
          </div>
        )}

        {/* FLOATING GLASS CONTROL DOCK */}
        <section id="nx-games" className="nx-section">
          <div className="nx-dock">
            <div className="nx-dock-left">
              <div className="nx-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search games..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

            </div>
          </div>

          {/* COLLECTOR'S EDITION 3:4 POSTER GAME CARDS */}
          {filteredGames.length === 0 ? (
            <div className="lobby-empty">
              <Plug size={28} color="#ffd166" />
              <h3>No Connected Games Yet</h3>
              <p>Official games will show up here as soon as they are live.</p>
            </div>
          ) : (
            <div className="nx-games-grid">
              {filteredGames.map((game) => {
                const coverImg =
                  game.id === 'juwa-777'
                    ? '/games/juwa-official.png'
                    : game.id === 'game-vault-999'
                    ? '/games/vault-bg.jpg'
                    : game.imageUrl || '';

                return (
                  <article key={game.id} className="nx-game-card">
                    <div className="nx-game-media">
                      {coverImg ? (
                        <img src={coverImg} alt={game.name} />
                      ) : (
                        <div className="nx-game-fallback">{game.initials}</div>
                      )}
                      <div className="nx-game-vignette" />

                      <div className="nx-game-top">
                        <span className="nx-pill-live">
                          <span className="live-dot" style={{ width: 5, height: 5 }} />
                          LIVE API
                        </span>
                        {game.downloadUrl && game.downloadUrl !== '#' && (
                          <a
                            href={game.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="nx-dl-circle"
                            title={`Download ${game.name} App`}
                          >
                            <Download size={14} />
                          </a>
                        )}
                      </div>

                      {/* Sleek Frosted Glass Bottom Dock Over Artwork */}
                      <div className="nx-game-overlay-foot">
                        <div className="nx-game-title-row">
                          <h3>{game.name}</h3>
                          <span className="nx-min-tag mono">Min ${game.minDeposit}</span>
                        </div>
                        <div className="nx-game-platforms">
                          {(game.platforms || ['iOS', 'Android']).join(' • ')}
                        </div>
                        <div className="nx-game-btns">
                          <button
                            type="button"
                            className="nx-btn-crimson"
                            style={{ flex: 1, padding: '9px 10px', fontSize: '0.8rem' }}
                            onClick={() => openCashier('deposit', game.name)}
                          >
                            <Zap size={14} />
                            <span>Play / Load</span>
                          </button>
                          <button
                            type="button"
                            className="nx-btn-glass"
                            style={{ padding: '9px 12px', fontSize: '0.78rem' }}
                            onClick={() => requestGameId(game.name)}
                          >
                            <Gamepad2 size={14} />
                            <span>ID</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* LIVE PAYOUTS & CASHTAP ACTIVITY FEED (POLISHED STAKE/ROLLBIT STREAM) */}
        <section id="nx-live" className="nx-section">
          <div className="nx-sec-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2>Live Cashouts &amp; Auto Loads</h2>
                <span className="nx-live-tag">
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  LIVE
                </span>
              </div>
              <p>Real-time CashTap &amp; verified payout stream across GameStrike.io</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="nx-feed-tabs">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'Cashout', label: 'Cashouts' },
                    { id: 'Auto Load', label: 'Auto Loads' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`nx-feed-tab ${feedFilter === t.id ? 'active' : ''}`}
                    onClick={() => setFeedFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="nx-btn-glass"
                style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                onClick={() => openCashier('deposit')}
              >
                <Wallet size={15} />
                <span>Open Cashier</span>
              </button>
            </div>
          </div>

          <div className="nx-feed-card">
            <div className="nx-feed-head">
              <span>Player</span>
              <span>Game</span>
              <span>Type</span>
              <span>Gateway</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
            </div>
            {feedRows
              .filter((r) => (feedFilter === 'all' ? true : r.action === feedFilter))
              .map((row, idx) => (
                <div
                  key={row.id}
                  className={`nx-feed-row ${idx === 0 ? 'nx-feed-row-fresh' : ''}`}
                >
                  <div className="nx-feed-player">
                    <span
                      className={`nx-feed-avatar ${
                        row.action === 'Cashout' ? 'gold' : 'green'
                      }`}
                    >
                      {row.player[0]}
                    </span>
                    <div>
                      <strong className="mono" style={{ display: 'block', fontSize: '0.84rem' }}>
                        {row.player}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: '#7f8599' }}>
                        {formatSecondsAgo(row.secondsAgo)}
                      </span>
                    </div>
                  </div>

                  <span className="nx-feed-game">
                    <Gamepad2 size={14} color="#ffd166" />
                    <span>{row.game}</span>
                  </span>

                  <span>
                    <span
                      className={`nx-type-chip ${
                        row.action === 'Cashout' ? 'cashout' : 'load'
                      }`}
                    >
                      {row.action === 'Cashout' ? '↗ Cashout' : '↙ Auto Load'}
                    </span>
                  </span>

                  <span>
                    <span className="nx-gw-pill">{row.method}</span>
                  </span>

                  <div style={{ textAlign: 'right' }}>
                    <strong
                      className="mono"
                      style={{
                        display: 'block',
                        fontSize: '0.92rem',
                        color: row.action === 'Cashout' ? '#ffd166' : '#4ade80',
                      }}
                    >
                      {row.amount}
                    </strong>
                    <span style={{ fontSize: '0.66rem', color: '#64748b' }}>Verified ✓</span>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* OFFICIAL MOBILE APP DOWNLOAD BANNER (ANDROID APK + iOS) */}
        <section
          id="nx-app-download"
          className="nx-section"
          style={{
            background: 'linear-gradient(135deg, rgba(255,31,75,0.12) 0%, rgba(15,16,22,0.96) 55%, rgba(255,209,102,0.10) 100%)',
            border: '1px solid rgba(255,31,75,0.28)',
            borderRadius: 22,
            padding: '26px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: 540 }}>
            <img
              src="/gamestrike-logo.jpg"
              alt="GameStrike.io App"
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                border: '2px solid #ffd166',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.09em', color: '#ffd166', textTransform: 'uppercase' }}>
                OFFICIAL MOBILE APP • LOCK-SCREEN ALERTS
              </div>
              <h2 style={{ margin: '4px 0 4px', fontSize: '1.3rem', color: '#fff' }}>
                Install GameStrike.io on Android &amp; iOS
              </h2>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#b4b9ce' }}>
                Download the native Android APK or install the 1-Tap iPhone App for full-screen play, instant deposits, and real-time lock-screen notifications.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <a
              href="/downloads/GameStrike.apk"
              download="GameStrike.apk"
              className="nx-btn-crimson"
              style={{ textDecoration: 'none', padding: '12px 18px' }}
            >
              <Download size={16} />
              <span>Android APK</span>
            </a>
            <button
              type="button"
              className="nx-btn-glass"
              onClick={() => setAppModalOpen(true)}
              style={{ padding: '12px 18px', borderColor: 'rgba(255,209,102,0.4)', color: '#ffd166' }}
            >
              <Smartphone size={16} />
              <span>Install iOS App</span>
            </button>
          </div>
        </section>

        {/* PAYMENT RAILS STRIP */}
        <section className="nx-pay-strip">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: '0.86rem' }}>
            <ShieldCheck size={18} color="#22c55e" />
            <span>Payment Methods</span>
          </div>
          <div className="nx-pay-tags">
            {gateways.map((gw) => (
              <button
                key={gw.id}
                type="button"
                className="nx-pay-tag"
                onClick={() => {
                  setGatewayId(gw.id);
                  openCashier('deposit');
                }}
              >
                {paymentMethodName(gw)}
              </button>
            ))}
          </div>
        </section>

        <footer className="nx-footer">
          <span>
            <strong>GameStrike.io</strong> — 24/7 Official Gaming Concierge • 18+ Play Responsibly
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" onClick={openChat} style={{ color: '#ffd166', fontWeight: 600 }}>
              Live Chat Support
            </button>
          </div>
        </footer>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="lobby-bottom-nav" aria-label="Mobile navigation">
        <button type="button" className="lobby-bottom-item active" onClick={() => scrollToSection('nx-games')}>
          <Home size={18} />
          <span>Lobby</span>
        </button>
        <button type="button" className="lobby-bottom-item" onClick={() => openCashier('deposit')}>
          <ArrowDownCircle size={18} color="#4ade80" />
          <span>Deposit</span>
        </button>
        <button type="button" className="lobby-bottom-item" onClick={() => openCashier('withdraw')}>
          <ArrowUpCircle size={18} color="#ffd166" />
          <span>Withdraw</span>
        </button>
        <button type="button" className="lobby-bottom-item" onClick={openChat}>
          <MessageSquare size={18} color="#ff1f4b" />
          <span>Chat</span>
        </button>
        <button type="button" className="lobby-bottom-item" onClick={() => setAppModalOpen(true)}>
          <Smartphone size={18} color="#38bdf8" />
          <span>Get App</span>
        </button>
      </nav>

      {/* GLASSMORPHIC CASHIER MODAL */}
      {cashierOpen && (
        <div className="cashier-backdrop" onClick={() => setCashierOpen(false)}>
          <div className="cashier-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cashier-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Wallet size={20} color="#ffd166" />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.08rem' }}>
                    GameStrike Cashier
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Automated CashTap Checkout &amp; Instant Payouts
                  </div>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCashierOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="auth-tabs" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`auth-tab ${walletTab === 'deposit' ? 'active' : ''}`}
                onClick={() => setWalletTab('deposit')}
              >
                Auto Deposit
              </button>
              <button
                type="button"
                className={`auth-tab ${walletTab === 'withdraw' ? 'active' : ''}`}
                onClick={() => setWalletTab('withdraw')}
              >
                Withdraw
              </button>
            </div>

            {errorMsg && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,31,75,0.14)', color: '#ff6b86', fontSize: '0.82rem', marginBottom: 12 }}>
                {errorMsg}
              </div>
            )}

            {checkoutUrl ? (
              <div style={{ textAlign: 'center', padding: '14px 4px', display: 'grid', gap: 12 }}>
                <CheckCircle2 size={36} color="#22c55e" style={{ margin: '0 auto' }} />
                <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>
                  CashTap Checkout Ready!
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Complete your ${amount} payment on CashTap — credits auto-confirm to {selectedGame}.
                </p>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nx-btn-crimson"
                  style={{ width: '100%', padding: '12px 16px' }}
                >
                  <span>Pay ${amount} on CashTap</span>
                  <ExternalLink size={16} />
                </a>
              </div>
            ) : (
              <form onSubmit={handleWalletSubmit}>
                <div className="field-group">
                  <label className="field-label">Game / Wallet</label>
                  <select
                    className="field-input"
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                  >
                    {games.length === 0 ? (
                      <option value="GameStrike Wallet">GameStrike Wallet Balance</option>
                    ) : (
                      games.map((g) => (
                        <option key={g.id} value={g.name}>
                          {g.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {walletTab === 'withdraw' && (
                  <div className="field-group">
                    <label className="field-label">Your Game Login ID</label>
                    <input
                      className="field-input"
                      placeholder="e.g. gs_player_1024"
                      value={gameUser}
                      onChange={(e) => setGameUser(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label">Amount (USD)</label>
                  <div className="amount-grid">
                    {[10, 20, 50, 100].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`amount-pill ${amount === v ? 'active' : ''}`}
                        onClick={() => setAmount(v)}
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                  <input
                    className="field-input mono"
                    type="number"
                    step="0.5"
                    min={walletTab === 'deposit' ? 0.5 : 10}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 1)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Payment Method</label>
                  <select
                    className="field-input"
                    value={gatewayId}
                    onChange={(e) => setGatewayId(e.target.value)}
                  >
                    {gateways
                      .filter((g) =>
                        walletTab === 'deposit' ? g.supportsDeposit : g.supportsWithdraw
                      )
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {paymentMethodName(g)}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Manual Gateway Details & Receipt in Modal */}
                {walletTab === 'deposit' && activeGateway && !['cashtap', 'cashapp', 'coinbase', 'wallet'].includes(activeGateway.id) && (
                  <div style={{ background: 'var(--nx-bg-surface-soft)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Send ${amount} to official {paymentMethodName(activeGateway)} Tag:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 6 }}>
                      <strong className="mono" style={{ fontSize: '0.86rem', color: '#ffd166' }}>
                        {activeGateway.handle}
                      </strong>
                      <button
                        type="button"
                        className="msg-act-btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeGateway.handle);
                          setCopiedTag(true);
                          setTimeout(() => setCopiedTag(false), 1600);
                        }}
                        title="Copy payment tag"
                      >
                        {copiedTag ? <CheckCircle2 size={13} color="#22c55e" /> : <Copy size={13} />}
                      </button>
                    </div>

                    {activeGateway.directPaymentLink && (
                      <div style={{ marginTop: 6, fontSize: '0.76rem' }}>
                        <a
                          href={activeGateway.directPaymentLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#38bdf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <ExternalLink size={12} />
                          <span>Open Direct Payment Link ↗</span>
                        </a>
                      </div>
                    )}

                    {activeGateway.qrImageUrl && (
                      <div style={{ marginTop: 8, textAlign: 'center' }}>
                        <img
                          src={activeGateway.qrImageUrl}
                          alt={`${activeGateway.name} QR`}
                          style={{ width: 110, height: 110, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }}
                        />
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            className="msg-act-btn"
                            style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = activeGateway.qrImageUrl!;
                              a.download = `${activeGateway.name.replace(/\s+/g, '_')}_QR.png`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }}
                          >
                            <Download size={11} />
                            <span>Download QR Code</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Receipt Screenshot Upload */}
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        Payment Receipt Screenshot (Required)
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: receiptUrl ? '1px solid #22c55e' : '1px dashed var(--border-subtle)',
                          background: 'rgba(0,0,0,0.2)',
                          cursor: 'pointer',
                          fontSize: '0.76rem',
                          color: receiptUrl ? '#4ade80' : 'var(--text-muted)',
                        }}
                      >
                        <ImagePlus size={14} />
                        <span>{receiptUrl ? '✓ Receipt Attached (Tap to change)' : 'Tap to upload payment screenshot'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const r = new FileReader();
                              r.onload = () => {
                                if (typeof r.result === 'string') setReceiptUrl(r.result);
                              };
                              r.readAsDataURL(f);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {walletTab === 'withdraw' && (
                  <div className="field-group">
                    <label className="field-label">Your Payout Tag / USDC Wallet</label>
                    <input
                      className="field-input"
                      placeholder="e.g. $CashTag or Base USDC address"
                      value={payoutTag}
                      onChange={(e) => setPayoutTag(e.target.value)}
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="nx-btn-crimson"
                  style={{ width: '100%', padding: '12px 16px' }}
                  disabled={submitting}
                >
                  <Zap size={16} />
                  <span>
                    {submitting
                      ? 'Processing...'
                      : walletTab === 'deposit'
                      ? `Pay $${amount} with ${paymentMethodName(activeGateway)}`
                      : `Request $${Math.max(10, amount)} Cashout`}
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      <AppDownloadModal open={appModalOpen} onClose={() => setAppModalOpen(false)} />
      {authOpen && !isLoggedIn && (
        <AuthSuite
          variant="modal"
          initialMode="login"
          onClose={() => setAuthOpen(false)}
          onAuthenticate={onAuthenticate}
        />
      )}
    </div>
  );
};
