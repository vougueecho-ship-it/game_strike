import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    playerCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    username: { type: String, required: true },
    contact: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['player', 'admin'], default: 'player' },
    tier: { type: String, enum: ['Starter', 'VIP Strike'], default: 'Starter' },
    completedDepositsCount: { type: Number, default: 0 },
    lastDepositAmount: { type: Number, default: 0 },
    lastBonusAmount: { type: Number, default: 0 },
    lastTotalLoad: { type: Number, default: 0 },
    referredBy: { type: String, default: '' },
    referralRewarded: { type: Boolean, default: false },
    referralCount: { type: Number, default: 0 },
    referralBonusEarned: { type: Number, default: 0 },
    pushSubscriptions: [pushSubscriptionSchema],
    fcmTokens: [{ type: String }],
    humanTakeover: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);

