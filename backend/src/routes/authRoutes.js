const express = require('express');
const crypto = require('crypto');
const store = require('../services/appStore');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { makeToken } = require('../services/tokenService');
const { requireAuth } = require('../middleware/authMiddleware');
const router = express.Router();

function cleanUser(u) { return { id: u.id, name: u.name, email: u.email, role: String(u.role).toLowerCase(), status: u.status, walletAddress: u.walletAddress || null }; }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')); }

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, role = 'customer', companyName, businessEmail, contactName, category, walletAddress } = req.body || {};
    const normalizedRole = String(role).toLowerCase();
    if (!name || String(name).trim().length < 2) return res.status(400).json({ success: false, code: 'INVALID_NAME', message: 'Enter your full name.' });
    if (!validEmail(email)) return res.status(400).json({ success: false, code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ success: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least 8 characters.' });
    if (!['customer', 'manufacturer'].includes(normalizedRole)) return res.status(400).json({ success: false, code: 'INVALID_ROLE', message: 'Choose Customer or Manufacturer.' });
    if (normalizedRole === 'manufacturer') {
      if (!companyName || !businessEmail || !contactName || !category || !walletAddress) return res.status(400).json({ success: false, code: 'MISSING_MANUFACTURER_FIELDS', message: 'Company, business email, contact name, category and wallet address are required.' });
      if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress))) return res.status(400).json({ success: false, code: 'INVALID_WALLET', message: 'Enter a valid EVM wallet address.' });
    }
    if (await store.findUserByEmail(String(email).trim())) return res.status(409).json({ success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
    if (normalizedRole === 'manufacturer' && (await store.findUserByWallet(String(walletAddress).trim()))) {
      return res.status(409).json({ success: false, code: 'WALLET_EXISTS', message: 'An account with this wallet address already exists.' });
    }
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const user = {
      id: userId, name: String(name).trim(), email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(password), role: normalizedRole,
      status: normalizedRole === 'manufacturer' ? 'PENDING' : 'ACTIVE',
      walletAddress: normalizedRole === 'manufacturer' ? String(walletAddress).trim() : null,
      createdAt: now, updatedAt: now
    };
    try {
      await store.insert('users', user);
    } catch (err) {
      if (err && err.code === 'P2002') {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target || '');
        if (target.includes('walletAddress')) return res.status(409).json({ success: false, code: 'WALLET_EXISTS', message: 'An account with this wallet address already exists.' });
        if (target.includes('email')) return res.status(409).json({ success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
      }
      throw err;
    }
    if (normalizedRole === 'manufacturer') {
      await store.insert('applications', {
        id: crypto.randomUUID(), userId, companyName: String(companyName).trim(), businessEmail: String(businessEmail).trim().toLowerCase(),
        contactName: String(contactName).trim(), category: String(category).trim(), walletAddress: String(walletAddress).trim(),
        status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: now, updatedAt: now
      });
      await store.createAudit('MANUFACTURER_APPLICATION_SUBMITTED', userId, 'ManufacturerApplication', null, 'PENDING');
      return res.status(201).json({ success: true, message: 'Manufacturer account created. Product registration is available after admin approval and on-chain wallet authorization.', user: cleanUser(user), token: makeToken(user) });
    }
    await store.createAudit('CUSTOMER_SIGNUP', userId, 'User', userId, 'SUCCESS');
    return res.status(201).json({ success: true, message: 'Account created successfully.', user: cleanUser(user), token: makeToken(user) });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, code: 'MISSING_CREDENTIALS', message: 'Email and password are required.' });
    const user = await store.findUserByEmail(String(email).trim());
    if (!user || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    if (user.status === 'DISABLED' || user.status === 'REJECTED') return res.status(403).json({ success: false, code: 'ACCOUNT_DISABLED', message: 'This account is disabled or rejected.' });
    await store.createAudit('LOGIN', user.id, 'User', user.id, 'SUCCESS');
    let app = String(user.role).toLowerCase() === 'manufacturer' ? await store.findApplicationByUserId(user.id) : null;
    if (app && app.walletAddress) {
      let onChainAuthorized = null;
      try {
        const blockchain = require('../services/blockchainService');
        onChainAuthorized = await blockchain.isAuthorizedManufacturer(app.walletAddress);
      } catch {
        onChainAuthorized = null;
      }
      app = { ...app, onChainAuthorized };
    }
    res.json({ success: true, message: 'Signed in successfully.', token: makeToken(user), user: cleanUser(user), manufacturerApplication: app });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res) => {
  let app = String(req.user.role).toLowerCase() === 'manufacturer' ? await store.findApplicationByUserId(req.user.id) : null;
  if (app && app.walletAddress) {
    let onChainAuthorized = null;
    let configuredContractAddress = null;
    try {
      const blockchain = require('../services/blockchainService');
      configuredContractAddress = blockchain.getConfiguredContractAddress() || null;
      onChainAuthorized = await blockchain.isAuthorizedManufacturer(app.walletAddress);
      if (onChainAuthorized === false && app.status === 'APPROVED') {
        const authRes = await blockchain.authorizeManufacturer(app.walletAddress);
        await store.update('applications', app.id, { authorizationTxHash: authRes.txHash });
        onChainAuthorized = true;
      }
    } catch {
      onChainAuthorized = null;
    }
    app = { ...app, onChainAuthorized, configuredContractAddress };
  }
  res.json({ success: true, user: req.user, manufacturerApplication: app });
});
module.exports = router;
