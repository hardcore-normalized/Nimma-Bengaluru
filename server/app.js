// Express application: security headers, API routes and the built React app.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './env.js';
import { runtime } from './runtime.js';
import { HttpError, isLoopback } from './lib/http.js';
import { csrfGuard, deviceMiddleware } from './lib/auth.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import officialRoutes from './routes/official.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import systemRoutes from './routes/system.js';
import { firewall } from './lib/firewall.js';
import { usageMeter } from './lib/usage.js';

export function createApp({ secure }) {
  const app = express();
  app.disable('x-powered-by');
  // Whose X-Forwarded-For header to believe for the visitor's real IP:
  // on this PC only a local tunnel ('loopback'); on Render, Render's proxy (1 hop).
  app.set('trust proxy', config.trustProxy);

  // Firewall first, so blocked requests cost almost nothing; then the usage meter.
  app.use(firewall());
  app.use(usageMeter());

  // Plain-HTTP requests from other devices are redirected to HTTPS, because phones
  // only allow camera + GPS on secure pages. (localhost is already "secure".)
  if (!secure && config.enableHttps) {
    app.use((req, res, next) => {
      if (isLoopback(req)) return next();
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      res.redirect(302, `https://${host}:${runtime.httpsPort}${req.originalUrl}`);
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
          'media-src': ["'self'", 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: false, // never pin HSTS on localhost / LAN IPs
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=()');
    next();
  });
  app.use(compression());
  app.use(express.json({ limit: '300kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser(config.secret));

  // ---- API
  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(csrfGuard);
  api.use(deviceMiddleware);
  api.use('/system', systemRoutes);
  api.use('/public', publicRoutes);
  api.use('/auth', authRoutes);
  api.use('/official', officialRoutes);
  api.use('/admin', adminRoutes);
  api.use('/media', mediaRoutes);
  api.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }));
  app.use('/api', api);

  // ---- Built React client
  const dist = config.clientDist;
  const indexHtml = path.join(dist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      '/assets',
      express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d' })
    );
    // Old tabs may request hashed assets removed by a newer build. Return a
    // real 404 so the client can refresh, instead of logging an ENOENT as 500.
    app.use('/assets', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendStatus(404);
    });
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (req, res) =>
      res
        .status(503)
        .type('html')
        .send('<h2>Nimma Bengaluru</h2><p>The web app has not been built yet. Run <code>npm run build</code> (the start script does this automatically).</p>')
    );
  }

  // ---- Errors → JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'File too large. Photos max 10 MB, video max 25 MB.' } });
    }
    if (err?.name === 'MulterError') {
      return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: `Upload problem: ${err.message}` } });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed request body.' } });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    console.error('  ! Unexpected error on', req.method, req.originalUrl, '\n', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Please try again.' } });
  });

  return app;
}
