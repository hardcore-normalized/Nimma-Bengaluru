import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// A citizen record keyed by self-reported contact number. No password / account.
const reporterSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true }, // 10-digit Indian mobile number
    name: String,
    names: [String], // every name ever used with this number
    locality: String, // residential locality (latest)
    localities: [String],
    devices: [
      {
        deviceId: String,
        fpHash: String,
        ua: String,
        platform: String,
        firstSeen: Date,
        lastSeen: Date,
        _id: false,
      },
    ],
    ips: [{ ip: String, firstSeen: Date, lastSeen: Date, count: Number, _id: false }],
    contactClaims: [{ at: Date, ip: String, deviceId: String, ua: String, name: String, _id: false }],
    strikes: [
      {
        report: ObjectId,
        ref: String,
        reason: String,
        by: ObjectId,
        byName: String,
        at: Date,
        revoked: { type: Boolean, default: false },
      },
    ],
    stats: {
      reports: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      spam: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
    },
    firstSeenAt: Date,
    lastSeenAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reporterSchema.methods.activeStrikes = function () {
  return (this.strikes || []).filter((s) => !s.revoked);
};

export const Reporter = mongoose.models.Reporter || mongoose.model('Reporter', reporterSchema);
