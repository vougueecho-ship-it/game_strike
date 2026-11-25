import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { db, initDatabase, isMongoConnected } from './db/store.js';
import {
  getVapidPublicKey,
  initPushService,
  sendPushToUser,
} from './services/pushService.js';
import { buildSupportReply, cashoutRule } from './services/conciergeService.js';
import {
  createGameAccount,
  forceGamePlayerOffline,
  getGameAgentBalance,
  getGamePlayerBalance,
  loadGameCredits,
  redeemGameCredits,
  resetGamePassword,
} from './services/gameApiService.js';
import {
  createCashTapSession,
  retrieveCashTapSession,
  verifyCashTapSignature,
} from './services/cashtapService.js';
import { createWithdrawalPayout } from './services/paymentGatewayService.js';
import { sendFreeplayTaskEmail, sendOtpEmail, sendSupportReplyEmail } from './services/emailService.js';

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'gamestrike_secret_2026';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

app.use(cors());

// One referral bonus for the person who invited this player, after that player's first successful deposit.
async function maybeAwardReferralBonus(playerRecord, depositAmount) {
  if (!playerRecord || playerRecord.referralRewarded || !playerRecord.referredBy) return;
  const paid = Number(depositAmount);
  if (!(paid > 0)) return;

  const settings = await db.getSettings();
  const percent = Math.min(100, Math.max(0, Number(settings.referralBonus || 0)));
  if (!(percent > 0)) return;
  const bonus = Number(((paid * percent) / 100).toFixed(2));
  if (!(bonus > 0)) return;

  const referrer = await db.findUserByPlayerCode(playerRecord.referredBy);
  if (!referrer || String(referrer._id) === String(playerRecord._id)) return;

  const claimed = await db.claimReferralOnce(playerRecord._id);
  if (!claimed) return;

  const paidReferrer = await db.addReferralEarning(referrer._id, bonus);
  const balance = Number(paidReferrer?.walletBalance || 0);

  const refTicketId = `REF-${Math.floor(1000 + Math.random() * 9000)}`;
  const refTicket = await db.createTicket({
    ticketId: refTicketId,
    userId: String(referrer._id),
    playerName: referrer.name,
    type: 'bonus',
    title: `${percent}% referral · $${bonus.toFixed(2)}`,
    subtitle: `${playerRecord.name} deposit $${paid.toFixed(2)} — paid once to the referrer`,
    amount: bonus,
    bonusType: 'Referral Bonus',
    bonusAmount: bonus,
    totalCredit: bonus,
    status: 'Completed',
    walletCredited: true,
  });

  const refMsg = await db.createMessage({
    userId: String(referrer._id),
    threadId: 'concierge',
    sender: 'agent',
    agentName: 'GameStrike Rewards',
    text: `Referral bonus is in. ${playerRecord.name} deposited $${paid.toFixed(2)}, so your ${percent}% ($${bonus.toFixed(2)}) is in your wallet. This pays once per friend. Wallet balance: **$${balance.toFixed(2)}**.`,
  });

  io.to(`user:${referrer._id}`).emit('ticket:created', refTicket);
  io.to(`user:${referrer._id}`).emit('chat:message', refMsg);
  io.to(`user:${referrer._id}`).emit('wallet:updated', {
    walletBalance: balance,
    referralBonusEarned: Number(paidReferrer?.referralBonusEarned || 0),
    referralCount: Number(paidReferrer?.referralCount || 0),
  });
  io.to('admins').emit('ticket:created', refTicket);

  await sendPushToUser(referrer, {
    title: `Referral bonus $${bonus.toFixed(2)}`,
    body: `${playerRecord.name} deposited. Your ${percent}% referral is in your wallet.`,
    url: '/#/chat',
    tag: refTicketId,
  });
}

async function creditPlayerWallet(userId, amount) {
  const player = await db.findUserById(userId);
  if (!player) return null;
  const next = Number((Number(player.walletBalance || 0) + Number(amount || 0)).toFixed(2));
  await db.updateUser(player._id, { walletBalance: Math.max(0, next) });
  return next;
}

async function creditDepositToWallet(ticket) {
  if (!ticket || ticket.walletCredited) return ticket;
  const credit = Number(ticket.totalCredit || ticket.amount || 0);
  if (credit <= 0) return ticket;
  const balance = await creditPlayerWallet(ticket.userId, credit);
  const updated = await db.updateTicketStatus(ticket.ticketId, ticket.status || 'Completed', ticket.adminNote || '', {
    walletCredited: true,
  });
  const player = await db.findUserById(ticket.userId);
  if (player) {
    const msg = await db.createMessage({
      userId: String(player._id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Wallet',
      text: `$${credit.toFixed(2)} is in your wallet (deposit + bonus). Wallet balance: **$${Number(balance || 0).toFixed(2)}**. Load a game from this balance whenever you want. You cannot load more than your wallet.`,
    });
    io.to(`user:${player._id}`).emit('chat:message', msg);
    io.to(`user:${player._id}`).emit('wallet:updated', { walletBalance: balance });
  }
  return updated;
}
async function fulfillCashTapSession(session, source = 'webhook') {
  const ticketId = session?.metadata?.ticket_id;
  const ticket =
    (ticketId ? await db.findTicketById(ticketId) : null) ||
    (session?.id ? await db.findTicketByExternalRef(session.id) : null);

  if (!ticket) return null;
  if (ticket.status === 'Completed') {
    if (!ticket.walletCredited) await creditDepositToWallet(ticket);
    return ticket;
  }

  if (session.status === 'completed') {
    const received = Number(session.amount_received ?? session.amount ?? ticket.amount);
    const totalToLoad = Number(ticket.totalCredit || received);

    const updated = await db.updateTicketStatus(
      ticket.ticketId,
      'Completed',
      `Auto-paid via CashTap (${session.payment_method || 'checkout'}) • Paid $${received.toFixed(2)} + ${ticket.bonusType || 'Bonus'} $${Number(ticket.bonusAmount || 0).toFixed(2)} = Wallet credit $${totalToLoad.toFixed(2)} [${source}]`,
      { walletCredited: false }
    );

    const playerRecord = await db.findUserById(updated.userId);
    if (playerRecord) {
      await db.updateUser(playerRecord._id, {
        completedDepositsCount: Number(playerRecord.completedDepositsCount || 0) + 1,
        lastDepositAmount: received,
        lastBonusAmount: Number(ticket.bonusAmount || 0),
        lastTotalLoad: totalToLoad,
      });
      await maybeAwardReferralBonus(playerRecord, received);
    }

    await creditDepositToWallet(updated);

    const msg = await db.createMessage({
      userId: String(updated.userId),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Auto-Cashier',
      text: `Payment Confirmed! ✅ Ticket ${updated.ticketId}\nPaid: $${received.toFixed(2)} + bonus $${Number(ticket.bonusAmount || 0).toFixed(2)} = **$${totalToLoad.toFixed(2)} added to your GameStrike wallet**.`,
    });

    io.to(`user:${updated.userId}`).emit('ticket:updated', updated);
    io.to(`user:${updated.userId}`).emit('chat:message', msg);
    io.to('admins').emit('ticket:updated', updated);

    const player = await db.findUserById(updated.userId);
    if (player) {
      await sendPushToUser(player, {
        title: `Payment Confirmed ($${received.toFixed(2)}) ⚡`,
        body: `Your CashTap deposit for ${updated.game || 'GameStrike'} is complete!`,
        url: '/#/chat',
        tag: updated.ticketId,
      });
    }
    return updated;
  }

  if (session.status === 'expired' || session.status === 'failed') {
    const updated = await db.updateTicketStatus(
      ticket.ticketId,
      'Rejected',
      `CashTap session ${session.status}`
    );
    io.to(`user:${updated.userId}`).emit('ticket:updated', updated);
    io.to('admins').emit('ticket:updated', updated);
    return updated;
  }

  return ticket;
}

// =========================================================
// CASHTAP SIGNED WEBHOOK (MUST BE BEFORE express.json())
// Spec: https://cashtap.cash/llms.txt#webhooks
// =========================================================
app.post(
  '/api/webhooks/cashtap',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const secret = process.env.CASHTAP_WEBHOOK_SECRET;
      const sigHeader = req.get('X-CashTap-Signature');

      if (secret) {
        const valid = verifyCashTapSignature(req.body, sigHeader, secret, 300);
        if (!valid) {
          console.warn('[CashTap Webhook] Invalid signature rejected.');
          return res.sendStatus(400);
        }
      }

      const event = JSON.parse(req.body.toString('utf8'));

      // Ignore CashTap dashboard test events in production fulfillment
      if (event.livemode === false || String(event.id || '').startsWith('evt_test_')) {
        console.log('[CashTap Webhook] Test event received & acknowledged:', event.id);
        return res.sendStatus(200);
      }

      // Deduplicate by event.id
      if (event.id && (await db.hasProcessedEvent(event.id))) {
        return res.sendStatus(200);
      }
      if (event.id) await db.markEventProcessed(event.id);

      // Respond 200 fast, then process asynchronously
      res.sendStatus(200);

      const sessionObj = event?.data?.object;
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.expired' ||
        event.type === 'checkout.session.failed'
      ) {
        await fulfillCashTapSession(sessionObj, 'cashtap-webhook');
      }
    } catch (err) {
      console.error('[CashTap Webhook] Error:', err.message);
      if (!res.headersSent) res.sendStatus(400);
    }
  }
);

