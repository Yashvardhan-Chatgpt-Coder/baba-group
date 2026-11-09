import mongoose, { Document, Schema } from 'mongoose';

export interface IBlacklistRegistry extends Document {
  registryId: string;
  names: string[];
  postedMessage?: {
    channelId: string;
    messageId: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const BlacklistRegistrySchema: Schema = new Schema<IBlacklistRegistry>(
  {
    registryId: { type: String, required: true, unique: true, default: 'default' },
    names: { type: [String], default: [] },
    postedMessage: {
      channelId: { type: String },
      messageId: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

export const BlacklistRegistry = mongoose.model<IBlacklistRegistry>(
  'BlacklistRegistry',
  BlacklistRegistrySchema
);
