import mongoose from 'mongoose';

const { Schema } = mongoose;

// A browser/phone, identified by a signed cookie + a fingerprint hash.
// Lets officials see when one phone is used with many numbers (fake identities).
const deviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    fpHash: { type: String, index: true },
    fp: Schema.Types.Mixed,
    uas: [String],
    phones: [{ phone: String, reporter: Schema.Types.ObjectId, firstSeen: Date, lastSeen: Date, _id: false }],
    ips: [{ ip: String, firstSeen: Date, lastSeen: Date, count: Number, _id: false }],
    firstSeen: Date,
    lastSeen: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