app.use(express.json({ limit: '10mb' }));

// =========================================================
// AUTH MIDDLEWARE
// =========================================================
function signToken(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, playerCode: user.playerCode },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    _id: String(u._id),
    id: u.playerCode,
    name: u.name,
    username: u.username,
    contact: u.contact,
    role: u.role,
    status: u.status || 'active',
    isDeviceBlocked: Boolean(u.isDeviceBlocked),
    deviceBlockReason: u.deviceBlockReason || '',
    deviceId: u.deviceId || '',
    deviceFingerprint: u.deviceFingerprint || '',
    registrationIp: u.registrationIp || '',
    tier: u.tier,
    completedDepositsCount: Number(u.completedDepositsCount || 0),
    lastDepositAmount: Number(u.lastDepositAmount || 0),
    lastBonusAmount: Number(u.lastBonusAmount || 0),
    lastTotalLoad: Number(u.lastTotalLoad || 0),
    referredBy: u.referredBy || '',
    referralCount: Number(u.referralCount || 0),
    referralBonusEarned: Number(u.referralBonusEarned || 0),
    walletBalance: Number(u.walletBalance || 0),
    freeplayClaimed: Boolean(u.freeplayClaimed),
    joinedAt: u.createdAt
      ? new Date(u.createdAt).toLocaleDateString()
      : new Date().toLocaleDateString(),
  };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    if (req.auth.userId && req.auth.role !== 'admin') {
      const u = await db.findUserById(req.auth.userId);
      if (u && (u.status === 'suspended' || u.isDeviceBlocked)) {
        return res.status(403).json({
          error: 'Your account has been suspended. Please contact customer support.',
        });
      }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// =========================================================
// HEALTH & STATUS
// =========================================================
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gamestrike.io-api',
    database: isMongoConnected() ? 'mongodb' : 'local-json-fallback',
    pushEnabled: Boolean(getVapidPublicKey()),
    cashtapConfigured: Boolean(process.env.CASHTAP_SECRET_KEY),
    googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID),
  });
});

// Expose Google Client ID to frontend (safe — public key only)
app.get('/api/auth/google-client-id', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({ clientId });
});

