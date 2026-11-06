// Private media access. Photos/videos are never public by default:
//  - officials: only for reports inside their scope
//  - the reporter: their own report's media
//  - everyone: only "after" (resolution) photos of non-confidential reports
import express from 'express';
import mongoose from 'mongoose';
import { Report } from '../models/index.js';
import { loadOfficial, loadCitizen, canAccessReport } from '../lib/auth.js';
import { streamFile } from '../lib/media.js';
import { forbidden, notFound } from '../lib/http.js';

const router = express.Router();

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('File not found');
  const fileId = new mongoose.Types.ObjectId(req.params.id);
  const report = await Report.findOne({ 'media.fileId': fileId }, { media: 1, reporter: 1, area: 1, category: 1, sensitive: 1, ref: 1 }).lean();
  if (!report) throw notFound('File not found');
  const m = report.media.find((x) => String(x.fileId) === String(fileId));

  const official = await loadOfficial(req);
  let allowed = Boolean(official && canAccessReport(official, report));
  if (!allowed) {
    const citizen = await loadCitizen(req);
    allowed = Boolean(citizen && String(report.reporter) === String(citizen._id));
  }
  if (!allowed && m.role === 'resolution' && !report.sensitive) allowed = true;
  if (!allowed) throw forbidden('You are not allowed to view this file.');

  await streamFile(fileId, req, res, m.mime);
});

export default router;
