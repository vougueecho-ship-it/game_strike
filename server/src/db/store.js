import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Ticket } from '../models/Ticket.js';
import { Game } from '../models/Game.js';
import { PaymentGateway } from '../models/PaymentGateway.js';

const LOCAL_DB_PATH = path.resolve(process.cwd(), 'data', 'local-db.json');

// Only games with real APIs you provide are registered here
const SEED_GAMES = [
  {
    slug: 'juwa-777',
    name: 'Juwa 777',
    tag: 'Official API',
    category: 'Hot',
    platforms: ['iOS', 'Android'],
    minDeposit: 5,
    playersOnline: 0,
    accentFrom: '#1D4ED8',
    accentTo: '#06B6D4',
    initials: 'JW',
    imageUrl: '/games/juwa-official.png',
    downloadUrl: 'https://dl.juwa777.com',
    enabled: true,
    apiConfig: {
      provider: 'juwa777',
      baseUrl: process.env.JUWA_BASE_URL || 'https://external.juwa777.com',
      apiKey: '',
      apiSecret: '',
      agentId: process.env.JUWA_AGENT_ID || '',
      isConnected: true,
    },
  },
  {
    slug: 'game-vault-999',
    name: 'Game Vault 999',
    tag: 'Official API',
    category: 'Slots',
    platforms: ['iOS', 'Android', 'Web'],
    minDeposit: 5,
    playersOnline: 0,
    accentFrom: '#0F766E',
    accentTo: '#06B6D4',
    initials: 'GV',
    imageUrl: '/games/vault-bg.jpg',
    downloadUrl: 'https://download.gamevault999.com/',
    enabled: true,
    apiConfig: {
      provider: 'gamevault999',
      baseUrl: process.env.GAMEVAULT_BASE_URL || 'https://apius.gamevault999.com',
      apiKey: '',
      apiSecret: '',
      agentId: process.env.GAMEVAULT_AGENT_ID || '',
      isConnected: true,
    },
  },
];

// Live CashTap Automated Checkout Gateways (https://cashtap.cash/llms.txt)
const SEED_GATEWAYS = [
  {
    slug: 'cashtap',
    name: 'CashTap Checkout (All Methods)',
    handle: 'pay.cashtap.cash',
    badge: 'Auto Instant',
    eta: 'Instant Auto',
    minAmount: 1,
    maxAmount: 100000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: false,
    color: '#10B981',
    enabled: true,
    apiConfig: {
      provider: 'cashtap',
      baseUrl: 'https://api.cashtap.cash/checkout/v1',
      apiKey: '',
      webhookSecret: '',
      isConnected: true,
    },
  },
  {
    slug: 'cashapp',
    name: 'CashApp Pay (via CashTap)',
    handle: 'Instant CashApp Checkout',
    badge: 'Instant',
    eta: 'Instant Auto',
    minAmount: 1,
    maxAmount: 16000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: true,
    color: '#10B981',
    enabled: true,
    apiConfig: {
      provider: 'cashtap',
      baseUrl: 'https://api.cashtap.cash/checkout/v1',
      apiKey: '',
      webhookSecret: '',
      isConnected: true,
    },
  },
  {
    slug: 'coinbase',
    name: 'Card, Bank or Apple Pay (CashTap)',
    handle: 'Debit / Bank / Apple Pay',
    badge: 'Card & Apple Pay',
    eta: 'Instant Auto',
    minAmount: 5,
    maxAmount: 10000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: false,
    color: '#2563EB',
    enabled: true,
    apiConfig: {
      provider: 'cashtap',
      baseUrl: 'https://api.cashtap.cash/checkout/v1',
      apiKey: '',
      webhookSecret: '',
      isConnected: true,
    },
  },
  {
    slug: 'wallet',
    name: 'Wallet Transfer USDC (CashTap)',
    handle: 'USDC on Base — Any Wallet',
    badge: 'High Limit',
    eta: 'Instant Auto',
    minAmount: 0.5,
    maxAmount: 100000,
    fee: 'Auto Settlement',
    supportsDeposit: true,
    supportsWithdraw: true,
    color: '#06B6D4',
    enabled: true,
    apiConfig: {
      provider: 'cashtap',
      baseUrl: 'https://api.cashtap.cash/checkout/v1',
      apiKey: '',
      webhookSecret: '',
      isConnected: true,
    },
  },
  {
    slug: 'chime',
    name: 'Chime (Manual Verify)',
    handle: '$GameStrike-Chime',
    badge: 'Manual Verify',
    eta: '2–5 mins',
    minAmount: 10,
    maxAmount: 2500,
    fee: '0% Fee',
    supportsDeposit: true,
    supportsWithdraw: true,
    color: '#22C55E',
    enabled: true,
    apiConfig: {
      provider: 'manual',
      baseUrl: '',
      apiKey: '',
      webhookSecret: '',
      isConnected: false,
    },
  },
];