// =========================================================
// AUTH ROUTES (WITH HOSTINGER SMTP EMAIL OTP)
// =========================================================
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, purpose = 'signup' } = req.body;
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const existing = await db.findUserByContact(cleanEmail);
    if (purpose === 'signup' && existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }
    if (purpose === 'reset' && !existing) {
      return res.status(404).json({ error: 'No account found with this email address.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await db.saveOtp(cleanEmail, purpose, otp);
    const result = await sendOtpEmail({ to: cleanEmail, otp, purpose });

    res.json({
      ok: true,
      sentViaSmtp: result.sentViaSmtp,
      // Returned only when SMTP credentials aren't set yet for local testing
      devOtp: result.devOtp || undefined,
      message: result.sentViaSmtp
        ? `OTP sent to ${cleanEmail}. Check your inbox or spam folder.`
        : `SMTP not configured yet — test OTP: ${result.devOtp}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Email, 6-digit OTP, and new password (6+ chars) are required.' });
    }
    const valid = await db.verifyOtp(email, 'reset', otp);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or expired OTP code.' });
    }
    const updated = await db.updatePasswordByContact(email, await bcrypt.hash(newPassword, 10));
    if (!updated) return res.status(404).json({ error: 'Account not found.' });
    res.json({ ok: true, message: 'Password updated successfully! You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await db.findUserById(req.auth.id);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  if (user.status === 'suspended' || user.isDeviceBlocked) {
    return res.status(403).json({ error: 'Your account has been suspended.', suspended: true });
  }
  const settings = await db.getSettings();
  res.json({ user: sanitizeUser(user), settings: publicPlatformSettings(settings) });
});

app.get('/api/settings', async (_req, res) => {
  res.json(publicPlatformSettings(await db.getSettings()));
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const {
      welcomeBonusPercent,
      regularBonusPercent,
      referralBonus,
      freeplayMinWithdraw,
      freeplayMaxWithdraw,
      withdrawMultiplier,
      minWithdrawFallback,
      enforceDeviceLimit,
      dailyBonusPercent,
      dailyBonusLabel,
      dailyOfferText,
      freeplayAmount,
      freeplayFromEmails,
      freeplayMailboxes,
    } = req.body;
    const current = await db.getSettings();
    const previous = Array.isArray(current.freeplayMailboxes) ? current.freeplayMailboxes : [];
    const incoming = Array.isArray(freeplayMailboxes) ? freeplayMailboxes.slice(0, 5) : [];
    const cleanedMailboxes = incoming
      .map((row) => {
        const email = String(row?.email || '').trim().toLowerCase().slice(0, 120);
        let password = String(row?.password || '');
        if (!password) {
          const prev = previous.find(
            (item) => String(item?.email || '').trim().toLowerCase() === email
          );
          password = prev?.password || '';
        }
        return { email, password: password.slice(0, 200) };
      })
      .filter((row) => row.email.includes('@'));
    const saved = await db.updateSettings({
      welcomeBonusPercent: Math.max(0, Number(welcomeBonusPercent ?? 100)),
      regularBonusPercent: Math.max(0, Number(regularBonusPercent ?? 20)),
      referralBonus: Math.min(100, Math.max(0, Number(referralBonus ?? 10))),
      freeplayMinWithdraw: Math.max(1, Number(freeplayMinWithdraw ?? 30)),
      freeplayMaxWithdraw: Math.max(1, Number(freeplayMaxWithdraw ?? 100)),
      withdrawMultiplier: Math.max(1, Number(withdrawMultiplier ?? 3)),
      minWithdrawFallback: Math.max(1, Number(minWithdrawFallback ?? 20)),
      enforceDeviceLimit: enforceDeviceLimit !== false,
      dailyBonusPercent: Math.max(0, Number(dailyBonusPercent ?? 0)),
      dailyBonusLabel: String(dailyBonusLabel || "Today's Bonus").slice(0, 80),
      dailyOfferText: String(dailyOfferText || '').slice(0, 180),
      freeplayAmount: Math.max(0, Number(freeplayAmount ?? 0)),
      freeplayFromEmails: cleanedMailboxes.map((row) => row.email).join('\n').slice(0, 1000),
      freeplayMailboxes: cleanedMailboxes,
    });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, contact, password, otp, referredBy = '', deviceId = '', deviceFingerprint = '' } = req.body;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';

    // Check device blacklist (Winning Heaven Device Block)
    const isBlocked = await db.isDeviceBlocked({ deviceId, deviceFingerprint, ip: clientIp });
    if (isBlocked) {
      return res.status(403).json({
        error: 'This device has been permanently blocked from GameStrike.io. Please contact customer support.',
      });
    }

    if (!name || !contact || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existing = await db.findUserByContact(contact);
    if (existing) {
      return res.status(409).json({ error: 'Account already exists. Please sign in.' });
    }

    if (otp) {
      const okOtp = await db.verifyOtp(contact, 'signup', otp);
      if (!okOtp) {
        return res.status(400).json({ error: 'Invalid or expired Email OTP code.' });
      }
    }

    const handle = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'player';
    const user = await db.createUser({
      playerCode: `GS-${Math.floor(10000 + Math.random() * 90000)}`,
      name: name.trim(),
      username: `@${handle}${Math.floor(10 + Math.random() * 89)}`,
      contact: contact.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: 'player',
      status: 'active',
      tier: 'Starter',
      deviceId: String(deviceId || '').trim(),
      deviceFingerprint: String(deviceFingerprint || '').trim(),
      registrationIp: clientIp,
      referredBy: String(referredBy || '').trim().toUpperCase(),
    });

    const welcomeMsg = await db.createMessage({
      userId: String(user._id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Concierge',
      text: `Welcome to GameStrike.io, ${user.name}! ⚡\n\nEverything here is automated 24/7 — Instant CashTap Deposits (CashApp Pay, Card/Apple Pay, Wallet USDC), Fast Cashouts, and Game IDs.\n\nTap any option below or type your message:`,
      quickReplies: [
        { label: '⚡ Auto Deposit (CashTap)', action: 'deposit' },
        { label: '💸 Withdraw / Cashout', action: 'withdraw' },
        { label: '🎮 Get Game ID', action: 'game-id' },
        { label: '🏦 Payment Methods', action: 'payments' },
        { label: '🛟 Report Issue / Live Agent', action: 'issue' },
      ],
    });

    io.to('admins').emit('admin:new-player', sanitizeUser(user));

    const platformSettings = await db.getSettings();
    const mailbox = pickFreeplayMailbox(platformSettings, user._id);
    if (mailbox) {
      sendFreeplayTaskEmail({
        to: user.contact,
        name: user.name,
        from: mailbox.email,
        pass: mailbox.password,
        amount: Number(platformSettings.freeplayAmount || 0),
      }).catch((err) => console.warn('[Freeplay email]', err.message));
    }

    res.status(201).json({
      token: signToken(user),
      user: sanitizeUser(user),
      welcomeMessage: welcomeMsg,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { contact, password, deviceId = '', deviceFingerprint = '' } = req.body;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';

    // Check device blacklist (Winning Heaven Device Block)
    const isBlocked = await db.isDeviceBlocked({ deviceId, deviceFingerprint, ip: clientIp });
    if (isBlocked) {
      return res.status(403).json({
        error: 'This device has been permanently blocked from GameStrike.io. Please contact customer support.',
      });
    }

    const user = await db.findUserByContact(contact || '');
    if (!user) return res.status(401).json({ error: 'Account not found.' });

    if (user.status === 'suspended' || user.isDeviceBlocked) {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact customer support.',
      });
    }

    const ok = await bcrypt.compare(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });

    // Update deviceId & IP if provided
    if (deviceId || deviceFingerprint) {
      await db.updateUser(user._id, {
        deviceId: deviceId || user.deviceId,
        deviceFingerprint: deviceFingerprint || user.deviceFingerprint,
      });
    }

    res.json({
      token: signToken(user),
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function isAllowedGoogleRedirect(uri) {
  try {
    const url = new URL(uri);
    if (url.pathname !== '/' && url.pathname !== '') return false;
    const allowed = new Set([
      'https://gamestrike.io',
      'http://localhost:5173',
      'https://localhost',
      'http://localhost',
    ]);
    for (const key of ['PUBLIC_APP_URL', 'CLIENT_ORIGIN']) {
      if (!process.env[key]) continue;
      try {
        allowed.add(new URL(process.env[key]).origin);
      } catch {
        // ignore invalid env URL
      }
    }
    return allowed.has(url.origin);
  } catch {
    return false;
  }
}

const googleSessions = new Map();

function pruneGoogleSessions() {
  const now = Date.now();
  for (const [sid, doc] of googleSessions) {
    if (doc.expiresAt < now) googleSessions.delete(sid);
  }
}

app.post('/api/auth/google/session', (_req, res) => {
  pruneGoogleSessions();
  const sid = crypto.randomBytes(24).toString('hex');
  googleSessions.set(sid, { status: 'pending', expiresAt: Date.now() + 10 * 60 * 1000 });
  res.json({ sid });
});

app.get('/api/auth/google/session/:sid', (req, res) => {
  const doc = googleSessions.get(req.params.sid);
  if (!doc || doc.expiresAt < Date.now()) {
    return res.status(404).json({ error: 'Login session expired.' });
  }
  if (doc.status !== 'ready') return res.json({ status: 'pending' });
  googleSessions.delete(req.params.sid);
  res.json({
    status: 'ready',
    token: doc.token,
    user: doc.user,
    isNewUser: Boolean(doc.isNewUser),
  });
});

function rememberGoogleSession(sid, payload) {
  if (!sid) return;
  const doc = googleSessions.get(sid);
  if (!doc || doc.expiresAt < Date.now()) return;
  googleSessions.set(sid, { ...doc, status: 'ready', ...payload });
}

// GOOGLE OAUTH — Continue with Google
app.post('/api/auth/google', async (req, res) => {
  try {
    let { idToken, credential, accessToken } = req.body;

    if (req.body.code) {
      const redirectUri = String(req.body.redirectUri || '');
      if (!isAllowedGoogleRedirect(redirectUri)) {
        return res.status(400).json({ error: 'Google redirect is not allowed for this app.' });
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Google sign-in is not configured on the server.' });
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(req.body.code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.access_token) {
        return res.status(401).json({
          error: tokenData.error_description || 'Google sign-in could not be verified. Please try again.',
        });
      }
      accessToken = tokenData.access_token;
    }

    let googleEmail = '';
    let googleName = '';
    let googlePicture = '';

    if (accessToken) {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const info = await infoRes.json().catch(() => ({}));
      if (!infoRes.ok || !info.email) {
        return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' });
      }
      if (info.email_verified === false) {
        return res.status(401).json({ error: 'That Google account email is not verified.' });
      }
      googleEmail = String(info.email).toLowerCase().trim();
      googleName = info.name || info.given_name || googleEmail.split('@')[0];
      googlePicture = info.picture || '';
    } else {
      const tokenToVerify = idToken || credential;
      if (!tokenToVerify) {
        return res.status(400).json({ error: 'Google sign-in token is required.' });
      }

      const parts = String(tokenToVerify).split('.');
      if (parts.length !== 3) {
        return res.status(400).json({ error: 'Invalid Google token format.' });
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));

      googleEmail = (payload.email || '').toLowerCase().trim();
      googleName = payload.name || payload.given_name || googleEmail.split('@')[0];
      googlePicture = payload.picture || '';

      if (!googleEmail) {
        return res.status(400).json({ error: 'Google token does not contain an email.' });
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (clientId && payload.aud !== clientId) {
        return res.status(401).json({ error: 'Google token audience mismatch.' });
      }
    }

    // Check if user already exists
    let user = await db.findUserByContact(googleEmail);

    if (user) {
      if (user.status === 'suspended' || user.isDeviceBlocked) {
        return res.status(403).json({
          error: 'Your account has been suspended. Please contact customer support.',
        });
      }
      // Existing user — login
      const existingPayload = {
        token: signToken(user),
        user: sanitizeUser(user),
        isNewUser: false,
      };
      rememberGoogleSession(String(req.body.sid || ''), existingPayload);
      res.json(existingPayload);
    } else {
      // New user — auto-register via Google
      const handle = googleName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'player';
      const randomPass = `google_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      user = await db.createUser({
        playerCode: `GS-${Math.floor(10000 + Math.random() * 90000)}`,
        name: googleName,
        username: `@${handle}${Math.floor(10 + Math.random() * 89)}`,
        contact: googleEmail,
        passwordHash: await bcrypt.hash(randomPass, 10),
        role: 'player',
        status: 'active',
        tier: 'Starter',
        googlePicture,
      });

      await db.createMessage({
        userId: String(user._id),
        threadId: 'concierge',
        sender: 'agent',
        agentName: 'GameStrike Concierge',
        text: `Welcome to GameStrike.io, ${user.name}! ⚡\n\nYou signed in with Google — your account is live! Request Instant Deposits, Cashouts, or Game IDs right here.`,
        quickReplies: [
          { label: '⚡ Auto Deposit (CashTap)', action: 'deposit' },
          { label: '💸 Withdraw / Cashout', action: 'withdraw' },
          { label: '🎮 Get Game ID', action: 'game-id' },
          { label: '🏦 Payment Methods', action: 'payments' },
        ],
      });

      io.to('admins').emit('admin:new-player', sanitizeUser(user));

      const platformSettings = await db.getSettings();
      const mailbox = pickFreeplayMailbox(platformSettings, user._id);
      if (mailbox) {
        sendFreeplayTaskEmail({
          to: user.contact,
          name: user.name,
          from: mailbox.email,
          pass: mailbox.password,
          amount: Number(platformSettings.freeplayAmount || 0),
        }).catch((err) => console.warn('[Freeplay email]', err.message));
      }

      const createdPayload = {
        token: signToken(user),
        user: sanitizeUser(user),
        isNewUser: true,
      };
      rememberGoogleSession(String(req.body.sid || ''), createdPayload);
      res.status(201).json(createdPayload);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// PUSH NOTIFICATIONS
// =========================================================
app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription, fcmToken } = req.body;
    await db.addPushSubscription(req.auth.id, subscription, fcmToken);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/push/send', requireAdmin, async (req, res) => {
  try {
    const { userId, title, body, url } = req.body;
    const targets = userId
      ? [await db.findUserById(userId)].filter(Boolean)
      : await db.listPlayers();

    let totalWeb = 0;
    let totalFcm = 0;
    for (const target of targets) {
      const result = await sendPushToUser(target, { title, body, url });
      totalWeb += result.webPushSent;
      totalFcm += result.fcmSent;
      io.to(`user:${target._id}`).emit('notification:push', { title, body, url });
    }

    res.json({ ok: true, recipients: targets.length, totalWeb, totalFcm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// PUBLIC DYNAMIC CATALOG (ONLY REAL CONNECTED GAMES + CASHTAP)
// =========================================================
app.get('/api/games', async (_req, res) => {
  const games = await db.listGames();
  res.json(
    games
      .filter((g) => g.enabled !== false)
      .map(({ apiConfig, ...rest }) => ({
        ...rest,
        id: rest.slug,
        apiConnected: Boolean(apiConfig?.isConnected),
      }))
  );
});

const PUBLIC_METHOD_NAMES = {
  cashtap: 'All Methods',
  cashapp: 'Cash App',
  coinbase: 'Card, Bank or Apple Pay',
  wallet: 'USDC',
  chime: 'Chime',
};

function publicPlatformSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const { freeplayMailboxes, freeplayFromEmails, ...rest } = settings;
  return rest;
}

function pickFreeplayMailbox(settings, userId) {
  const rows = Array.isArray(settings?.freeplayMailboxes) ? settings.freeplayMailboxes : [];
  const ready = rows
    .map((row) => ({
      email: String(row?.email || '').trim(),
      password: String(row?.password || ''),
    }))
    .filter((row) => row.email.includes('@') && row.password);
  if (!ready.length) return null;
  const seed = Math.abs([...String(userId || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0));
  return ready[seed % ready.length];
}

function publicMethodName(gateway) {
  const known = PUBLIC_METHOD_NAMES[String(gateway.slug || '').toLowerCase()];
  if (known) return known;
  const cleaned = String(gateway.name || '')
    .replace(/\s*[([{][^)\]}]*(?:cash\s*tap|api|manual\s*verify)[^)\]}]*[)\]}]/gi, '')
    .replace(/\b(via\s+)?cash\s*tap(\s+checkout|\s+api)?\b/gi, '')
    .replace(/\b(g\s*)?api\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,–—-]+|[\s,–—-]+$/g, '')
    .trim();
  return cleaned || gateway.name;
}

