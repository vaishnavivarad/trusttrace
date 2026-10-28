const express = require('express');
const store = require('../services/appStore');
const blockchain = require('../services/blockchainService');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/manufacturers', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const apps = await store.all('applications');
    const users = await store.all('users');
    const enriched = await Promise.all(apps.map(async (a) => {
      let onChainAuthorized = null;
      try {
        onChainAuthorized = await blockchain.isAuthorizedManufacturer(a.walletAddress);
      } catch {
        onChainAuthorized = null;
      }
      const u = users.find(usr => usr.id === a.userId);
      return {
        ...a,
        onChainAuthorized,
        user: u ? { id: u.id, name: u.name, email: u.email } : null
      };
    }));
    const result = enriched.filter(a => {
      if (!status) return true;
      if (status === 'PENDING') return a.status === 'PENDING' || (a.status === 'APPROVED' && a.onChainAuthorized === false);
      return a.status === status;
    });
    res.json({ success: true, applications: result });
  } catch (error) { next(error); }
});

router.post('/manufacturers/:id/approve', async (req, res, next) => {
  try {
    const application = await store.findById('applications', req.params.id);
    if (!application) return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', message: 'Manufacturer application not found.' });
    if (application.status === 'APPROVED') {
      let alreadyAuthorizedOnChain = false;
      try {
        alreadyAuthorizedOnChain = await blockchain.isAuthorizedManufacturer(application.walletAddress);
      } catch {
        alreadyAuthorizedOnChain = false;
      }
      if (alreadyAuthorizedOnChain) {
        return res.status(409).json({ success: false, code: 'ALREADY_APPROVED', message: 'This application is already approved.' });
      }
    }
    // Approve on chain first; do not mark the DB as approved if this transaction fails.
    let chainResult;
    try { chainResult = await blockchain.authorizeManufacturer(application.walletAddress); }
    catch (error) { return res.status(503).json({ success: false, code: 'CHAIN_AUTHORIZATION_FAILED', message: error.message }); }
    const now = new Date().toISOString();
    await store.update('applications', application.id, { status: 'APPROVED', reviewedBy: req.user.id, reviewedAt: now, reviewNote: String(req.body?.note || ''), authorizationTxHash: chainResult.txHash, updatedAt: now });
    await store.update('users', application.userId, { status: 'ACTIVE', updatedAt: now });
    await store.createAudit('MANUFACTURER_APPROVED_ON_CHAIN', req.user.id, 'ManufacturerApplication', application.id, 'SUCCESS', { txHash: chainResult.txHash, walletAddress: application.walletAddress });
    res.json({ success: true, message: 'Manufacturer approved and wallet authorized on-chain.', txHash: chainResult.txHash });
  } catch (error) { next(error); }
});

router.post('/manufacturers/:id/reject', async (req, res, next) => {
  try {
    const application = await store.findById('applications', req.params.id);
    if (!application) return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', message: 'Manufacturer application not found.' });
    const now = new Date().toISOString();
    await store.update('applications', application.id, { status: 'REJECTED', reviewedBy: req.user.id, reviewedAt: now, reviewNote: String(req.body?.note || 'Application rejected.'), updatedAt: now });
    await store.update('users', application.userId, { status: 'REJECTED', updatedAt: now });
    await store.createAudit('MANUFACTURER_REJECTED', req.user.id, 'ManufacturerApplication', application.id, 'SUCCESS');
    res.json({ success: true, message: 'Manufacturer application rejected.' });
  } catch (error) { next(error); }
});

router.get('/overview', async (req, res, next) => {
  try {
    const [users, apps, products, scans, diagnostics] = await Promise.all([
      store.all('users'),
      store.all('applications'),
      store.all('products'),
      store.all('scanEvents'),
      blockchain.getDiagnostics()
    ]);
    const manufacturers = await Promise.all(apps.map(async (a) => {
      let onChainAuthorized = null;
      if (diagnostics.contractBytecodeExists && a.walletAddress) {
        try {
          onChainAuthorized = await blockchain.isAuthorizedManufacturer(a.walletAddress);
        } catch {
          onChainAuthorized = null;
        }
      }
      const u = users.find(usr => usr.id === a.userId);
      return {
        id: a.id,
        userId: a.userId,
        companyName: a.companyName,
        businessEmail: a.businessEmail,
        userEmail: u?.email || a.businessEmail,
        userName: u?.name || a.contactName,
        walletAddress: a.walletAddress,
        status: a.status,
        onChainAuthorized,
        authorizationTxHash: a.authorizationTxHash || null
      };
    }));
    res.json({
      success: true,
      stats: {
        users: users.length,
        manufacturersPending: apps.filter(a => a.status === 'PENDING').length,
        manufacturersApproved: apps.filter(a => a.status === 'APPROVED').length,
        products: products.length,
        scans: scans.length,
        suspiciousScans: scans.filter(s => String(s.caspgStatus).includes('SUSPICIOUS')).length
      },
      diagnostics: {
        ...diagnostics,
        manufacturers
      }
    });
  } catch (error) { next(error); }
});

router.get('/diagnostics', async (req, res, next) => {
  try {
    const [apps, users, diagnostics] = await Promise.all([
      store.all('applications'),
      store.all('users'),
      blockchain.getDiagnostics()
    ]);
    const manufacturers = await Promise.all(apps.map(async (a) => {
      let onChainAuthorized = null;
      if (diagnostics.contractBytecodeExists && a.walletAddress) {
        try {
          onChainAuthorized = await blockchain.isAuthorizedManufacturer(a.walletAddress);
        } catch {
          onChainAuthorized = null;
        }
      }
      const u = users.find(usr => usr.id === a.userId);
      return {
        id: a.id,
        userId: a.userId,
        companyName: a.companyName,
        businessEmail: a.businessEmail,
        userEmail: u?.email || a.businessEmail,
        userName: u?.name || a.contactName,
        walletAddress: a.walletAddress,
        status: a.status,
        onChainAuthorized,
        authorizationTxHash: a.authorizationTxHash || null
      };
    }));
    res.json({
      success: true,
      diagnostics: {
        ...diagnostics,
        manufacturers
      }
    });
  } catch (error) { next(error); }
});

router.post('/sync-local-chain', async (req, res) => {
  try {
    const { syncState } = require('../../scripts/syncLocalChainState');
    const summary = await syncState({ keepStoreOpen: true });
    const diagnostics = await blockchain.getDiagnostics();
    await store.createAudit('LOCAL_CHAIN_SYNCED', req.user.id, 'Blockchain', summary.contractAddress, 'SUCCESS', summary);
    res.json({
      success: true,
      message: `Local Hardhat chain synchronized at ${summary.contractAddress}.`,
      summary,
      diagnostics
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      code: 'LOCAL_CHAIN_SYNC_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
