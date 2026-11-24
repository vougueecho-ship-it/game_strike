import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Gamepad2,
  Gift,
  History,
  ImagePlus,
  Info,
  KeyRound,
  Landmark,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Pencil,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { InlineChatCard } from './InlineChatForms';
import { AppDownloadModal } from './AppDownloadModal';
import { SUPPORT_THREADS, paymentMethodName } from '../data/catalog';
import {
  ChatMessage,
  GameItem,
  PaymentGateway,
  PlatformSettings,
  ThreadId,
  TicketItem,
  UserProfile,
} from '../types';

interface ChatSuiteProps {
  user: UserProfile;
  settings?: PlatformSettings;
  games: GameItem[];
  gateways: PaymentGateway[];
  messages: ChatMessage[];
  tickets: TicketItem[];
  activeThread: ThreadId;
  isTyping: boolean;
  humanTakeover?: boolean;
  onPlayerTyping?: (typing: boolean) => void;
  darkMode: boolean;
  onSelectThread: (id: ThreadId) => void;
  onSendMessage: (text: string, attachment?: { url: string; name: string }) => void;
  onEditMessage?: (messageId: string, newText: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  onTriggerAction: (action: string, preselectedGame?: string) => void;
  onSubmitDeposit: (data: {
    game: string;
    amount: number;
    method: string;
    handle: string;
    receiptScreenshotUrl?: string;
  }) => void;
  onSubmitWithdraw: (data: {
    game: string;
    gameUser: string;
    amount: number;
    method: string;
    payoutTag: string;
    balanceScreenshotUrl?: string;
    qrScreenshotUrl?: string;
  }) => void;
  onSubmitGameId: (game: string) => void;
  onSubmitIssue?: (data: { category: string; game: string; referenceId: string; details: string }) => void;
  onClaimPromo: (title: string, code: string) => void;
  onSyncCashTap?: (ticketId: string) => void;
  onOpenGamesPage: () => void;
  onEnablePush?: () => void;
  pushEnabled?: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

export const ChatSuite: React.FC<ChatSuiteProps> = ({
  user,
  settings,
  games,
  gateways,
  messages,
  tickets,
  activeThread,
  isTyping,
  humanTakeover,
  onPlayerTyping,
  darkMode,
  onSelectThread,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReactMessage,
  onTriggerAction,
  onSubmitDeposit,
  onSubmitWithdraw,
  onSubmitGameId,
  onSubmitIssue,
  onClaimPromo,
  onSyncCashTap,
  onOpenGamesPage,
  onEnablePush,
  pushEnabled,
  onToggleTheme,
  onSignOut,
}) => {
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboard = () => {
      const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const open = overlap > 60;
      root.style.setProperty('--keyboard-overlap', open ? `${Math.round(overlap)}px` : '0px');
      root.classList.toggle('keyboard-open', open);
    };
    viewport.addEventListener('resize', syncKeyboard);
    viewport.addEventListener('scroll', syncKeyboard);
    syncKeyboard();
    return () => {
      viewport.removeEventListener('resize', syncKeyboard);
      viewport.removeEventListener('scroll', syncKeyboard);
      root.style.removeProperty('--keyboard-overlap');
      root.classList.remove('keyboard-open');
    };
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetails, setShowDetails] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposit' | 'withdraw' | 'bonus'>('all');
  const [copiedCred, setCopiedCred] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const referralLink = `${window.location.origin}/?ref=${user.id}`;
  const filteredHistory = tickets.filter((t) =>
    historyFilter === 'all' ? true : t.type === historyFilter
  );

  const gameCredentials = tickets.filter(
    (t) => t.type === 'game-id' && Boolean(t.gameUser)
  );

  const handleCopyCred = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedCred(key);
    setTimeout(() => setCopiedCred(null), 1600);
  };

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentThreadMeta =
    SUPPORT_THREADS.find((t) => t.id === activeThread) || SUPPORT_THREADS[0];

  const threadMessages = messages.filter((m) => m.threadId === activeThread);

