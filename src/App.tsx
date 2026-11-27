import React, { useEffect, useRef, useState } from 'react';
import { AuthSuite } from './components/AuthSuite';
import { ChatSuite } from './components/ChatSuite';
import { GamesLandingPage } from './components/GamesLandingPage';
import { AdminSuite } from './components/AdminSuite';
import {
  apiFetch,
  createRealtimeSocket,
  enableLockScreenPush,
  enableNativePushOnLaunch,
  isUnauthorized,
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
import { paymentMethodName } from './data/catalog';
import { getClientDevicePayload } from './utils/clientDevice';
import { freeplayEligibility, freeplayEligibilityMessage } from './utils/freeplayEligibility';

const STORAGE_USER_KEY = 'gamestrike_user_v1';
const STORAGE_TOKEN_KEY = 'gamestrike_token_v1';
const STORAGE_MSGS_KEY = 'gamestrike_msgs_v1';
const STORAGE_TICKETS_KEY = 'gamestrike_tickets_v1';
const STORAGE_THEME_KEY = 'gamestrike_theme_v1';

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function withoutSiteWallet(profile: UserProfile): UserProfile {
  if (profile.role === 'admin') return profile;
  const next = { ...profile };
  delete next.walletBalance;
  return next;
}

function parseRouteFromHash(): RouteView {
  if (window.location.hash === '#/games') return 'games';
  if (window.location.hash === '#/admin') return 'admin';
  return 'chat';
}

let googleSignInFlight: Promise<void> | null = null;

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
    bonusAmount: t.bonusAmount,
    totalCredit: t.totalCredit,
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
  const [googleReturn, setGoogleReturn] = useState(() => {
    if (typeof window === 'undefined') return false;
    const search = new URLSearchParams(window.location.search);
    return search.has('code') || window.location.hash.includes('access_token=');
  });
  const [activeThread, setActiveThread] = useState<ThreadId>('concierge');
  const [isTyping, setIsTyping] = useState(false);
  const [games, setGames] = useState<GameItem[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>(DEFAULT_GATEWAYS);
  const [settings, setSettings] = useState<PlatformSettings>({
    welcomeBonusPercent: 100,
    regularBonusPercent: 20,
    withdrawMultiplier: 3,
    minWithdrawFallback: 20,
    dailyBonusPercent: 10,
    dailyBonusLabel: "Today's Bonus",
    dailyOfferText: "Today's offer is live — extra bonus on your next deposit",
    freeplayAmount: 5,
    freeplayDepositAmountRequired: 15,
    freeplayMinGameBalance: 120,
    freeplayCashoutPercent: 10,
    referralBonus: 10,
  });

  const socketRef = useRef<ReturnType<typeof createRealtimeSocket> | null>(null);
  const expireSessionRef = useRef<() => void>(() => {});

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
    enableNativePushOnLaunch(token)
      .then((ok) => {
        if (ok) setPushEnabled(true);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const payload = getClientDevicePayload();
    apiFetch<{ blocked?: boolean; reason?: string }>('/api/device/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (res.blocked) expireSessionRef.current();
      })
      .catch(() => {});
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

    apiFetch<{ user: UserProfile }>('/api/auth/me', {}, token)
      .then((res) => {
        if (res.user) {
          const fresh = withoutSiteWallet(res.user);
          setUser((prev) => (prev ? withoutSiteWallet({ ...prev, ...fresh }) : fresh));
        }
      })
      .catch((err) => {
        if (isUnauthorized(err)) expireSessionRef.current();
      });

    apiFetch<{ messages: any[]; tickets: any[] }>('/api/chat/history', {}, token)
      .then((res) => {
        if (res.messages?.length) {
          setMessages(res.messages.map(mapServerMsg));
        }
        if (res.tickets?.length) {
          setTickets(res.tickets.map(mapServerTicket));
        }
      })
      .catch((err) => {
        if (isUnauthorized(err)) expireSessionRef.current();
      });

    const socket = createRealtimeSocket(token);
    socketRef.current = socket;

    socket.on('auth:expired', () => {
      expireSessionRef.current();
    });

    socket.on('auth:revoked', () => {
      expireSessionRef.current();
    });

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

    socket.on('chat:cleared', () => {
      setMessages([]);
    });

    socket.on('wallet:updated', (payload: { referralBonusEarned?: number; referralCount?: number }) => {
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          referralBonusEarned: typeof payload?.referralBonusEarned === 'number' ? payload.referralBonusEarned : prev.referralBonusEarned,
          referralCount: typeof payload?.referralCount === 'number' ? payload.referralCount : prev.referralCount,
        };
      });
    });

    socket.on('ticket:created', (raw: any) => {
      const mapped = mapServerTicket(raw);
      setTickets((prev) => (prev.some((t) => t.id === mapped.id) ? prev : [mapped, ...prev]));
    });

    socket.on('ticket:updated', (raw: any) => {
      const mapped = mapServerTicket(raw);
      setTickets((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
    });

    socket.on('profile:updated', (profile: UserProfile) => {
      setUser((prev) => (prev ? withoutSiteWallet({ ...prev, ...profile }) : withoutSiteWallet(profile)));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?._id]);

  const handleAuthenticate = (
    profile: UserProfile,
    _isNewSignup: boolean,
    providedToken?: string | null
  ) => {
    if (!providedToken) return;
    setUser(withoutSiteWallet(profile));
    setToken(providedToken);
    setActiveThread('concierge');
    navigate('chat');
  };

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const hashQuery = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : rawHash;
    const hashParams = new URLSearchParams(hashQuery);
    const code = search.get('code') || '';
    const accessToken = hashParams.get('access_token') || '';
    const sid = search.get('state') || hashParams.get('state') || '';
    const oauthError = search.get('error') || hashParams.get('error') || '';
    if (code) sessionStorage.setItem('gs_google_code', code);
    if (accessToken) sessionStorage.setItem('gs_google_access', accessToken);
    if (sid) sessionStorage.setItem('gs_google_sid', sid);
    if (oauthError) sessionStorage.setItem('gs_google_oauth_error', oauthError);
    if (code || accessToken || oauthError || search.has('state')) {
      const hashPath = window.location.hash.includes('?')
        ? window.location.hash.slice(0, window.location.hash.indexOf('?'))
        : window.location.hash;
      window.history.replaceState({}, '', `${window.location.pathname}${hashPath}`);
    }

    const savedCode = sessionStorage.getItem('gs_google_code') || '';
    const savedAccess = sessionStorage.getItem('gs_google_access') || '';
    const savedSid = sessionStorage.getItem('gs_google_sid') || '';
    const savedError = sessionStorage.getItem('gs_google_oauth_error') || '';
    if (!savedCode && !savedAccess && !savedError) return;

    const clearGoogleAttempt = () => {
      sessionStorage.removeItem('gs_google_code');
      sessionStorage.removeItem('gs_google_access');
      sessionStorage.removeItem('gs_google_sid');
      sessionStorage.removeItem('gs_google_oauth_error');
    };

    if (savedError || (!savedCode && !savedAccess)) {
      clearGoogleAttempt();
      sessionStorage.setItem('gs_google_error', 'Google sign-in was cancelled.');
      setGoogleReturn(false);
      return;
    }
    if (googleSignInFlight) return;

    googleSignInFlight = (async () => {
      try {
        const res = await apiFetch<{ token: string; user: UserProfile; isNewUser: boolean }>(
          '/api/auth/google',
          {
            method: 'POST',
            body: JSON.stringify(
              savedCode
                ? { code: savedCode, redirectUri: window.location.origin, sid: savedSid }
                : { accessToken: savedAccess, sid: savedSid }
            ),
          }
        );
        clearGoogleAttempt();
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(
            {
              type: 'gamestrike-google',
              token: res.token,
              user: res.user,
              isNewUser: Boolean(res.isNewUser),
            },
            window.location.origin
          );
          window.close();
        }
        setUser(withoutSiteWallet(res.user));
        setToken(res.token);
        setActiveThread('concierge');
        navigate('chat');
        setGoogleReturn(false);
      } catch (err) {
        clearGoogleAttempt();
        googleSignInFlight = null;
        const message = err instanceof Error ? err.message : 'Google sign-in could not be verified.';
        sessionStorage.setItem('gs_google_error', message);
        setGoogleReturn(false);
      }
    })();
  }, []);

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

  const expireSession = () => {
    sessionStorage.setItem('gs_session_notice', 'Your session expired. Sign in again, then send the message.');
    handleSignOut();
  };
  expireSessionRef.current = expireSession;

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
    } else if (action === 'freeplay') {
      const elig = freeplayEligibility(user || undefined, settings, tickets);
      if (!elig.eligible) {
        pushAgentReply(targetThread, {
          text: freeplayEligibilityMessage(user || undefined, settings, tickets),
        });
        return;
      }
      pushAgentReply(targetThread, {
        text:
          elig.claimCount === 0
            ? 'Do not mark the GameStrike email as spam. If it is in Spam, move it to Primary. Do not open the email. Screenshot the Primary inbox where the GameStrike email is sitting in the list, then upload it below.'
            : 'You unlocked another freeplay. Same rule: Primary inbox screenshot — email visible in the list, do not open it.',
        card: 'freeplay-task',
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
    if (!token) return;
    apiFetch(
      '/api/chat/message',
      {
        method: 'POST',
        body: JSON.stringify({
          threadId: activeThread,
          text,
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
          clientMeta: getClientDevicePayload(),
        }),
      },
      token
    ).catch((err) => {
      if (isUnauthorized(err)) expireSession();
    });
  };

  const handleSubmitDeposit = async (data: {
    game: string;
    amount: number;
    method: string;
    handle: string;
    receiptScreenshotUrl?: string;
    senderTag?: string;
  }): Promise<{ checkoutUrl?: string; error?: string } | void> => {
    const activeToken = token;
    if (!activeToken) {
      navigate('chat');
      return { error: 'Sign in with your account before depositing.' };
    }

    try {
      const res = await apiFetch<{
        ticket: any;
        message: any;
        session: { id: string; url: string };
      }>('/api/tickets/deposit', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          applyDailyBonus: sessionStorage.getItem('gs_bonus_choice') === 'daily',
        }),
      }, activeToken);
      sessionStorage.removeItem('gs_bonus_choice');

      return { checkoutUrl: res.session?.url };
    } catch (err: any) {
      const errText = err.message || 'CashTap Checkout request failed.';
      pushAgentReply(activeThread, {
        text: `⚠️ CashTap Checkout Error: ${errText}`,
      });
      return { error: errText };
    }
  };

  const handleSubmitFreeplay = async (data: { screenshot: string; game: string }) => {
    if (!token) return;
    const elig = freeplayEligibility(user || undefined, settings, tickets);
    if (!elig.eligible) {
      throw new Error(freeplayEligibilityMessage(user || undefined, settings, tickets));
    }
    const res = await apiFetch<{ ticket: any; user?: UserProfile }>(
      '/api/tickets/freeplay',
      {
        method: 'POST',
        body: JSON.stringify({ receiptScreenshotUrl: data.screenshot, game: data.game }),
      },
      token
    );
    if (res.ticket) {
      const mapped = mapServerTicket(res.ticket);
      setTickets((prev) => (prev.some((t) => t.id === mapped.id) ? prev : [mapped, ...prev]));
    }
    if (res.user) {
      setUser((prev) => (prev ? withoutSiteWallet({ ...prev, ...res.user! }) : withoutSiteWallet(res.user!)));
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
    gameBalance?: number;
  }): Promise<{ error?: string } | void> => {
    if (!token) {
      navigate('chat');
      return { error: 'Sign in with your account before requesting a cashout.' };
    }
    try {
      await apiFetch('/api/tickets/withdraw', { method: 'POST', body: JSON.stringify(data) }, token);
    } catch (err: any) {
      const errText = err.message || 'Could not submit cashout.';
      pushAgentReply(activeThread, {
        text: `⚠️ Withdrawal Rule: ${errText}`,
      });
      return { error: errText };
    }
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

    if (!token) {
      navigate('chat');
      return;
    }
    try {
      await apiFetch('/api/tickets/game-id', { method: 'POST', body: JSON.stringify({ game }) }, token);
    } catch (err: any) {
      pushAgentReply(activeThread, {
        text: `⚠️ Could not generate ${game} ID: ${err.message || 'Please try again.'}`,
      });
    }
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
    if (code === 'REFERRAL') {
      const pct = Number(settings.referralBonus ?? 10);
      pushAgentReply(activeThread, {
        text: `Referral is ${pct}% and it pays once. When someone joins with your link and their deposit succeeds, you get ${pct}% of that deposit (referral ledger).`,
        quickReplies: [{ label: 'Deposit now', action: 'deposit' }],
      });
      return;
    }
    if (code === 'DAILY') sessionStorage.setItem('gs_bonus_choice', 'daily');
    else sessionStorage.removeItem('gs_bonus_choice');
    const tags = gateways
      .map((gw) => `${paymentMethodName(gw)}${gw.handle ? `: ${gw.handle}` : ''}`)
      .join('\n');
    const fpEligible = freeplayEligibility(user || undefined, settings, tickets).eligible;
    pushAgentReply(activeThread, {
      text: `**${title}** is selected.\n\nLive bonuses right now:\n• Welcome ${settings.welcomeBonusPercent}% on your first deposit\n• Regular ${settings.regularBonusPercent}% on every deposit\n• ${settings.dailyBonusLabel || "Today's Bonus"} ${settings.dailyBonusPercent || 0}% if you picked today's bonus\n• Freeplay $${Number(settings.freeplayAmount || 0).toFixed(2)}${
        fpEligible ? ', when you are eligible — Primary inbox screenshot' : ` — ${freeplayEligibilityMessage(user || undefined, settings, tickets)}`
      }\n• Referral ${Number(settings.referralBonus ?? 10)}% once, paid to the inviter when that player's deposit succeeds\n\nPayment tags:\n${tags || 'Open Payment Methods in chat.'}\n\nGet your Game ID first. Deposit for a game — payment + bonus load on that game.`,
      quickReplies: [
        { label: 'Deposit now', action: 'deposit' },
        ...(code === 'FREEPLAY' && fpEligible
          ? [{ label: 'Send inbox screenshot', action: 'freeplay' }]
          : []),
      ],
    });
  };

  if (googleReturn) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#140c08',
          color: '#f6efe4',
          fontFamily: 'inherit',
        }}
      >
        Signing you in with Google…
      </div>
    );
  }

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
        settings={settings}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onBackToChat={() => navigate('chat')}
        onRequestGameIdInChat={(gameName) => {
          if (!user || !token) {
            navigate('chat');
            return;
          }
          navigate('chat');
          setActiveThread('concierge');
          handleTriggerAction('game-id', gameName, 'concierge');
        }}
        onSubmitDepositFromPage={handleSubmitDeposit}
        onSubmitWithdrawFromPage={handleSubmitWithdraw}
        onClaimPromoInChat={(title, code) => {
          navigate('chat');
          setActiveThread('concierge');
          handleClaimPromo(title, code);
        }}
        isLoggedIn={Boolean(user && token)}
        onAuthenticate={handleAuthenticate}
      />
    );
  }

  // AUTH GATE -> BUSINESS SUITE CHAT SUPPORT
  if (!user || !token) {
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
      onSubmitFreeplay={handleSubmitFreeplay}
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
