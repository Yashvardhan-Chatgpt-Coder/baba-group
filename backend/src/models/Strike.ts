import mongoose, { Document, Schema } from 'mongoose';

export type StrikeStatus = 'ACTIVE' | 'EXPIRED' | 'REMOVED';

export interface IStrike extends Document {
  userId: string;
  guildId: string;
  strikeNumber: number;
  reason: string;
  issuerId: string;
  issuerTag: string;
  durationDays: number;
  issuedAt: Date;
  expiresAt: Date;
  status: StrikeStatus;
  removedAt?: Date;
  removedBy?: string;
  removeReason?: string;
}

const StrikeSchema: Schema = new Schema<IStrike>(
  {
    userId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    strikeNumber: { type: Number, required: true },
    reason: { type: String, required: true },
    issuerId: { type: String, required: true },
    issuerTag: { type: String, required: true },
    durationDays: { type: Number, required: true },
    issuedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'REMOVED'],
      default: 'ACTIVE',
      index: true,
    },
    removedAt: { type: Date },
    removedBy: { type: String },
    removeReason: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Strike = mongoose.model<IStrike>('Strike', StrikeSchema);
