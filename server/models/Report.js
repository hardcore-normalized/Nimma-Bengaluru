import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// One photo / video attached to a report (the file itself lives in GridFS).
const mediaSchema = new Schema(
  {
    fileId: ObjectId,
    kind: { type: String, enum: ['image', 'video'] },
    mime: String,
    size: Number,
    sha256: String, // exact-duplicate detection
    phash: String, // perceptual hash: near-duplicate detection (re-used photos)
    role: { type: String, enum: ['evidence', 'resolution', 'correction', 'progress'], default: 'evidence' },
    captureMethod: { type: String, enum: ['live', 'native', 'gallery', 'official', 'seed'] },
    capturedAt: Date,
    gps: { lat: Number, lng: Number, accuracy: Number },
    exifDate: Date,
    exifLat: Number,
    exifLng: Number,
    width: Number,
    height: Number,
    durationSec: Number,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Append-only status history (never overwritten).
const historySchema = new Schema(
  {
    from: String,
    to: String,
    reason: String,
    actorType: { type: String, enum: ['citizen', 'official', 'system'] },
    actorId: ObjectId,
    actorName: String,
    at: { type: Date, default: Date.now },
    public: { type: Boolean, default: true },
  },
  { _id: true }
);

const noteSchema = new Schema({ text: String, by: ObjectId, byName: String, at: { type: Date, default: Date.now } }, { _id: true });

const assignmentSchema = new Schema(
  {
    department: String,
    team: String,
    official: ObjectId,
    officialName: String,
    dueAt: Date,
    note: String,
    by: ObjectId,
    byName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const signalSchema = new Schema({ code: String, label: String, weight: Number }, { _id: false });

const reportSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true }, // public, non-sequential reference
    category: { type: String, required: true, index: true },
    group: String,
    description: { type: String, maxlength: 1500 },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    hazard: { type: Boolean, default: false },

    // Incident location (kept separate from the reporter's residence)
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    locationAccuracy: Number,
    locationSource: { type: String, enum: ['gps', 'gps-adjusted', 'map'] },
    landmark: String,
    address: String,
    area: { type: String, index: true }, // ward code, e.g. "C-015"
    areaName: String,
    corporation: String,
    zone: String,

    // Who reported it (private – never sent to public endpoints)
    reporter: { type: ObjectId, ref: 'Reporter', index: true },
    reporterSnapshot: { name: String, phone: String, locality: String },

    // Forensic data captured at submission – used to trace misuse
    client: {
      deviceId: String,
      fpHash: String,
      ip: String,
      ua: String,
      platform: String,
      screen: String,
      tz: String,
      lang: String,
      deviceLocation: { lat: Number, lng: Number, accuracy: Number, at: Date },
      distanceToIssueM: Number,
      formDurationMs: Number,
      startedAt: Date,
      viaTunnel: Boolean,
    },

    media: [mediaSchema],
    status: { type: String, index: true },
    history: [historySchema],
    notes: [noteSchema],
    assignment: assignmentSchema,
    assignments: [assignmentSchema],
    resolution: { note: String, at: Date, by: ObjectId, byName: String },
    duplicateOf: String,
    possibleDuplicates: [String],
    supporters: [{ reporter: ObjectId, at: Date, _id: false }],
    supportCount: { type: Number, default: 0 },
    sensitive: { type: Boolean, default: false, index: true },
    risk: { score: { type: Number, default: 0 }, level: { type: String, default: 'low' }, signals: [signalSchema] },
    spam: { reason: String, by: ObjectId, byName: String, at: Date },
    correctionRequest: { message: String, byName: String, at: Date },
    citizenResponses: [{ text: String, at: Date, mediaIds: [ObjectId], _id: false }],
    reopenRequests: [{ reason: String, at: Date, _id: false }],
    slaDueAt: Date,
    closedAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ area: 1, status: 1, createdAt: -1 });
reportSchema.index({ 'media.sha256': 1 });
reportSchema.index({ 'client.deviceId': 1, createdAt: -1 });
reportSchema.index({ 'client.fpHash': 1 });
reportSchema.index({ createdAt: -1 });

reportSchema.virtual('lat').get(function () {
  return this.location?.coordinates?.[1];
});
reportSchema.virtual('lng').get(function () {
  return this.location?.coordinates?.[0];
});

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
