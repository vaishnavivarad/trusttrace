const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rawMode = process.env.STORAGE_MODE
  ? String(process.env.STORAGE_MODE).trim().toLowerCase()
  : (process.env.DATABASE_URL ? 'postgres' : 'file');

if (rawMode !== 'file' && rawMode !== 'postgres') {
  throw new Error(`Invalid STORAGE_MODE "${rawMode}". Must be "file" or "postgres".`);
}

const MODE = rawMode;
const STORE_FILE = process.env.STORE_FILE_PATH
  ? path.resolve(process.env.STORE_FILE_PATH)
  : path.join(__dirname, '../../data/trusttrace-store.json');
const isPrisma = MODE === 'postgres';
let prisma = null;
let fallbackToFile = false;

function isLocalDbConnectionError(err) {
  if (process.env.NODE_ENV === 'production') return false;
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === 'P1001' || code === 'P1002' || /Can't reach database server/i.test(msg);
}

async function withStore(prismaFn, fileFn) {
  if (isPrisma && !fallbackToFile) {
    try {
      return await prismaFn();
    } catch (err) {
      if (isLocalDbConnectionError(err)) {
        fallbackToFile = true;
        console.warn('[TrustTrace Store] PostgreSQL is unreachable; automatically falling back to persistent file store (backend/data/trusttrace-store.json).');
        return await fileFn();
      }
      throw err;
    }
  }
  return await fileFn();
}

const emptyStore = () => ({ users: [], applications: [], products: [], sessions: [], scanEvents: [], imageComparisons: [], auditLogs: [] });
const prismaModels = {
  users: 'user', applications: 'manufacturerApplication', products: 'product',
  sessions: 'verificationSession', scanEvents: 'scanEvent', imageComparisons: 'imageComparison', auditLogs: 'auditLog'
};

function getPrisma() {
  if (!isPrisma) return null;
  if (prisma) return prisma;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required when STORAGE_MODE=postgres.');
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    return prisma;
  } catch (error) {
    throw new Error('Prisma client is not installed/generated. Run npm install and npx prisma generate.');
  }
}

function ensureFile() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(emptyStore(), null, 2));
}
function readFileStore() {
  ensureFile();
  try {
    const value = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { ...emptyStore(), ...value };
  } catch {
    throw new Error(`Local JSON store is invalid: ${STORE_FILE}. Back it up and repair the JSON before restarting.`);
  }
}
function writeFileStore(value) {
  ensureFile();
  const tmp = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  try {
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      fs.copyFileSync(tmp, STORE_FILE);
      try { fs.unlinkSync(tmp); } catch { /* ignore cleanup error */ }
    } else {
      throw err;
    }
  }
}
function normalizeDateFields(record) {
  const copy = { ...record };
  for (const [key, value] of Object.entries(copy)) {
    if (value != null && /At$/.test(key) && typeof value === 'string') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) copy[key] = d;
    }
  }
  return copy;
}
function normalizeFromPrisma(record) {
  if (!record) return record;
  const copy = { ...record };
  for (const [key, value] of Object.entries(copy)) if (value instanceof Date) copy[key] = value.toISOString();
  return copy;
}

