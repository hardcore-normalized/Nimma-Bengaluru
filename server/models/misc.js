import mongoose from 'mongoose';

const { Schema } = mongoose;

// Blocks against misuse. type = what is blocked.
const blockSchema = new Schema(
  {
    type: { type: String, enum: ['phone', 'device', 'fingerprint', 'ip'], required: true },
    value: { type: String, required: true },
    reason: String,
    reporter: Schema.Types.ObjectId,
    relatedRef: String,
    until: Date, // null/undefined = permanent
    active: { type: Boolean, default: true },
    auto: { type: Boolean, default: false },
    by: Schema.Types.ObjectId,
    byName: String,
    liftedAt: Date,
    liftedBy: String,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
blockSchema.index({ type: 1, value: 1, active: 1 });

// Every privileged action is written here (who, what, when, from where).
const auditSchema = new Schema({
  at: { type: Date, default: Date.now, index: true },
  actorType: String, // official | citizen | system
  actorId: Schema.Types.ObjectId,
  actorName: String,
  actorRole: String,
  action: { type: String, index: true },
  targetType: String,
  targetId: String,
  targetRef: String,
  details: Schema.Types.Mixed,
  ip: String,
  ua: String,
});

// Admin-editable settings (single document).
const settingSchema = new Schema({ _id: String, values: Schema.Types.Mixed }, { timestamps: true });

export const Block = mongoose.models.Block || mongoose.model('Block', blockSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

// Free-tier usage counters, one document per period:
//   host-YYYY-MM  → minutes the server was awake, bytes sent, requests
//   db-YYYY-MM-DD → photo/video bytes written to / read from the database
const usageSchema = new Schema(
  {
    _id: String,
    awakeMinutes: { type: Number, default: 0 },
    bytesOut: { type: Number, default: 0 },
    requests: { type: Number, default: 0 },
    mediaIn: { type: Number, default: 0 },
    mediaOut: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Firewall bans (network level – every request from the IP is refused).
const firewallBanSchema = new Schema(
  {
    ip: { type: String, required: true, unique: true },
    until: Date, // null = permanent
    reason: String,
    auto: { type: Boolean, default: false },
    byName: String,
    count: { type: Number, default: 1 }, // how many times this IP was banned
  },
  { timestamps: true }
);

export const Usage = mongoose.models.Usage || mongoose.model('Usage', usageSchema);
export const FirewallBan = mongoose.models.FirewallBan || mongoose.model('FirewallBan', firewallBanSchema);
