const crypto = require('crypto');
const store = require('../services/appStore');
const blockchain = require('../services/blockchainService');
const ipfs = require('../services/ipfsService');
const { assessMovement, haversineMeters } = require('../services/caspgService');

function sameOwner(session, user) { return session && (session.userId === user.id || user.role === 'admin'); }
async function startVerification(req, res, next) {
  try {
    const productId = String(req.body?.productId || '').trim();
    if (!productId) return res.status(400).json({ success: false, code: 'PRODUCT_ID_REQUIRED', message: 'Scan a product QR or enter a Product ID.' });
    let chain;
    try { chain = await blockchain.verifyProduct(productId); }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', gate1: 'UNAVAILABLE', message: `Could not read the configured blockchain: ${error.message}` }); }
    if (!chain.exists) {
      await store.createAudit('UNREGISTERED_PRODUCT_SCAN', req.user.id, 'Product', productId, 'SUSPICIOUS');
      return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', gate1: 'FAIL', overallStatus: 'UNREGISTERED_LIKELY_COUNTERFEIT', message: 'This Product ID is not registered on the configured blockchain. Verification stopped at Gate 1.', productId });
    }
    let details = {};
    try { details = await blockchain.verifyProductDetails(productId); } catch { /* older deployed contract might not expose extended fields */ }
    const record = await store.findProductByProductId(productId);
    const session = {
      id: crypto.randomUUID(), productId, userId: req.user.id, status: 'IN_PROGRESS', gate1Status: 'PASS',
      gate2Status: 'PENDING', gate3Status: 'NOT_CHECKED', overallStatus: 'IN_PROGRESS', reasonCode: null,
      startedAt: new Date().toISOString(), completedAt: null, modelVersion: null
    };
    await store.insert('sessions', session);
    await store.createAudit('VERIFICATION_STARTED', req.user.id, 'VerificationSession', session.id, 'GATE_1_PASS');
    res.json({ success: true, sessionId: session.id, gate1: { status: 'PASS', message: 'Product record found on the blockchain.' }, product: {
      productId, name: chain.name, brand: details.brand || record?.brand || '', category: details.category || record?.category || '',
      sku: details.sku || record?.sku || '', batchNumber: chain.batchNumber, unitSerial: details.unitSerial || record?.unitSerial || '',
      manufactureDate: details.manufactureDate || record?.manufactureDate || null, expiryDate: details.expiryDate || record?.expiryDate || null,
      manufacturerWallet: chain.manufacturer, registeredAt: chain.registeredAt, scanCount: chain.scanCount
    }, nextStep: 'CAPTURE_PACKAGING_IMAGE' });
  } catch (error) { next(error); }
}

