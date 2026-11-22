import React, { useEffect, useRef, useState } from 'react';
import { AuthSuite } from './components/AuthSuite';
import { ChatSuite } from './components/ChatSuite';
import { GamesLandingPage } from './components/GamesLandingPage';
import { AdminSuite } from './components/AdminSuite';
import {
  apiFetch,
  createRealtimeSocket,
  enableLockScreenPush,
} from './services/api';
import {
  ChatMessage,
  GameItem,
  PaymentGateway,
  PlatformSettings,
  RouteView,
  ThreadId,
  TicketItem,
  UserProfile,
} from './types';
import { PAYMENT_GATEWAYS as DEFAULT_GATEWAYS } from './data/catalog';

const STORAGE_USER_KEY = 'gamestrike_user_v1';
const STORAGE_TOKEN_KEY = 'gamestrike_token_v1';
const STORAGE_MSGS_KEY = 'gamestrike_msgs_v1';
const STORAGE_TICKETS_KEY = 'gamestrike_tickets_v1';
const STORAGE_THEME_KEY = 'gamestrike_theme_v1';

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function parseRouteFromHash(): RouteView {
  if (window.location.hash === '#/games') return 'games';
  if (window.location.hash === '#/admin') return 'admin';
  return 'chat';
}

function mapServerMsg(m: any): ChatMessage {
  return {
    id: String(m._id || m.id || uid()),
    threadId: (m.threadId || 'concierge') as ThreadId,
    sender: m.sender || 'agent',
    agentName: m.agentName,
    text: m.text || '',
    timestamp: m.createdAt
      ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : nowTime(),
    read: m.read,
    edited: Boolean(m.edited),
    deletedForEveryone: Boolean(m.deletedForEveryone),
    replyTo: m.replyTo,
    reactions: m.reactions instanceof Map ? Object.fromEntries(m.reactions) : (m.reactions || {}),
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    card: m.card,
    cardData: m.cardData,
    quickReplies: m.quickReplies,
  };
}

function mapServerTicket(t: any): TicketItem {
  return {
    id: t.ticketId || t.id,
    type: t.type,
    title: t.title,
    subtitle: t.subtitle,
    amount: t.amount,
    game: t.game,
    gameUser: t.gameUser,
    gamePassword: t.gamePassword,
    method: t.method,
    status: t.status,
    createdAt: t.createdAt
      ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : nowTime(),
  };
}

