import express from 'express';
import { dbInfo } from '../db.js';
import { config } from '../env.js';
import { lanAddresses } from '../network.js';
import { runtime } from '../runtime.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, db: dbInfo.mode, time: new Date() });
});

// Used by the "Open on your phone" page to build the QR code.
router.get('/network', (req, res) => {
  const lan = lanAddresses();
  const proto = config.enableHttps ? 'https' : 'http';
  const port = config.enableHttps ? runtime.httpsPort : runtime.httpPort;
  const urls = lan.map((a) => ({ name: a.name, address: a.address, virtual: a.virtual, url: `${proto}://${a.address}:${port}` }));
  res.json({
    phoneUrl: runtime.publicUrl || urls.find((u) => !u.virtual)?.url || urls[0]?.url || null,
    lanUrls: urls,
    publicUrl: runtime.publicUrl || null,
    httpsEnabled: config.enableHttps,
    httpPort: runtime.httpPort,
    httpsPort: runtime.httpsPort,
    localUrl: `http://localhost:${runtime.httpPort}`,
    db: { mode: dbInfo.mode, label: dbInfo.label, warning: dbInfo.warning },
  });
});

export default router;
