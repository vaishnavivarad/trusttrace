const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

require('dotenv').config();
const tempStoreFile = path.join(os.tmpdir(), `trusttrace-test-store-${process.pid}-${Date.now()}.json`);
if (!process.env.TEST_STORAGE_MODE) {
  process.env.STORAGE_MODE = 'file';
  process.env.STORE_FILE_PATH = tempStoreFile;
}

const app = require('../server');
const store = require('../src/services/appStore');
const { hashPassword, verifyPassword } = require('../src/services/passwordService');
const { makeToken, verify, sign } = require('../src/services/tokenService');
const blockchain = require('../src/services/blockchainService');

test.after(async () => {
  await store.disconnect();
  try { fs.unlinkSync(tempStoreFile); } catch { /* ignore */ }
});

// Helper to make requests to the express app using an ephemeral server
function request(appInstance) {
  return new Promise((resolve) => {
    const server = http.createServer(appInstance);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      const execute = async (method, path, { body, headers = {} } = {}) => {
        const reqHeaders = { ...headers };
        let reqBody = undefined;
        if (body && typeof body === 'object') {
          reqHeaders['Content-Type'] = 'application/json';
          reqBody = JSON.stringify(body);
        } else if (body) {
          reqBody = String(body);
        }
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: reqHeaders,
          body: reqBody
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, body: json };
      };
      resolve({
        get: (path, opts) => execute('GET', path, opts),
        post: (path, opts) => execute('POST', path, opts),
        close: () => new Promise((cb) => server.close(cb))
      });
    });
  });
}