const DEFAULT_SETTINGS = {
  welcomeBonusPercent: 100,
  regularBonusPercent: 20,
  withdrawMultiplier: 3,
  minWithdrawFallback: 20,
};

let useMongo = false;
let localState = {
  users: [],
  messages: [],
  tickets: [],
  games: [],
  gateways: [],
  processedEvents: [],
  settings: { ...DEFAULT_SETTINGS },
  otps: {},
};

function saveLocal() {
  try {
    fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(localState, null, 2));
  } catch (err) {
    console.error('[LocalDB] Write failed:', err.message);
  }
}

function loadLocal() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8'));
      localState = {
        users: parsed.users || [],
        messages: parsed.messages || [],
        tickets: parsed.tickets || [],
        games: parsed.games || [],
        gateways: parsed.gateways || [],
        processedEvents: parsed.processedEvents || [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        otps: parsed.otps || {},
      };
    }
  } catch {
    // ignore corrupt local file
  }
}

export function isMongoConnected() {
  return useMongo;
}

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

export async function initDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gamestrike_io';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    useMongo = true;
    const safeHost = uri.includes('@') ? uri.split('@')[1].split('/')[0] : uri;
    console.log(`[DB] Connected to MongoDB: ${safeHost}`);
  } catch (err) {
    useMongo = false;
    console.log(
      `[DB] MongoDB not reachable (${err.message}). Running with persistent local JSON store until MONGODB_URI is available.`
    );
    loadLocal();
  }

  await seedInitialData();
}

async function seedInitialData() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gamestrike.io').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@1234';

  if (useMongo) {
    const adminExists = await User.findOne({ contact: adminEmail });
    if (!adminExists) {
      await User.create({
        playerCode: 'ADMIN-001',
        name: 'GameStrike Admin',
        username: '@admin',
        contact: adminEmail,
        passwordHash: await bcrypt.hash(adminPass, 10),
        role: 'admin',
        tier: 'VIP Strike',
      });
    }
    if ((await Game.countDocuments()) === 0 && SEED_GAMES.length > 0) {
      await Game.insertMany(SEED_GAMES);
    }
    if ((await PaymentGateway.countDocuments()) === 0) {
      await PaymentGateway.insertMany(SEED_GATEWAYS);
    }
  } else {
    if (!localState.users.find((u) => u.contact === adminEmail)) {
      localState.users.push({
        _id: 'admin-001',
        playerCode: 'ADMIN-001',
        name: 'GameStrike Admin',
        username: '@admin',
        contact: adminEmail,
        passwordHash: await bcrypt.hash(adminPass, 10),
        role: 'admin',
        tier: 'VIP Strike',
        pushSubscriptions: [],
        fcmTokens: [],
        createdAt: new Date().toISOString(),
      });
    }
    for (const seedGame of SEED_GAMES) {
      if (!localState.games.some((g) => g.slug === seedGame.slug)) {
        localState.games.push({ _id: seedGame.slug, ...seedGame });
      }
    }
    for (const seedGw of SEED_GATEWAYS) {
      if (!localState.gateways.some((g) => g.slug === seedGw.slug)) {
        localState.gateways.push({ _id: seedGw.slug, ...seedGw });
      }
    }
    saveLocal();
  }
}

