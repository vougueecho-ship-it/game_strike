import mongoose from 'mongoose';

const blockedDeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, index: true },
    deviceFingerprint: { type: String, index: true },
    ip: { type: String, index: true },
    reason: { type: String, default: 'Fraudulent activity / Multi-accounting' },
    blockedBy: { type: String, default: 'admin' },
  },
  { timestamps: true }
);

export const BlockedDevice =
  mongoose.models.BlockedDevice || mongoose.model('BlockedDevice', blockedDeviceSchema);
