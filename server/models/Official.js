import mongoose from 'mongoose';

const { Schema } = mongoose;

const officialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 15 },
    designation: { type: String, trim: true, maxlength: 80 },
    department: { type: String, default: 'WARD' },
    role: { type: String, enum: ['admin', 'officer'], default: 'officer' },
    areas: [{ type: String }], // ward codes this official may see (admin = all)
    categories: [{ type: String }], // empty = all categories
    canViewSensitive: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
    lastLoginIp: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'Official' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

officialSchema.methods.toSafeJSON = function () {
  return {
    id: String(this._id),
    name: this.name,
    username: this.username,
    email: this.email || '',
    phone: this.phone || '',
    designation: this.designation || '',
    department: this.department,
    role: this.role,
    areas: this.areas || [],
    categories: this.categories || [],
    canViewSensitive: Boolean(this.canViewSensitive || this.role === 'admin'),
    active: this.active,
    mustChangePassword: this.mustChangePassword,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    isDemo: this.isDemo,
  };
};

export const Official = mongoose.models.Official || mongoose.model('Official', officialSchema);
