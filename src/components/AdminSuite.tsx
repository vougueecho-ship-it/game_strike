import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CheckCircle2,
  Database,
  Download,
  Gamepad2,
  ImagePlus,
  Landmark,
  LogOut,
  MessageSquare,
  Moon,
  Pencil,
  Plug,
  Power,
  RefreshCw,
  Send,
  ShieldCheck,
  Sliders,
  Sun,
  Ticket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiFetch, createRealtimeSocket, enableLockScreenPush } from '../services/api';

interface AdminSuiteProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onBackToPlayerApp: () => void;
}

type AdminTab = 'analytics' | 'inbox' | 'tickets' | 'games' | 'gateways' | 'rules' | 'push';

const ADMIN_TOKEN_KEY = 'gamestrike_admin_token_v1';

export const AdminSuite: React.FC<AdminSuiteProps> = ({
  darkMode,
  onToggleTheme,
  onBackToPlayerApp,
}) => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(ADMIN_TOKEN_KEY)
  );
  const [email, setEmail] = useState('admin@gamestrike.io');
  const [password, setPassword] = useState('Admin@1234');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<AdminTab>('analytics');
  const [agentBalances, setAgentBalances] = useState<Record<string, string>>({});
  const [playerBalLookup, setPlayerBalLookup] = useState<Record<string, string>>({});
  const [dbMode, setDbMode] = useState('Connecting...');
  const [players, setPlayers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerMessages, setPlayerMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [typingPlayerId, setTypingPlayerId] = useState<string | null>(null);
  const [humanModeMap, setHumanModeMap] = useState<Record<string, boolean>>({});
  const [credDrafts, setCredDrafts] = useState<Record<string, { user: string; pass: string }>>({});

  const adminSocketRef = useRef<ReturnType<typeof createRealtimeSocket> | null>(null);
  const adminFileRef = useRef<HTMLInputElement | null>(null);

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // ignore autoplay restrictions
    }
  };

  // Push broadcast state
  const [pushTitle, setPushTitle] = useState('⚡ 20% Reload Bonus Live!');
  const [pushBody, setPushBody] = useState('Deposit $20+ right now in GameStrike.io chat and claim 20% extra play credit.');
  const [pushStatus, setPushStatus] = useState('');

  // API config editing state
  const [editingGame, setEditingGame] = useState<any | null>(null);
  const [editingGateway, setEditingGateway] = useState<any | null>(null);
  const [saveBanner, setSaveBanner] = useState('');
  const [rules, setRules] = useState({
    welcomeBonusPercent: 100,
    regularBonusPercent: 20,
    referralBonus: 10,
    freeplayMinWithdraw: 30,
    freeplayMaxWithdraw: 100,
    withdrawMultiplier: 3,
    minWithdrawFallback: 20,
    enforceDeviceLimit: true,
  });
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadOverview = async (authToken: string) => {
    try {
      const data = await apiFetch<any>('/api/admin/overview', {}, authToken);
      setDbMode(data.database);
      setPlayers(data.players || []);
      setTickets(data.tickets || []);
      setGames(data.games || []);
      setGateways(data.gateways || []);
      if (data.settings) setRules(data.settings);
      if (!selectedPlayerId && data.players?.length > 0) {
        setSelectedPlayerId(data.players[0]._id);
      }
    } catch (err: any) {
      if (err.message?.includes('Unauthorized') || err.message?.includes('Invalid')) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
      }
    }
  };

  useEffect(() => {
    if (!token) return;
    loadOverview(token);

    const socket = createRealtimeSocket(token);
    adminSocketRef.current = socket;
    socket.on('admin:new-player', (newPlayer: any) => {
      setPlayers((prev) => [newPlayer, ...prev.filter((p) => p._id !== newPlayer._id)]);
    });
    socket.on('ticket:created', (ticket: any) => {
      playChime();
      setTickets((prev) =>
        prev.some((t) => t.ticketId === ticket.ticketId) ? prev : [ticket, ...prev]
      );
      setSaveBanner(
        `🔔 New Request: ${ticket.title} from ${ticket.playerName} (${ticket.ticketId})`
      );
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`GameStrike Admin: ${ticket.ticketId}`, {
          body: `${ticket.playerName} — ${ticket.title}`,
          icon: '/gamestrike-logo.jpg',
        });
      }
    });
    socket.on('ticket:updated', (ticket: any) => {
      setTickets((prev) => prev.map((t) => (t.ticketId === ticket.ticketId ? ticket : t)));
    });
    socket.on('chat:typing', (payload: { userId: string; isTyping: boolean }) => {
      setTypingPlayerId(payload.isTyping ? String(payload.userId) : null);
    });
    socket.on('chat:message', (msg: any) => {
      if (msg.sender === 'user') {
        playChime();
        setSaveBanner(`💬 ${msg.playerName || 'Player'}: "${msg.text || 'Sent an image'}"`);
        const uid = String(msg.userId);
        // Move active player to top of Admin Inbox
        setPlayers((prev) => {
          const found = prev.find((p) => String(p._id) === uid);
          if (!found) return prev;
          return [found, ...prev.filter((p) => String(p._id) !== uid)];
        });
        if (uid !== String(selectedPlayerId)) {
          setUnreadMap((prev) => ({ ...prev, [uid]: (prev[uid] || 0) + 1 }));
        }
      }
      setPlayerMessages((prev) => {
        if (String(msg.userId) !== String(selectedPlayerId)) return prev;
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    });
    socket.on('chat:message-updated', (updated: any) => {
      setPlayerMessages((prev) =>
        prev.map((m) => (String(m._id) === String(updated._id) ? updated : m))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [token, selectedPlayerId]);

  useEffect(() => {
    if (!token || !selectedPlayerId) return;
    apiFetch<{ messages: any[] }>(`/api/admin/chat/${selectedPlayerId}`, {}, token)
      .then((res) => setPlayerMessages(res.messages || []))
      .catch(() => {});
  }, [token, selectedPlayerId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [playerMessages.length]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ contact: email, password }),
      });
      if (res.user.role !== 'admin') {
        throw new Error('This account does not have Admin permissions.');
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (
    e: React.FormEvent,
    attachment?: { url: string; name: string }
  ) => {
    e.preventDefault();
    if (!token || !selectedPlayerId) return;
    if (!replyText.trim() && !attachment) return;
    const text = replyText.trim();
    setReplyText('');
    adminSocketRef.current?.emit('chat:typing', {
      targetUserId: selectedPlayerId,
      isTyping: false,
    });
    setHumanModeMap((prev) => ({ ...prev, [selectedPlayerId]: true }));
    await apiFetch(
      `/api/admin/chat/${selectedPlayerId}/reply`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: text || (attachment ? `Sent image: ${attachment.name}` : ''),
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
        }),
      },
      token
    );
  };

  const handleToggleHumanMode = async (userId: string) => {
    if (!token) return;
    const next = !humanModeMap[userId];
    setHumanModeMap((prev) => ({ ...prev, [userId]: next }));
    await apiFetch(
      `/api/admin/chat/${userId}/mode`,
      { method: 'PATCH', body: JSON.stringify({ humanTakeover: next }) },
      token
    );
    setSaveBanner(
      next
        ? '🟢 Live Human Mode ON — Auto-bot paused for this player.'
        : '🤖 Auto-Bot Mode ON — Automated concierge resumed for this player.'
    );
  };

  const handleAdminEditMessage = async (msgId: string, newText: string) => {
    if (!token || !newText.trim()) return;
    const updated = await apiFetch<any>(
      `/api/chat/message/${msgId}`,
      { method: 'PATCH', body: JSON.stringify({ text: newText.trim() }) },
      token
    );
    setPlayerMessages((prev) =>
      prev.map((m) => (String(m._id) === String(updated._id) ? updated : m))
    );
    setEditingMsgId(null);
  };

  const handleAdminDeleteMessage = async (msgId: string) => {
    if (!token) return;
    const updated = await apiFetch<any>(
      `/api/chat/message/${msgId}`,
      { method: 'DELETE' },
      token
    );
    setPlayerMessages((prev) =>
      prev.map((m) => (String(m._id) === String(updated._id) ? updated : m))
    );
  };

  const handleTicketAction = async (
    ticketId: string,
    status: 'Completed' | 'Rejected',
    extra?: { gameUser?: string; gamePassword?: string }
  ) => {
    if (!token) return;
    await apiFetch(
      `/api/admin/tickets/${ticketId}`,
      { method: 'PATCH', body: JSON.stringify({ status, ...(extra || {}) }) },
      token
    );
    setSaveBanner(`Ticket ${ticketId} marked ${status} + Push Notification sent to player.`);
    setTimeout(() => setSaveBanner(''), 3500);
  };

  const handleSaveGameApi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingGame) return;
    await apiFetch(
      `/api/admin/games/${editingGame.slug}`,
      { method: 'PUT', body: JSON.stringify(editingGame) },
      token
    );
    await loadOverview(token);
    setEditingGame(null);
    setSaveBanner(`Saved Game API configuration for ${editingGame.name}.`);
    setTimeout(() => setSaveBanner(''), 3500);
  };

  const handleSaveGatewayApi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingGateway) return;
    await apiFetch(
      `/api/admin/gateways/${editingGateway.slug}`,
      { method: 'PUT', body: JSON.stringify(editingGateway) },
      token
    );
    await loadOverview(token);
    setEditingGateway(null);
    setSaveBanner(`Saved Payment Gateway API config for ${editingGateway.name}.`);
    setTimeout(() => setSaveBanner(''), 3500);
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const saved = await apiFetch<any>(
      '/api/admin/settings',
      { method: 'PUT', body: JSON.stringify(rules) },
      token
    );
    setRules(saved);
    setSaveBanner('Bonus percentages & Withdrawal Multiplier saved live!');
    setTimeout(() => setSaveBanner(''), 3500);
  };

  const handleCheckAgentBalance = async (slug: string, name: string) => {
    if (!token) return;
    try {
      const res = await apiFetch<any>(`/api/admin/games/${slug}/agent-balance`, {}, token);
      const bal = String(res.agentBalance ?? '0');
      setAgentBalances((prev) => ({ ...prev, [slug]: bal }));
      setSaveBanner(`${name} Store/Agent Balance: ${bal}`);
    } catch (err: any) {
      setSaveBanner(`⚠️ ${name}: ${err.message}`);
    }
  };

  const handleCheckPlayerBalance = async (ticketId: string, gameName: string, loginId: string) => {
    if (!token || !gameName || !loginId) return;
    const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      const res = await apiFetch<any>(
        `/api/admin/games/${slug}/player-balance`,
        { method: 'POST', body: JSON.stringify({ loginId }) },
        token
      );
      const bal = String(res.userBalance ?? '0');
      setPlayerBalLookup((prev) => ({ ...prev, [ticketId]: bal }));
      setSaveBanner(`Live Balance for ${loginId} on ${gameName}: $${bal}`);
    } catch (err: any) {
      setSaveBanner(`⚠️ Balance Check (${gameName}): ${err.message}`);
    }
  };

  const handleForceOffline = async (gameName: string, loginId: string) => {
    if (!token || !gameName || !loginId) return;
    const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      await apiFetch(
        `/api/admin/games/${slug}/force-offline`,
        { method: 'POST', body: JSON.stringify({ loginId }) },
        token
      );
      setSaveBanner(`✅ Forced ${loginId} offline on ${gameName} — ready for withdraw!`);
    } catch (err: any) {
      setSaveBanner(`⚠️ Force Offline (${gameName}): ${err.message}`);
    }
  };

  const handleExportCsv = () => {
    const header = ['TicketID', 'Type', 'Player', 'Game', 'GameUser', 'Amount', 'Bonus', 'TotalCredit', 'Method', 'Status', 'CreatedAt'];
    const rows = tickets.map((t) => [
      t.ticketId,
      t.type,
      t.playerName,
      t.game || '',
      t.gameUser || '',
      t.amount ?? '',
      t.bonusAmount ?? '',
      t.totalCredit ?? '',
      t.method || '',
      t.status,
      t.createdAt || '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gamestrike-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBroadcastPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const res = await apiFetch<any>(
      '/api/admin/push/send',
      {
        method: 'POST',
        body: JSON.stringify({ title: pushTitle, body: pushBody, url: '/#/chat' }),
      },
      token
    );
    setPushStatus(
      `Sent lock-screen push to ${res.recipients} player(s) (WebPush: ${res.totalWeb}, FCM: ${res.totalFcm}).`
    );
    setTimeout(() => setPushStatus(''), 4500);
  };

  if (!token) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--bg-app)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 20,
            padding: 28,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <BrandLogo size="md" subtitle="ADMIN PANEL APP" />
            <button type="button" className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.76rem' }} onClick={onBackToPlayerApp}>
              Player App
            </button>
          </div>

          <h2 className="auth-heading">Admin Business Suite</h2>
          <p className="auth-sub">
            Manage live player chats, deposits, cashouts, Game APIs, Payment Gateways & Lock-Screen Push.
          </p>

          {authError && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: '0.84rem', marginBottom: 14 }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAdminLogin}>
            <div className="field-group">
              <label className="field-label">Admin Email</label>
              <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <input className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              <ShieldCheck size={17} />
              <span>{loading ? 'Signing In...' : 'Open Admin Panel App'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedPlayer = players.find((p) => p._id === selectedPlayerId);
  const pendingCount = tickets.filter((t) => t.status === 'Processing').length;

  const navItems = [
    { id: 'analytics' as const, label: 'Analytics & Profit', icon: BarChart3 },
    { id: 'inbox' as const, label: 'Player Inbox', count: players.length, icon: MessageSquare },
    { id: 'tickets' as const, label: 'Cashier & Issues', count: pendingCount, icon: Ticket },
    { id: 'games' as const, label: 'Games & APIs', icon: Gamepad2 },
    { id: 'gateways' as const, label: 'Payment APIs', icon: Landmark },
    { id: 'rules' as const, label: 'Bonus & Rules', icon: Sliders },
    { id: 'push' as const, label: 'Lock-Screen Push', icon: BellRing },
  ];

  // Live Financial Metrics
  const completedDeposits = tickets
    .filter((t) => t.type === 'deposit' && t.status === 'Completed')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const completedCashouts = tickets
    .filter((t) => t.type === 'withdraw' && t.status === 'Completed')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = completedDeposits - completedCashouts;
  const totalReferrals = players.reduce((sum, p) => sum + Number(p.referralCount || 0), 0);

  const activeNavLabel = navItems.find((n) => n.id === tab)?.label || 'Admin Panel';

  return (
    <div className="admin-shell">
      {/* LEFT ADMIN SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <BrandLogo size="sm" subtitle="ADMIN SUITE" />
        </div>

        <nav className="admin-sidebar-nav">
          <div className="admin-nav-label">MANAGEMENT</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && (
                  <span className={`admin-nav-badge ${item.id === 'tickets' && item.count > 0 ? 'urgent' : ''}`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <span className="status-pill verified" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', padding: '7px 10px' }}>
            <Database size={13} />
            <span>{dbMode}</span>
          </span>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, padding: '8px 10px', fontSize: '0.78rem' }}
              onClick={onBackToPlayerApp}
            >
              Player App
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Sign Out Admin"
              onClick={() => {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                setToken(null);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE (FIXED HEIGHT WITH INTERNAL SCROLL) */}
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.12rem', fontWeight: 700 }}>
              {activeNavLabel}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '7px 12px', fontSize: '0.78rem' }}
              title="Enable Admin Lock-Screen Alerts"
              onClick={() => enableLockScreenPush(token)}
            >
              <BellRing size={15} color="#ffd166" />
              <span>Enable Alerts</span>
            </button>
            <button type="button" className="icon-btn" onClick={onToggleTheme}>
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Nav Fallback */}
        <div className="admin-mobile-tabs">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`filter-pill ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label} {item.count !== undefined ? `(${item.count})` : ''}
            </button>
          ))}
        </div>

        {saveBanner && (
          <div className="admin-live-banner">
            <span>{saveBanner}</span>
            <button
              type="button"
              style={{ color: 'inherit', fontWeight: 700, fontSize: '0.78rem' }}
              onClick={() => setSaveBanner('')}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 0: ADMIN ANALYTICS & DAILY PROFIT DASHBOARD */}
        {tab === 'analytics' && (
          <div className="admin-scroll-body">
            <div className="games-container" style={{ maxWidth: 1200, paddingTop: 20 }}>
              <div className="section-head">
                <div>
                  <h2>Revenue, Profit &amp; Operations Overview</h2>
                  <p>Real-time summary of completed deposits, cashouts, net profit, players &amp; referrals.</p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '9px 15px', fontSize: '0.82rem' }}
                  onClick={handleExportCsv}
                >
                  <Download size={15} />
                  <span>Export CSV Report</span>
                </button>
              </div>

              <div className="admin-api-grid" style={{ marginBottom: 24 }}>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Deposits (Completed)
                  </div>
                  <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4ade80' }}>
                    ${completedDeposits.toFixed(2)}
                  </div>
                </div>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Cashouts (Completed)
                  </div>
                  <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffd166' }}>
                    ${completedCashouts.toFixed(2)}
                  </div>
                </div>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Net Profit
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 700,
                      color: netProfit >= 0 ? '#4ade80' : '#ff476c',
                    }}
                  >
                    ${netProfit.toFixed(2)}
                  </div>
                </div>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Registered Players
                  </div>
                  <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                    {players.length}
                  </div>
                </div>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Pending Cashier Queue
                  </div>
                  <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ff476c' }}>
                    {pendingCount}
                  </div>
                </div>
                <div className="admin-api-card">
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Referrals Converted
                  </div>
                  <div className="mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffd166' }}>
                    {totalReferrals}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: LIVE PLAYER INBOX (PROPERLY LOCKED HEIGHT & SCROLLABLE) */}
        {tab === 'inbox' && (
          <div className="admin-inbox-grid">
            <div className="admin-players-col">
              <div className="sidebar-section-label" style={{ paddingLeft: 8 }}>
                Active Players ({players.length})
              </div>
              {players.length === 0 ? (
                <p style={{ padding: 12, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  No players yet. Open Player App in another tab and sign in to test live real-time chat!
                </p>
              ) : (
                players.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    className={`thread-item ${selectedPlayerId === p._id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedPlayerId(p._id);
                      setUnreadMap((prev) => ({ ...prev, [String(p._id)]: 0 }));
                    }}
                  >
                    <div className="user-avatar-circle">{p.name?.slice(0, 2).toUpperCase()}</div>
                    <div className="thread-meta">
                      <div className="thread-meta-top">
                        <span className="thread-name">
                          {p.name}
                          {p.status === 'suspended' && (
                            <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, background: '#ef4444', color: '#fff' }}>
                              SUSPENDED
                            </span>
                          )}
                        </span>
                        {(unreadMap[String(p._id)] || 0) > 0 && (
                          <span className="admin-nav-badge urgent">
                            {unreadMap[String(p._id)]}
                          </span>
                        )}
                      </div>
                      <div className="thread-preview mono">{p.id} • {p.contact}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="chat-main">
            {selectedPlayer ? (
              <>
                <div className="chat-header">
                  <div>
                    <div className="chat-header-title">{selectedPlayer.name}</div>
                    <div className="mono" style={{ fontSize: '0.76rem', color: typingPlayerId === String(selectedPlayer._id) ? '#4ade80' : 'var(--text-muted)' }}>
                      {typingPlayerId === String(selectedPlayer._id)
                        ? 'Player is typing...'
                        : `${selectedPlayer.id} • ${selectedPlayer.contact}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: '6px 11px',
                        fontSize: '0.74rem',
                        borderColor: selectedPlayer.status === 'suspended'
                          ? 'rgba(239, 68, 68, 0.5)'
                          : 'rgba(255, 31, 75, 0.25)',
                        color: selectedPlayer.status === 'suspended' ? '#ef4444' : '#f87171',
                      }}
                      onClick={async () => {
                        const isSuspended = selectedPlayer.status === 'suspended';
                        const confirmMsg = isSuspended
                          ? `Reactivate account for ${selectedPlayer.name}?`
                          : `Suspend account and permanently block device for ${selectedPlayer.name}?`;
                        if (!window.confirm(confirmMsg)) return;

                        try {
                          const res = await apiFetch<{ ok: boolean; player: any }>(
                            `/api/admin/players/${selectedPlayer._id}/toggle-suspend`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                status: isSuspended ? 'active' : 'suspended',
                                reason: isSuspended ? '' : 'Violated terms / multi-account abuse',
                              }),
                            },
                            token
                          );
                          if (res.player) {
                            setPlayers((prev) =>
                              prev.map((p) => (p._id === res.player._id ? res.player : p))
                            );
                          }
                        } catch (err: any) {
                          alert(err.message || 'Could not update suspension.');
                        }
                      }}
                    >
                      {selectedPlayer.status === 'suspended' ? '🚫 Suspended (Reactivate)' : '⛔ Suspend Player'}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: '6px 11px',
                        fontSize: '0.74rem',
                        borderColor: humanModeMap[selectedPlayer._id]
                          ? 'rgba(34,197,94,0.5)'
                          : 'var(--border-subtle)',
                        color: humanModeMap[selectedPlayer._id] ? '#4ade80' : 'var(--text-secondary)',
                      }}
                      onClick={() => handleToggleHumanMode(selectedPlayer._id)}
                    >
                      {humanModeMap[selectedPlayer._id] ? '🟢 Live Human Mode' : '🤖 Auto-Bot Active'}
                    </button>
                  </div>
                </div>

                <div className="chat-messages">
                  {playerMessages.map((m) => {
                    const msgId = String(m._id || m.id);
                    const isAgentSide = m.sender === 'agent';
                    return (
                      <div key={msgId} className={`msg-row ${isAgentSide ? 'user' : 'agent'}`}>
                        <div className="msg-content-wrap">
                          {m.deletedForEveryone ? (
                            <div className="msg-bubble msg-deleted-bubble">
                              🚫 This message was deleted
                            </div>
                          ) : (
                            <>
                              {m.attachmentUrl && (
                                <div className="msg-attachment">
                                  <img src={m.attachmentUrl} alt="Receipt" />
                                </div>
                              )}
                              {editingMsgId === msgId ? (
                                <form
                                  className="msg-edit-box"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    handleAdminEditMessage(msgId, editingText);
                                  }}
                                >
                                  <input
                                    className="field-input"
                                    style={{ padding: '7px 10px', fontSize: '0.84rem' }}
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    autoFocus
                                  />
                                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <button type="submit" className="btn-primary" style={{ padding: '5px 11px', fontSize: '0.75rem' }}>
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                                      onClick={() => setEditingMsgId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="msg-bubble-wrap">
                                  <div className="msg-actions">
                                    {isAgentSide && (
                                      <button
                                        type="button"
                                        className="msg-act-btn"
                                        title="Edit message"
                                        onClick={() => {
                                          setEditingMsgId(msgId);
                                          setEditingText(m.text || '');
                                        }}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="msg-act-btn danger"
                                      title="Delete for everyone"
                                      onClick={() => handleAdminDeleteMessage(msgId)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                  <div className="msg-bubble">{m.text}</div>
                                </div>
                              )}
                            </>
                          )}
                          <div className="msg-meta mono">
                            <span>{isAgentSide ? 'You (Admin)' : selectedPlayer.name}</span>
                            {m.edited && !m.deletedForEveryone && <span>• edited</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-composer-wrap">
                  <form className="chat-composer" onSubmit={handleSendReply}>
                    <input
                      ref={adminFileRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') {
                            handleSendReply(
                              { preventDefault: () => {} } as React.FormEvent,
                              { url: reader.result, name: file.name }
                            );
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      title="Send screenshot / receipt image to player"
                      onClick={() => adminFileRef.current?.click()}
                    >
                      <ImagePlus size={18} />
                    </button>
                    <input
                      type="text"
                      placeholder={`Reply live to ${selectedPlayer.name} (real-time + lock-screen push)...`}
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);
                        adminSocketRef.current?.emit('chat:typing', {
                          targetUserId: selectedPlayer._id,
                          isTyping: e.target.value.trim().length > 0,
                        });
                      }}
                      onBlur={() =>
                        adminSocketRef.current?.emit('chat:typing', {
                          targetUserId: selectedPlayer._id,
                          isTyping: false,
                        })
                      }
                    />
                    <button type="submit" className="send-btn" disabled={!replyText.trim()}>
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select a player conversation to reply live.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CASHIER TICKETS */}
      {tab === 'tickets' && (
        <div className="admin-scroll-body">
          <div className="games-container" style={{ maxWidth: 1200, paddingTop: 20 }}>
          <div className="section-head">
            <div>
              <h2>Deposits, Cashouts & Game ID Queue</h2>
              <p>Approving a ticket updates the player chat live and triggers a Lock-Screen Push Notification.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {tickets.length === 0 ? (
              <div className="wallet-panel">No tickets submitted yet.</div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.ticketId}
                  className="wallet-panel"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong className="mono">{t.ticketId}</strong>
                      <span className={`status-pill ${t.status === 'Processing' ? 'processing' : 'verified'}`}>
                        {t.status}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>• {t.playerName}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{t.title}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t.subtitle}</div>

                    {/* Show Game Name, Game Username & Bonus Breakdown clearly for Admin */}
                    {(t.game || t.gameUser || t.totalCredit) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: '0.76rem' }}>
                        {t.game && (
                          <span className="gateway-chip">
                            Game: <strong>{t.game}</strong>
                          </span>
                        )}
                        {t.gameUser && (
                          <span className="gateway-chip mono">
                            Username: <strong style={{ color: '#ffd166' }}>{t.gameUser}</strong>
                          </span>
                        )}
                        {t.type === 'deposit' && t.totalCredit > 0 && (
                          <span className="gateway-chip mono" style={{ borderColor: 'rgba(34,197,94,0.4)' }}>
                            Paid ${t.amount} + {t.bonusType} (${t.bonusAmount || 0}) ={' '}
                            <strong style={{ color: '#4ade80' }}>Load ${t.totalCredit}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Clickable Verification Screenshots (Manual Deposit Receipt OR 2 Withdraw Screenshots) */}
                    {(t.receiptScreenshotUrl || t.balanceScreenshotUrl || t.qrScreenshotUrl) && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        {t.receiptScreenshotUrl && (
                          <button
                            type="button"
                            onClick={() => setLightboxImg(t.receiptScreenshotUrl)}
                            style={{ textAlign: 'left', padding: 6, borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
                          >
                            <img
                              src={t.receiptScreenshotUrl}
                              alt="Payment Receipt"
                              style={{ width: 96, height: 68, objectFit: 'cover', borderRadius: 7, display: 'block' }}
                            />
                            <span style={{ fontSize: '0.68rem', color: '#ffd166', fontWeight: 600 }}>
                              Payment Receipt (Click)
                            </span>
                          </button>
                        )}
                        {t.balanceScreenshotUrl && (
                          <button
                            type="button"
                            onClick={() => setLightboxImg(t.balanceScreenshotUrl)}
                            style={{ textAlign: 'left', padding: 6, borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
                          >
                            <img
                              src={t.balanceScreenshotUrl}
                              alt="Game Balance"
                              style={{ width: 96, height: 68, objectFit: 'cover', borderRadius: 7, display: 'block' }}
                            />
                            <span style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 600 }}>
                              1. Game Balance SS
                            </span>
                          </button>
                        )}
                        {t.qrScreenshotUrl && (
                          <button
                            type="button"
                            onClick={() => setLightboxImg(t.qrScreenshotUrl)}
                            style={{ textAlign: 'left', padding: 6, borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
                          >
                            <img
                              src={t.qrScreenshotUrl}
                              alt="Payout QR / Tag"
                              style={{ width: 96, height: 68, objectFit: 'cover', borderRadius: 7, display: 'block' }}
                            />
                            <span style={{ fontSize: '0.68rem', color: '#ffd166', fontWeight: 600 }}>
                              2. Payout Tag / QR SS
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                    {t.type === 'game-id' && t.status === 'Processing' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <input
                          className="field-input mono"
                          style={{ width: 170, padding: '7px 10px', fontSize: '0.8rem' }}
                          placeholder="Game Username"
                          value={credDrafts[t.ticketId]?.user || ''}
                          onChange={(e) =>
                            setCredDrafts((prev) => ({
                              ...prev,
                              [t.ticketId]: {
                                user: e.target.value,
                                pass: prev[t.ticketId]?.pass || '',
                              },
                            }))
                          }
                        />
                        <input
                          className="field-input mono"
                          style={{ width: 150, padding: '7px 10px', fontSize: '0.8rem' }}
                          placeholder="Game Password"
                          value={credDrafts[t.ticketId]?.pass || ''}
                          onChange={(e) =>
                            setCredDrafts((prev) => ({
                              ...prev,
                              [t.ticketId]: {
                                user: prev[t.ticketId]?.user || '',
                                pass: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {t.game && t.gameUser && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '8px 11px', fontSize: '0.78rem' }}
                          onClick={() => handleCheckPlayerBalance(t.ticketId, t.game, t.gameUser)}
                        >
                          <RefreshCw size={13} />
                          <span>
                            {playerBalLookup[t.ticketId]
                              ? `Bal: $${playerBalLookup[t.ticketId]}`
                              : 'Check Balance'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '8px 11px', fontSize: '0.78rem', color: '#ffd166' }}
                          onClick={() => handleForceOffline(t.game, t.gameUser)}
                        >
                          <Power size={13} />
                          <span>Force Offline</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                      onClick={() => {
                        setSelectedPlayerId(t.userId);
                        setTab('inbox');
                      }}
                    >
                      <MessageSquare size={14} />
                      Open Player Chat
                    </button>
                    {t.status === 'Processing' && (
                      <>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                          onClick={() =>
                            handleTicketAction(t.ticketId, 'Completed', {
                              gameUser: credDrafts[t.ticketId]?.user,
                              gamePassword: credDrafts[t.ticketId]?.pass,
                            })
                          }
                        >
                          <CheckCircle2 size={15} />
                          {t.type === 'game-id' ? 'Send Credentials & Approve' : 'Resolve & Notify'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '8px 14px', fontSize: '0.82rem', color: '#ef4444' }}
                          onClick={() => handleTicketAction(t.ticketId, 'Rejected')}
                        >
                          <XCircle size={15} />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      )}

      {/* TAB 3: GAMES & PLUGGABLE GAME APIs */}
      {tab === 'games' && (
        <div className="admin-scroll-body">
          <div className="games-container" style={{ maxWidth: 1200, paddingTop: 20 }}>
          <div className="section-head">
            <div>
              <h2>Games & Pluggable Game APIs</h2>
              <p>All static games have been cleared. Add only the real games whose APIs you connect.</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '9px 15px', fontSize: '0.84rem' }}
              onClick={() =>
                setEditingGame({
                  slug: '',
                  name: '',
                  tag: 'Live API',
                  category: 'Hot',
                  platforms: ['Web', 'iOS', 'Android'],
                  minDeposit: 10,
                  initials: 'GS',
                  accentFrom: '#2563EB',
                  accentTo: '#06B6D4',
                  enabled: true,
                  apiConfig: {
                    provider: 'custom',
                    baseUrl: '',
                    apiKey: '',
                    agentId: '',
                    isConnected: true,
                  },
                })
              }
            >
              <Gamepad2 size={15} />
              <span>+ Add Game with API</span>
            </button>
          </div>

          {games.length === 0 ? (
            <div className="wallet-panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
              No games added yet. Click <strong>+ Add Game with API</strong> above (or send your game API documentation) to connect your first game.
            </div>
          ) : (
            <div className="admin-api-grid">
              {games.map((g) => (
                <div key={g.slug} className="admin-api-card">
                  <div className="admin-api-card-top">
                    <div className="admin-api-icon">
                      <Gamepad2 size={18} color="#ffd166" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: '0.98rem', fontFamily: 'var(--font-display)' }}>
                          {g.name}
                        </strong>
                        <span className={`status-pill ${g.apiConfig?.isConnected ? 'verified' : 'processing'}`}>
                          {g.apiConfig?.isConnected ? 'API Connected' : 'Pending API'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {g.category || 'Gaming Platform'} • Min ${g.minDeposit || 5}
                      </div>
                    </div>
                  </div>

                  <div className="admin-api-meta">
                    <div className="admin-api-meta-row">
                      <span>Endpoint</span>
                      <code className="mono">{g.apiConfig?.baseUrl || 'Manual Game'}</code>
                    </div>
                    <div className="admin-api-meta-row">
                      <span>Agent ID</span>
                      <code className="mono">{g.apiConfig?.agentId || 'Set in .env / modal'}</code>
                    </div>
                    {agentBalances[g.slug] !== undefined && (
                      <div className="admin-api-meta-row">
                        <span>Live Store Balance</span>
                        <strong className="mono" style={{ color: '#4ade80' }}>
                          {agentBalances[g.slug]}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, padding: '10px 10px', fontSize: '0.8rem' }}
                      onClick={() => setEditingGame(JSON.parse(JSON.stringify(g)))}
                    >
                      <Plug size={14} />
                      <span>Configure</span>
                    </button>
                    {g.apiConfig?.isConnected && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '10px 10px', fontSize: '0.8rem', color: '#4ade80' }}
                        onClick={() => handleCheckAgentBalance(g.slug, g.name)}
                      >
                        <RefreshCw size={14} />
                        <span>Store Bal</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingGame && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.6)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 20 }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const slug =
                    editingGame.slug ||
                    editingGame.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                  editingGame.slug = slug;
                  editingGame.initials = (editingGame.name || 'GS').slice(0, 2).toUpperCase();
                  handleSaveGameApi(e);
                }}
                className="wallet-panel"
                style={{ width: '100%', maxWidth: 460 }}
              >
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>
                  {editingGame.slug ? `Plug Game API — ${editingGame.name}` : 'Add New API-Connected Game'}
                </h3>
                <div className="field-group">
                  <label className="field-label">Game Name</label>
                  <input
                    className="field-input"
                    placeholder="e.g. Fire Kirin"
                    value={editingGame.name || ''}
                    onChange={(e) => setEditingGame({ ...editingGame, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">API Base URL</label>
                  <input
                    className="field-input mono"
                    placeholder="https://api.gameprovider.com/v1"
                    value={editingGame.apiConfig?.baseUrl || ''}
                    onChange={(e) =>
                      setEditingGame({
                        ...editingGame,
                        apiConfig: { ...editingGame.apiConfig, baseUrl: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">API Key</label>
                  <input
                    className="field-input mono"
                    placeholder="sk_live_..."
                    value={editingGame.apiConfig?.apiKey || ''}
                    onChange={(e) =>
                      setEditingGame({
                        ...editingGame,
                        apiConfig: { ...editingGame.apiConfig, apiKey: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Agent ID / Secret</label>
                  <input
                    className="field-input mono"
                    placeholder="agent_12345"
                    value={editingGame.apiConfig?.agentId || ''}
                    onChange={(e) =>
                      setEditingGame({
                        ...editingGame,
                        apiConfig: { ...editingGame.apiConfig, agentId: e.target.value },
                      })
                    }
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.86rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editingGame.apiConfig?.isConnected)}
                    onChange={(e) =>
                      setEditingGame({
                        ...editingGame,
                        apiConfig: { ...editingGame.apiConfig, isConnected: e.target.checked },
                      })
                    }
                  />
                  Enable Live API Calls
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Game API</button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingGame(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}
        </div>
        </div>
      )}

      {/* TAB 4: PAYMENT GATEWAY APIs */}
      {tab === 'gateways' && (
        <div className="admin-scroll-body">
          <div className="games-container" style={{ maxWidth: 1200, paddingTop: 20 }}>
          <div className="section-head">
            <div>
              <h2>Payment Gateways (Auto CashTap + Manual)</h2>
              <p>Add manual gateways like Chime/Zelle or control which methods allow Withdrawals.</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '9px 15px', fontSize: '0.84rem' }}
              onClick={() =>
                setEditingGateway({
                  slug: '',
                  name: '',
                  handle: '',
                  badge: 'Manual Verify',
                  eta: '2–5 mins',
                  minAmount: 10,
                  maxAmount: 2500,
                  fee: '0% Fee',
                  supportsDeposit: true,
                  supportsWithdraw: true,
                  enabled: true,
                  apiConfig: {
                    provider: 'manual',
                    baseUrl: '',
                    apiKey: '',
                    webhookSecret: '',
                    isConnected: false,
                  },
                })
              }
            >
              <Landmark size={15} />
              <span>+ Add Manual / API Gateway</span>
            </button>
          </div>

          <div className="admin-api-grid">
            {gateways.map((gw) => (
              <div key={gw.slug} className="admin-api-card">
                <div className="admin-api-card-top">
                  <div className="admin-api-icon">
                    <Landmark size={18} color="#22c55e" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '0.96rem', fontFamily: 'var(--font-display)' }}>
                        {gw.name}
                      </strong>
                      <span className={`status-pill ${gw.apiConfig?.isConnected ? 'verified' : 'processing'}`}>
                        {gw.apiConfig?.isConnected ? 'Live API' : 'Manual Tag'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {gw.eta || 'Instant Auto'} • {gw.fee || 'Auto Settlement'}
                    </div>
                  </div>
                </div>

                <div className="admin-api-meta">
                  <div className="admin-api-meta-row">
                    <span>Handle / Rail</span>
                    <code className="mono">{gw.handle}</code>
                  </div>
                  <div className="admin-api-meta-row">
                    <span>Limits</span>
                    <code className="mono">
                      ${gw.minAmount ?? 1} – ${(gw.maxAmount ?? 10000).toLocaleString()}
                    </code>
                  </div>
                  <div className="admin-api-meta-row">
                    <span>Supports</span>
                    <span style={{ color: '#e2e6f0', fontWeight: 600 }}>
                      {gw.supportsDeposit ? 'Deposit' : ''}
                      {gw.supportsDeposit && gw.supportsWithdraw ? ' • ' : ''}
                      {gw.supportsWithdraw ? 'Withdraw' : ''}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '0.82rem', marginTop: 'auto' }}
                  onClick={() => setEditingGateway(JSON.parse(JSON.stringify(gw)))}
                >
                  <Plug size={14} />
                  <span>Configure Gateway API</span>
                </button>
              </div>
            ))}
          </div>

          {editingGateway && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.72)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 20 }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editingGateway.slug) {
                    editingGateway.slug = editingGateway.name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-');
                  }
                  handleSaveGatewayApi(e);
                }}
                className="wallet-panel"
                style={{ width: '100%', maxWidth: 460 }}
              >
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>
                  {editingGateway.slug ? `Configure — ${editingGateway.name}` : 'Add Payment Gateway'}
                </h3>
                <div className="field-group">
                  <label className="field-label">Gateway Name</label>
                  <input
                    className="field-input"
                    placeholder="e.g. Chime (Manual Verify)"
                    value={editingGateway.name || ''}
                    onChange={(e) => setEditingGateway({ ...editingGateway, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Official Payment Tag / Handle</label>
                  <input
                    className="field-input mono"
                    placeholder="e.g. $GameStrike-Chime"
                    value={editingGateway.handle || ''}
                    onChange={(e) => setEditingGateway({ ...editingGateway, handle: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.84rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingGateway.supportsDeposit)}
                      onChange={(e) =>
                        setEditingGateway({ ...editingGateway, supportsDeposit: e.target.checked })
                      }
                    />
                    Allow Deposits
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingGateway.supportsWithdraw)}
                      onChange={(e) =>
                        setEditingGateway({ ...editingGateway, supportsWithdraw: e.target.checked })
                      }
                    />
                    Allow Withdrawals
                  </label>
                </div>
                <div className="field-group">
                  <label className="field-label">API Base URL (Leave blank for Manual Screenshot Verify)</label>
                  <input
                    className="field-input mono"
                    placeholder="https://api.gateway.com/v1"
                    value={editingGateway.apiConfig?.baseUrl || ''}
                    onChange={(e) =>
                      setEditingGateway({
                        ...editingGateway,
                        apiConfig: { ...editingGateway.apiConfig, baseUrl: e.target.value },
                      })
                    }
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.84rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editingGateway.apiConfig?.isConnected)}
                    onChange={(e) =>
                      setEditingGateway({
                        ...editingGateway,
                        apiConfig: {
                          ...editingGateway.apiConfig,
                          provider: e.target.checked ? 'custom-api' : 'manual',
                          isConnected: e.target.checked,
                        },
                      })
                    }
                  />
                  Auto API Mode (Uncheck for Manual Screenshot Verification)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Gateway</button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingGateway(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}
        </div>
        </div>
      )}

      {/* TAB 5: BONUS & WITHDRAWAL RULES SETTINGS */}
      {tab === 'rules' && (
        <div className="admin-scroll-body">
          <div className="games-container" style={{ maxWidth: 680, paddingTop: 20 }}>
            <div className="wallet-panel">
              <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 6 }}>
                Bonus Percentages &amp; Withdrawal Multiplier Rules
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 20 }}>
                Control the automatic Welcome Bonus (1st deposit only), Regular Reload Bonus (2nd+ deposits), and Minimum Withdrawal Multiplier.
              </p>

              <form onSubmit={handleSaveRules}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="field-group">
                    <label className="field-label">Welcome Bonus % (1st Deposit Only)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={0}
                      max={500}
                      value={rules.welcomeBonusPercent}
                      onChange={(e) =>
                        setRules({ ...rules, welcomeBonusPercent: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Regular Reload Bonus % (2nd+ Deposits)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={0}
                      max={500}
                      value={rules.regularBonusPercent}
                      onChange={(e) =>
                        setRules({ ...rules, regularBonusPercent: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Referral Reward ($ Freeplay on 1st $20+ Deposit)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={0}
                      value={rules.referralBonus || 10}
                      onChange={(e) =>
                        setRules({ ...rules, referralBonus: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Freeplay Min Cashout ($)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={5}
                      value={rules.freeplayMinWithdraw || 30}
                      onChange={(e) =>
                        setRules({ ...rules, freeplayMinWithdraw: Number(e.target.value) || 30 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Freeplay Max Cashout Cap ($)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={10}
                      value={rules.freeplayMaxWithdraw || 100}
                      onChange={(e) =>
                        setRules({ ...rules, freeplayMaxWithdraw: Number(e.target.value) || 100 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Min Withdraw Multiplier (x of Last Load + Bonus)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      step="0.5"
                      min={1}
                      max={20}
                      value={rules.withdrawMultiplier}
                      onChange={(e) =>
                        setRules({ ...rules, withdrawMultiplier: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Fallback Min Withdraw ($)</label>
                    <input
                      className="field-input mono"
                      type="number"
                      min={1}
                      value={rules.minWithdrawFallback}
                      onChange={(e) =>
                        setRules({ ...rules, minWithdrawFallback: Number(e.target.value) || 10 })
                      }
                    />
                  </div>
                </div>

                <div className="ticket-mini" style={{ marginBottom: 16, padding: 12, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Example: If a new player deposits <strong>$20</strong>, they get{' '}
                  <strong style={{ color: '#ffd166' }}>+{rules.welcomeBonusPercent}%</strong> ={' '}
                  <strong>${(20 + (20 * rules.welcomeBonusPercent) / 100).toFixed(2)} Total Load</strong>. Minimum withdrawal required will be{' '}
                  <strong style={{ color: '#4ade80' }}>
                    ${((20 + (20 * rules.welcomeBonusPercent) / 100) * rules.withdrawMultiplier).toFixed(2)}
                  </strong>{' '}
                  ({rules.withdrawMultiplier}x). On their 2nd deposit, they get{' '}
                  <strong>+{rules.regularBonusPercent}%</strong> Regular Bonus.
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  Save Bonus &amp; Withdrawal Rules
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LOCK-SCREEN PUSH NOTIFICATIONS BROADCAST */}
      {tab === 'push' && (
        <div className="admin-scroll-body">
          <div className="games-container" style={{ maxWidth: 700, paddingTop: 20 }}>
          <div className="wallet-panel">
            <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 6 }}>
              Send Lock-Screen Push Notification
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 18 }}>
              Deliver instant lock-screen alerts to all installed PWA & Capacitor Android/iOS players.
            </p>

            {pushStatus && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.14)', color: 'var(--gs-emerald)', fontSize: '0.84rem', fontWeight: 600, marginBottom: 14 }}>
                {pushStatus}
              </div>
            )}

            <form onSubmit={handleBroadcastPush}>
              <div className="field-group">
                <label className="field-label">Notification Title</label>
                <input className="field-input" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} required />
              </div>
              <div className="field-group">
                <label className="field-label">Message Body</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                <BellRing size={16} />
                <span>Send Lock-Screen Push to All Players</span>
              </button>
            </form>
          </div>
        </div>
        </div>
      )}
      </div>
      {lightboxImg && (
        <div
          className="cashier-backdrop"
          style={{ zIndex: 120 }}
          onClick={() => setLightboxImg(null)}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '88vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImg}
              alt="Verification Screenshot"
              style={{ maxWidth: '90vw', maxHeight: '84vh', borderRadius: 14, border: '2px solid rgba(255,209,102,0.5)' }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => setLightboxImg(null)}
            >
              Close Screenshot
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

