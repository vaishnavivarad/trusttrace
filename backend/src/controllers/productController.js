const crypto = require('crypto');
const store = require('../services/appStore');
const blockchain = require('../services/blockchainService');
const ipfs = require('../services/ipfsService');
const { generateQRCode, getVerificationUrl } = require('../services/qrService');
const { detectNetworkLocation, resolveLocationName } = require('../services/caspgService');

function makeProductId() { return `PROD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function safeDate(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
function publicProduct(p, chain, details, extra = {}) {
  // Blockchain fields always take priority. PostgreSQL is an application/search
  // store and must not override the canonical on-chain registration facts.
  const resolvedProductId = chain.productId || p?.productId;
  const referenceImageCID = chain.referenceImageCID || p?.referenceImageCID || null;
  const brand = details?.brand || p?.brand || '';
  return {
    productId: resolvedProductId,
    name: chain.name || p?.name || '',
    brand,
    manufacturerName: extra.manufacturerName || brand || null,
    category: details?.category || p?.category || '',
    sku: details?.sku || p?.sku || '',
    batchNumber: chain.batchNumber || p?.batchNumber || '',
    unitSerial: details?.unitSerial || p?.unitSerial || '',
    manufactureDate: details?.manufactureDate || p?.manufactureDate || null,
    expiryDate: details?.expiryDate || p?.expiryDate || null,
    manufacturerWallet: chain.manufacturer || p?.manufacturerWallet || null,
    registeredAt: chain.registeredAt,
    createdAt: p?.createdAt || (chain.registeredAt ? new Date(Number(chain.registeredAt) * 1000).toISOString() : null),
    status: p?.status || 'REGISTERED',
    referenceImageCID,
    referenceImageConsistency: p?.referenceImageCID && chain.referenceImageCID && p.referenceImageCID !== chain.referenceImageCID ? 'DB_CHAIN_MISMATCH' : 'CONSISTENT',
    referenceImageUrl: referenceImageCID && resolvedProductId ? `/api/products/${encodeURIComponent(resolvedProductId)}/image` : null,
    referenceImageGatewayUrl: referenceImageCID ? ipfs.gatewayUrl(referenceImageCID) : null,
    scanCount: chain.scanCount,
    hasSuspiciousScan: chain.hasSuspiciousScan,
    transactionHash: p?.txHash || null,
    chainId: p?.chainId || (process.env.BLOCKCHAIN_CHAIN_ID ? Number(process.env.BLOCKCHAIN_CHAIN_ID) : null),
    contractAddress: p?.contractAddress || process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null,
    qrUrl: p?.qrUrl || null
  };
}
async function registerProduct(req, res, next) {
  let uploadedCid = null;
  let createdRecord = null;
  let chainRegistrationSucceeded = false;
  let chainResult = null;
  try {
    const application = await store.findApplicationByUserId(req.user.id);
    if (req.user.role !== 'manufacturer' || !application || application.status !== 'APPROVED' || req.user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, code: 'MANUFACTURER_NOT_APPROVED', message: 'Only an approved manufacturer can register a product.' });
    }
    if (!req.user.walletAddress || req.user.walletAddress.toLowerCase() !== application.walletAddress.toLowerCase()) {
      return res.status(403).json({ success: false, code: 'WALLET_MISMATCH', message: 'The account wallet does not match the approved manufacturer wallet.' });
    }
    if (!req.file) return res.status(400).json({ success: false, code: 'REFERENCE_IMAGE_REQUIRED', message: 'Upload a clear manufacturing-time packaging photo.' });
    const { name, brand, category, sku, batchNumber, unitSerial, manufactureDate, expiryDate } = req.body || {};
    if (!name || !brand || !category || !batchNumber || !unitSerial) return res.status(400).json({ success: false, code: 'MISSING_PRODUCT_FIELDS', message: 'Product name, brand, category, batch number and unique unit serial are required.' });
    const cleanedName = String(name).trim(); const cleanedBrand = String(brand).trim();
    const cleanedBatch = String(batchNumber).trim(); const cleanedUnitSerial = String(unitSerial).trim();
    if (cleanedName.length > 120 || cleanedBrand.length > 120 || cleanedBatch.length > 100 || cleanedUnitSerial.length > 100 || String(sku || '').length > 100) {
      return res.status(400).json({ success: false, code: 'PRODUCT_FIELD_TOO_LONG', message: 'Product name, brand, batch, unit serial or SKU is too long.' });
    }
    const manufacturingDate = safeDate(manufactureDate); const expirationDate = safeDate(expiryDate);
    if (manufactureDate && !manufacturingDate) return res.status(400).json({ success: false, code: 'INVALID_MANUFACTURE_DATE', message: 'Manufacturing date is invalid.' });
    if (expiryDate && !expirationDate) return res.status(400).json({ success: false, code: 'INVALID_EXPIRY_DATE', message: 'Expiry date is invalid.' });
    if (manufacturingDate && expirationDate && expirationDate < manufacturingDate) return res.status(400).json({ success: false, code: 'INVALID_DATE_ORDER', message: 'Expiry date cannot be before manufacturing date.' });
    const existingProducts = await store.all('products');
    const duplicateUnit = existingProducts.find(p => p.manufacturerUserId === req.user.id && String(p.batchNumber).toLowerCase() === cleanedBatch.toLowerCase() && String(p.unitSerial).toLowerCase() === cleanedUnitSerial.toLowerCase());
    if (duplicateUnit) return res.status(409).json({ success: false, code: 'DUPLICATE_UNIT_SERIAL', message: 'This batch/unit serial already has a registration attempt. Review the existing record before retrying to avoid duplicate physical-unit records.' });
    const allowedCategories = ['food', 'cosmetics', 'medicine'];
    if (!allowedCategories.includes(String(category).toLowerCase())) return res.status(400).json({ success: false, code: 'INVALID_CATEGORY', message: 'Category must be Food, Cosmetics or Medicine.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return res.status(422).json({ success: false, code: 'INVALID_IMAGE_TYPE', message: 'Use JPEG, PNG or WebP for the reference image.' });
    if (req.file.size > 8 * 1024 * 1024) return res.status(413).json({ success: false, code: 'IMAGE_TOO_LARGE', message: 'Reference image must be 8 MB or smaller.' });
    const productId = makeProductId();
    let authorized;
    try {
      authorized = await blockchain.isAuthorizedManufacturer(application.walletAddress);
      if (!authorized && application.status === 'APPROVED') {
        const authRes = await blockchain.authorizeManufacturer(application.walletAddress);
        await store.update('applications', application.id, { authorizationTxHash: authRes.txHash });
        authorized = true;
      }
    }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', message: `Could not verify manufacturer authorization on the blockchain: ${error.message}` }); }
    if (!authorized) return res.status(403).json({ success: false, code: 'WALLET_NOT_AUTHORIZED_ON_CHAIN', message: 'This manufacturer wallet has not been authorized on the configured blockchain.' });

    // Never silently substitute local file storage for real IPFS. A missing provider key produces an actionable error.
    const imageUpload = await ipfs.uploadFile(req.file, `${productId}-reference.${req.file.mimetype.split('/')[1].replace('jpeg','jpg')}`);
    uploadedCid = imageUpload.cid;
    await store.createAudit('REFERENCE_IMAGE_UPLOADED_PENDING_REGISTRATION', req.user.id, 'Product', productId, 'PENDING', { referenceImageCID: imageUpload.cid });
    const metadata = {
      schema: 'trusttrace-product-v1', productId, name: cleanedName, brand: cleanedBrand, category: String(category).toLowerCase(),
      sku: String(sku || '').trim(), batchNumber: cleanedBatch, unitSerial: cleanedUnitSerial,
      manufactureDate: manufacturingDate, expiryDate: expirationDate, manufacturerWallet: application.walletAddress,
      referenceImageCID: imageUpload.cid, referenceImageSha256: imageUpload.sha256 || null, source: 'manufacturer-registration', createdAt: new Date().toISOString()
    };
    const metadataUpload = await ipfs.uploadJson(metadata, `${productId}-metadata.json`);
    const metadataHash = blockchain.metadataHash(metadata);
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), productId, name: metadata.name, brand: metadata.brand, category: metadata.category,
      sku: metadata.sku, batchNumber: metadata.batchNumber, unitSerial: metadata.unitSerial,
      manufactureDate: metadata.manufactureDate, expiryDate: metadata.expiryDate, manufacturerUserId: req.user.id,
      manufacturerWallet: application.walletAddress, referenceImageCID: imageUpload.cid, metadataCID: metadataUpload.cid,
      metadataHash, chainId: null, contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null,
      txHash: null, qrFilename: null, qrUrl: null, status: 'REGISTRATION_PENDING', createdAt: now
    };
    createdRecord = await store.insert('products', record);

    try {
      chainResult = await blockchain.registerProductOnChain(record, { referenceImageCID: imageUpload.cid, metadataCID: metadataUpload.cid }, metadataHash);
      chainRegistrationSucceeded = true;
    }
    catch (error) {
      await store.update('products', record.id, { status: 'REGISTRATION_FAILED' });
      await store.createAudit('PRODUCT_REGISTRATION_FAILED', req.user.id, 'Product', productId, 'FAILED', { reason: error.message, referenceImageCID: uploadedCid });
      return res.status(503).json({ success: false, code: 'BLOCKCHAIN_REGISTRATION_FAILED', message: `IPFS upload completed but blockchain registration failed. No QR was issued. ${error.message}`, productId });
    }
    let qr;
    try { qr = await generateQRCode(productId); }
    catch (error) {
      await store.update('products', record.id, { status: 'REGISTERED_QR_PENDING', txHash: chainResult.txHash, chainId: chainResult.chainId, contractAddress: chainResult.contractAddress });
      createdRecord = { ...record, status: 'REGISTERED_QR_PENDING', txHash: chainResult.txHash };
      return res.status(500).json({ success: false, code: 'QR_GENERATION_FAILED', message: 'Product is registered on-chain but QR generation failed. Retry QR generation from My Products; do not register this unit again.', productId, txHash: chainResult.txHash });
    }
    const updated = await store.update('products', record.id, {
      status: 'REGISTERED', txHash: chainResult.txHash, chainId: chainResult.chainId,
      contractAddress: chainResult.contractAddress, qrFilename: qr.filename, qrUrl: qr.publicPath
    });
    createdRecord = updated;
    let auditLogStatus = 'RECORDED';
    try {
      let originLat = Number(req.body?.originLatitude);
      let originLon = Number(req.body?.originLongitude);
      let originLocName = String(req.body?.originLocationName || '').trim();
      if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) {
        const netLoc = await detectNetworkLocation();
        originLat = netLoc.latitude;
        originLon = netLoc.longitude;
        if (!originLocName) originLocName = netLoc.locationName;
      }
      originLocName = resolveLocationName(originLat, originLon, originLocName);
      await store.insert('scanEvents', {
        id: crypto.randomUUID(),
        productId,
        sessionId: `ORIGIN_${productId}`,
        userId: req.user.id,
        serverReceivedAt: now,
        latitude: originLat,
        longitude: originLon,
        accuracyMeters: 25,
        locationConsent: true,
        previousScanId: null,
        distanceKm: 0,
        elapsedSeconds: 0,
        estimatedSpeedKmh: 0,
        caspgStatus: 'ORIGIN_REGISTERED',
        reasonCode: `LOC:${originLocName}`,
        evidenceHash: metadataHash,
        chainAuditTxHash: chainResult.txHash
      });
    } catch (originErr) {
      console.warn(`Could not record manufacturer origin scan event for ${productId}: ${originErr.message}`);
    }
    try {
      await store.createAudit('PRODUCT_REGISTERED_ON_CHAIN', req.user.id, 'Product', productId, 'SUCCESS', { txHash: chainResult.txHash, referenceImageCID: imageUpload.cid, metadataCID: metadataUpload.cid });
    } catch (auditError) {
      // Registration is already confirmed on-chain. Do not mark the product failed
      // or encourage the user to submit the same unit again because an audit write failed.
      auditLogStatus = 'FAILED';
      console.error(`Product ${productId} is registered on-chain, but the application audit log failed: ${auditError.message}`);
    }
    const message = auditLogStatus === 'RECORDED'
      ? 'Product registered on the blockchain. QR is ready.'
      : 'Product registered on the blockchain and QR is ready, but the application audit log could not be saved.';
    return res.status(201).json({ success: true, message, auditLogStatus, product: { ...updated, createdAt: updated.createdAt }, qr: { filename: qr.filename, url: qr.publicPath, verificationUrl: qr.verificationUrl }, chain: chainResult });
  } catch (error) {
    if (chainRegistrationSucceeded) {
      return res.status(503).json({
        success: false,
        code: 'CHAIN_REGISTERED_LOCAL_FINALIZATION_FAILED',
        message: 'The blockchain registration succeeded, but local product finalization did not complete. Do not register this physical unit again. Refresh My Products and check the transaction before retrying.',
        productId: createdRecord?.productId || null,
        txHash: chainResult?.txHash || null
      });
    }
    if (createdRecord && createdRecord.status === 'REGISTRATION_PENDING') {
      try { await store.update('products', createdRecord.id, { status: 'REGISTRATION_FAILED' }); } catch { /* retain original error */ }
    }
    if (error.message && /PINATA_JWT|IPFS|gateway|pinning/i.test(error.message)) return res.status(503).json({ success: false, code: 'IPFS_NOT_CONFIGURED_OR_UNAVAILABLE', message: error.message });
    next(error);
  }
}

async function syncExistingDbProductIfMissingOnChain(productId, currentChain) {
  if (currentChain?.exists) return currentChain;
  const record = await store.findProductByProductId(productId);
  if (!record || record.status !== 'REGISTERED' || !record.referenceImageCID || !record.manufacturerWallet) {
    return currentChain;
  }
  try {
    const isAuth = await blockchain.isAuthorizedManufacturer(record.manufacturerWallet);
    if (!isAuth) {
      await blockchain.authorizeManufacturer(record.manufacturerWallet);
    }
    const metaHash = /^0x[0-9a-fA-F]{64}$/.test(record.metadataHash || '')
      ? record.metadataHash
      : blockchain.metadataHash({ productId: record.productId, name: record.name, batchNumber: record.batchNumber });
    const res = await blockchain.registerProductOnChain(
      record,
      { referenceImageCID: record.referenceImageCID, metadataCID: record.metadataCID || '' },
      metaHash
    );
    await store.update('products', record.id, {
      txHash: res.txHash,
      chainId: res.chainId,
      contractAddress: res.contractAddress
    });
    return await blockchain.verifyProduct(productId);
  } catch (err) {
    console.warn(`On-demand chain sync for ${productId} skipped: ${err.message}`);
    return currentChain;
  }
}

async function getProduct(req, res, next) {
  try {
    const productId = String(req.params.productId || '');
    let chain, details;
    try {
      chain = await blockchain.verifyProduct(productId);
      if (!chain.exists) chain = await syncExistingDbProductIfMissingOnChain(productId, chain);
    }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', message: `Could not verify the product record on-chain: ${error.message}` }); }
    if (!chain.exists) return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', message: 'This Product ID was not found on the configured blockchain.', productId });
    try { details = await blockchain.verifyProductDetails(productId); } catch { details = null; }
    const record = await store.findProductByProductId(productId);
    let manufacturerName = null;
    if (record?.manufacturerUserId) {
      const app = await store.findApplicationByUserId(record.manufacturerUserId);
      if (app?.companyName) manufacturerName = app.companyName;
      else {
        const user = await store.findById('users', record.manufacturerUserId);
        if (user?.name) manufacturerName = user.name;
      }
    }
    if (!manufacturerName && chain.manufacturer) {
      const apps = await store.all('applications');
      const matchApp = apps.find(a => String(a.walletAddress || '').toLowerCase() === String(chain.manufacturer).toLowerCase());
      if (matchApp?.companyName) manufacturerName = matchApp.companyName;
    }
    const product = publicProduct(record, chain, details, { manufacturerName });
    try {
      const scans = (await store.all('scanEvents'))
        .filter(s => s.productId === productId && s.locationConsent && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
        .sort((a, b) => new Date(a.serverReceivedAt).getTime() - new Date(b.serverReceivedAt).getTime())
        .map(s => ({
          id: s.id,
          scanType: s.caspgStatus === 'ORIGIN_REGISTERED' || String(s.sessionId || '').startsWith('ORIGIN_') ? 'MANUFACTURER_ORIGIN' : 'CUSTOMER_SCAN',
          locationName: resolveLocationName(s.latitude, s.longitude, String(s.reasonCode || '').startsWith('LOC:') ? String(s.reasonCode).slice(4) : null),
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          timestamp: s.serverReceivedAt,
          distanceKm: s.distanceKm,
          elapsedSeconds: s.elapsedSeconds,
          estimatedSpeedKmh: s.estimatedSpeedKmh,
          caspgStatus: s.caspgStatus
        }));
      product.scanHistory = scans;
      product.originLocation = scans.find(s => s.scanType === 'MANUFACTURER_ORIGIN') || scans[0] || null;
      product.latestScan = scans.length ? scans[scans.length - 1] : null;
    } catch { /* non-fatal */ }
    return res.json({ success: true, product, sourceOfTruth: 'blockchain', chain: { contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS, chainId: process.env.BLOCKCHAIN_CHAIN_ID || null } });
  } catch (error) { next(error); }
}
async function getProductReferenceImage(req, res, next) {
  try {
    const productId = String(req.params.productId || '');
    let chain;
    try {
      chain = await blockchain.verifyProduct(productId);
      if (!chain.exists) chain = await syncExistingDbProductIfMissingOnChain(productId, chain);
    }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', message: `Could not verify the product record on-chain: ${error.message}` }); }
    if (!chain.exists) return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', message: 'This Product ID was not found on the configured blockchain.', productId });
    const record = await store.findProductByProductId(productId);
    const cid = chain.referenceImageCID || record?.referenceImageCID;
    if (!cid) return res.status(404).json({ success: false, code: 'REFERENCE_IMAGE_NOT_FOUND', message: 'No reference packaging image CID is recorded for this product.' });
    let retrieved;
    try { retrieved = await ipfs.retrieveBuffer(cid); }
    catch (error) { return res.status(503).json({ success: false, code: 'IPFS_UNAVAILABLE', message: `Could not retrieve reference packaging image from IPFS: ${error.message}` }); }
    const buf = retrieved.buffer;
    let contentType = retrieved.contentType || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) contentType = 'image/png';
      else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) contentType = 'image/jpeg';
      else if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') contentType = 'image/webp';
      else contentType = 'image/png';
    }
    res.setHeader('Content-Type', contentType);
    // URL is product-specific and the CID is immutable for a registered product; ETag ties the bytes to that CID.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', `"${cid}"`);
    res.setHeader('X-IPFS-CID', cid);
    res.setHeader('X-Content-SHA256', require('crypto').createHash('sha256').update(buf).digest('hex'));
    res.setHeader('X-Reference-Consistency', record?.referenceImageCID && record.referenceImageCID !== cid ? 'DB_CHAIN_MISMATCH' : 'CONSISTENT');
    return res.send(buf);
  } catch (error) { next(error); }
}
async function listMyProducts(req, res, next) {
  try {
    const rows = (await store.all('products')).filter(p => p.manufacturerUserId === req.user.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    res.json({ success: true, products: rows });
  } catch (error) { next(error); }
}
async function getProductQr(req, res, next) {
  try {
    const productId = String(req.params.productId || '');
    const product = await store.findProductByProductId(productId);
    if (req.user.role !== 'admin' && (!product || product.manufacturerUserId !== req.user.id)) return res.status(403).json({ success: false, code: 'PRODUCT_ACCESS_DENIED', message: 'You can only generate/download QR codes for your own products.' });
    let chain;
    try {
      chain = await blockchain.verifyProduct(productId);
      if (!chain.exists) chain = await syncExistingDbProductIfMissingOnChain(productId, chain);
    }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', message: `Could not verify the product record on-chain: ${error.message}` }); }
    if (!chain.exists) return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', message: 'QR cannot be generated for an unregistered product.' });
    const qr = await generateQRCode(productId);
    if (product) await store.update('products', product.id, { qrFilename: qr.filename, qrUrl: qr.publicPath });
    res.json({ success: true, productId, filename: qr.filename, url: qr.publicPath, verificationUrl: qr.verificationUrl });
  } catch (error) { next(error); }
}
function legacyVerifyRedirect(req, res) {
  res.redirect(302, getVerificationUrl(req.params.productId));
}
module.exports = { registerProduct, getProduct, getProductReferenceImage, listMyProducts, getProductQr, legacyVerifyRedirect, publicProduct };