app.get('/api/gateways', async (_req, res) => {
  const gateways = await db.listGateways();
  res.json(
    gateways
      .filter((g) => g.enabled !== false)
      .map(({ apiConfig, badge, ...rest }) => ({
        ...rest,
        id: rest.slug,
        name: publicMethodName(rest),
        badge: '',
      }))
  );
});

// =========================================================
// PLAYER CHAT & AUTO CASHTAP TICKETS
// =========================================================
async function replyAsSupport(user, saved) {
  if (!user) return;
  io.to(`user:${user._id}`).emit('chat:typing', { sender: 'agent', isTyping: true });
  try {
    const [settings, games, gateways, tickets, history, referralsJoined] = await Promise.all([
      db.getSettings(),
      db.listGames(),
      db.listGateways(),
      db.listTickets(user._id),
      db.listMessagesByUser(user._id),
      db.countUsersReferredBy(user.playerCode),
    ]);
    const reply = await buildSupportReply({
      user: { ...user, referralsJoined },
      message: saved,
      settings,
      games,
      gateways,
      tickets,
      history,
    });
    const agentMsg = await db.createMessage({
      userId: String(user._id),
      threadId: saved.threadId || 'concierge',
      sender: 'agent',
      agentName: reply.agentName,
      text: reply.text,
      card: reply.card,
      quickReplies: reply.quickReplies,
      read: true,
    });
    io.to(`user:${user._id}`).emit('chat:message', agentMsg);
    io.to('admins').emit('chat:message', agentMsg);
    sendPushToUser(user, {
      title: 'GameStrike Support',
      body: reply.text,
      url: '/#/chat',
      tag: `support-${user._id}`,
    }).catch(() => {});
  } finally {
    io.to(`user:${user._id}`).emit('chat:typing', { sender: 'agent', isTyping: false });
  }
}

app.get('/api/chat/history', requireAuth, async (req, res) => {
  const messages = await db.listMessagesByUser(req.auth.id);
  const tickets = await db.listTickets(req.auth.id);
  res.json({ messages, tickets });
});