function buildWelcomeMessages(user: UserProfile): ChatMessage[] {
  const t = nowTime();
  return [
    {
      id: uid(),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Concierge',
      text: `Welcome to GameStrike.io, ${user.name}! ⚡\n\nI'm your 24/7 Gaming Support Desk. Anything you need — New Game IDs, Instant Deposits, Fast Cashouts, Payment Tags, or Bonuses — just ask right here in chat.\n\nSelect an option below or type your question:`,
      timestamp: t,
      quickReplies: [
        { label: '💳 Deposit / Load Credits', action: 'deposit' },
        { label: '💸 Withdraw / Cashout', action: 'withdraw' },
        { label: '🎮 Get New Game ID', action: 'game-id' },
        { label: '🏦 Payment Methods', action: 'payments' },
        { label: '🎁 Claim Bonus', action: 'bonuses' },
        { label: '🔑 Reset Password', action: 'password' },
      ],
    },
    {
      id: uid(),
      threadId: 'cashier',
      sender: 'agent',
      agentName: 'Instant Cashier Desk',
      text: `Hi ${user.name}! This is the dedicated Cashier Desk for fast Deposits & Withdrawals (Cash App, Chime, PayPal, Venmo, Zelle, Apple Pay & Crypto).`,
      timestamp: t,
      quickReplies: [
        { label: '💳 Start Deposit', action: 'deposit' },
        { label: '💸 Request Cashout', action: 'withdraw' },
        { label: '🏦 View Payment Tags', action: 'payments' },
      ],
    },
    {
      id: uid(),
      threadId: 'accounts',
      sender: 'agent',
      agentName: 'Game IDs & Bonuses',
      text: `Welcome ${user.name}! Need a Fire Kirin, Orion Stars, Juwa 777, or Game Vault login? Tap below to generate your Game ID or claim your 100% Welcome Bonus.`,
      timestamp: t,
      quickReplies: [
        { label: '🎮 Create Game ID', action: 'game-id' },
        { label: '🎁 100% Welcome Bonus', action: 'bonuses' },
      ],
    },
  ];
}

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_TOKEN_KEY)
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MSGS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [tickets, setTickets] = useState<TicketItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TICKETS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [darkMode, setDarkMode] = useState<boolean>(
    () => localStorage.getItem(STORAGE_THEME_KEY) !== 'light'
  );
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [route, setRoute] = useState<RouteView>(parseRouteFromHash);
  const [activeThread, setActiveThread] = useState<ThreadId>('concierge');
  const [isTyping, setIsTyping] = useState(false);
  const [humanTakeover, setHumanTakeover] = useState(false);
  const [games, setGames] = useState<GameItem[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>(DEFAULT_GATEWAYS);
  const [settings, setSettings] = useState<PlatformSettings>({
    welcomeBonusPercent: 100,
    regularBonusPercent: 20,
    withdrawMultiplier: 3,
    minWithdrawFallback: 20,
  });

  const socketRef = useRef<ReturnType<typeof createRealtimeSocket> | null>(null);

  // Load live API-connected games, CashTap + Manual gateways & platform bonus/withdraw settings
  useEffect(() => {
    apiFetch<GameItem[]>('/api/games')
      .then((list) => setGames(Array.isArray(list) ? list : []))
      .catch(() => setGames([]));
    apiFetch<PaymentGateway[]>('/api/gateways')
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setGateways(list);
      })
      .catch(() => {});
    apiFetch<PlatformSettings>('/api/settings')
      .then((s) => {
        if (s && typeof s.welcomeBonusPercent === 'number') setSettings(s);
      })
      .catch(() => {});
  }, [route]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem(STORAGE_THEME_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (target: RouteView) => {
    window.location.hash = `#/${target}`;
    setRoute(target);
  };

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_USER_KEY);
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem(STORAGE_TOKEN_KEY, token);
    else localStorage.removeItem(STORAGE_TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(tickets));
  }, [tickets]);

  // Connect live Socket.IO & sync history when authenticated with backend token
  useEffect(() => {
    if (!token || !user) return;

    apiFetch<{ messages: any[]; tickets: any[] }>('/api/chat/history', {}, token)
      .then((res) => {
        if (res.messages?.length) {
          setMessages(res.messages.map(mapServerMsg));
        }
        if (res.tickets?.length) {
          setTickets(res.tickets.map(mapServerTicket));
        }
      })
      .catch(() => {
        // Offline / local fallback mode works seamlessly
      });

    const socket = createRealtimeSocket(token);
    socketRef.current = socket;

    socket.on('chat:message', (raw: any) => {
      const mapped = mapServerMsg(raw);
      setMessages((prev) => (prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]));
    });

    socket.on('chat:message-updated', (raw: any) => {
      const mapped = mapServerMsg(raw);
      setMessages((prev) => prev.map((m) => (m.id === mapped.id ? mapped : m)));
    });

    socket.on('chat:typing', (payload: { sender: string; isTyping: boolean }) => {
      if (payload?.sender === 'agent') {
        setIsTyping(Boolean(payload.isTyping));
      }
    });

    socket.on('chat:mode', (payload: { humanTakeover: boolean }) => {
      setHumanTakeover(Boolean(payload?.humanTakeover));
    });

    socket.on('ticket:created', (raw: any) => {
      const mapped = mapServerTicket(raw);
      setTickets((prev) => (prev.some((t) => t.id === mapped.id) ? prev : [mapped, ...prev]));
    });

    socket.on('ticket:updated', (raw: any) => {
      const mapped = mapServerTicket(raw);
      setTickets((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?._id]);

  const handleAuthenticate = async (
    profile: UserProfile,
    isNewSignup: boolean,
    providedToken?: string | null
  ) => {
    if (providedToken) {
      setUser(profile);
      setToken(providedToken);
      setActiveThread('concierge');
      navigate('chat');
      return;
    }

    try {
      const endpoint = profile.contact.startsWith('guest@')
        ? '/api/auth/demo'
        : isNewSignup
        ? '/api/auth/register'
        : '/api/auth/login';

      const payload =
        endpoint === '/api/auth/demo'
          ? {}
          : { name: profile.name, contact: profile.contact, password: 'strike_user_pass' };

      const res = await apiFetch<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(res.user);
      setToken(res.token);
      setActiveThread('concierge');
      navigate('chat');
    } catch {
      setUser(profile);
      setToken(null);
      setActiveThread('concierge');
      navigate('chat');
      setIsTyping(true);
      setMessages([]);
      setTimeout(() => {
        setMessages(buildWelcomeMessages(profile));
        setIsTyping(false);
      }, 600);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setToken(null);
    setMessages([]);
    setTickets([]);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_MSGS_KEY);
    localStorage.removeItem(STORAGE_TICKETS_KEY);
    navigate('chat');
  };

  const handleEnablePush = async () => {
    if (!token) {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setPushEnabled(true);
          new Notification('GameStrike.io Notifications Active ⚡', {
            body: 'You will receive instant alerts for chats, deposits & cashouts.',
            icon: '/gamestrike-logo.jpg',
          });
        }
      }
      return;
    }
    const res = await enableLockScreenPush(token);
    if (res.ok) setPushEnabled(true);
  };

  const pushAgentReply = (
    threadId: ThreadId,
    reply: Omit<ChatMessage, 'id' | 'threadId' | 'sender' | 'timestamp'>
  ) => {
    setIsTyping(true);
    setTimeout(async () => {
      if (token) {
        try {
          const saved = await apiFetch<any>(
            '/api/chat/agent-message',
            {
              method: 'POST',
              body: JSON.stringify({
                threadId,
                agentName: reply.agentName || 'GameStrike Concierge',
                text: reply.text,
                card: reply.card,
                cardData: reply.cardData,
                quickReplies: reply.quickReplies,
              }),
            },
            token
          );
          const mapped = mapServerMsg(saved);
          setMessages((prev) =>
            prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]
          );
          setIsTyping(false);
          return;
        } catch {
          // fallback to local state below if backend unreachable
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          threadId,
          sender: 'agent',
          timestamp: nowTime(),
          ...reply,
        },
      ]);
      setIsTyping(false);
    }, 450);
  };

  const handleTriggerAction = (
    action: string,
    preselectedGame?: string,
    overrideThread?: ThreadId
  ) => {
    const targetThread = overrideThread || activeThread;

    if (action === 'deposit') {
      pushAgentReply(targetThread, {
        text: 'Sure! Fill out your quick Deposit Request below and copy our official payment tag. Once sent, you can upload your receipt screenshot right here in chat.',
        card: 'deposit-form',
        cardData: { preselectedGame },
      });
    } else if (action === 'withdraw') {
      pushAgentReply(targetThread, {
        text: 'Ready to cash out your winnings! Enter your game ID, amount, and payout tag below — average payout time is 5–15 minutes.',
        card: 'withdraw-form',
        cardData: { preselectedGame },
      });
    } else if (action === 'game-id') {
      pushAgentReply(targetThread, {
        text: preselectedGame
          ? `Let's set up your **${preselectedGame}** account right away. Tap below to generate your login ID:`
          : 'Pick any game below and I will generate your instant Game ID & temporary password right here:',
        card: 'game-id-form',
        cardData: { preselectedGame },
      });
    } else if (action === 'payments') {
      pushAgentReply(targetThread, {
        text: 'Here are our verified 24/7 Payment Gateways (0% fees on all deposits & withdrawals):',
        card: 'payment-methods',
        quickReplies: [
          { label: '💳 Make a Deposit', action: 'deposit' },
          { label: '💸 Request Cashout', action: 'withdraw' },
        ],
      });
    } else if (action === 'bonuses') {
      pushAgentReply(targetThread, {
        text: 'Here are the active GameStrike.io promotions available for your account:',
        card: 'bonuses',
      });
    } else if (action === 'password') {
      pushAgentReply(targetThread, {
        text: 'No problem! Please reply with your **Game Name** and **Username** (e.g. `Juwa 777 - gs_player21`), and our live agent will reset your password within 2 minutes.',
      });
    } else if (action === 'issue') {
      pushAgentReply(targetThread, {
        text: 'We are here to fix it fast! Select your issue below (game not opening, payment not received, or withdrawal delay) to alert a live human agent immediately:',
        card: 'issue-form',
        cardData: { preselectedGame },
      });
    }
  };

  const handleSendMessage = async (
    text: string,
    attachment?: { url: string; name: string }
  ) => {
    if (token) {
      apiFetch(
        '/api/chat/message',
        {
          method: 'POST',
          body: JSON.stringify({
            threadId: activeThread,
            text,
            attachmentUrl: attachment?.url,
            attachmentName: attachment?.name,
          }),
        },
        token
      ).catch(() => {});
    } else {
      const userMsg: ChatMessage = {
        id: uid(),
        threadId: activeThread,
        sender: 'user',
        text,
        timestamp: nowTime(),
        read: true,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    if (attachment) {
      if (!humanTakeover) {
        pushAgentReply(activeThread, {
          text: 'Receipt received! ✅ Our cashier team is verifying your screenshot now.',
          quickReplies: [
            { label: '🎮 Get Game ID', action: 'game-id' },
            { label: '🎁 Claim Bonus', action: 'bonuses' },
          ],
        });
      }
      return;
    }

    // When Admin has taken over (Live Human Mode), keep auto-bot 100% silent for real 1-on-1 chat!
    if (humanTakeover) {
      return;
    }

    const q = text.toLowerCase();
    if (
      q.includes('deposit') ||
      q.includes('load') ||
      q.includes('add') ||
      q.includes('topup') ||
      q.includes('paise dal') ||
      q.includes('recharge')
    ) {
      handleTriggerAction('deposit');
    } else if (
      q.includes('withdraw') ||
      q.includes('cashout') ||
      q.includes('redeem') ||
      q.includes('payout') ||
      q.includes('nikal')
    ) {
      handleTriggerAction('withdraw');
    } else if (
      q.includes('game id') ||
      q.includes('new id') ||
      q.includes('account') ||
      q.includes('juwa') ||
      q.includes('fire kirin') ||
      q.includes('orion') ||
      q.includes('vault') ||
      q.includes('milky') ||
      q.includes('id chahiye') ||
      q.includes('id bna')
    ) {
      handleTriggerAction('game-id');
    } else if (
      q.includes('payment') ||
      q.includes('cashapp') ||
      q.includes('cash app') ||
      q.includes('chime') ||
      q.includes('paypal') ||
      q.includes('zelle') ||
      q.includes('venmo') ||
      q.includes('crypto') ||
      q.includes('btc') ||
      q.includes('usdt') ||
      q.includes('tag')
    ) {
      handleTriggerAction('payments');
    } else if (
      q.includes('bonus') ||
      q.includes('freeplay') ||
      q.includes('promo') ||
      q.includes('offer')
    ) {
      handleTriggerAction('bonuses');
    } else if (
      q.includes('issue') ||
      q.includes('problem') ||
      q.includes('not open') ||
      q.includes('open nai') ||
      q.includes('chal nai') ||
      q.includes('not received') ||
      q.includes('receive nai') ||
      q.includes('nai ayi') ||
      q.includes('stuck') ||
      q.includes('error') ||
      q.includes('agent') ||
      q.includes('help') ||
      q.includes('support')
    ) {
      handleTriggerAction('issue');
    } else if (q.includes('password') || q.includes('reset') || q.includes('forgot')) {
      handleTriggerAction('password');
    } else if (!token) {
      pushAgentReply(activeThread, {
        text: `Got it, ${user?.name || 'Player'}! A GameStrike.io support specialist has received your message. You can also use any quick action below:`,
        quickReplies: [
          { label: '💳 Deposit / Load', action: 'deposit' },
          { label: '💸 Withdraw / Cashout', action: 'withdraw' },
          { label: '🎮 New Game ID', action: 'game-id' },
          { label: '🏦 Payment Tags', action: 'payments' },
        ],
      });
    }
  };

  const handleSubmitDeposit = async (data: {
    game: string;
    amount: number;
    method: string;
    handle: string;
    receiptScreenshotUrl?: string;
  }): Promise<{ checkoutUrl?: string; error?: string } | void> => {
    let activeToken = token;
    if (!activeToken) {
      // Auto-register a demo session on the backend so CashTap Checkout works immediately
      try {
        const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/demo', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        activeToken = res.token;
        setToken(res.token);
        setUser(res.user);
      } catch (err: any) {
        const msg = err.message || 'Backend server is not reachable.';
        pushAgentReply(activeThread, { text: `Could not start CashTap Checkout: ${msg}` });
        return { error: msg };
      }
    }

    try {
      const res = await apiFetch<{
        ticket: any;
        message: any;
        session: { id: string; url: string };
      }>('/api/tickets/deposit', { method: 'POST', body: JSON.stringify(data) }, activeToken);

      return { checkoutUrl: res.session?.url };
    } catch (err: any) {
      const errText = err.message || 'CashTap Checkout request failed.';
      pushAgentReply(activeThread, {
        text: `⚠️ CashTap Checkout Error: ${errText}`,
      });
      return { error: errText };
    }
  };

  const handleSyncCashTap = async (ticketId: string) => {
    if (!token) return;
    try {
      const res = await apiFetch<{ ticket: any; session: any }>(
        `/api/tickets/${ticketId}/sync`,
        {},
        token
      );
      if (res.session?.status && res.session.status !== 'completed') {
        pushAgentReply(activeThread, {
          text: `CashTap Session ${res.session.id} status is currently **${res.session.status}**. Complete payment on the CashTap page and it will auto-confirm.`,
        });
      }
    } catch (err: any) {
      pushAgentReply(activeThread, {
        text: `Could not sync CashTap status: ${err.message}`,
      });
    }
  };

  const handleSubmitWithdraw = async (data: {
    game: string;
    gameUser: string;
    amount: number;
    method: string;
    payoutTag: string;
    balanceScreenshotUrl?: string;
    qrScreenshotUrl?: string;
  }) => {
    if (token) {
      try {
        await apiFetch('/api/tickets/withdraw', { method: 'POST', body: JSON.stringify(data) }, token);
      } catch (err: any) {
        pushAgentReply(activeThread, {
          text: `⚠️ Withdrawal Rule: ${err.message || 'Could not submit cashout.'}`,
        });
      }
      return;
    }
    const ticketId = `WD-${Math.floor(1000 + Math.random() * 9000)}`;
    setTickets((prev) => [
      {
        id: ticketId,
        type: 'withdraw',
        title: `Cashout $${data.amount} (${data.game})`,
        subtitle: `${data.method} → ${data.payoutTag}`,
        amount: data.amount,
        game: data.game,
        method: data.method,
        status: 'Processing',
        createdAt: nowTime(),
      },
      ...prev,
    ]);
    pushAgentReply(activeThread, {
      text: `Cashout Ticket created! Our Cashier Desk is verifying your balance on ${data.game} (${data.gameUser}) and will send $${data.amount} to ${data.payoutTag}.`,
      card: 'ticket-receipt',
      cardData: { ticketId, ticketType: 'withdraw', game: data.game, amount: data.amount, method: data.method, handle: data.payoutTag },
    });
  };

  const handleSubmitGameId = async (game: string) => {
    // Client-side guard: never send duplicate game-id request if player already has one
    const existingLocal = tickets.find(
      (t) =>
        t.type === 'game-id' &&
        String(t.game || '').toLowerCase() === String(game || '').toLowerCase() &&
        t.status !== 'Rejected'
    );
    if (existingLocal) {
      pushAgentReply(activeThread, {
        text: existingLocal.gameUser
          ? `You already have an active **${game}** account! Here are your saved credentials:`
          : `Your **${game}** ID request (${existingLocal.id}) is already pending with Admin.`,
        card: 'ticket-receipt',
        cardData: existingLocal.gameUser
          ? {
              ticketId: existingLocal.id,
              ticketType: 'game-id',
              game: existingLocal.game,
              loginId: existingLocal.gameUser,
              tempPass: existingLocal.gamePassword || '—',
            }
          : {
              ticketId: existingLocal.id,
              ticketType: 'game-id',
              game: existingLocal.game,
              handle: 'Already Pending with Admin',
            },
      });
      return;
    }

    if (token) {
      try {
        await apiFetch('/api/tickets/game-id', { method: 'POST', body: JSON.stringify({ game }) }, token);
      } catch (err: any) {
        pushAgentReply(activeThread, {
          text: `⚠️ Could not generate ${game} ID: ${err.message || 'Please try again.'}`,
        });
      }
      return;
    }
    const ticketId = `ID-${Math.floor(1000 + Math.random() * 9000)}`;
    const prefix = game.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    const loginId = `GS_${prefix}${Math.floor(1000 + Math.random() * 8999)}`;
    const tempPass = `Strike@${Math.floor(100 + Math.random() * 899)}`;
    setTickets((prev) => [
      {
        id: ticketId,
        type: 'game-id',
        title: `${game} Account Ready`,
        subtitle: `Login: ${loginId}`,
        game,
        gameUser: loginId,
        gamePassword: tempPass,
        status: 'Completed',
        createdAt: nowTime(),
      },
      ...prev,
    ]);
    pushAgentReply(activeThread, {
      text: `Your ${game} account is active! Save your credentials below:`,
      card: 'ticket-receipt',
      cardData: { ticketId, ticketType: 'game-id', game, loginId, tempPass },
      quickReplies: [
        { label: `💳 Load ${game} Now`, action: 'deposit' },
        { label: '🎁 Claim 100% Bonus', action: 'bonuses' },
      ],
    });
  };

  const handleSubmitIssue = async (data: {
    category: string;
    game: string;
    referenceId: string;
    details: string;
  }) => {
    if (token) {
      await apiFetch('/api/tickets/issue', { method: 'POST', body: JSON.stringify(data) }, token).catch(() => {});
      return;
    }
    const ticketId = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;
    setTickets((prev) => [
      {
        id: ticketId,
        type: 'issue',
        title: `[URGENT] ${data.category}`,
        subtitle: `${data.referenceId ? `Ref: ${data.referenceId} • ` : ''}${data.details || 'Live agent alerted'}`,
        game: data.game,
        status: 'Processing',
        createdAt: nowTime(),
      },
      ...prev,
    ]);
    pushAgentReply(activeThread, {
      text: `Priority Support Ticket ${ticketId} created! 🚨 A live human agent has been alerted and will resolve this right here. You can also upload a screenshot using the image button below.`,
      card: 'ticket-receipt',
      cardData: {
        ticketId,
        ticketType: 'issue',
        game: data.game || data.category,
        handle: data.referenceId || 'Assigned to Live Agent',
      },
    });
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    if (token) {
      try {
        const updated = await apiFetch<any>(
          `/api/chat/message/${messageId}`,
          { method: 'PATCH', body: JSON.stringify({ text: trimmed }) },
          token
        );
        const mapped = mapServerMsg(updated);
        setMessages((prev) => prev.map((m) => (m.id === mapped.id ? mapped : m)));
        return;
      } catch {
        // fallback below
      }
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: trimmed, edited: true } : m))
    );
  };

  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (token) {
      try {
        const updated = await apiFetch<any>(
          `/api/chat/message/${messageId}/react`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
          token
        );
        const mapped = mapServerMsg(updated);
        setMessages((prev) => prev.map((m) => (m.id === mapped.id ? mapped : m)));
        return;
      } catch {
        // fallback below
      }
    }
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const myVote = user?.contact?.toLowerCase().trim() || 'me';
        const currentList = reactions[emoji] || [];
        if (currentList.includes(myVote)) {
          reactions[emoji] = currentList.filter((v) => v !== myVote);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...currentList, myVote];
        }
        return { ...m, reactions };
      })
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (token) {
      try {
        const updated = await apiFetch<any>(
          `/api/chat/message/${messageId}`,
          { method: 'DELETE' },
          token
        );
        const mapped = mapServerMsg(updated);
        setMessages((prev) => prev.map((m) => (m.id === mapped.id ? mapped : m)));
        return;
      } catch {
        // fallback below
      }
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              text: '',
              attachmentUrl: undefined,
              card: undefined,
              quickReplies: [],
              deletedForEveryone: true,
            }
          : m
      )
    );
  };

  const handleClaimPromo = (title: string, code: string) => {
    const ticketId = `PRM-${Math.floor(1000 + Math.random() * 9000)}`;
    setTickets((prev) => [
      {
        id: ticketId,
        type: 'bonus',
        title,
        subtitle: `Code: ${code} Applied`,
        status: 'Verified',
        createdAt: nowTime(),
      },
      ...prev,
    ]);
    pushAgentReply(activeThread, {
      text: `Promo code **${code}** (${title}) has been tagged to your account! Make your qualifying deposit right here to receive your bonus credits.`,
      quickReplies: [{ label: '💳 Deposit Now with Bonus', action: 'deposit' }],
    });
  };

  // ADMIN PANEL APP ROUTE (#/admin)
  if (route === 'admin') {
    return (
      <AdminSuite
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onBackToPlayerApp={() => navigate('chat')}
      />
    );
  }

  // DEDICATED GAMES & WALLET LANDING PAGE (#/games)
  if (route === 'games') {
    return (
      <GamesLandingPage
        games={games}
        gateways={gateways}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onBackToChat={() => navigate('chat')}
        onRequestGameIdInChat={(gameName) => {
          if (!user) {
            handleAuthenticate(
              {
                id: `GS-${Math.floor(10000 + Math.random() * 90000)}`,
                name: 'Guest Player',
                username: `@strike${Math.floor(100 + Math.random() * 899)}`,
                contact: 'guest@gamestrike.io',
                joinedAt: new Date().toLocaleDateString(),
                tier: 'Starter',
              },
              true
            );
          } else {
            navigate('chat');
            setActiveThread('concierge');
            handleTriggerAction('game-id', gameName, 'concierge');
          }
        }}
        onSubmitDepositFromPage={handleSubmitDeposit}
        onSubmitWithdrawFromPage={handleSubmitWithdraw}
        onClaimPromoInChat={(title, code) => {
          navigate('chat');
          setActiveThread('concierge');
          handleClaimPromo(title, code);
        }}
      />
    );
  }

  // AUTH GATE -> BUSINESS SUITE CHAT SUPPORT
  if (!user) {
    return (
      <AuthSuite
        onAuthenticate={handleAuthenticate}
        onPreviewGames={() => navigate('games')}
      />
    );
  }

  // PRIMARY EXPERIENCE: PLAYER MESSENGER / BUSINESS SUITE
  return (
    <ChatSuite
      user={user}
      settings={settings}
      games={games}
      gateways={gateways}
      messages={messages}
      tickets={tickets}
      activeThread={activeThread}
      isTyping={isTyping}
      humanTakeover={humanTakeover}
      onPlayerTyping={(typing) => {
        socketRef.current?.emit('chat:typing', { isTyping: typing });
      }}
      darkMode={darkMode}
      onSelectThread={setActiveThread}
      onSendMessage={handleSendMessage}
      onEditMessage={handleEditMessage}
      onDeleteMessage={handleDeleteMessage}
      onReactMessage={handleReactMessage}
      onTriggerAction={handleTriggerAction}
      onSubmitDeposit={handleSubmitDeposit}
      onSubmitWithdraw={handleSubmitWithdraw}
      onSubmitGameId={handleSubmitGameId}
      onSubmitIssue={handleSubmitIssue}
      onClaimPromo={handleClaimPromo}
      onSyncCashTap={handleSyncCashTap}
      onOpenGamesPage={() => navigate('games')}
      onEnablePush={handleEnablePush}
      pushEnabled={pushEnabled}
      onToggleTheme={() => setDarkMode((d) => !d)}
      onSignOut={handleSignOut}
    />
  );
};

export default App;