  const filteredThreads = SUPPORT_THREADS.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length, isTyping, activeThread]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSendMessage(`Uploaded receipt: ${file.name}`, {
          url: reader.result,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`suite-shell ${showDetails ? '' : 'details-closed'}`}>
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11, 17, 32, 0.5)',
            zIndex: 55,
          }}
        />
      )}

      {/* LEFT BUSINESS SUITE INBOX SIDEBAR */}
      <aside className={`suite-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <BrandLogo size="sm" subtitle="SUPPORT SUITE" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="suite-badge">24/7</span>
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="sidebar-search-wrap">
          <div className="sidebar-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search support desks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-section-label">Live Gaming Desks</div>

        <div className="thread-list">
          {filteredThreads.map((thread) => {
            const lastMsg = [...messages]
              .reverse()
              .find((m) => m.threadId === thread.id);

            return (
              <button
                key={thread.id}
                type="button"
                className={`thread-item ${activeThread === thread.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectThread(thread.id);
                  setMobileMenuOpen(false);
                }}
              >
                <div className="thread-avatar">
                  {thread.id === 'concierge' ? (
                    <img src="/gamestrike-logo.jpg" alt="Concierge" />
                  ) : thread.id === 'cashier' ? (
                    <Landmark size={19} />
                  ) : (
                    <Gamepad2 size={19} />
                  )}
                  <span className="status-dot" />
                </div>

                <div className="thread-meta">
                  <div className="thread-meta-top">
                    <span className="thread-name">{thread.name}</span>
                    {thread.badge && <span className="thread-pill">{thread.badge}</span>}
                  </div>
                  <div className="thread-preview">
                    {lastMsg ? lastMsg.text.replace(/\n/g, ' ') : thread.preview}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Compact Trust Info Box */}
          <div
            style={{
              margin: '14px 4px 0',
              padding: '12px',
              borderRadius: 12,
              background: 'var(--bg-surface-soft)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.78rem',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              <ShieldCheck size={15} color="#10b981" />
              <span>Direct Gaming Concierge</span>
            </div>
            Ask for Game IDs, instant deposits, fast cashouts, or bonuses right inside chat. Want to browse all games? Click <strong>Games & Wallet</strong> at the top.
          </div>

          {/* Mobile App Download Button (Android APK + iOS) */}
          <button
            type="button"
            onClick={() => {
              setAppModalOpen(true);
              setMobileMenuOpen(false);
            }}
            style={{
              margin: '10px 4px 0',
              width: 'calc(100% - 8px)',
              padding: '11px 12px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(255,31,75,0.16), rgba(255,209,102,0.12))',
              border: '1px solid rgba(255,31,75,0.38)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Smartphone size={16} color="#ff1f4b" />
              <span>Install Mobile App (APK / iOS)</span>
            </span>
            <ArrowUpRight size={15} color="#ffd166" />
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar-circle">{initials || 'GS'}</div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name}
              </div>
              <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {user.id}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleTheme}
              title={darkMode ? 'Switch to Light Suite' : 'Switch to Dark Suite'}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onSignOut}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER MAIN MESSENGER CHAT WINDOW */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-left">
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open support menu"
            >
              <Menu size={20} />
            </button>

            <div className="thread-avatar" style={{ width: 38, height: 38, borderRadius: 11 }}>
              <img src="/gamestrike-logo.jpg" alt="GameStrike Support" />
              <span className="status-dot" />
            </div>

            <div style={{ minWidth: 0 }}>
              <div className="chat-header-title">
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentThreadMeta.name}
                </span>
                <BadgeCheck size={16} color="#2563eb" style={{ flexShrink: 0 }} />
              </div>
              <div className="chat-header-sub">
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                <span>
                  {isTyping
                    ? 'Live Agent is typing...'
                    : humanTakeover
                    ? 'Live Human Agent Connected • Real-Time Chat'
                    : 'Online • Instant Automated + Live Desk'}
                </span>
              </div>
            </div>
          </div>

          <div className="chat-header-actions">
            {/* QUICK ACCESS TO TRANSACTION HISTORY */}
            <button
              type="button"
              className="btn-secondary chat-hdr-pill"
              onClick={() => setHistoryModalOpen(true)}
              title="View your Deposits, Withdrawals & Bonuses history"
            >
              <History size={15} />
              <span className="chat-hdr-label">History</span>
            </button>

            {/* QUICK ACCESS TO SAVED GAME USERNAMES & PASSWORDS */}
            <button
              type="button"
              className="btn-secondary chat-hdr-pill"
              onClick={() => setCredsModalOpen(true)}
              title="View & copy your Game Usernames and Passwords"
            >
              <KeyRound size={15} color="#f59e0b" />
              <span className="chat-hdr-label">My IDs</span>
              <span className="chat-hdr-count">{gameCredentials.length}</span>
            </button>

            {/* SMALL DEDICATED TOP LINK TO GAMES LANDING PAGE */}
            <button
              type="button"
              className="games-top-link"
              onClick={onOpenGamesPage}
              title="Open dedicated Games, Deposits & Withdrawals page"
            >
              <Gamepad2 size={15} />
              <span>Games &amp; Wallet</span>
              <ArrowUpRight size={14} />
            </button>

            {onEnablePush && (
              <button
                type="button"
                className="icon-btn"
                onClick={onEnablePush}
                title={
                  pushEnabled
                    ? 'Lock-Screen Push Notifications Enabled'
                    : 'Enable Lock-Screen Push Notifications'
                }
              >
                {pushEnabled ? (
                  <BellRing size={18} color="#10b981" />
                ) : (
                  <Bell size={18} />
                )}
              </button>
            )}

            <button
              type="button"
              className="icon-btn desktop-only-btn"
              onClick={() => setShowDetails((prev) => !prev)}
              title="Toggle Business Suite Details"
            >
              <Info size={18} />
            </button>
          </div>
        </header>

        {/* Chat Stream */}
        <section className="chat-messages">
          <div className="chat-day-divider">
            Today • Encrypted GameStrike.io Support Session
          </div>

          {threadMessages.map((msg) => (
            <div key={msg.id} className={`msg-row ${msg.sender}`}>
              {msg.sender === 'agent' && (
                <div className="msg-agent-avatar">
                  <img src="/gamestrike-logo.jpg" alt="Agent" />
                </div>
              )}

              <div className="msg-content-wrap">
                {msg.deletedForEveryone ? (
                  <div className="msg-bubble msg-deleted-bubble">
                    🚫 This message was deleted
                  </div>
                ) : (
                  <>
                    {msg.attachmentUrl && (
                      <div className="msg-attachment">
                        <img src={msg.attachmentUrl} alt={msg.attachmentName || 'Receipt'} />
                        <div className="msg-attachment-caption">
                          <ImagePlus size={13} />
                          <span>{msg.attachmentName || 'Payment Receipt'}</span>
                        </div>
                      </div>
                    )}

                    {editingMsgId === msg.id ? (
                      <form
                        className="msg-edit-box"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editingText.trim()) {
                            onEditMessage?.(msg.id, editingText);
                          }
                          setEditingMsgId(null);
                        }}
                      >
                        <input
                          className="field-input"
                          style={{ padding: '7px 10px', fontSize: '0.86rem' }}
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
                      msg.text && (
                        <div className="msg-bubble-wrap">
                          {msg.sender === 'user' && (
                            <div className="msg-actions">
                              <button
                                type="button"
                                className="msg-act-btn"
                                title="Edit message"
                                onClick={() => {
                                  setEditingMsgId(msg.id);
                                  setEditingText(msg.text);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                className="msg-act-btn danger"
                                title="Delete for everyone"
                                onClick={() => onDeleteMessage?.(msg.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                          <div className="msg-bubble">{msg.text}</div>
                        </div>
                      )
                    )}

                    {/* Emoji Reactions Pills & Quick Reaction Trigger (Winning Heaven Style) */}
                    {!msg.deletedForEveryone && (
                      <div className="msg-reactions-wrap" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {msg.reactions &&
                          Object.entries(msg.reactions).map(([emoji, voters]) => {
                            const count = voters.length;
                            if (count === 0) return null;
                            const hasMyVote = voters.includes(user.contact.toLowerCase().trim());
                            return (
                              <button
                                key={emoji}
                                type="button"
                                className={`msg-reaction-pill ${hasMyVote ? 'active' : ''}`}
                                onClick={() => onReactMessage?.(msg.id, emoji)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '2px 6px',
                                  borderRadius: 12,
                                  fontSize: '0.72rem',
                                  border: hasMyVote ? '1px solid #ffd166' : '1px solid var(--border-subtle)',
                                  background: hasMyVote ? 'rgba(255, 209, 102, 0.15)' : 'var(--bg-surface-soft)',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                }}
                              >
                                <span>{emoji}</span>
                                <span className="mono" style={{ fontSize: '0.68rem', fontWeight: 600 }}>{count}</span>
                              </button>
                            );
                          })}

                        {/* Quick emoji popover buttons */}
                        <div className="msg-quick-emojis" style={{ display: 'inline-flex', gap: 2, opacity: 0.75 }}>
                          {['👍', '🔥', '⚡', '❤️', '🎉'].map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => onReactMessage?.(msg.id, em)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                padding: '1px 3px',
                                filter: 'grayscale(30%)',
                              }}
                              title={`React with ${em}`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.card && (
                      <InlineChatCard
                        message={msg}
                        user={user}
                        settings={settings}
                        games={games}
                        gateways={gateways}
                        tickets={tickets}
                        onSubmitDeposit={onSubmitDeposit}
                        onSubmitWithdraw={onSubmitWithdraw}
                        onSubmitGameId={onSubmitGameId}
                        onSubmitIssue={onSubmitIssue}
                        onClaimPromo={onClaimPromo}
                        onSyncCashTap={onSyncCashTap}
                      />
                    )}

                    {msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="quick-replies">
                        {msg.quickReplies.map((qr) => (
                          <button
                            key={qr.action + qr.label}
                            type="button"
                            className="quick-chip"
                            onClick={() => onTriggerAction(qr.action)}
                          >
                            {qr.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="msg-meta">
                  <span className="mono">{msg.timestamp}</span>
                  {msg.edited && !msg.deletedForEveryone && (
                    <span style={{ fontStyle: 'italic' }}>• edited</span>
                  )}
                  {msg.sender === 'user' && !msg.deletedForEveryone && (
                    <CheckCheck size={13} color="#ffd166" />
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="msg-row agent">
              <div className="msg-agent-avatar">
                <img src="/gamestrike-logo.jpg" alt="Agent typing" />
              </div>
              <div className="typing-dots" aria-label="Agent is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        {/* Bottom Composer */}
        <footer className="chat-composer-wrap">
          <div className="composer-shortcut-bar">
            <button
              type="button"
              className="composer-shortcut-btn"
              onClick={() => onTriggerAction('deposit')}
            >
              <ArrowDownCircle size={13} color="#2563eb" />
              Deposit
            </button>
            <button
              type="button"
              className="composer-shortcut-btn"
              onClick={() => onTriggerAction('withdraw')}
            >
              <ArrowUpCircle size={13} color="#10b981" />
              Withdraw
            </button>
            <button
              type="button"
              className="composer-shortcut-btn"
              onClick={() => onTriggerAction('game-id')}
            >
              <Gamepad2 size={13} color="#06b6d4" />
              New Game ID
            </button>
            <button
              type="button"
              className="composer-shortcut-btn"
              onClick={() => onTriggerAction('payments')}
            >
              <Landmark size={13} />
              Payment Tags
            </button>
            <button
              type="button"
              className="composer-shortcut-btn"
              onClick={() => onTriggerAction('bonuses')}
            >
              <Gift size={13} color="#10b981" />
              Bonuses
            </button>
            <button
              type="button"
              className="composer-shortcut-btn"
              style={{ borderColor: 'rgba(255,31,75,0.4)', color: '#ff6b86' }}
              onClick={() => onTriggerAction('issue')}
            >
              <AlertTriangle size={13} color="#ff1f4b" />
              Report Issue
            </button>
          </div>

          <form className="chat-composer" onSubmit={handleSend}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="icon-btn"
              title="Upload payment receipt screenshot"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={19} />
            </button>

            <input
              type="text"
              placeholder={
                humanTakeover
                  ? 'Message live agent directly...'
                  : 'Ask anything — Deposit, Withdraw, Game ID, Cash App, Bonus...'
              }
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                onPlayerTyping?.(e.target.value.trim().length > 0);
              }}
              onBlur={() => onPlayerTyping?.(false)}
            />

            <button
              type="submit"
              className="send-btn"
              disabled={!inputText.trim()}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </footer>

        {/* MOBILE APP BOTTOM NAVIGATION BAR */}
        <nav className="chat-mobile-bottom-nav" aria-label="Mobile navigation">
          <button
            type="button"
            className="chat-bottom-item active"
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            className="chat-bottom-item"
            onClick={onOpenGamesPage}
          >
            <Gamepad2 size={18} color="#ffd166" />
            <span>Games</span>
          </button>
          <button
            type="button"
            className="chat-bottom-item"
            onClick={() => onTriggerAction('deposit')}
          >
            <ArrowDownCircle size={18} color="#4ade80" />
            <span>Deposit</span>
          </button>
          <button
            type="button"
            className="chat-bottom-item"
            onClick={() => setCredsModalOpen(true)}
          >
            <KeyRound size={18} color="#f59e0b" />
            <span>My IDs</span>
          </button>
          <button
            type="button"
            className="chat-bottom-item"
            onClick={() => setAppModalOpen(true)}
          >
            <Smartphone size={18} color="#ff1f4b" />
            <span>Get App</span>
          </button>
        </nav>
      </main>

      {/* RIGHT BUSINESS SUITE DETAILS DRAWER */}
      {showDetails && (
        <aside className="suite-details">
          <div className="details-card">
            <div className="details-title">Player Suite Profile</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
              <div className="user-avatar-circle" style={{ width: 42, height: 42, fontSize: '0.95rem' }}>
                {initials || 'GS'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>{user.name}</div>
                <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {user.username} • {user.id}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>Support Tier</span>
              <strong style={{ color: 'var(--gs-cobalt)' }}>{user.tier}</strong>
            </div>
          </div>

          {/* PERMANENT MY GAME CREDENTIALS VAULT (COPY USERNAME & PASSWORD ANYTIME) */}
          <div className="details-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="details-title" style={{ marginBottom: 0 }}>
                My Game IDs ({gameCredentials.length})
              </div>
              <KeyRound size={14} color="#ffd166" />
            </div>

            {gameCredentials.length === 0 ? (
              <p style={{ fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                No active game logins yet. Tap <strong>New Game ID</strong> in chat — your username &amp; password will stay saved here permanently.
              </p>
            ) : (
              gameCredentials.map((cred) => {
                const isShown = Boolean(revealedIds[cred.id]);
                return (
                  <div key={cred.id} className="ticket-mini" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.84rem', color: '#ffd166' }}>{cred.game}</strong>
                      <span className="status-pill verified">Active</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>User:</span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <code className="mono" style={{ fontWeight: 600 }}>{cred.gameUser}</code>
                        <button
                          type="button"
                          className="msg-act-btn"
                          title="Copy Username"
                          onClick={() => handleCopyCred(`${cred.id}-u`, cred.gameUser || '')}
                        >
                          {copiedCred === `${cred.id}-u` ? (
                            <CheckCircle2 size={12} color="#22c55e" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Pass:</span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <code className="mono" style={{ fontWeight: 600 }}>
                          {isShown ? cred.gamePassword || '—' : '••••••••'}
                        </code>
                        <button
                          type="button"
                          className="msg-act-btn"
                          title={isShown ? 'Hide Password' : 'Show Password'}
                          onClick={() =>
                            setRevealedIds((prev) => ({ ...prev, [cred.id]: !prev[cred.id] }))
                          }
                        >
                          {isShown ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button
                          type="button"
                          className="msg-act-btn"
                          title="Copy Password"
                          onClick={() => handleCopyCred(`${cred.id}-p`, cred.gamePassword || '')}
                        >
                          {copiedCred === `${cred.id}-p` ? (
                            <CheckCircle2 size={12} color="#22c55e" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="details-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="details-title" style={{ marginBottom: 0 }}>
                Active Tickets ({tickets.length})
              </div>
            </div>

            {tickets.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                No requests yet. Use chat or quick buttons to request a Deposit, Cashout, or Game ID.
              </p>
            ) : (
              tickets.slice(0, 4).map((t) => (
                <div key={t.id} className="ticket-mini">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <strong className="mono" style={{ fontSize: '0.76rem' }}>{t.id}</strong>
                    <span
                      className={`status-pill ${
                        t.status === 'Processing' ? 'processing' : 'verified'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{t.subtitle}</div>
                </div>
              ))
            )}
          </div>

          <div className="details-card">
            <div className="details-title">Games & Wallet Page</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              Explore all 12+ games, compare payment gateways, or submit direct loads and cashouts.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', padding: '9px 12px', fontSize: '0.82rem' }}
              onClick={onOpenGamesPage}
            >
              <Gamepad2 size={15} />
              <span>Open Games Page</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {/* REFER & EARN $10 FREEPLAY CARD */}
          <div className="details-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="details-title" style={{ marginBottom: 0 }}>
                Refer &amp; Earn ($10)
              </div>
              <Share2 size={14} color="#22c55e" />
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 8 }}>
              Share your link — when a friend loads $20+, you automatically earn <strong>$10 Freeplay</strong>!
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                className="field-input mono"
                style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                value={referralLink}
                readOnly
              />
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                onClick={() => handleCopyCred('ref-link', referralLink)}
              >
                {copiedCred === 'ref-link' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <span>Friends Joined: <strong>{user.referralCount || 0}</strong></span>
              <span style={{ color: '#4ade80' }}>Earned: <strong>${user.referralBonusEarned || 0}</strong></span>
            </div>
          </div>

          <div className="details-card">
            <div className="details-title">Payment Methods</div>
            <div className="gateway-chip-grid">
              {gateways.map((gw) => (
                <span key={gw.id} className="gateway-chip">
                  {paymentMethodName(gw)}
                </span>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* PLAYER TRANSACTION HISTORY MODAL */}
      {historyModalOpen && (
        <div className="cashier-backdrop" onClick={() => setHistoryModalOpen(false)}>
          <div className="cashier-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="cashier-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <History size={20} color="#ffd166" />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.08rem' }}>
                    Transaction History
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    All your Deposits, Withdrawals, Bonuses &amp; Tickets
                  </div>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setHistoryModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'deposit', label: 'Deposits' },
                  { id: 'withdraw', label: 'Withdrawals' },
                  { id: 'bonus', label: 'Bonuses' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`filter-pill ${historyFilter === f.id ? 'active' : ''}`}
                  style={{ padding: '5px 12px', fontSize: '0.76rem' }}
                  onClick={() => setHistoryFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px 8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                No transactions found in this category yet.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 9, maxHeight: '58vh', overflowY: 'auto' }}>
                {filteredHistory.map((t) => (
                  <div key={t.id} className="ticket-mini" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong className="mono" style={{ fontSize: '0.78rem' }}>{t.id}</strong>
                      <span
                        className={`status-pill ${
                          t.status === 'Processing' ? 'processing' : 'verified'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.title}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {t.subtitle}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                      <span>{t.method || t.game || t.type.toUpperCase()}</span>
                      <span className="mono">{t.createdAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MY GAME CREDENTIALS MODAL (ACCESSIBLE FROM HEADER ON MOBILE & DESKTOP) */}
      {credsModalOpen && (
        <div className="cashier-backdrop" onClick={() => setCredsModalOpen(false)}>
          <div className="cashier-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cashier-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <KeyRound size={20} color="#ffd166" />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.08rem' }}>
                    My Game Credentials
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Tap copy anytime to log into your game app
                  </div>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCredsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {gameCredentials.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '18px 8px', display: 'grid', gap: 10 }}>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                  You don&apos;t have any active Game IDs yet.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setCredsModalOpen(false);
                    onTriggerAction('game-id');
                  }}
                >
                  <Gamepad2 size={16} />
                  <span>Request New Game ID in Chat</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
                {gameCredentials.map((cred) => (
                  <div key={cred.id} className="ticket-mini" style={{ padding: 13, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.96rem', color: '#ffd166' }}>
                        {cred.game}
                      </strong>
                      <span className="status-pill verified">{cred.id}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Username</span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <code className="mono" style={{ fontWeight: 700 }}>{cred.gameUser}</code>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 9px', fontSize: '0.72rem' }}
                          onClick={() => handleCopyCred(`m-${cred.id}-u`, cred.gameUser || '')}
                        >
                          {copiedCred === `m-${cred.id}-u` ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Password</span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <code className="mono" style={{ fontWeight: 700 }}>{cred.gamePassword || '—'}</code>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 9px', fontSize: '0.72rem' }}
                          onClick={() => handleCopyCred(`m-${cred.id}-p`, cred.gamePassword || '')}
                        >
                          {copiedCred === `m-${cred.id}-p` ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <AppDownloadModal open={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
};

