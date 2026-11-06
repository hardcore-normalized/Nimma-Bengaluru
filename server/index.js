// Nimma Bengaluru server entry point.
//  http://localhost:PORT        → for this computer (camera/GPS allowed on localhost)
//  https://<wifi-ip>:HTTPS_PORT → for phones on the same Wi-Fi (self-signed certificate)
import http from 'node:http';
import https from 'node:https';
import { exec } from 'node:child_process';
import QRCode from 'qrcode';
import { config } from './env.js';
import { runtime } from './runtime.js';
import { connectDatabase, closeDatabase, dbInfo } from './db.js';
import { createApp } from './app.js';
import { ensureCertificate, lanAddresses } from './network.js';
import { seedAll } from './seed/seed.js';
import { DEMO_ACCOUNTS } from './seed/accounts.js';
import { Report, Reporter, Device, Official, Block, AuditLog, FirewallBan } from './models/index.js';
import { loadBans } from './lib/firewall.js';
import { startUsageTracking, stopUsageTracking, getUsageStatus } from './lib/usage.js';

const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  c: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function listen(server, port, label) {
  return new Promise((resolve, reject) => {
    let p = port;
    const tryListen = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < port + 20) {
          console.warn(c.y(`  ! Port ${p} is busy, trying ${p + 1} for ${label}...`));
          p += 1;
          tryListen();
        } else reject(err);
      });
      server.listen(p, '0.0.0.0', () => resolve(p));
    };
    tryListen();
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  console.log('\n' + c.b('  Nimma Bengaluru') + c.dim('  – civic issue reporting platform (academic prototype)\n'));

  console.log('  > Connecting to the database...');
  await connectDatabase();
  console.log(c.g('  ✓ ') + dbInfo.label);

  await Promise.all([Report, Reporter, Device, Official, Block, AuditLog, FirewallBan].map((m) => m.init()));
  const bans = await loadBans();
  console.log(c.g('  ✓ ') + `Firewall on${bans ? ` (${bans} active ban${bans === 1 ? '' : 's'})` : ''}`);
  startUsageTracking();
  const seeded = await seedAll({ demo: config.seedDemoData });
  if (seeded.accounts) console.log(c.g('  ✓ ') + `Created ${seeded.accounts} demo account(s)`);
  if (seeded.data && !seeded.data.skipped) console.log(c.g('  ✓ ') + `Loaded demo data: ${seeded.data.reports} reports from ${seeded.data.reporters} citizens`);

  const httpServer = http.createServer(createApp({ secure: false }));
  runtime.httpPort = await listen(httpServer, config.port, 'HTTP');

  let httpsServer = null;
  if (config.enableHttps) {
    const creds = ensureCertificate();
    httpsServer = https.createServer(creds, createApp({ secure: true }));
    runtime.httpsPort = await listen(httpsServer, config.httpsPort, 'HTTPS');
  }

  if (config.onRender) {
    // Cloud mode: Render gives the app a public https:// address.
    console.log('');
    console.log(c.b('  Public link : ') + c.c(runtime.publicUrl || '(see your Render dashboard)'));
    console.log(c.b('  Admin portal: ') + c.c(`${runtime.publicUrl}/official`));
    if (!process.env.JWT_SECRET) console.log(c.y('  ! JWT_SECRET is not set – everyone is signed out whenever Render restarts the app. Add it in Render → Environment.'));
    const usage = await getUsageStatus().catch(() => null);
    if (usage && usage.level !== 'ok') console.log(c.y(`  ! Free-plan usage is at "${usage.level}" – see Admin portal → Free-tier usage.`));
  } else {
    await printLocalAccess();
  }
  if (dbInfo.warning) console.log(c.y('\n  ! ' + dbInfo.warning));

  const shutdown = async () => {
    console.log('\n  Stopping Nimma Bengaluru...');
    httpServer.close();
    httpsServer?.close();
    await stopUsageTracking();
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function printLocalAccess() {
  const lan = lanAddresses().filter((a) => !a.virtual);
  const phoneUrl = runtime.publicUrl || (lan[0] ? `${config.enableHttps ? 'https' : 'http'}://${lan[0].address}:${config.enableHttps ? runtime.httpsPort : runtime.httpPort}` : null);
  const localUrl = `http://localhost:${runtime.httpPort}`;

  console.log('');
  console.log(c.b('  On this computer : ') + c.c(localUrl));
  console.log(c.b('  Official portal  : ') + c.c(`${localUrl}/official`));
  if (phoneUrl) {
    console.log(c.b('  On your phone    : ') + c.c(phoneUrl) + c.dim('  (same Wi-Fi)'));
    for (const a of lan.slice(1)) console.log(c.dim(`                     also: https://${a.address}:${runtime.httpsPort}  (${a.name})`));
    console.log('\n  Scan with your phone camera:\n');
    try {
      const qr = await QRCode.toString(phoneUrl, { type: 'terminal', small: true, errorCorrectionLevel: 'M' });
      console.log(qr.split('\n').map((l) => '   ' + l).join('\n'));
    } catch {
      /* QR is optional */
    }
    if (config.enableHttps && !runtime.publicUrl) {
      console.log(c.y('  First time on the phone: the browser shows "Your connection is not private".'));
      console.log(c.y('  Tap "Advanced" → "Proceed to ' + (lan[0]?.address || 'site') + '" (iPhone: "Show Details" → "visit this website").'));
      console.log(c.dim('  This is expected – the site uses its own local security certificate.'));
    }
  } else {
    console.log(c.y('  ! No Wi-Fi / LAN address found. Connect this computer to Wi-Fi to use the phone.'));
  }
  console.log('');
  console.log(c.b('  Demo logins (official portal):'));
  for (const a of DEMO_ACCOUNTS) console.log(`    ${a.username.padEnd(14)} ${a.password.padEnd(12)} ${c.dim(a.designation)}`);
  console.log(c.dim(`\n  SMS receipt mode: ${config.smsMode}`));
  console.log(c.dim('\n  Keep this window open while using the app. Press Ctrl+C to stop.\n'));

  if (config.openBrowser) openBrowser(`${localUrl}/connect`);
}

main().catch(async (err) => {
  console.error('\n  ✗ Could not start Nimma Bengaluru:\n   ', err?.message || err);
  if (/bad auth|authentication failed/i.test(String(err?.message))) {
    console.error('    → The MongoDB username/password in .env is wrong.');
  }
  await closeDatabase();
  process.exit(1);
});
