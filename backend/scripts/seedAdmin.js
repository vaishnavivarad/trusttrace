require('dotenv').config();
const crypto = require('crypto');
const store = require('../src/services/appStore');
const { hashPassword } = require('../src/services/passwordService');
(async () => {
  try {
    const email = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.SEED_ADMIN_PASSWORD || '');
    if (!email || !password || password.length < 12) {
      throw new Error('Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 12 characters in backend/.env before running this script.');
    }
    if (await store.findUserByEmail(email)) {
      console.log(`Admin account already exists for ${email}; no changes made.`);
      process.exitCode = 0;
      return;
    }
    const now = new Date().toISOString();
    const user = { id: crypto.randomUUID(), name: 'TrustTrace Admin', email, passwordHash: await hashPassword(password), role: 'admin', status: 'ACTIVE', walletAddress: null, createdAt: now, updatedAt: now };
    await store.insert('users', user);
    await store.createAudit('ADMIN_SEEDED', user.id, 'User', user.id, 'SUCCESS');
    console.log(`Local admin created: ${email}`);
    console.log('Keep the password private. This account does not itself imply on-chain admin signer configuration.');
  } catch (error) {
    console.error(`Admin seed failed: ${error.message}`);
    process.exitCode = 1;
  } finally { await store.disconnect().catch(() => {}); }
})();
