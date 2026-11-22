import mongoose from 'mongoose';

const paymentGatewaySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    handle: { type: String, required: true },
    badge: { type: String, default: 'Instant' },
    eta: { type: String, default: '1–5 mins' },
    minAmount: { type: Number, default: 10 },
    maxAmount: { type: Number, default: 5000 },
    fee: { type: String, default: '0% Fee' },
    supportsDeposit: { type: Boolean, default: true },
    supportsWithdraw: { type: Boolean, default: true },
    color: { type: String, default: '#2563EB' },
    qrImageUrl: { type: String, default: '' },
    directPaymentLink: { type: String, default: '' },
    instructions: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    // Pluggable Payment Gateway API Config
    apiConfig: {
      provider: { type: String, default: 'manual' },
      baseUrl: { type: String, default: '' },
      apiKey: { type: String, default: '' },
      webhookSecret: { type: String, default: '' },
      isConnected: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const PaymentGateway =
  mongoose.models.PaymentGateway || mongoose.model('PaymentGateway', paymentGatewaySchema);