async function all(collection) {
  if (!prismaModels[collection]) throw new Error(`Unknown collection: ${collection}`);
  return withStore(
    async () => {
      const model = getPrisma()[prismaModels[collection]];
      return (await model.findMany({ orderBy: collection === 'users' || collection === 'applications' ? { createdAt: 'desc' } : undefined })).map(normalizeFromPrisma);
    },
    async () => readFileStore()[collection]
  );
}
async function findById(collection, id) {
  return withStore(
    async () => normalizeFromPrisma(await getPrisma()[prismaModels[collection]].findUnique({ where: { id } })),
    async () => (await all(collection)).find((row) => row.id === id) || null
  );
}
async function insert(collection, record) {
  return withStore(
    async () => {
      const data = normalizeDateFields(record);
      return normalizeFromPrisma(await getPrisma()[prismaModels[collection]].create({ data }));
    },
    async () => {
      const store = readFileStore();
      const rows = store[collection];
      if (rows.some((row) => row.id === record.id)) throw new Error(`Duplicate ${collection} id.`);
      rows.push(record);
      writeFileStore(store);
      return record;
    }
  );
}
async function update(collection, id, patch) {
  return withStore(
    async () => normalizeFromPrisma(await getPrisma()[prismaModels[collection]].update({ where: { id }, data: normalizeDateFields(patch) })),
    async () => {
      const store = readFileStore();
      const index = store[collection].findIndex((row) => row.id === id);
      if (index < 0) return null;
      store[collection][index] = { ...store[collection][index], ...patch };
      writeFileStore(store);
      return store[collection][index];
    }
  );
}
async function remove(collection, id) {
  return withStore(
    async () => normalizeFromPrisma(await getPrisma()[prismaModels[collection]].delete({ where: { id } })),
    async () => {
      const store = readFileStore();
      const prev = store[collection].length;
      store[collection] = store[collection].filter((row) => row.id !== id);
      writeFileStore(store);
      return prev !== store[collection].length;
    }
  );
}
async function findUserByEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  return withStore(
    async () => {
      const user = await getPrisma().user.findUnique({ where: { email: normalized } });
      return normalizeFromPrisma(user);
    },
    async () => (await all('users')).find((u) => u.email.toLowerCase() === normalized) || null
  );
}
async function findUserByWallet(walletAddress) {
  if (!walletAddress) return null;
  const normalized = String(walletAddress).trim();
  return withStore(
    async () => {
      const user = await getPrisma().user.findFirst({
        where: { walletAddress: { equals: normalized, mode: 'insensitive' } }
      });
      return normalizeFromPrisma(user);
    },
    async () => (await all('users')).find((u) => u.walletAddress && u.walletAddress.toLowerCase() === normalized.toLowerCase()) || null
  );
}
async function checkHealth() {
  return withStore(
    async () => {
      await getPrisma().$queryRaw`SELECT 1`;
      return { reachable: true, mode: MODE };
    },
    async () => {
      readFileStore();
      return { reachable: true, mode: fallbackToFile ? 'file-fallback' : MODE };
    }
  );
}
async function findApplicationByUserId(userId) {
  if (!userId) return null;
  return withStore(
    async () => {
      const app = await getPrisma().manufacturerApplication.findFirst({ where: { userId } });
      return normalizeFromPrisma(app);
    },
    async () => (await all('applications')).find((a) => a.userId === userId) || null
  );
}
async function findProductByProductId(productId) {
  if (!productId) return null;
  return withStore(
    async () => {
      const product = await getPrisma().product.findUnique({ where: { productId } });
      return normalizeFromPrisma(product);
    },
    async () => (await all('products')).find((p) => p.productId === productId) || null
  );
}
async function createId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
async function latestUsableScan(productId) {
  const rows = (await all('scanEvents')).filter((s) => s.productId === productId && s.locationConsent && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && !['INVALID_COORDINATES', 'LOCATION_UNCERTAIN', 'INVALID_TIME'].includes(s.caspgStatus));
  rows.sort((a, b) => new Date(b.serverReceivedAt).getTime() - new Date(a.serverReceivedAt).getTime());
  return rows[0] || null;
}
async function createAudit(action, actorUserId, targetType, targetId, status, metadata = {}) {
  return insert('auditLogs', { id: await createId('audit'), actorUserId: actorUserId || null, action, targetType, targetId: targetId || null, status, metadata, createdAt: new Date().toISOString() });
}
async function disconnect() { if (prisma) await prisma.$disconnect(); }
module.exports = { MODE, isPrisma, all, findById, insert, update, remove, findUserByEmail, findUserByWallet, findApplicationByUserId, findProductByProductId, createId, latestUsableScan, createAudit, checkHealth, disconnect };
