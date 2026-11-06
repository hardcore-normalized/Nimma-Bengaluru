// LAN address detection + a self-signed HTTPS certificate so phones on the same
// Wi-Fi get camera and GPS access (browsers only allow these on HTTPS).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { config } from './env.js';

const VIRTUAL = /(vEthernet|VirtualBox|VMware|vmnet|docker|br-|veth|utun|awdl|llw|bridge|Hyper-V|WSL|Loopback|tailscale|zerotier|ham|npcap|anpi|gif|stf|ap1)/i;

export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  const rank = (x) => {
    let r = 0;
    if (x.virtual) r += 100;
    if (x.address.startsWith('192.168.')) r += 0;
    else if (x.address.startsWith('10.')) r += 5;
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)) r += 8;
    else r += 20;
    if (/^(en0|en1|wlan|wlp|wi-?fi|wireless|wlan)/i.test(x.name)) r -= 2;
    return r;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

export function primaryLanIp() {
  const list = lanAddresses();
  return list.length ? list[0].address : null;
}

/** Load (or create) a self-signed certificate valid for localhost + all current LAN IPs. */
export function ensureCertificate() {
  const dir = path.join(config.dataDir, 'certs');
  fs.mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const metaFile = path.join(dir, 'meta.json');
  const ips = [...new Set(lanAddresses().map((a) => a.address))];
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const fresh = Date.now() - meta.createdAt < 300 * 86400000;
    const covers = ips.every((ip) => meta.ips.includes(ip));
    if (fresh && covers && fs.existsSync(keyFile) && fs.existsSync(certFile)) {
      return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
    }
  } catch {
    /* create a new one */
  }
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  // iPhones require: RSA ≥ 2048, SHA-256, validity ≤ 825 days, SAN and serverAuth.
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Nimma Bengaluru (local)' }, { name: 'organizationName', value: 'Nimma Bengaluru prototype' }], {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(metaFile, JSON.stringify({ createdAt: Date.now(), ips }));
  return { key: pems.private, cert: pems.cert };
}