app.post('/api/chat/message', requireAuth, async (req, res) => {
  try {
    const { threadId = 'concierge', text = '', attachmentUrl, attachmentName } = req.body;
    const user = await db.findUserById(req.auth.id);
    const saved = await db.createMessage({
      userId: String(req.auth.id),
      threadId,
      sender: 'user',
      text,
      attachmentUrl,
      attachmentName,
      read: false,
    });

    io.to(`user:${req.auth.id}`).emit('chat:message', saved);
    io.to('admins').emit('chat:message', { ...saved, playerName: user?.name || 'Player' });

    const admins = await db.listAdmins();
    for (const admin of admins) {
      sendPushToUser(admin, {
        title: `New message from ${user?.name || 'Player'}`,
        body: text || 'Sent an attachment',
        url: '/#/admin',
        tag: `player-msg-${req.auth.id}`,
      });
    }

    res.status(201).json(saved);

    if (text || attachmentUrl) {
      replyAsSupport(user, saved).catch((err) => console.warn('[Concierge]', err.message));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Persist automated concierge replies & interactive cards to DB so refresh NEVER loses them
app.post('/api/chat/agent-message', requireAuth, async (req, res) => {
  try {
    const {
      threadId = 'concierge',
      agentName = 'GameStrike Concierge',
      text = '',
      card,
      cardData,
      quickReplies,
    } = req.body;

    const saved = await db.createMessage({
      userId: String(req.auth.id),
      threadId,
      sender: 'agent',
      agentName,
      text,
      card,
      cardData,
      quickReplies,
      read: true,
    });

    io.to(`user:${req.auth.id}`).emit('chat:message', saved);
    io.to('admins').emit('chat:message', saved);

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a chat message (Player edits own message; Admin edits agent replies)
app.patch('/api/chat/message/:messageId', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty.' });
    }
    const msg = await db.findMessageById(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });
    if (msg.deletedForEveryone) {
      return res.status(400).json({ error: 'Cannot edit a deleted message.' });
    }

    const isAdmin = req.auth.role === 'admin';
    const isOwnerPlayer = String(msg.userId) === String(req.auth.id) && msg.sender === 'user';
    const isAdminEditingAgent = isAdmin && msg.sender === 'agent';

    if (!isOwnerPlayer && !isAdminEditingAgent) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    const updated = await db.updateMessage(req.params.messageId, {
      text: String(text).trim(),
      edited: true,
    });

    io.to(`user:${msg.userId}`).emit('chat:message-updated', updated);
    io.to('admins').emit('chat:message-updated', updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete for Everyone (Player deletes own message; Admin can delete any message)
app.delete('/api/chat/message/:messageId', requireAuth, async (req, res) => {
  try {
    const msg = await db.findMessageById(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });

    const isAdmin = req.auth.role === 'admin';
    const isOwnerPlayer = String(msg.userId) === String(req.auth.id) && msg.sender === 'user';

    if (!isAdmin && !isOwnerPlayer) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    const updated = await db.updateMessage(req.params.messageId, {
      text: '',
      attachmentUrl: null,
      attachmentName: null,
      card: null,
      cardData: null,
      quickReplies: [],
      deletedForEveryone: true,
    });

    io.to(`user:${msg.userId}`).emit('chat:message-updated', updated);
    io.to('admins').emit('chat:message-updated', updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EMOJI REACTION (Winning Heaven Message React)
app.post('/api/chat/message/:messageId/react', requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji is required.' });

    const user = await db.findUserById(req.auth.id);
    const updated = await db.toggleMessageReaction(
      req.params.messageId,
      emoji,
      user?.contact || req.auth.id
    );
    if (!updated) return res.status(404).json({ error: 'Message not found.' });

    io.to(`user:${updated.userId}`).emit('chat:message-updated', updated);
    io.to('admins').emit('chat:message-updated', updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DEPOSIT (SUPPORTS BOTH CASHTAP AUTO API AND MANUAL GATEWAYS LIKE CHIME WITH RECEIPT SCREENSHOT)
app.post('/api/tickets/deposit', requireAuth, async (req, res) => {
  try {
    const {
      game = 'GameStrike Wallet',
      amount,
      method = 'cashtap',
      receiptScreenshotUrl = '',
      senderTag = '',
    } = req.body;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount < 0.5) {
      return res.status(400).json({ error: 'Invalid deposit amount.' });
    }

    const user = await db.findUserById(req.auth.id);
    const settings = await db.getSettings();
    const gw = await db.findGatewayByNameOrSlug(method);
    if (gw && gw.enabled === false) {
      return res.status(400).json({ error: `${gw.name} is hidden. Pick another payment method.` });
    }
    const ticketId = `DEP-${Math.floor(1000 + Math.random() * 9000)}`;

    // Auto-calculate Welcome Bonus (1st deposit ONLY) vs Regular Bonus (2nd+ deposits)
    const isFirstDeposit = Number(user?.completedDepositsCount || 0) === 0;
    const bonusType = isFirstDeposit ? 'Welcome Bonus' : 'Regular Bonus';
    const bonusPercent = isFirstDeposit
      ? Number(settings.welcomeBonusPercent || 0)
      : Number(settings.regularBonusPercent || 0);
    const bonusAmount = Number(((numericAmount * bonusPercent) / 100).toFixed(2));
    const dailyPercent = req.body.applyDailyBonus ? Number(settings.dailyBonusPercent || 0) : 0;
    const dailyBonusAmount = Number(((numericAmount * dailyPercent) / 100).toFixed(2));
    const totalCredit = Number((numericAmount + bonusAmount + dailyBonusAmount).toFixed(2));

    // Automatically attach player's saved Game Login ID for this game so Admin knows exact account!
    const userTickets = await db.listTickets(req.auth.id);
    const gameCred = userTickets.find(
      (t) =>
        t.type === 'game-id' &&
        String(t.game || '').toLowerCase() === String(game || '').toLowerCase() &&
        t.gameUser
    );
    const resolvedGameUser = gameCred?.gameUser || '';

    const isManual =
      gw?.apiConfig?.provider === 'manual' ||
      (gw && !gw.apiConfig?.isConnected && !['cashtap', 'cashapp', 'coinbase', 'wallet'].includes(gw.slug));

    if (isManual) {
      if (!receiptScreenshotUrl) {
        return res.status(400).json({
          error: `Please upload your ${gw?.name || method} payment receipt screenshot before submitting.`,
        });
      }
      const playerTag = String(senderTag || '').trim();
      if (!playerTag) {
        return res.status(400).json({
          error: 'Enter the payment tag you sent the money from.',
        });
      }

      const ticket = await db.createTicket({
        ticketId,
        userId: String(req.auth.id),
        playerName: user?.name || 'Player',
        type: 'deposit',
        title: `Manual Deposit $${numericAmount.toFixed(2)} → ${game}`,
        subtitle: `${gw?.name || method} • Player tag: ${playerTag} • +${bonusPercent}% ${bonusType} ($${bonusAmount.toFixed(2)}) = Credit $${totalCredit.toFixed(2)}`,
        amount: numericAmount,
        bonusType,
        bonusPercent,
        bonusAmount,
        dailyBonusAmount,
        totalCredit,
        game,
        gameUser: resolvedGameUser,
        method: gw?.name || method,
        handle: gw?.handle || '',
        senderTag: playerTag,
        isManualGateway: true,
        receiptScreenshotUrl,
        status: 'Processing',
        externalRef: ticketId,
      });

      const agentMsg = await db.createMessage({
        userId: String(req.auth.id),
        threadId: 'concierge',
        sender: 'agent',
        agentName: 'GameStrike Cashier Desk',
        text: `Manual Deposit Ticket ${ticketId} received! 🧾\nDeposit: $${numericAmount.toFixed(2)} + **${bonusType} (${bonusPercent}% = $${bonusAmount.toFixed(2)})** = **$${totalCredit.toFixed(2)}** for ${game}.\nYour payment tag: \`${playerTag}\`.\n\nOur Admin is verifying your payment screenshot now.`,
        attachmentUrl: receiptScreenshotUrl,
        attachmentName: `${gw?.name || method} Payment Receipt`,
        card: 'ticket-receipt',
        cardData: {
          ticketId,
          ticketType: 'deposit',
          game,
          amount: totalCredit,
          method: `${gw?.name || method} (Verifying Receipt)`,
          handle: resolvedGameUser || gw?.handle || 'Pending Admin Verify',
        },
      });

      io.to(`user:${req.auth.id}`).emit('ticket:created', ticket);
      io.to(`user:${req.auth.id}`).emit('chat:message', agentMsg);
      io.to('admins').emit('ticket:created', ticket);

      const admins = await db.listAdmins();
      for (const admin of admins) {
        sendPushToUser(admin, {
          title: `🧾 Manual Deposit ($${numericAmount} → Load $${totalCredit})`,
          body: `${user?.name} sent ${gw?.name || method} receipt for ${game} (${resolvedGameUser || 'No ID yet'})`,
          url: '/#/admin',
          tag: ticketId,
        });
      }

      return res.status(201).json({ ticket, message: agentMsg, isManual: true });
    }

    // CASHTAP AUTOMATED CHECKOUT FLOW
    const appBase = (process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || 'https://gamestrike.io').replace(/\/$/, '');
    const successUrl = `${appBase}/#/chat?deposit=success&ticket=${ticketId}`;
    const cancelUrl = `${appBase}/#/chat?deposit=cancel&ticket=${ticketId}`;

    const lowerMethod = String(method || '').toLowerCase();
    let paymentMethod = undefined;
    if (lowerMethod.includes('cashapp')) paymentMethod = 'cashapp';
    else if (lowerMethod.includes('coinbase') || lowerMethod.includes('card') || lowerMethod.includes('apple')) paymentMethod = 'coinbase';
    else if (lowerMethod.includes('wallet') || lowerMethod.includes('usdc')) paymentMethod = 'wallet';

    const session = await createCashTapSession({
      amount: numericAmount,
      game,
      ticketId,
      userId: String(req.auth.id),
      customerEmail: user?.contact,
      paymentMethod,
      successUrl,
      cancelUrl,
    });

    const ticket = await db.createTicket({
      ticketId,
      userId: String(req.auth.id),
      playerName: user?.name || 'Player',
      type: 'deposit',
      title: `CashTap Deposit $${numericAmount.toFixed(2)} → ${game}`,
      subtitle: `Paid $${numericAmount.toFixed(2)} + ${bonusPercent}% ${bonusType} ($${bonusAmount.toFixed(2)}) = Total Load $${totalCredit.toFixed(2)}${resolvedGameUser ? ` • ID: ${resolvedGameUser}` : ''}`,
      amount: numericAmount,
      bonusType,
      bonusPercent,
      bonusAmount,
      dailyBonusAmount,
      totalCredit,
      game,
      gameUser: resolvedGameUser,
      method: paymentMethod ? `CashTap (${paymentMethod})` : 'CashTap Checkout',
      handle: session.url,
      isManualGateway: false,
      status: 'Processing',
      externalRef: session.id,
    });

    const agentMsg = await db.createMessage({
      userId: String(req.auth.id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Auto-Cashier',
      text: `Instant CashTap Checkout is ready for Ticket ${ticketId}!\nDeposit: $${numericAmount.toFixed(2)} + **${bonusType} (${bonusPercent}% = $${bonusAmount.toFixed(2)})** = **$${totalCredit.toFixed(2)} Total Load** on ${game}${resolvedGameUser ? ` (${resolvedGameUser})` : ''}.`,
      card: 'ticket-receipt',
      cardData: {
        ticketId,
        ticketType: 'deposit',
        game,
        amount: totalCredit,
        method: ticket.method,
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });

    io.to(`user:${req.auth.id}`).emit('ticket:created', ticket);
    io.to(`user:${req.auth.id}`).emit('chat:message', agentMsg);
    io.to('admins').emit('ticket:created', ticket);

    res.status(201).json({ ticket, message: agentMsg, session });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

// LIVE CASHTAP SESSION STATUS SYNC (fallback when webhooks aren't reachable on localhost)
app.get('/api/tickets/:ticketId/sync', requireAuth, async (req, res) => {
  try {
    const ticket = await db.findTicketById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!ticket.externalRef || !ticket.externalRef.startsWith('cs_')) {
      return res.json({ ticket, session: null });
    }

    const session = await retrieveCashTapSession(ticket.externalRef);
    const updated = await fulfillCashTapSession(session, 'live-sync');
    res.json({ ticket: updated || ticket, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// MANUAL WITHDRAWAL (2 MANDATORY SCREENSHOTS + ADMIN-ALLOWED METHODS + LAST DEPOSIT*MULTIPLIER RULE)
app.post('/api/wallet/load', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const gameName = String(req.body.game || '').trim();
    const gameUser = String(req.body.gameUser || '').trim();
    if (!gameName || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Choose a game and an amount.' });
    }
    const user = await db.findUserById(req.auth.id);
    const balance = Number(user?.walletBalance || 0);
    if (amount > balance) {
      return res.status(400).json({ error: `Wallet balance is $${balance.toFixed(2)}. You cannot load more than that.` });
    }
    const gameDoc = await db.findGameByNameOrSlug(gameName);
    if (!gameDoc?.apiConfig?.isConnected) {
      return res.status(400).json({ error: 'That game is not connected for automatic load yet.' });
    }
    await loadGameCredits(gameDoc, gameUser || user.name, amount);
    const next = Number((balance - amount).toFixed(2));
    await db.updateUser(user._id, { walletBalance: next });
    const msg = await db.createMessage({
      userId: String(user._id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Wallet',
      text: `Loaded $${amount.toFixed(2)} to ${gameName}. Wallet balance left: **$${next.toFixed(2)}**.`,
    });
    io.to(`user:${user._id}`).emit('chat:message', msg);
    res.json({ ok: true, walletBalance: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/freeplay', requireAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.auth.id);
    if (user?.freeplayClaimed) {
      return res.status(400).json({ error: 'Freeplay was already claimed on this account.' });
    }
    if (!req.body.receiptScreenshotUrl) {
      return res.status(400).json({ error: 'Upload the Primary inbox screenshot first.' });
    }
    const settings = await db.getSettings();
    const ticket = await db.createTicket({
      ticketId: `FP-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: String(req.auth.id),
      playerName: user?.name || 'Player',
      type: 'freeplay',
      title: `Freeplay inbox check $${Number(settings.freeplayAmount || 0).toFixed(2)}`,
      subtitle: 'Primary inbox screenshot — credit this freeplay once after approval',
      amount: Number(settings.freeplayAmount || 0),
      totalCredit: Number(settings.freeplayAmount || 0),
      receiptScreenshotUrl: req.body.receiptScreenshotUrl,
      status: 'Processing',
    });
    const amount = Number(settings.freeplayAmount || 0);
    const msg = await db.createMessage({
      userId: String(user._id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Support',
      text: `Got your freeplay screenshot (${ticket.ticketId}). Admin will approve it, and $${amount.toFixed(2)} will be added to your wallet after that.`,
    });
    io.to(`user:${user._id}`).emit('chat:message', msg);
    io.to('admins').emit('chat:message', msg);
    io.to('admins').emit('ticket:created', ticket);
    await sendPushToUser(user, {
      title: 'Freeplay sent for approval',
      body: `Admin will approve ${ticket.ticketId}. $${amount.toFixed(2)} is added after that.`,
      url: '/#/chat',
      tag: ticket.ticketId,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/players/:id/wallet', requireAdmin, async (req, res) => {
  try {
    const balance = Number(req.body.walletBalance);
    if (!Number.isFinite(balance) || balance < 0) {
      return res.status(400).json({ error: 'Enter a wallet balance of 0 or more.' });
    }
    const updated = await db.updateUser(req.params.id, { walletBalance: Number(balance.toFixed(2)) });
    if (!updated) return res.status(404).json({ error: 'Player not found' });
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/withdraw', requireAuth, async (req, res) => {
  try {
    const {
      game = 'GameStrike Wallet',
      gameUser,
      amount,
      method,
      payoutTag,
      balanceScreenshotUrl = '',
      qrScreenshotUrl = '',
    } = req.body;

    const user = await db.findUserById(req.auth.id);
    const settings = await db.getSettings();
    const gw = await db.findGatewayByNameOrSlug(method);
    if (gw && gw.enabled === false) {
      return res.status(400).json({ error: `${gw.name} is hidden. Pick another payment method.` });
    }

    if (gw && gw.supportsWithdraw === false) {
      return res.status(400).json({
        error: `${gw.name} is not enabled for withdrawals by Admin.`,
      });
    }

    if (!balanceScreenshotUrl || !qrScreenshotUrl) {
      return res.status(400).json({
        error: 'Both screenshots are required: (1) Game Balance Screenshot and (2) Payout Tag / QR Code Screenshot.',
      });
    }

    const numericAmount = Number(amount);
    const playerTickets = await db.listTickets(req.auth.id);
    const rule = cashoutRule(
      playerTickets,
      game,
      settings.withdrawMultiplier,
      settings.minWithdrawFallback
    );
    const minRequired = rule.minimum;

    if (!numericAmount || numericAmount < minRequired) {
      const still = Number((minRequired - Number(numericAmount || 0)).toFixed(2));
      return res.status(400).json({
        error: rule.hasLoad
          ? `Your minimum cashout on ${game} is $${minRequired.toFixed(2)} (${rule.multiplier}x of $${rule.total.toFixed(2)}). You still need $${still.toFixed(2)} more, then you can cash out.`
          : `Your minimum cashout is $${minRequired.toFixed(2)}. You still need $${still.toFixed(2)} more, then you can cash out.`,
      });
    }

    const ticketId = `WD-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await db.createTicket({
      ticketId,
      userId: String(req.auth.id),
      playerName: user?.name || 'Player',
      type: 'withdraw',
      title: `Manual Cashout $${numericAmount.toFixed(2)} — ${game}`,
      subtitle: `Game ID: ${gameUser} • ${gw?.name || method} → ${payoutTag} • Last Load: $${lastLoad.toFixed(2)}`,
      amount: numericAmount,
      game,
      gameUser,
      method: gw?.name || method,
      payoutTag,
      isManualGateway: true,
      balanceScreenshotUrl,
      qrScreenshotUrl,
      status: 'Processing',
      externalRef: ticketId,
    });

    const agentMsg = await db.createMessage({
      userId: String(req.auth.id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Cashier Desk',
      text: `Manual Cashout Ticket ${ticketId} submitted! 💸\nGame: **${game}** (ID: \`${gameUser}\`)\nAmount: **$${numericAmount.toFixed(2)}** via ${gw?.name || method} (\`${payoutTag}\`)\n\nBoth screenshots (Game Balance + Payout QR) have been sent to our Admin Desk for verification.`,
      card: 'ticket-receipt',
      cardData: {
        ticketId,
        ticketType: 'withdraw',
        game,
        amount: numericAmount,
        method: gw?.name || method,
        handle: payoutTag,
      },
    });

    io.to(`user:${req.auth.id}`).emit('ticket:created', ticket);
    io.to(`user:${req.auth.id}`).emit('chat:message', agentMsg);
    io.to('admins').emit('ticket:created', ticket);

    const admins = await db.listAdmins();
    for (const admin of admins) {
      sendPushToUser(admin, {
        title: `💸 Cashout $${numericAmount.toFixed(2)} (${game})`,
        body: `${user?.name} (${gameUser}) via ${gw?.name || method} — 2 screenshots attached`,
        url: '/#/admin',
        tag: ticketId,
      });
    }

    res.status(201).json({ ticket, message: agentMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/issue', requireAuth, async (req, res) => {
  try {
    const { category = 'General Issue', game = '', referenceId = '', details = '' } = req.body;
    const user = await db.findUserById(req.auth.id);
    const ticketId = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await db.createTicket({
      ticketId,
      userId: String(req.auth.id),
      playerName: user?.name || 'Player',
      type: 'issue',
      title: `[URGENT] ${category}${game ? ` — ${game}` : ''}`,
      subtitle: `${referenceId ? `Ref: ${referenceId} • ` : ''}${details || 'Player requested live human support'}`,
      game,
      status: 'Processing',
      externalRef: referenceId || ticketId,
    });

    const agentMsg = await db.createMessage({
      userId: String(req.auth.id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Live Support',
      text: `Priority Support Ticket ${ticketId} created! 🚨 A live human agent has been notified on our Admin Desk and will resolve your issue right here in chat.\n\nIf this is a payment issue, please also tap the image icon below to upload your payment screenshot.`,
      card: 'ticket-receipt',
      cardData: {
        ticketId,
        ticketType: 'issue',
        game: game || category,
        handle: referenceId || 'Assigned to Live Agent',
      },
    });

    io.to(`user:${req.auth.id}`).emit('ticket:created', ticket);
    io.to(`user:${req.auth.id}`).emit('chat:message', agentMsg);
    io.to('admins').emit('ticket:created', ticket);

    const admins = await db.listAdmins();
    for (const admin of admins) {
      sendPushToUser(admin, {
        title: `🚨 Urgent Issue (${ticketId})`,
        body: `${user?.name}: ${category} — ${details || 'Needs live agent help'}`,
        url: '/#/admin',
        tag: ticketId,
      });
    }

    res.status(201).json({ ticket, message: agentMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/game-id', requireAuth, async (req, res) => {
  try {
    const { game } = req.body;
    const user = await db.findUserById(req.auth.id);
    const gameDoc = await db.findGameByNameOrSlug(game);
    if (!gameDoc) {
      return res.status(400).json({
        error: 'No connected game found with that name. Add games via Admin Panel → Games & APIs first.',
      });
    }

    // PREVENT DUPLICATE GAME ID REQUESTS PER PLAYER PER GAME
    const userTickets = await db.listTickets(req.auth.id);
    const existing = userTickets.find(
      (t) =>
        t.type === 'game-id' &&
        String(t.game || '').toLowerCase() === gameDoc.name.toLowerCase() &&
        t.status !== 'Rejected'
    );

    if (existing) {
      const hasCreds = Boolean(existing.gameUser);
      const existingMsg = await db.createMessage({
        userId: String(req.auth.id),
        threadId: 'concierge',
        sender: 'agent',
        agentName: 'GameStrike Accounts Desk',
        text: hasCreds
          ? `You already have an active **${gameDoc.name}** account! Duplicate requests are disabled — here are your saved credentials:`
          : `You already have a pending **${gameDoc.name}** ID request (${existing.ticketId}). Our Admin Desk is processing it now.`,
        card: 'ticket-receipt',
        cardData: hasCreds
          ? {
              ticketId: existing.ticketId,
              ticketType: 'game-id',
              game: existing.game,
              loginId: existing.gameUser,
              tempPass: existing.gamePassword || '—',
            }
          : {
              ticketId: existing.ticketId,
              ticketType: 'game-id',
              game: existing.game,
              handle: 'Already Pending with Admin',
            },
      });
      io.to(`user:${req.auth.id}`).emit('chat:message', existingMsg);
      return res.json({ alreadyExists: true, ticket: existing, message: existingMsg });
    }

    const ticketId = `ID-${Math.floor(1000 + Math.random() * 9000)}`;
    let account = null;
    let apiError = '';

    try {
      account = await createGameAccount(gameDoc, user);
    } catch (err) {
      apiError = err.message || 'Game API credentials pending';
      console.warn(`[GameID] Live API fallback to Admin Queue for ${gameDoc.name}: ${apiError}`);
    }

    const isAutoReady = Boolean(account?.loginId);

    const ticket = await db.createTicket({
      ticketId,
      userId: String(req.auth.id),
      playerName: user?.name || 'Player',
      type: 'game-id',
      title: isAutoReady
        ? `${gameDoc.name} Account Ready`
        : `New Game ID Request — ${gameDoc.name}`,
      subtitle: isAutoReady
        ? `Login: ${account.loginId}`
        : `Pending Admin / API (${apiError})`,
      game: gameDoc.name,
      gameUser: account?.loginId || '',
      gamePassword: account?.tempPass || '',
      status: isAutoReady ? 'Completed' : 'Processing',
      externalRef: account?.externalRef || ticketId,
    });

    const agentMsg = await db.createMessage({
      userId: String(req.auth.id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Accounts Desk',
      text: isAutoReady
        ? `Your ${gameDoc.name} account is active! Save your credentials below:`
        : `Your ${gameDoc.name} Game ID request (${ticketId}) has been sent to our live Admin Desk! An agent will send your login credentials right here shortly.`,
      card: 'ticket-receipt',
      cardData: isAutoReady
        ? {
            ticketId,
            ticketType: 'game-id',
            game: gameDoc.name,
            loginId: account.loginId,
            tempPass: account.tempPass,
          }
        : {
            ticketId,
            ticketType: 'game-id',
            game: gameDoc.name,
            handle: 'Pending Admin Provisioning',
          },
      quickReplies: [
        { label: `⚡ Auto Deposit for ${gameDoc.name}`, action: 'deposit' },
      ],
    });

    io.to(`user:${req.auth.id}`).emit('ticket:created', ticket);
    io.to(`user:${req.auth.id}`).emit('chat:message', agentMsg);
    io.to('admins').emit('ticket:created', ticket);

    // Notify Admins on lock-screen & live dashboard
    const admins = await db.listAdmins();
    for (const admin of admins) {
      sendPushToUser(admin, {
        title: `🎮 Game ID Request (${gameDoc.name})`,
        body: `${user?.name || 'Player'} requested a ${gameDoc.name} Game ID (${ticketId})`,
        url: '/#/admin',
        tag: ticketId,
      });
    }

    res.status(201).json({ ticket, message: agentMsg, account });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// ADMIN PANEL ROUTES
// =========================================================
app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  const [players, tickets, games, gateways, settings] = await Promise.all([
    db.listPlayers(),
    db.listTickets(),
    db.listGames(),
    db.listGateways(),
    db.getSettings(),
  ]);
  res.json({
    database: isMongoConnected() ? 'MongoDB Connected' : 'Local JSON Fallback',
    cashtapConnected: Boolean(process.env.CASHTAP_SECRET_KEY),
    players: players.map(sanitizeUser),
    tickets,
    games,
    gateways,
    settings,
  });
});

app.get('/api/admin/chat/:userId', requireAdmin, async (req, res) => {
  const messages = await db.listMessagesByUser(req.params.userId);
  res.json({ messages });
});

app.post('/api/admin/chat/:userId/reply', requireAdmin, async (req, res) => {
  try {
    const { text, threadId = 'concierge' } = req.body;
    const targetUser = await db.findUserById(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: 'Player not found' });

    const saved = await db.createMessage({
      userId: String(targetUser._id),
      threadId,
      sender: 'agent',
      agentName: 'GameStrike Live Agent',
      text: text || '',
      attachmentUrl: req.body.attachmentUrl,
      attachmentName: req.body.attachmentName,
      read: false,
    });

    io.to(`user:${targetUser._id}`).emit('chat:message', saved);
    io.to('admins').emit('chat:message', saved);

    await sendPushToUser(targetUser, {
      title: 'GameStrike.io Live Agent',
      body: text || 'Sent you an image',
      url: '/#/chat',
      tag: `reply-${targetUser._id}`,
    });

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/chat/:userId', requireAdmin, async (req, res) => {
  try {
    const targetUser = await db.findUserById(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: 'Player not found' });
    const deleted = await db.deleteMessagesByUser(targetUser._id);
    const payload = { userId: String(targetUser._id) };
    io.to(`user:${targetUser._id}`).emit('chat:cleared', payload);
    io.to('admins').emit('chat:cleared', payload);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/tickets/:ticketId/reply', requireAdmin, async (req, res) => {
  try {
    const reply = String(req.body.reply || '').trim();
    if (!reply) return res.status(400).json({ error: 'Write a reply first.' });
    const ticket = await db.findTicketById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const player = await db.findUserById(ticket.userId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const updated = await db.updateTicketStatus(ticket.ticketId, ticket.status, reply);
    const message = await db.createMessage({
      userId: String(player._id),
      threadId: 'concierge',
      sender: 'agent',
      agentName: 'GameStrike Support',
      text: `Reply on ${ticket.ticketId}: ${reply}`,
      read: false,
    });

    io.to(`user:${player._id}`).emit('chat:message', message);
    io.to(`user:${player._id}`).emit('ticket:updated', updated);
    io.to('admins').emit('chat:message', message);
    io.to('admins').emit('ticket:updated', updated);

    const push = await sendPushToUser(player, {
      title: `GameStrike reply · ${ticket.ticketId}`,
      body: reply.slice(0, 180),
      url: '/#/chat',
      tag: `issue-reply-${ticket.ticketId}`,
    });

    let emailSent = false;
    if (String(player.contact || '').includes('@')) {
      const mailed = await sendSupportReplyEmail({
        to: player.contact,
        name: player.name,
        ticketId: ticket.ticketId,
        title: ticket.title,
        reply,
      }).catch((err) => {
        console.warn(`[Support email] ${ticket.ticketId}: ${err.message}`);
        return { sentViaSmtp: false };
      });
      emailSent = Boolean(mailed?.sentViaSmtp);
    }

    res.json({
      ticket: updated,
      message,
      emailSent,
      notified: (push?.webPushSent || 0) + (push?.fcmSent || 0) > 0,
      appNotified: (push?.fcmSent || 0) > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/tickets/:ticketId', requireAdmin, async (req, res) => {
  try {
    const { status, adminNote = '', gameUser, gamePassword } = req.body;
    const extraFields = {};
    if (gameUser) extraFields.gameUser = String(gameUser).trim();
    if (gamePassword) extraFields.gamePassword = String(gamePassword).trim();
    if (gameUser) extraFields.subtitle = `Login: ${String(gameUser).trim()}`;

    const updated = await db.updateTicketStatus(
      req.params.ticketId,
      status,
      adminNote,
      extraFields
    );
    if (!updated) return res.status(404).json({ error: 'Ticket not found' });

    if (status === 'Completed' && updated.type === 'deposit') {
      const playerRec = await db.findUserById(updated.userId);
      const totalToLoad = Number(updated.totalCredit || updated.amount || 0);
      if (playerRec && !updated.walletCredited) {
        await db.updateUser(playerRec._id, {
          completedDepositsCount: Number(playerRec.completedDepositsCount || 0) + 1,
          lastDepositAmount: Number(updated.amount || 0),
          lastBonusAmount: Number(updated.bonusAmount || 0),
          lastTotalLoad: totalToLoad,
        });
        await maybeAwardReferralBonus(playerRec, Number(updated.amount || 0));
        await creditDepositToWallet({ ...updated, status: 'Completed' });
      }
    } else if (status === 'Completed' && updated.type === 'freeplay') {
      const playerRec = await db.findUserById(updated.userId);
      const settings = await db.getSettings();
      const amount = Number(settings.freeplayAmount || 0);
      if (playerRec && !playerRec.freeplayClaimed && amount > 0) {
        const balance = await creditPlayerWallet(playerRec._id, amount);
        await db.updateUser(playerRec._id, { freeplayClaimed: true });
        const msg = await db.createMessage({
          userId: String(playerRec._id),
          threadId: 'concierge',
          sender: 'agent',
          agentName: 'GameStrike Wallet',
          text: `Freeplay approved. $${amount.toFixed(2)} was added once to your wallet. Balance: **$${Number(balance || 0).toFixed(2)}**.`,
        });
        io.to(`user:${playerRec._id}`).emit('chat:message', msg);
        io.to(`user:${playerRec._id}`).emit('wallet:updated', {
          walletBalance: Number(balance || 0),
        });
      }
    } else if (status === 'Completed' && updated.type === 'withdraw' && updated.game && updated.amount) {
      const gameDoc = await db.findGameByNameOrSlug(updated.game);
      if (gameDoc?.apiConfig?.isConnected) {
        try {
          await redeemGameCredits(gameDoc, updated.gameUser || updated.playerName, updated.amount);
        } catch (err) {
          console.warn('[AdminWithdraw] Game API redeem skipped:', err.message);
        }
      }
    }

    const isGameCredentialsReady =
      updated.type === 'game-id' && status === 'Completed' && updated.gameUser;

    const statusMsg = await db.createMessage({
      userId: String(updated.userId),
      threadId: 'concierge',
      sender: 'agent',
      agentName: isGameCredentialsReady ? 'GameStrike Accounts Desk' : 'GameStrike Cashier',
      text: isGameCredentialsReady
        ? `Your ${updated.game} credentials are ready! Tap copy below — they are also saved permanently in your **My Game IDs** panel.`
        : `Ticket ${updated.ticketId} (${updated.title}) status updated to **${status}**! ${adminNote}`.trim(),
      card: isGameCredentialsReady ? 'ticket-receipt' : undefined,
      cardData: isGameCredentialsReady
        ? {
            ticketId: updated.ticketId,
            ticketType: 'game-id',
            game: updated.game,
            loginId: updated.gameUser,
            tempPass: updated.gamePassword || 'Set by Agent',
          }
        : undefined,
    });

    io.to(`user:${updated.userId}`).emit('ticket:updated', updated);
    io.to(`user:${updated.userId}`).emit('chat:message', statusMsg);
    io.to('admins').emit('ticket:updated', updated);

    const player = await db.findUserById(updated.userId);
    if (player) {
      await sendPushToUser(player, {
        title: `GameStrike: ${updated.ticketId} ${status}`,
        body: `${updated.title} is now ${status}.`,
        url: '/#/chat',
        tag: updated.ticketId,
      });
    }

    res.json({ ticket: updated, message: statusMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/games/:slug', requireAdmin, async (req, res) => {
  try {
    const saved = await db.upsertGame(req.params.slug, req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/games/:slug', requireAdmin, async (req, res) => {
  try {
    await db.deleteGame(req.params.slug);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// LIVE GAME API OPERATIONS (JUWA 777 & PLUGGED GAME APIs)
// =========================================================
app.get('/api/admin/games/:slug/agent-balance', requireAdmin, async (req, res) => {
  try {
    const game = await db.findGameByNameOrSlug(req.params.slug);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const data = await getGameAgentBalance(game);
    res.json({ game: game.name, ...data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/games/:slug/player-balance', requireAdmin, async (req, res) => {
  try {
    const game = await db.findGameByNameOrSlug(req.params.slug);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const data = await getGamePlayerBalance(game, req.body.loginId || req.body.userId);
    res.json({ game: game.name, ...data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/games/:slug/player-balance', requireAuth, async (req, res) => {
  try {
    const game = await db.findGameByNameOrSlug(req.params.slug);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const data = await getGamePlayerBalance(game, req.body.loginId || req.body.userId);
    res.json({ game: game.name, ...data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/games/:slug/reset-password', requireAuth, async (req, res) => {
  try {
    const game = await db.findGameByNameOrSlug(req.params.slug);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const data = await resetGamePassword(
      game,
      req.body.loginId || req.body.userId,
      req.body.newPassword
    );
    res.json({ game: game.name, ...data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/games/:slug/force-offline', requireAdmin, async (req, res) => {
  try {
    const game = await db.findGameByNameOrSlug(req.params.slug);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const data = await forceGamePlayerOffline(game, req.body.loginId || req.body.userId);
    res.json({ game: game.name, ...data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/gateways/:slug', requireAdmin, async (req, res) => {
  try {
    const saved = await db.upsertGateway(req.params.slug, req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const API_GATEWAY_SLUGS = new Set(['cashtap', 'cashapp', 'coinbase', 'wallet']);

function isCodeGateway(gateway) {
  if (!gateway) return false;
  return Boolean(gateway.apiConfig?.isConnected) || API_GATEWAY_SLUGS.has(String(gateway.slug || '').toLowerCase());
}

app.patch('/api/admin/gateways/:slug/visibility', requireAdmin, async (req, res) => {
  try {
    const current = await db.findGatewayByNameOrSlug(req.params.slug);
    if (!current) return res.status(404).json({ error: 'Payment method not found.' });
    const saved = await db.upsertGateway(current.slug, { enabled: req.body.enabled !== false });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/gateways/:slug', requireAdmin, async (req, res) => {
  try {
    const current = await db.findGatewayByNameOrSlug(req.params.slug);
    if (!current) return res.status(404).json({ error: 'Payment method not found.' });
    if (isCodeGateway(current)) {
      return res.status(400).json({ error: 'API payment methods can be hidden, not deleted.' });
    }
    await db.deleteGateway(current.slug);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// SOCKET.IO (REAL-TIME MESSAGES + LIVE TYPING INDICATORS)
// =========================================================
io.on('connection', (socket) => {
  socket.on('auth:join', ({ token }) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.data.userId = payload.id;
      socket.data.role = payload.role;
      if (payload.role === 'admin') socket.join('admins');
      else socket.join(`user:${payload.id}`);
    } catch {
      socket.emit('auth:expired');
    }
  });

  // Live typing indicator: Player -> Admin OR Admin -> Player
  socket.on('chat:typing', ({ targetUserId, isTyping }) => {
    if (socket.data.role === 'admin' && targetUserId) {
      io.to(`user:${targetUserId}`).emit('chat:typing', { sender: 'agent', isTyping: Boolean(isTyping) });
    } else if (socket.data.userId) {
      io.to('admins').emit('chat:typing', {
        userId: String(socket.data.userId),
        sender: 'user',
        isTyping: Boolean(isTyping),
      });
    }
  });
});

// =========================================================
// ADMIN SUSPEND & DEVICE BLOCK (WINNING HEAVEN STYLE)
// =========================================================
app.post('/api/admin/players/:userId/toggle-suspend', requireAdmin, async (req, res) => {
  try {
    const { status, reason } = req.body;
    const updated = await db.toggleUserSuspension(req.params.userId, status, reason);
    if (!updated) return res.status(404).json({ error: 'Player not found.' });

    // If suspended, disconnect user's active sockets immediately!
    if (updated.status === 'suspended') {
      io.to(`user:${updated._id}`).emit('auth:revoked', {
        reason: updated.deviceBlockReason || 'Account suspended by admin.',
      });
    }

    io.to('admins').emit('player:updated', sanitizeUser(updated));
    res.json({ ok: true, player: sanitizeUser(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/devices/unblock', requireAdmin, async (req, res) => {
  try {
    const { deviceId, deviceFingerprint, ip } = req.body;
    await db.unblockDevice({ deviceId, deviceFingerprint, ip });
    res.json({ ok: true, message: 'Device unblocked successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast Socket & Server Initialization
initPushService();
await initDatabase();

server.listen(PORT, () => {
  console.log(`\n⚡ GameStrike.io Backend running on http://localhost:${PORT}`);
  console.log(`   CashTap Checkout API: ${process.env.CASHTAP_SECRET_KEY ? 'LIVE KEY LOADED' : 'NOT SET'}`);
  console.log(`   Admin Login: ${process.env.ADMIN_EMAIL || 'admin@gamestrike.io'} / ${process.env.ADMIN_PASSWORD || 'Admin@1234'}`);
});
