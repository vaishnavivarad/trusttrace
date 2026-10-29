require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const qrRoutes = require('./src/routes/qrRoutes');
const productRoutes = require('./src/routes/productRoutes');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const verificationRoutes = require('./src/routes/verificationRoutes');
const store = require('./src/services/appStore');

const app = express();
const port = Number(process.env.PORT || 5000);
const allowedOrigins = Array.from(new Set([
  ...String(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim().replace(/\/+$/, '')),
  String(process.env.FRONTEND_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
  String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, ''),
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean)));
function isOriginAllowed(origin) {
  if (!origin) return true;
  const clean = String(origin).trim().replace(/\/+$/, '');
  if (allowedOrigins.includes(clean)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)*(trycloudflare\.com|onrender\.com|vercel\.app|netlify\.app|ngrok-free\.app|ngrok\.io|lhr\.life|loca\.lt)(:\d+)?$/i.test(clean)) {
    return true;
  }
  if (process.env.NODE_ENV !== 'production') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(clean)) {
      return true;
    }
  }
  return false;
}
app.disable('x-powered-by');
// Behind Render/Railway/Fly load balancers, trust the first proxy hop so req.ip (and rate limiting) is per-client.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '');
if (trustProxy !== '') app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    const err = new Error('CORS origin is not allowed');
    err.status = 403;
    err.code = 'CORS_NOT_ALLOWED';
    return callback(err);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { success: false, code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please wait a moment and try again.' } }));
// Always serve freshly generated QR PNGs so any IP/FRONTEND_PUBLIC_URL change takes effect immediately.
app.get('/uploads/qr_codes/:filename', async (req, res, next) => {
  try {
    const match = /^([A-Za-z0-9_-]{3,100})\.png$/.exec(req.params.filename);
    if (!match) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'QR code not found.' });
    const { generateQRCode } = require('./src/services/qrService');
    const qr = await generateQRCode(match[1]);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Verification-Url', qr.verificationUrl);
    return res.sendFile(qr.filePath);
  } catch (err) { return next(err); }
});
app.use('/uploads/qr_codes', express.static(path.join(__dirname, 'uploads/qr_codes'), { fallthrough: true, maxAge: 0 }));
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/products', productRoutes);
app.use('/api/verification', verificationRoutes);
app.get('/api/health', async (req, res) => {
  let chainStatus = 'not-configured';
  const databaseMode = store.MODE;
  let databaseStatus = 'unavailable';
  try {
    await store.checkHealth();
    databaseStatus = 'reachable';
  } catch {
    databaseStatus = 'unavailable';
  }
  try {
    if (process.env.BLOCKCHAIN_RPC_URL && process.env.BLOCKCHAIN_CONTRACT_ADDRESS) {
      const blockchain = require('./src/services/blockchainService');
      await blockchain.getChainId();
      await blockchain.ensureContractDeployed();
      chainStatus = 'reachable';
    }
  } catch (err) {
    chainStatus = err.message && /No ProductAuth contract bytecode/i.test(err.message) ? 'contract-not-deployed' : 'unavailable';
  }
  const healthy = databaseStatus === 'reachable';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unavailable',
    service: 'TrustTrace API',
    storageMode: databaseMode,
    database: databaseStatus,
    blockchain: chainStatus,
    ipfsConfigured: Boolean(process.env.PINATA_JWT),
    mlServiceUrlConfigured: Boolean(process.env.ML_SERVICE_URL)
  });
});
const fs = require('fs');
const frontendDistDir = path.join(__dirname, '../frontend/dist');
const frontendIndexHtml = path.join(frontendDistDir, 'index.html');
app.use(express.static(frontendDistDir, { index: false }));
app.get('/', (req, res) => {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html') && fs.existsSync(frontendIndexHtml)) {
    return res.sendFile(frontendIndexHtml);
  }
  return res.json({ name: 'TrustTrace API', health: '/api/health' });
});
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads') && fs.existsSync(frontendIndexHtml)) {
    return res.sendFile(frontendIndexHtml);
  }
  return next();
});

app.use((req, res) => res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'API route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isDbDown = error.code === 'P1001' || error.code === 'P1002' || /Can't reach database server/i.test(error.message || '');
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : isDbDown ? 503 : 500);
  const message = isDbDown
    ? 'Database server (PostgreSQL on port 5432) is currently unreachable. Please ensure PostgreSQL service is running.'
    : status >= 500
      ? 'Unexpected server error. Check the backend logs for the request ID.'
      : error.message;
  const requestId = require('crypto').randomUUID();
  console.error(`[${requestId}] ${error.message}`);
  res.status(status).json({ success: false, code: error.code || 'INTERNAL_ERROR', message, requestId });
});

let server = null;
if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  server = app.listen(port, host, async () => {
    console.log(`TrustTrace API listening on http://localhost:${port} (bound to ${host}:${port})`);
    console.log(`Storage mode: ${store.MODE}`);
    try {
      const adminEmail = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
      const adminPassword = String(process.env.SEED_ADMIN_PASSWORD || '');
      if (adminEmail && adminPassword.length >= 8) {
        const { hashPassword } = require('./src/services/passwordService');
        const existingAdmin = await store.findUserByEmail(adminEmail);
        if (existingAdmin) {
          await store.update('users', existingAdmin.id, { passwordHash: await hashPassword(adminPassword), role: 'admin', status: 'ACTIVE' });
        } else {
          const now = new Date().toISOString();
          await store.insert('users', { id: require('crypto').randomUUID(), name: 'TrustTrace Admin', email: adminEmail, passwordHash: await hashPassword(adminPassword), role: 'admin', status: 'ACTIVE', walletAddress: null, createdAt: now, updatedAt: now });
        }
      }
    } catch { /* non-fatal */ }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('replace-with')) console.warn('WARNING: set SESSION_SECRET in backend/.env before non-local use.');
    if (String(process.env.BLOCKCHAIN_CHAIN_ID || '').trim() === '31337' && store.MODE === 'postgres') {
      try {
        const { syncState } = require('./scripts/syncLocalChainState');
        await syncState({ keepStoreOpen: true });
      } catch (err) {
        console.warn(`Local Hardhat auto-sync on startup warning: ${err.message}`);
      }
    }
  });
  async function shutdown() { if (server) server.close(async () => { await store.disconnect().catch(() => {}); process.exit(0); }); }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
module.exports = app;
