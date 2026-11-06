// Database connection: MongoDB Atlas first, with an automatic local fallback
// (an embedded MongoDB stored in ./data/local-db) so a demo never stops because
// the network blocks Atlas.
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './env.js';

export const dbInfo = { mode: null, label: '', warning: '' };
let memoryServer = null;
let bucket = null;

function uriHasDbName(uri) {
  // mongodb+srv://user:pass@host/<db>?options  -> true when <db> is present
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/);
  return Boolean(m && m[1]);
}

async function connectAtlas(uri) {
  const opts = { serverSelectionTimeoutMS: 15000, maxPoolSize: 20 };
  if (!uriHasDbName(uri)) opts.dbName = config.dbName;
  try {
    await mongoose.connect(uri, opts);
  } catch (err) {
    // Some ISP / college DNS servers cannot resolve the SRV records Atlas uses.
    // Retry once with public DNS resolvers.
    if (/querySrv|ENOTFOUND|ECONNREFUSED|ETIMEOUT|EREFUSED/i.test(String(err && err.message))) {
      console.warn('  ! Atlas DNS lookup failed, retrying with public DNS (8.8.8.8 / 1.1.1.1)...');
      dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
      await mongoose.disconnect().catch(() => {});
      await mongoose.connect(uri, opts);
    } else {
      throw err;
    }
  }
  const host = mongoose.connection.host || 'atlas';
  dbInfo.mode = 'atlas';
  dbInfo.label = `MongoDB Atlas (${host}) / db "${mongoose.connection.name}"`;
}

async function connectLocal() {
  const { MongoMemoryServer } = await import('mongodb-memory-server-core');
  const dbPath = path.join(config.dataDir, 'local-db');
  fs.mkdirSync(dbPath, { recursive: true });
  console.log('  > Starting the built-in local database (first run downloads MongoDB once, ~100 MB)...');
  memoryServer = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', launchTimeout: 60000 },
    binary: { downloadDir: path.join(config.dataDir, 'mongodb-binaries') },
  });
  await mongoose.connect(memoryServer.getUri(), { dbName: config.dbName });
  dbInfo.mode = 'local';
  dbInfo.label = `Built-in local database (data/local-db) / db "${config.dbName}"`;
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const { mongoUri, dbMode } = config;

  if (dbMode !== 'local' && mongoUri) {
    try {
      await connectAtlas(mongoUri);
      return dbInfo;
    } catch (err) {
      const reason = String((err && err.message) || err).split('\n')[0].slice(0, 220);
      if (dbMode === 'atlas') {
        throw new Error(`Could not connect to MongoDB Atlas: ${reason}`);
      }
      dbInfo.warning =
        `Could not reach MongoDB Atlas (${reason}). Using the built-in local database instead. ` +
        'Check internet access and Atlas > Network Access (allow 0.0.0.0/0).';
      console.warn('\n  ! ' + dbInfo.warning + '\n');
      await mongoose.disconnect().catch(() => {});
    }
  } else if (dbMode === 'atlas') {
    throw new Error('DB_MODE=atlas but MONGODB_URI is empty in .env');
  }
  await connectLocal();
  return dbInfo;
}

export function mediaBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' });
  }
  return bucket;
}

export async function closeDatabase() {
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  if (memoryServer) {
    await memoryServer.stop({ doCleanup: false, force: false }).catch(() => {});
    memoryServer = null;
  }
}
