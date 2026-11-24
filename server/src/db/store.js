import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { Ticket } from '../models/Ticket.js';
import { Game } from '../models/Game.js';
import { PaymentGateway } from '../models/PaymentGateway.js';
import { BlockedDevice } from '../models/BlockedDevice.js';

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
    name: 'All Methods',
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
    name: 'Cash App',
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
    name: 'Card, Bank or Apple Pay',
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
    name: 'USDC',
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
    name: 'Chime',
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
  referralBonus: 10,
  freeplayMinWithdraw: 30,
  freeplayMaxWithdraw: 100,
  withdrawMultiplier: 3,
  minWithdrawFallback: 20,
  enforceDeviceLimit: true,
  dailyBonusPercent: 10,
  dailyBonusLabel: "Today's Bonus",
  dailyOfferText: "Today's offer is live — extra bonus on your next deposit",
  freeplayAmount: 5,
  freeplayFromEmails: '',
  freeplayMailboxes: [],
};

let useMongo = false;
let localState = {
  users: [],
  messages: [],
  tickets: [],
  games: [],
  gateways: [],
  processedEvents: [],
  blockedDevices: [],
  settings: { ...DEFAULT_SETTINGS },
  otps: {},
};

function saveLocal() {
  throw new Error('Local JSON storage is disabled. All GameStrike data is stored in MongoDB.');
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
        blockedDevices: parsed.blockedDevices || [],
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

const otpSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
const Otp = mongoose.models.Otp || mongoose.model('Otp', otpSchema);

const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);
const ProcessedEvent =
  mongoose.models.ProcessedEvent || mongoose.model('ProcessedEvent', processedEventSchema);

function withoutLocalId(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const copy = { ...doc };
  delete copy._id;
  return copy;
}

async function importLocalFileOnce() {
  if (!fs.existsSync(LOCAL_DB_PATH)) return;
  if ((await User.countDocuments()) > 0) return;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8'));
  } catch (err) {
    console.warn(`[DB] Previous local file could not be read (${err.message}).`);
    return;
  }

  const users = (parsed.users || []).map(withoutLocalId).filter((u) => u?.contact && u?.passwordHash);
  if (users.length) {
    await User.insertMany(users, { ordered: false }).catch((err) => {
      console.warn(`[DB] User import skipped: ${err.message}`);
    });
  }
  const games = (parsed.games || []).map(withoutLocalId).filter((g) => g?.slug);
  if (games.length && (await Game.countDocuments()) === 0) {
    await Game.insertMany(games, { ordered: false }).catch((err) => {
      console.warn(`[DB] Game import skipped: ${err.message}`);
    });
  }
  const gateways = (parsed.gateways || []).map(withoutLocalId).filter((g) => g?.slug);
  if (gateways.length && (await PaymentGateway.countDocuments()) === 0) {
    await PaymentGateway.insertMany(gateways, { ordered: false }).catch((err) => {
      console.warn(`[DB] Gateway import skipped: ${err.message}`);
    });
  }
  const tickets = (parsed.tickets || []).map(withoutLocalId).filter((t) => t?.ticketId);
  if (tickets.length) {
    await Ticket.insertMany(tickets, { ordered: false }).catch((err) => {
      console.warn(`[DB] Ticket import skipped: ${err.message}`);
    });
  }
  const messages = (parsed.messages || []).map(withoutLocalId);
  if (messages.length) {
    await Message.insertMany(messages, { ordered: false }).catch((err) => {
      console.warn(`[DB] Message import skipped: ${err.message}`);
    });
  }
  const blocked = (parsed.blockedDevices || []).map(withoutLocalId);
  if (blocked.length) {
    await BlockedDevice.insertMany(blocked, { ordered: false }).catch((err) => {
      console.warn(`[DB] Block list import skipped: ${err.message}`);
    });
  }
  if (parsed.settings && typeof parsed.settings === 'object') {
    await Setting.findOneAndUpdate(
      { key: 'platform_settings' },
      { $set: { value: { ...DEFAULT_SETTINGS, ...parsed.settings } } },
      { upsert: true }
    );
  }
  for (const [key, entry] of Object.entries(parsed.otps || {})) {
    if (!entry?.code || Date.now() > Number(entry.expiresAt)) continue;
    await Otp.updateOne(
      { key },
      { code: String(entry.code), expiresAt: new Date(Number(entry.expiresAt)) },
      { upsert: true }
    );
  }
  for (const eventId of parsed.processedEvents || []) {
    if (!eventId) continue;
    await ProcessedEvent.updateOne({ eventId: String(eventId) }, { eventId: String(eventId) }, { upsert: true });
  }

  if (users.length && (await User.countDocuments()) === 0) {
    console.warn('[DB] Local records stayed in the old file because the user import did not land. New saves still go only to MongoDB.');
    return;
  }

  fs.unlinkSync(LOCAL_DB_PATH);
  console.log('[DB] Previous local records were imported into MongoDB and the JSON file was removed.');
}