export const db = {
  // USERS
  async findUserByContact(contact) {
    const clean = contact.toLowerCase().trim();
    if (useMongo) return User.findOne({ contact: clean }).lean();
    return localState.users.find((u) => u.contact === clean) || null;
  },
  async findUserById(id) {
    if (useMongo) return User.findById(id).lean();
    return localState.users.find((u) => String(u._id) === String(id) || u.playerCode === id) || null;
  },
  async findUserByPlayerCode(playerCode) {
    const clean = String(playerCode || '').trim().toUpperCase();
    if (!clean) return null;
    if (useMongo) return User.findOne({ playerCode: clean }).lean();
    return localState.users.find((u) => String(u.playerCode || '').toUpperCase() === clean) || null;
  },
  async listPlayers() {
    if (useMongo) return User.find({ role: 'player' }).sort({ updatedAt: -1 }).lean();
    return localState.users.filter((u) => u.role === 'player');
  },
  async listAdmins() {
    if (useMongo) return User.find({ role: 'admin' }).lean();
    return localState.users.filter((u) => u.role === 'admin');
  },
  async createUser(doc) {
    if (useMongo) {
      const created = await User.create(doc);
      return created.toObject();
    }
    const created = {
      _id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      completedDepositsCount: 0,
      lastDepositAmount: 0,
      lastBonusAmount: 0,
      lastTotalLoad: 0,
      referredBy: '',
      referralRewarded: false,
      referralCount: 0,
      referralBonusEarned: 0,
      pushSubscriptions: [],
      fcmTokens: [],
      createdAt: new Date().toISOString(),
      ...doc,
    };
    localState.users.unshift(created);
    saveLocal();
    return created;
  },
  async updateUser(userId, updates) {
    if (useMongo) {
      return User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).lean();
    }
    const u = localState.users.find((x) => String(x._id) === String(userId));
    if (!u) return null;
    Object.assign(u, updates);
    saveLocal();
    return u;
  },
  async updatePasswordByContact(contact, passwordHash) {
    const clean = contact.toLowerCase().trim();
    if (useMongo) {
      return User.findOneAndUpdate({ contact: clean }, { $set: { passwordHash } }, { new: true }).lean();
    }
    const u = localState.users.find((x) => x.contact === clean);
    if (!u) return null;
    u.passwordHash = passwordHash;
    saveLocal();
    return u;
  },

  // PLATFORM BONUS & WITHDRAWAL SETTINGS
  async getSettings() {
    if (useMongo) {
      const doc = await Setting.findOne({ key: 'platform_settings' }).lean();
      return { ...DEFAULT_SETTINGS, ...(doc?.value || {}) };
    }
    return { ...DEFAULT_SETTINGS, ...(localState.settings || {}) };
  },
  async updateSettings(patch) {
    if (useMongo) {
      const current = await this.getSettings();
      const next = { ...current, ...patch };
      await Setting.findOneAndUpdate(
        { key: 'platform_settings' },
        { $set: { value: next } },
        { upsert: true, new: true }
      );
      return next;
    }
    localState.settings = {
      ...DEFAULT_SETTINGS,
      ...(localState.settings || {}),
      ...patch,
    };
    saveLocal();
    return localState.settings;
  },

  // EMAIL OTP STORE (10-MIN EXPIRY)
  async saveOtp(email, purpose, code) {
    const key = `${email.toLowerCase().trim()}:${purpose}`;
    localState.otps = localState.otps || {};
    localState.otps[key] = { code: String(code), expiresAt: Date.now() + 10 * 60 * 1000 };
    saveLocal();
  },
  async verifyOtp(email, purpose, code) {
    const key = `${email.toLowerCase().trim()}:${purpose}`;
    const entry = localState.otps?.[key];
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      delete localState.otps[key];
      saveLocal();
      return false;
    }
    if (String(entry.code) !== String(code).trim()) return false;
    delete localState.otps[key];
    saveLocal();
    return true;
  },
  async addPushSubscription(userId, subscription, fcmToken) {
    if (useMongo) {
      const update = {};
      if (subscription?.endpoint) {
        update.$addToSet = { ...(update.$addToSet || {}), pushSubscriptions: subscription };
      }
      if (fcmToken) {
        update.$addToSet = { ...(update.$addToSet || {}), fcmTokens: fcmToken };
      }
      return User.findByIdAndUpdate(userId, update, { new: true }).lean();
    }
    const u = localState.users.find((x) => String(x._id) === String(userId));
    if (!u) return null;
    if (subscription?.endpoint) {
      u.pushSubscriptions = u.pushSubscriptions || [];
      if (!u.pushSubscriptions.some((s) => s.endpoint === subscription.endpoint)) {
        u.pushSubscriptions.push(subscription);
      }
    }
    if (fcmToken) {
      u.fcmTokens = u.fcmTokens || [];
      if (!u.fcmTokens.includes(fcmToken)) u.fcmTokens.push(fcmToken);
    }
    saveLocal();
    return u;
  },

  // MESSAGES
  async listMessagesByUser(userId) {
    if (useMongo) return Message.find({ userId: String(userId) }).sort({ createdAt: 1 }).lean();
    return localState.messages.filter((m) => String(m.userId) === String(userId));
  },
  async createMessage(doc) {
    if (useMongo) {
      const created = await Message.create(doc);
      return created.toObject();
    }
    const created = {
      _id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      edited: false,
      deletedForEveryone: false,
      ...doc,
    };
    localState.messages.push(created);
    saveLocal();
    return created;
  },
  async findMessageById(id) {
    if (useMongo) return Message.findById(id).lean();
    return localState.messages.find((m) => String(m._id) === String(id)) || null;
  },
  async updateMessage(id, updates) {
    if (useMongo) {
      return Message.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    }
    const idx = localState.messages.findIndex((m) => String(m._id) === String(id));
    if (idx < 0) return null;
    localState.messages[idx] = { ...localState.messages[idx], ...updates };
    saveLocal();
    return localState.messages[idx];
  },

  // TICKETS
  async listTickets(userId) {
    if (useMongo) {
      const filter = userId ? { userId: String(userId) } : {};
      return Ticket.find(filter).sort({ createdAt: -1 }).lean();
    }
    return userId
      ? localState.tickets.filter((t) => String(t.userId) === String(userId))
      : localState.tickets;
  },
  async findTicketById(ticketId) {
    if (useMongo) return Ticket.findOne({ ticketId }).lean();
    return localState.tickets.find((t) => t.ticketId === ticketId) || null;
  },
  async findTicketByExternalRef(externalRef) {
    if (useMongo) return Ticket.findOne({ externalRef }).lean();
    return localState.tickets.find((t) => t.externalRef === externalRef) || null;
  },
  async createTicket(doc) {
    if (useMongo) {
      const created = await Ticket.create(doc);
      return created.toObject();
    }
    const created = {
      _id: `t_${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...doc,
    };
    localState.tickets.unshift(created);
    saveLocal();
    return created;
  },
  async updateTicketStatus(ticketId, status, adminNote = '', extraFields = {}) {
    if (useMongo) {
      return Ticket.findOneAndUpdate(
        { ticketId },
        { status, adminNote, ...extraFields },
        { new: true }
      ).lean();
    }
    const t = localState.tickets.find((x) => x.ticketId === ticketId);
    if (!t) return null;
    t.status = status;
    if (adminNote) t.adminNote = adminNote;
    Object.assign(t, extraFields);
    saveLocal();
    return t;
  },

  // WEBHOOK EVENT DEDUPLICATION
  async hasProcessedEvent(eventId) {
    return localState.processedEvents.includes(eventId);
  },
  async markEventProcessed(eventId) {
    if (!localState.processedEvents.includes(eventId)) {
      localState.processedEvents.push(eventId);
      if (localState.processedEvents.length > 500) {
        localState.processedEvents = localState.processedEvents.slice(-500);
      }
      saveLocal();
    }
  },

  // GAMES (100% Dynamic — zero static seed games)
  async listGames() {
    if (useMongo) return Game.find().sort({ createdAt: 1 }).lean();
    return localState.games;
  },
  async findGameByNameOrSlug(nameOrSlug) {
    const q = (nameOrSlug || '').toLowerCase();
    if (useMongo) {
      return Game.findOne({
        $or: [{ slug: q }, { name: new RegExp(`^${nameOrSlug}$`, 'i') }],
      }).lean();
    }
    return (
      localState.games.find(
        (g) => g.slug.toLowerCase() === q || g.name.toLowerCase() === q
      ) || null
    );
  },
  async upsertGame(slug, data) {
    if (useMongo) {
      return Game.findOneAndUpdate(
        { slug },
        { $set: { slug, ...data } },
        { upsert: true, new: true }
      ).lean();
    }
    const idx = localState.games.findIndex((g) => g.slug === slug);
    if (idx >= 0) {
      localState.games[idx] = { ...localState.games[idx], ...data };
      saveLocal();
      return localState.games[idx];
    }
    const created = { _id: slug, slug, enabled: true, ...data };
    localState.games.push(created);
    saveLocal();
    return created;
  },
  async deleteGame(slug) {
    if (useMongo) {
      await Game.deleteOne({ slug });
      return true;
    }
    localState.games = localState.games.filter((g) => g.slug !== slug);
    saveLocal();
    return true;
  },

  // PAYMENT GATEWAYS
  async listGateways() {
    if (useMongo) return PaymentGateway.find().sort({ createdAt: 1 }).lean();
    return localState.gateways;
  },
  async findGatewayByNameOrSlug(nameOrSlug) {
    const q = (nameOrSlug || '').toLowerCase();
    if (useMongo) {
      return PaymentGateway.findOne({
        $or: [{ slug: q }, { name: new RegExp(`^${nameOrSlug}$`, 'i') }],
      }).lean();
    }
    return (
      localState.gateways.find(
        (g) => g.slug.toLowerCase() === q || g.name.toLowerCase() === q
      ) || null
    );
  },
  async upsertGateway(slug, data) {
    if (useMongo) {
      return PaymentGateway.findOneAndUpdate(
        { slug },
        { $set: { slug, ...data } },
        { upsert: true, new: true }
      ).lean();
    }
    const idx = localState.gateways.findIndex((g) => g.slug === slug);
    if (idx >= 0) {
      localState.gateways[idx] = { ...localState.gateways[idx], ...data };
      saveLocal();
      return localState.gateways[idx];
    }
    const created = { _id: slug, slug, ...data };
    localState.gateways.push(created);
    saveLocal();
    return created;
  },
};
