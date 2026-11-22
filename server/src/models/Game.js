import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tag: { type: String, default: 'Live' },
    category: { type: String, enum: ['Fish Tables', 'Slots', 'Sweeps', 'Hot'], default: 'Hot' },
    platforms: [{ type: String }],
    minDeposit: { type: Number, default: 10 },
    playersOnline: { type: Number, default: 150 },
    accentFrom: { type: String, default: '#2563EB' },
    accentTo: { type: String, default: '#06B6D4' },
    initials: { type: String, default: 'GS' },
    downloadUrl: { type: String, default: '#' },
    enabled: { type: Boolean, default: true },
    // Pluggable Game Provider API Config
    apiConfig: {
      provider: { type: String, default: 'manual' },
      baseUrl: { type: String, default: '' },
      apiKey: { type: String, default: '' },
      apiSecret: { type: String, default: '' },
      agentId: { type: String, default: '' },
      isConnected: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const Game = mongoose.models.Game || mongoose.model('Game', gameSchema);

