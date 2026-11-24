import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    playerName: { type: String, required: true },
    type: { type: String, enum: ['deposit', 'withdraw', 'game-id', 'bonus', 'issue', 'freeplay'], required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    amount: { type: Number },
    bonusType: { type: String, default: '' },
    bonusPercent: { type: Number, default: 0 },
    bonusAmount: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    dailyBonusAmount: { type: Number, default: 0 },
    walletCredited: { type: Boolean, default: false },
    game: { type: String },
    gameUser: { type: String },
    gamePassword: { type: String },
    method: { type: String },
    handle: { type: String },
    payoutTag: { type: String },
    senderTag: { type: String, default: '' },
    isManualGateway: { type: Boolean, default: false },
    receiptScreenshotUrl: { type: String, default: '' },
    balanceScreenshotUrl: { type: String, default: '' },
    qrScreenshotUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Processing', 'Verified', 'Completed', 'Rejected'],
      default: 'Processing',
    },
    adminNote: { type: String, default: '' },
    externalRef: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