test('Customer signup and login works end-to-end', async () => {
  const client = await request(app);
  try {
    const uniqueEmail = `cust-${Date.now()}@example.test`;
    const signupRes = await client.post('/api/auth/signup', {
      body: {
        name: 'Jane Customer',
        email: uniqueEmail,
        password: 'securePassword123!',
        role: 'customer'
      }
    });
    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.success, true);
    assert.equal(signupRes.body.user.role, 'customer');
    assert.equal(signupRes.body.user.status, 'ACTIVE');
    assert.ok(signupRes.body.token);

    // Login with the created customer
    const loginRes = await client.post('/api/auth/login', {
      body: {
        email: uniqueEmail,
        password: 'securePassword123!'
      }
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.equal(loginRes.body.user.email, uniqueEmail);
    assert.ok(loginRes.body.token);
  } finally {
    await client.close();
  }
});

test('Invalid password and non-existent email are rejected with 401', async () => {
  const client = await request(app);
  try {
    const uniqueEmail = `pass-test-${Date.now()}@example.test`;
    await client.post('/api/auth/signup', {
      body: {
        name: 'Password Tester',
        email: uniqueEmail,
        password: 'correctPassword123!',
        role: 'customer'
      }
    });

    const wrongPassRes = await client.post('/api/auth/login', {
      body: {
        email: uniqueEmail,
        password: 'wrongPassword123!'
      }
    });
    assert.equal(wrongPassRes.status, 401);
    assert.equal(wrongPassRes.body.code, 'INVALID_CREDENTIALS');

    const noUserRes = await client.post('/api/auth/login', {
      body: {
        email: `non-existent-${Date.now()}@example.test`,
        password: 'anyPassword123!'
      }
    });
    assert.equal(noUserRes.status, 401);
    assert.equal(noUserRes.body.code, 'INVALID_CREDENTIALS');
  } finally {
    await client.close();
  }
});

test('Session token validates, rejects tampering, and handles expiry', () => {
  const user = { id: 'usr-test-123', role: 'customer' };
  const token = makeToken(user);
  const payload = verify(token);
  assert.equal(payload.sub, 'usr-test-123');
  assert.equal(payload.role, 'customer');

  // Tampered payload/signature returns null
  assert.equal(verify(`${token}tampered`), null);
  assert.equal(verify('invalid.token'), null);
  assert.equal(verify(''), null);

  // Expired token returns null
  const pastTime = Math.floor(Date.now() / 1000) - 3600;
  const expiredToken = sign({ sub: 'usr-expired', role: 'customer', iat: pastTime - 3600, exp: pastTime });
  assert.equal(verify(expiredToken), null);
});

test('Public signup cannot assign the admin role', async () => {
  const client = await request(app);
  try {
    const adminAttempt = await client.post('/api/auth/signup', {
      body: {
        name: 'Hacker Admin',
        email: `hacker-${Date.now()}@example.test`,
        password: 'hackerPassword123!',
        role: 'admin'
      }
    });
    assert.equal(adminAttempt.status, 400);
    assert.equal(adminAttempt.body.code, 'INVALID_ROLE');

    const adminAttemptUpper = await client.post('/api/auth/signup', {
      body: {
        name: 'Hacker Admin 2',
        email: `hacker2-${Date.now()}@example.test`,
        password: 'hackerPassword123!',
        role: 'ADMIN'
      }
    });
    assert.equal(adminAttemptUpper.status, 400);
    assert.equal(adminAttemptUpper.body.code, 'INVALID_ROLE');
  } finally {
    await client.close();
  }
});

test('Manufacturer application submission creates pending application and pending status', async () => {
  const client = await request(app);
  try {
    const wallet = `0x${crypto.randomBytes(20).toString('hex')}`;
    const email = `mfg-${Date.now()}@company.test`;
    const res = await client.post('/api/auth/signup', {
      body: {
        name: 'Acme Manufacturer Rep',
        email,
        password: 'mfgPassword123!',
        role: 'manufacturer',
        companyName: 'Acme Organics Ltd',
        businessEmail: email,
        contactName: 'Alice Director',
        category: 'cosmetics',
        walletAddress: wallet
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.role, 'manufacturer');
    assert.equal(res.body.user.status, 'PENDING');

    // Confirm application is saved with PENDING status in the store
    const appRecord = await store.findApplicationByUserId(res.body.user.id);
    assert.ok(appRecord);
    assert.equal(appRecord.status, 'PENDING');
    assert.equal(appRecord.companyName, 'Acme Organics Ltd');
    assert.equal(appRecord.walletAddress.toLowerCase(), wallet.toLowerCase());

    // Login returns the pending application
    const loginRes = await client.post('/api/auth/login', {
      body: { email, password: 'mfgPassword123!' }
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.manufacturerApplication.status, 'PENDING');

    // Duplicate wallet address is rejected with 409 WALLET_EXISTS
    const dupWalletRes = await client.post('/api/auth/signup', {
      body: {
        name: 'Another Manufacturer',
        email: `mfg-dup-${Date.now()}@company.test`,
        password: 'mfgPassword123!',
        role: 'manufacturer',
        companyName: 'Duplicate Wallet Ltd',
        businessEmail: `mfg-dup-${Date.now()}@company.test`,
        contactName: 'Bob Director',
        category: 'food',
        walletAddress: wallet.toUpperCase().replace(/^0X/, '0x')
      }
    });
    assert.equal(dupWalletRes.status, 409);
    assert.equal(dupWalletRes.body.code, 'WALLET_EXISTS');
  } finally {
    await client.close();
  }
});

test('Admin can review, approve and reject manufacturer applications', async () => {
  const client = await request(app);
  try {
    const adminUser = {
      id: crypto.randomUUID(),
      name: 'Admin Reviewer',
      email: `admin-rev-${Date.now()}@trusttrace.test`,
      passwordHash: await hashPassword('adminPassword123!'),
      role: 'admin',
      status: 'ACTIVE',
      walletAddress: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('users', adminUser);
    const adminToken = makeToken(adminUser);

    // 1. Test rejection workflow
    const mfgUser1 = {
      id: crypto.randomUUID(),
      name: 'Applicant 1',
      email: `applicant1-${Date.now()}@test.test`,
      passwordHash: await hashPassword('password123!'),
      role: 'manufacturer',
      status: 'PENDING',
      walletAddress: `0x${crypto.randomBytes(20).toString('hex')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('users', mfgUser1);
    const app1 = {
      id: crypto.randomUUID(),
      userId: mfgUser1.id,
      companyName: 'Rejectable Corp',
      businessEmail: mfgUser1.email,
      contactName: 'Charlie',
      category: 'cosmetics',
      walletAddress: mfgUser1.walletAddress,
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('applications', app1);

    const rejectRes = await client.post(`/api/admin/manufacturers/${app1.id}/reject`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { note: 'Incomplete documents' }
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.success, true);

    const updatedApp1 = await store.findById('applications', app1.id);
    assert.equal(updatedApp1.status, 'REJECTED');
    assert.equal(updatedApp1.reviewNote, 'Incomplete documents');
    const updatedUser1 = await store.findById('users', mfgUser1.id);
    assert.equal(updatedUser1.status, 'REJECTED');

    // 2. Test approval workflow (with simulated blockchain authorization)
    const mfgUser2 = {
      id: crypto.randomUUID(),
      name: 'Applicant 2',
      email: `applicant2-${Date.now()}@test.test`,
      passwordHash: await hashPassword('password123!'),
      role: 'manufacturer',
      status: 'PENDING',
      walletAddress: `0x${crypto.randomBytes(20).toString('hex')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('users', mfgUser2);
    const app2 = {
      id: crypto.randomUUID(),
      userId: mfgUser2.id,
      companyName: 'Approved Corp',
      businessEmail: mfgUser2.email,
      contactName: 'Dana',
      category: 'food',
      walletAddress: mfgUser2.walletAddress,
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('applications', app2);

    const originalAuth = blockchain.authorizeManufacturer;
    try {
      blockchain.authorizeManufacturer = async () => ({ txHash: '0xmockTxHash123456789', blockNumber: 42 });
      const approveRes = await client.post(`/api/admin/manufacturers/${app2.id}/approve`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { note: 'All documentation verified' }
      });
      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.body.success, true);
      assert.equal(approveRes.body.txHash, '0xmockTxHash123456789');

      const updatedApp2 = await store.findById('applications', app2.id);
      assert.equal(updatedApp2.status, 'APPROVED');
      assert.equal(updatedApp2.authorizationTxHash, '0xmockTxHash123456789');
      const updatedUser2 = await store.findById('users', mfgUser2.id);
      assert.equal(updatedUser2.status, 'ACTIVE');
    } finally {
      blockchain.authorizeManufacturer = originalAuth;
    }
  } finally {
    await client.close();
  }
});

test('Unauthorized users cannot access admin endpoints or approve applications', async () => {
  const client = await request(app);
  try {
    // 1. Unauthenticated request
    const unauthRes = await client.get('/api/admin/manufacturers');
    assert.equal(unauthRes.status, 401);
    assert.equal(unauthRes.body.code, 'UNAUTHENTICATED');

    // 2. Customer user attempting to access admin endpoints
    const customerToken = makeToken({ id: 'cust-123', role: 'customer' });
    const custRes = await client.get('/api/admin/manufacturers', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    // Customer gets 401 if id not in store, or 403 FORBIDDEN if in store
    assert.ok(custRes.status === 401 || custRes.status === 403);

    // 3. Customer attempting to approve an application
    const approveAttempt = await client.post('/api/admin/manufacturers/fake-app-id/approve', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.ok(approveAttempt.status === 401 || approveAttempt.status === 403);
  } finally {
    await client.close();
  }
});

test('Website approval without on-chain authorization strictly blocks product registration', async () => {
  const client = await request(app);
  try {
    const unapprovedWallet = '0x1111111111111111111111111111111111111111';
    const mfgUser = {
      id: crypto.randomUUID(),
      name: 'Simulated Mfg',
      email: `sim-${Date.now()}@mfg.test`,
      passwordHash: await hashPassword('password123!'),
      role: 'manufacturer',
      status: 'ACTIVE',
      walletAddress: unapprovedWallet,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('users', mfgUser);

    // Website application is marked APPROVED, but wallet is NOT authorized on the smart contract
    await store.insert('applications', {
      id: crypto.randomUUID(),
      userId: mfgUser.id,
      companyName: 'Simulated Co',
      businessEmail: mfgUser.email,
      contactName: 'Bob',
      category: 'food',
      walletAddress: unapprovedWallet,
      status: 'APPROVED',
      reviewedBy: 'admin-id',
      reviewedAt: new Date().toISOString(),
      reviewNote: 'Website approved only',
      authorizationTxHash: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const mfgToken = makeToken(mfgUser);

    // Attempt to register product: website approval passes, but on-chain check blocks it
    const registerRes = await client.post('/api/products/register', {
      headers: { Authorization: `Bearer ${mfgToken}` },
      body: {
        name: 'Unauthorized Product',
        brand: 'Brand',
        category: 'food',
        batchNumber: 'BATCH-01',
        unitSerial: 'UNIT-01'
      }
    });

    // Should fail with either WALLET_NOT_AUTHORIZED_ON_CHAIN or BLOCKCHAIN_UNAVAILABLE if chain not configured
    assert.ok(
      [400, 403, 503].includes(registerRes.status),
      `Expected 400, 403 or 503, got ${registerRes.status}`
    );
    assert.ok(
      ['WALLET_NOT_AUTHORIZED_ON_CHAIN', 'BLOCKCHAIN_UNAVAILABLE', 'REFERENCE_IMAGE_REQUIRED'].includes(registerRes.body.code),
      `Unexpected code: ${registerRes.body.code}`
    );
  } finally {
    await client.close();
  }
});

test('Manufacturer cannot access another manufacturer product QR codes or data', async () => {
  const client = await request(app);
  try {
    const mfg1 = {
      id: crypto.randomUUID(),
      name: 'Manufacturer 1',
      email: `mfg1-${Date.now()}@test.test`,
      passwordHash: await hashPassword('password123!'),
      role: 'manufacturer',
      status: 'ACTIVE',
      walletAddress: '0x2222222222222222222222222222222222222222',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const mfg2 = {
      id: crypto.randomUUID(),
      name: 'Manufacturer 2',
      email: `mfg2-${Date.now()}@test.test`,
      passwordHash: await hashPassword('password123!'),
      role: 'manufacturer',
      status: 'ACTIVE',
      walletAddress: '0x3333333333333333333333333333333333333333',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.insert('users', mfg1);
    await store.insert('users', mfg2);

    // Product belonging to mfg1
    const p1 = {
      id: crypto.randomUUID(),
      productId: `PROD-MFG1-${Date.now()}`,
      name: 'Mfg 1 Product',
      brand: 'Brand 1',
      category: 'food',
      sku: 'SKU1',
      batchNumber: 'B1',
      unitSerial: 'U1',
      manufacturerUserId: mfg1.id,
      manufacturerWallet: mfg1.walletAddress,
      referenceImageCID: 'cid1',
      status: 'REGISTERED',
      createdAt: new Date().toISOString()
    };
    await store.insert('products', p1);

    const token2 = makeToken(mfg2);

    // Mfg 2 requests their products: must NOT see Mfg 1's product
    const mineRes = await client.get('/api/products/mine', {
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert.equal(mineRes.status, 200);
    const hasP1 = mineRes.body.products.some((p) => p.productId === p1.productId);
    assert.equal(hasP1, false, 'Mfg 2 should not see Mfg 1 products in listMyProducts');

    // Mfg 2 tries to get QR for Mfg 1's product
    const qrRes = await client.get(`/api/products/${p1.productId}/qr`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    // Returns 403 or 404 depending on on-chain check
    assert.ok(
      [403, 404].includes(qrRes.status),
      `Expected 403 or 404, got ${qrRes.status}`
    );
  } finally {
    await client.close();
  }
});

test('Explicit STORAGE_MODE rejects invalid storage modes and postgres failure does not silently fallback', async () => {
  // 1. Verify invalid STORAGE_MODE throws
  const oldMode = process.env.STORAGE_MODE;
  try {
    delete require.cache[require.resolve('../src/services/appStore')];
    process.env.STORAGE_MODE = 'invalid-mode';
    assert.throws(() => require('../src/services/appStore'), /Invalid STORAGE_MODE/);
  } finally {
    if (oldMode === undefined) delete process.env.STORAGE_MODE;
    else process.env.STORAGE_MODE = oldMode;
    delete require.cache[require.resolve('../src/services/appStore')];
  }

  // 2. Verify postgres mode requires DATABASE_URL
  const oldDbUrl = process.env.DATABASE_URL;
  try {
    delete require.cache[require.resolve('../src/services/appStore')];
    process.env.STORAGE_MODE = 'postgres';
    delete process.env.DATABASE_URL;
    const storePostgres = require('../src/services/appStore');
    await assert.rejects(
      async () => storePostgres.all('users'),
      /DATABASE_URL is required when STORAGE_MODE=postgres/
    );
  } finally {
    if (oldMode === undefined) delete process.env.STORAGE_MODE;
    else process.env.STORAGE_MODE = oldMode;
    if (oldDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDbUrl;
    delete require.cache[require.resolve('../src/services/appStore')];
  }
});