export async function initDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required. GameStrike does not use a local or JSON database.');
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  } catch (err) {
    useMongo = false;
    console.error(
      `[DB] MongoDB is required and was not reachable (${err.message}). GameStrike does not save data anywhere else.`
    );
    throw err;
  }

  useMongo = true;
  console.log('[DB] Connected to MongoDB');
  mongoose.connection.on('error', (err) => {
    console.warn('[DB Error] MongoDB connection error:', err.message);
  });

  await seedInitialData();
}

async function seedInitialData() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gamestrike.io').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@1234';

  if (useMongo) {
    if ((await User.countDocuments()) > 0) return;
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
    return;
  }
  throw new Error('MongoDB is required. Local JSON storage is disabled.');
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

  // EMAIL OTP STORE (10-MIN EXPIRY) — MongoDB only
  async saveOtp(email, purpose, code) {
    if (!useMongo) throw new Error('MongoDB is required.');
    const key = `${email.toLowerCase().trim()}:${purpose}`;
    await Otp.findOneAndUpdate(
      { key },
      { code: String(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true }
    );
  },
  async verifyOtp(email, purpose, code) {
    if (!useMongo) throw new Error('MongoDB is required.');
    const key = `${email.toLowerCase().trim()}:${purpose}`;
    const entry = await Otp.findOne({ key }).lean();
    if (!entry) return false;
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      await Otp.deleteOne({ key });
      return false;
    }
    if (String(entry.code) !== String(code).trim()) return false;
    await Otp.deleteOne({ key });
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

  // WEBHOOK EVENT DEDUPLICATION — MongoDB only
  async hasProcessedEvent(eventId) {
    if (!useMongo) throw new Error('MongoDB is required.');
    const found = await ProcessedEvent.findOne({ eventId: String(eventId) }).lean();
    return Boolean(found);
  },
  async markEventProcessed(eventId) {
    if (!useMongo) throw new Error('MongoDB is required.');
    await ProcessedEvent.updateOne(
      { eventId: String(eventId) },
      { eventId: String(eventId) },
      { upsert: true }
    );
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
  async deleteGateway(slug) {
    if (useMongo) {
      const removed = await PaymentGateway.findOneAndDelete({ slug });
      return removed ? removed.toObject() : null;
    }
    const idx = localState.gateways.findIndex((g) => g.slug === slug);
    if (idx < 0) return null;
    const [removed] = localState.gateways.splice(idx, 1);
    saveLocal();
    return removed;
  },

  // DEVICE BLOCK & ACCOUNT SUSPENSION (WINNING HEAVEN STYLE)
  async isDeviceBlocked({ deviceId, deviceFingerprint, ip }) {
    const dId = String(deviceId || '').trim();
    const dFp = String(deviceFingerprint || '').trim();
    const userIp = String(ip || '').trim();
    if (!dId && !dFp && !userIp) return false;

    if (useMongo) {
      const orConditions = [];
      if (dId) orConditions.push({ deviceId: dId });
      if (dFp) orConditions.push({ deviceFingerprint: dFp });
      if (userIp && userIp !== '127.0.0.1' && userIp !== '::1') orConditions.push({ ip: userIp });

      if (orConditions.length === 0) return false;
      const found = await BlockedDevice.findOne({ $or: orConditions }).lean();
      return Boolean(found);
    }

    return (localState.blockedDevices || []).some((b) => {
      if (dId && b.deviceId === dId) return true;
      if (dFp && b.deviceFingerprint === dFp) return true;
      if (userIp && userIp !== '127.0.0.1' && b.ip === userIp) return true;
      return false;
    });
  },

  async blockDevice({ deviceId, deviceFingerprint, ip, reason = 'Administrative block' }) {
    const doc = {
      deviceId: String(deviceId || '').trim(),
      deviceFingerprint: String(deviceFingerprint || '').trim(),
      ip: String(ip || '').trim(),
      reason,
      createdAt: new Date().toISOString(),
    };

    if (useMongo) {
      await BlockedDevice.create(doc);
    } else {
      localState.blockedDevices = localState.blockedDevices || [];
      localState.blockedDevices.push(doc);
      saveLocal();
    }
    return doc;
  },

  async unblockDevice({ deviceId, deviceFingerprint, ip }) {
    const dId = String(deviceId || '').trim();
    const dFp = String(deviceFingerprint || '').trim();
    const userIp = String(ip || '').trim();

    if (useMongo) {
      const conds = [];
      if (dId) conds.push({ deviceId: dId });
      if (dFp) conds.push({ deviceFingerprint: dFp });
      if (userIp) conds.push({ ip: userIp });
      if (conds.length > 0) {
        await BlockedDevice.deleteMany({ $or: conds });
      }
    } else {
      localState.blockedDevices = (localState.blockedDevices || []).filter((b) => {
        if (dId && b.deviceId === dId) return false;
        if (dFp && b.deviceFingerprint === dFp) return false;
        if (userIp && b.ip === userIp) return false;
        return true;
      });
      saveLocal();
    }
    return true;
  },

  async toggleUserSuspension(userId, newStatus, reason = '') {
    if (useMongo) {
      const u = await User.findById(userId);
      if (!u) return null;
      const status = newStatus || (u.status === 'suspended' ? 'active' : 'suspended');
      u.status = status;
      if (status === 'suspended') {
        u.isDeviceBlocked = true;
        u.deviceBlockReason = reason || 'Suspended by Administrator';
        if (u.deviceId || u.deviceFingerprint || u.registrationIp) {
          await this.blockDevice({
            deviceId: u.deviceId,
            deviceFingerprint: u.deviceFingerprint,
            ip: u.registrationIp,
            reason: u.deviceBlockReason,
          });
        }
      } else {
        u.isDeviceBlocked = false;
        u.deviceBlockReason = '';
        if (u.deviceId || u.deviceFingerprint || u.registrationIp) {
          await this.unblockDevice({
            deviceId: u.deviceId,
            deviceFingerprint: u.deviceFingerprint,
            ip: u.registrationIp,
          });
        }
      }
      await u.save();
      return u.toObject();
    }

    const u = localState.users.find((x) => String(x._id) === String(userId));
    if (!u) return null;
    const status = newStatus || (u.status === 'suspended' ? 'active' : 'suspended');
    u.status = status;
    if (status === 'suspended') {
      u.isDeviceBlocked = true;
      u.deviceBlockReason = reason || 'Suspended by Administrator';
      if (u.deviceId || u.deviceFingerprint || u.registrationIp) {
        await this.blockDevice({
          deviceId: u.deviceId,
          deviceFingerprint: u.deviceFingerprint,
          ip: u.registrationIp,
          reason: u.deviceBlockReason,
        });
      }
    } else {
      u.isDeviceBlocked = false;
      u.deviceBlockReason = '';
      if (u.deviceId || u.deviceFingerprint || u.registrationIp) {
        await this.unblockDevice({
          deviceId: u.deviceId,
          deviceFingerprint: u.deviceFingerprint,
          ip: u.registrationIp,
        });
      }
    }
    saveLocal();
    return u;
  },

  async toggleMessageReaction(messageId, emoji, userContact) {
    const voter = String(userContact || '').toLowerCase().trim();
    if (!voter || !emoji) return null;

    if (useMongo) {
      const msg = await Message.findById(messageId);
      if (!msg) return null;
      const reactions = msg.reactions || new Map();
      const currentList = reactions.get(emoji) || [];
      const hasVoted = currentList.includes(voter);
      let updated;
      if (hasVoted) {
        updated = currentList.filter((v) => v !== voter);
      } else {
        updated = [...currentList, voter];
      }

      if (updated.length > 0) {
        reactions.set(emoji, updated);
      } else {
        reactions.delete(emoji);
      }
      msg.reactions = reactions;
      msg.markModified('reactions');
      await msg.save();
      return msg.toObject();
    }

    const m = localState.messages.find((x) => String(x._id) === String(messageId));
    if (!m) return null;
    m.reactions = m.reactions || {};
    const currentList = m.reactions[emoji] || [];
    const hasVoted = currentList.includes(voter);
    if (hasVoted) {
      m.reactions[emoji] = currentList.filter((v) => v !== voter);
      if (m.reactions[emoji].length === 0) delete m.reactions[emoji];
    } else {
      m.reactions[emoji] = [...currentList, voter];
    }
    saveLocal();
    return m;
  },
};