async function compareImage(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    if (session.gate1Status !== 'PASS') return res.status(409).json({ success: false, code: 'GATE_1_NOT_PASSED', message: 'Gate 1 must pass before image comparison.' });
    if (!req.file) return res.status(400).json({ success: false, code: 'IMAGE_REQUIRED', message: 'Capture or upload a clear product packaging photo.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return res.status(422).json({ success: false, code: 'INVALID_IMAGE_TYPE', message: 'Use JPEG, PNG or WebP.' });
    if (req.file.size > 8 * 1024 * 1024) return res.status(413).json({ success: false, code: 'IMAGE_TOO_LARGE', message: 'The photo must be 8 MB or smaller.' });
    let chain;
    try { chain = await blockchain.verifyProduct(session.productId); }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', message: error.message }); }
    if (!chain.exists) return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', message: 'Product record no longer exists on the configured chain.' });
    let reference;
    try { reference = await ipfs.retrieveBuffer(chain.referenceImageCID); }
    catch (error) { return res.status(503).json({ success: false, code: 'IPFS_UNAVAILABLE', gate2: 'UNAVAILABLE', message: `The registered reference image could not be retrieved: ${error.message}` }); }
    const mlBase = String(process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const form = new FormData();
    form.append('reference_image', new Blob([reference.buffer], { type: reference.contentType.startsWith('image/') ? reference.contentType : 'image/jpeg' }), 'reference-image');
    form.append('current_image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'customer-image');
    let modelResponse, model;
    try {
      modelResponse = await fetch(`${mlBase}/compare`, { method: 'POST', body: form, signal: AbortSignal.timeout(45000) });
      model = await modelResponse.json();
    } catch (error) {
      return res.status(503).json({ success: false, code: 'ML_SERVICE_UNAVAILABLE', gate2: 'UNAVAILABLE', message: `The CNN service is not reachable: ${error.message}` });
    }
    if (!modelResponse.ok || !model) return res.status(503).json({ success: false, code: model?.code || 'MODEL_NOT_CONFIGURED', gate2: 'UNAVAILABLE', message: model?.message || 'CNN model could not process the image. No pass result was created.' });
    const modelResult = String(model.result || 'MODEL_NOT_CONFIGURED').toUpperCase();
    if (['MODEL_NOT_CONFIGURED', 'UNAVAILABLE'].includes(modelResult)) return res.status(503).json({ success: false, code: modelResult, gate2: 'UNAVAILABLE', message: model.message || 'Siamese model is not trained/configured yet. Gate 2 cannot pass.' });
    const record = {
      id: crypto.randomUUID(), sessionId: session.id, referenceCID: chain.referenceImageCID,
      modelVersion: model.modelVersion || 'unknown', threshold: Number.isFinite(Number(model.threshold)) ? Number(model.threshold) : null,
      distanceScore: Number.isFinite(Number(model.distance)) ? Number(model.distance) : (Number.isFinite(Number(model.score)) ? Number(model.score) : null),
      qualityStatus: model.qualityStatus || 'UNKNOWN', result: modelResult, createdAt: new Date().toISOString()
    };
    await store.insert('imageComparisons', record);
    if (model.modelVersion) await store.update('sessions', session.id, { modelVersion: model.modelVersion });
    if (modelResult === 'NEED_RETAKE' || modelResult === 'UNCERTAIN') {
      await store.update('sessions', session.id, { gate2Status: modelResult, overallStatus: 'IMAGE_RETAKE_REQUIRED' });
      return res.json({ success: true, sessionId: session.id, gate2: { status: modelResult, message: model.message || 'Image quality is not sufficient to make a reliable comparison. Please retake the photo.', distance: record.distanceScore, threshold: record.threshold, modelVersion: record.modelVersion }, nextStep: 'RETAKE_IMAGE' });
    }
    if (modelResult === 'MISMATCH') {
      await store.update('sessions', session.id, { status: 'COMPLETED', gate2Status: 'MISMATCH', overallStatus: 'SUSPICIOUS_IMAGE_MISMATCH', reasonCode: 'IMAGE_MISMATCH', completedAt: new Date().toISOString() });
      await store.createAudit('GATE_2_IMAGE_MISMATCH', req.user.id, 'VerificationSession', session.id, 'SUSPICIOUS', { modelVersion: record.modelVersion, distance: record.distanceScore, threshold: record.threshold });
      return res.json({ success: true, sessionId: session.id, gate2: { status: 'MISMATCH', message: 'The packaging photo does not match the manufacturer reference closely enough.' }, final: { status: 'SUSPICIOUS_IMAGE_MISMATCH', title: 'Likely counterfeit — packaging mismatch', message: 'The packaging image differs from the registered reference. Stop verification and contact the manufacturer.' }, stoppedAt: 'GATE_2' });
    }
    if (modelResult !== 'MATCH') return res.status(503).json({ success: false, code: 'MODEL_INVALID_RESULT', gate2: 'UNAVAILABLE', message: `The CNN returned an unsupported result: ${modelResult}.` });
    await store.update('sessions', session.id, { gate2Status: 'PASS', overallStatus: 'GATE_2_PASSED' });
    return res.json({ success: true, sessionId: session.id, gate2: { status: 'PASS', message: 'No strong packaging-image mismatch was detected.', distance: record.distanceScore, threshold: record.threshold, modelVersion: record.modelVersion }, nextStep: 'REQUEST_LOCATION', note: 'A matching image is not final proof of authenticity. Continue to Gate 3.' });
  } catch (error) { next(error); }
}

async function recordLocationAndComplete(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    if (session.gate2Status !== 'PASS') return res.status(409).json({ success: false, code: 'GATE_2_NOT_PASSED', message: 'Gate 2 must match before Gate 3 starts.' });
    const consent = req.body?.locationConsent === true;
    const now = new Date().toISOString();
    if (!consent) {
      await store.update('sessions', session.id, { status: 'COMPLETED', gate3Status: 'LOCATION_UNAVAILABLE', overallStatus: 'PARTIAL_CHECK_LOCATION_UNAVAILABLE', reasonCode: 'LOCATION_PERMISSION_DENIED', completedAt: now });
      return res.json({ success: true, sessionId: session.id, gate3: { status: 'LOCATION_UNAVAILABLE', message: 'Location permission was not granted. The location/time check could not be completed.' }, final: { status: 'PARTIAL_CHECK_LOCATION_UNAVAILABLE', title: 'Partial verification', message: 'Blockchain and packaging checks ran, but Gate 3 is unavailable because location permission was not granted.' } });
    }
    const latitude = Number(req.body?.latitude); const longitude = Number(req.body?.longitude); const accuracy = Number(req.body?.accuracyMeters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return res.status(400).json({ success: false, code: 'INVALID_COORDINATES', message: 'Browser location coordinates are invalid.' });
    const maxAccuracy = Number(process.env.MAX_GPS_ACCURACY_METERS || 150);
    const maxSpeed = Number(process.env.MAX_PLAUSIBLE_SPEED_KMH || 120);
    let previous;
    try { previous = await store.latestUsableScan(session.productId); }
    catch (error) { return res.status(500).json({ success: false, code: 'SCAN_HISTORY_UNAVAILABLE', message: `Could not read previous scan history: ${error.message}` }); }
    let movement;
    try {
      movement = assessMovement({
        previous,
        current: { latitude, longitude, accuracyMeters: accuracy, serverReceivedAt: now },
        maxSpeedKmh: maxSpeed,
        maxAccuracyMeters: maxAccuracy
      });
    } catch (error) {
      return res.status(500).json({ success: false, code: 'INVALID_CASPG_CONFIG', message: error.message });
    }
    const { distanceKm, elapsedSeconds, estimatedSpeedKmh: speed, caspgStatus, reasonCode, isDuplicateScan, explanation } = movement;
    const suspicious = caspgStatus === 'SUSPICIOUS_MOVEMENT';
    const scan = {
      id: crypto.randomUUID(), productId: session.productId, sessionId: session.id, userId: req.user.id,
      serverReceivedAt: now, latitude, longitude, accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
      locationConsent: true, previousScanId: previous?.id || null, distanceKm, elapsedSeconds,
      estimatedSpeedKmh: speed, caspgStatus, reasonCode, evidenceHash: null, chainAuditTxHash: null
    };
    const evidence = { productId: scan.productId, sessionId: scan.sessionId, serverReceivedAt: scan.serverReceivedAt, previousScanId: scan.previousScanId, distanceKm: scan.distanceKm, elapsedSeconds: scan.elapsedSeconds, estimatedSpeedKmh: scan.estimatedSpeedKmh, caspgStatus: scan.caspgStatus, reasonCode: scan.reasonCode };
    try { scan.evidenceHash = blockchain.metadataHash(evidence); } catch { scan.evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`; }
    await store.insert('scanEvents', scan);
    let chainAudit = null; let auditError = null;
    try { chainAudit = await blockchain.recordScanAudit(session.productId, suspicious, speed || 0, scan.evidenceHash); scan.chainAuditTxHash = chainAudit.txHash; await store.update('scanEvents', scan.id, { chainAuditTxHash: chainAudit.txHash }); }
    catch (error) { auditError = error.message; }
    const finalStatus = suspicious ? 'SUSPICIOUS_MOVEMENT' : (['BASELINE_NO_PREVIOUS_SCAN', 'LOCATION_UNCERTAIN', 'INVALID_TIME'].includes(caspgStatus) ? `PARTIAL_CHECK_${caspgStatus}` : (chainAudit ? 'NO_SUSPICIOUS_SIGNALS_DETECTED' : 'PARTIAL_CHECK_AUDIT_NOT_ANCHORED'));
    const completedAt = new Date().toISOString();
    await store.update('sessions', session.id, { status: 'COMPLETED', gate3Status: caspgStatus, overallStatus: finalStatus, reasonCode, completedAt });
    await store.createAudit('GATE_3_CASPG_COMPLETED', req.user.id, 'VerificationSession', session.id, finalStatus, { caspgStatus, distanceKm, elapsedSeconds, estimatedSpeedKmh: speed, chainAuditTxHash: chainAudit?.txHash || null });
    const gate3Payload = { status: caspgStatus, distanceKm, elapsedSeconds, estimatedSpeedKmh: speed, thresholdKmh: Number(process.env.MAX_PLAUSIBLE_SPEED_KMH || 120), reason: reasonCode, isDuplicateScan: Boolean(isDuplicateScan), explanation };
    const auditPayload = chainAudit ? { status: 'ANCHORED', txHash: chainAudit.txHash } : { status: 'NOT_ANCHORED', message: auditError };
    if (suspicious) {
      return res.json({ success: true, sessionId: session.id, gate3: gate3Payload, final: { status: finalStatus, title: 'Suspicious scan movement', message: 'The estimated movement between two scan locations exceeds the configured physical travel threshold. This is a warning for review, not conclusive proof of counterfeiting.', explanation, gate3: gate3Payload, audit: auditPayload }, audit: auditPayload });
    }
    if (finalStatus.startsWith('PARTIAL')) {
      return res.json({ success: true, sessionId: session.id, gate3: gate3Payload, final: { status: finalStatus, title: 'Partial verification', message: caspgStatus === 'BASELINE_NO_PREVIOUS_SCAN' ? 'This is the first usable location for this product ID. A travel comparison is not available yet.' : caspgStatus === 'LOCATION_UNCERTAIN' ? 'GPS accuracy is not sufficient for a reliable travel calculation.' : auditError ? 'Movement did not exceed the threshold, but the immutable scan audit could not be recorded on-chain.' : 'The travel comparison could not be completed reliably.', explanation, gate3: gate3Payload, audit: auditPayload }, audit: auditPayload });
    }
    return res.json({ success: true, sessionId: session.id, gate3: gate3Payload, final: { status: 'NO_SUSPICIOUS_SIGNALS_DETECTED', title: 'No suspicious signals detected', message: 'All three configured checks ran without a warning. This result is not a guarantee that the product is genuine.', explanation, gate3: gate3Payload, audit: auditPayload }, audit: auditPayload });
  } catch (error) { next(error); }
}
async function getSession(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    const comparisons = (await store.all('imageComparisons')).filter(c => c.sessionId === session.id);
    const scans = (await store.all('scanEvents')).filter(s => s.sessionId === session.id);
    res.json({ success: true, session, comparisons, scans: scans.map(s => ({ ...s, latitude: undefined, longitude: undefined })) });
  } catch (error) { next(error); }
}
module.exports = { haversineMeters, startVerification, compareImage, recordLocationAndComplete, getSession };
