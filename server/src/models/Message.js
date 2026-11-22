import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    threadId: { type: String, enum: ['concierge', 'cashier', 'accounts'], default: 'concierge' },
    sender: { type: String, enum: ['agent', 'user', 'system'], required: true },
    agentName: { type: String, default: 'GameStrike Concierge' },
    text: { type: String, default: '' },
    attachmentUrl: { type: String },
    attachmentName: { type: String },
    card: { type: String },
    cardData: { type: mongoose.Schema.Types.Mixed },
    quickReplies: [
      {
        label: String,
        action: String,
      },
    ],
    read: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    deletedForEveryone: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

