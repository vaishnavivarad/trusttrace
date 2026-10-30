const crypto = require('crypto');
const store = require('../services/appStore');
const blockchain = require('../services/blockchainService');
const ipfs = require('../services/ipfsService');
const {
  assessMovement,
  haversineMeters,
  formatDuration,
  resolveLocationName,
  detectNetworkLocation,
  KNOWN_CITIES
} = require('../services/caspgService');

function sameOwner(session, user) {
  return session && (session.userId === user.id || user.role === 'admin');
}

async function detectDeviceLocation(req, res) {
  const qLat = Number(req.query?.lat);
  const qLon = Number(req.query?.lon);
  if (Number.isFinite(qLat) && Number.isFinite(qLon) && qLat >= -90 && qLat <= 90 && qLon >= -180 && qLon <= 180) {
    let placeName = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${qLat}&lon=${qLon}&zoom=14`, {
        headers: { 'User-Agent': 'TrustTrace-ProductAuth/1.0' },
        signal: AbortSignal.timeout(2500)
      });
      if (r.ok) {
        const d = await r.json();
        const addr = d?.address || {};
        const locality = addr.suburb || addr.neighbourhood || addr.town || addr.village || addr.city_district || '';
        const city = addr.city || addr.town || addr.county || addr.state_district || '';
        const state = addr.state || '';
        const parts = [locality, city, state].filter(Boolean);
        const uniqueParts = [...new Set(parts)];
        if (uniqueParts.length > 0) placeName = uniqueParts.slice(0, 3).join(', ');
      }
    } catch { /* fallback to nearest city resolver */ }
    const resolvedName = placeName || resolveLocationName(qLat, qLon);
    return res.json({
      success: true,
      location: {
        latitude: qLat,
        longitude: qLon,
        locationName: resolvedName,
        source: 'gps'
      },
      thresholdSpeedKmh: Number(process.env.MAX_PLAUSIBLE_SPEED_KMH || 120)
    });
  }

  const loc = await detectNetworkLocation();
  return res.json({
    success: true,
    location: loc,
    cities: KNOWN_CITIES,
    thresholdSpeedKmh: Number(process.env.MAX_PLAUSIBLE_SPEED_KMH || 120)
  });
}

async function ensureOriginBaselineForProduct(productId, productRecord) {
  let previous = await store.latestUsableScan(productId);
  if (previous) return previous;
  const prod = productRecord || (await store.findProductByProductId(productId));
  if (!prod) return null;
  const netLoc = await detectNetworkLocation();
  const originTime = prod.createdAt || new Date(Date.now() - 3600 * 1000).toISOString();
  const originName = resolveLocationName(netLoc.latitude, netLoc.longitude, netLoc.locationName || 'Pune, Maharashtra');
  const originScan = {
    id: crypto.randomUUID(),
    productId,
    sessionId: `ORIGIN_${productId}`,
    userId: prod.manufacturerUserId || null,
    serverReceivedAt: originTime,
    latitude: netLoc.latitude,
    longitude: netLoc.longitude,
    accuracyMeters: 25,
    locationConsent: true,
    previousScanId: null,
    distanceKm: 0,
    elapsedSeconds: 0,
    estimatedSpeedKmh: 0,
    caspgStatus: 'ORIGIN_REGISTERED',
    reasonCode: `LOC:${originName}`,
    evidenceHash: prod.metadataHash || null,
    chainAuditTxHash: prod.txHash || null
  };
  try {
    await store.insert('scanEvents', originScan);
    return originScan;
  } catch {
    return originScan;
  }
}

async function startVerification(req, res, next) {
  try {
    const productId = String(req.body?.productId || '').trim();
    if (!productId) return res.status(400).json({ success: false, code: 'PRODUCT_ID_REQUIRED', message: 'Scan a product QR or enter a Product ID.' });
    let chain;
    try { chain = await blockchain.verifyProduct(productId); }
    catch (error) { return res.status(503).json({ success: false, code: 'BLOCKCHAIN_UNAVAILABLE', gate1: 'UNAVAILABLE', message: `Could not read the configured blockchain: ${error.message}` }); }
    if (!chain.exists) {
      await store.createAudit('UNREGISTERED_PRODUCT_SCAN', req.user.id, 'Product', productId, 'SUSPICIOUS');
      return res.status(404).json({ success: false, code: 'UNREGISTERED_PRODUCT', gate1: 'FAIL', overallStatus: 'UNREGISTERED_LIKELY_COUNTERFEIT', message: 'This Product ID is not registered on the configured blockchain. Verification stopped at Layer 1.', productId });
    }
    let details = {};
    try { details = await blockchain.verifyProductDetails(productId); } catch { /* older deployed contract might not expose extended fields */ }
    const record = await store.findProductByProductId(productId);
    const previousScan = await ensureOriginBaselineForProduct(productId, record);
    const session = {
      id: crypto.randomUUID(), productId, userId: req.user.id, status: 'IN_PROGRESS', gate1Status: 'PASS',
      gate2Status: 'PENDING', gate3Status: 'NOT_CHECKED', overallStatus: 'IN_PROGRESS', reasonCode: null,
      startedAt: new Date().toISOString(), completedAt: null, modelVersion: null
    };
    await store.insert('sessions', session);
    await store.createAudit('VERIFICATION_STARTED', req.user.id, 'VerificationSession', session.id, 'GATE_1_PASS');
    const prevSummary = previousScan ? {
      scanType: previousScan.caspgStatus === 'ORIGIN_REGISTERED' || String(previousScan.sessionId || '').startsWith('ORIGIN_') ? 'MANUFACTURER_ORIGIN' : 'CUSTOMER_SCAN',
      locationName: resolveLocationName(previousScan.latitude, previousScan.longitude, String(previousScan.reasonCode || '').startsWith('LOC:') ? String(previousScan.reasonCode).slice(4) : null),
      latitude: previousScan.latitude,
      longitude: previousScan.longitude,
      timestamp: previousScan.serverReceivedAt
    } : null;
    res.json({
      success: true,
      sessionId: session.id,
      gate1: { status: 'PASS', message: 'Product record found on the blockchain.' },
      previousScan: prevSummary,
      product: {
        productId, name: chain.name, brand: details.brand || record?.brand || '', category: details.category || record?.category || '',
        sku: details.sku || record?.sku || '', batchNumber: chain.batchNumber, unitSerial: details.unitSerial || record?.unitSerial || '',
        manufactureDate: details.manufactureDate || record?.manufactureDate || null, expiryDate: details.expiryDate || record?.expiryDate || null,
        manufacturerWallet: chain.manufacturer, registeredAt: chain.registeredAt, scanCount: chain.scanCount,
        previousScan: prevSummary
      },
      nextStep: 'CAPTURE_PACKAGING_IMAGE'
    });
  } catch (error) { next(error); }
}

async function compareImage(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    if (session.gate1Status !== 'PASS') return res.status(409).json({ success: false, code: 'GATE_1_NOT_PASSED', message: 'Layer 1 must pass before image comparison.' });
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
    if (['MODEL_NOT_CONFIGURED', 'UNAVAILABLE'].includes(modelResult)) return res.status(503).json({ success: false, code: modelResult, gate2: 'UNAVAILABLE', message: model.message || 'Siamese model is not trained/configured yet. Layer 2 cannot pass.' });
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
      return res.json({
        success: true,
        sessionId: session.id,
        gate2: {
          status: 'MISMATCH',
          distance: record.distanceScore,
          threshold: record.threshold,
          metrics: model.metrics || null,
          message: model.message || 'The packaging photo does not match the manufacturer reference closely enough.'
        },
        final: {
          status: 'SUSPICIOUS_IMAGE_MISMATCH',
          title: 'Suspicious Product — Packaging Mismatch Detected (Layer 2 Failed)',
          message: model.message || 'The uploaded packaging photo differs significantly from the manufacturer’s registered IPFS reference image. This unit is flagged as suspicious / likely counterfeit.'
        },
        stoppedAt: 'GATE_2'
      });
    }
    if (modelResult !== 'MATCH') return res.status(503).json({ success: false, code: 'MODEL_INVALID_RESULT', gate2: 'UNAVAILABLE', message: `The CNN returned an unsupported result: ${modelResult}.` });
    await store.update('sessions', session.id, { gate2Status: 'PASS', overallStatus: 'GATE_2_PASSED' });
    return res.json({
      success: true,
      sessionId: session.id,
      gate2: {
        status: 'PASS',
        message: model.message || 'Packaging photo matches the manufacturer reference.',
        distance: record.distanceScore,
        threshold: record.threshold,
        metrics: model.metrics || null,
        modelVersion: record.modelVersion
      },
      nextStep: 'REQUEST_LOCATION',
      note: 'Layer 2 packaging check passed. Continue to Layer 3 location & timestamp verification.'
    });
  } catch (error) { next(error); }
}

async function recordLocationAndComplete(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    if (session.gate2Status !== 'PASS') return res.status(409).json({ success: false, code: 'GATE_2_NOT_PASSED', message: 'Layer 2 must match before Layer 3 starts.' });

    const now = new Date().toISOString();
    let latitude = Number(req.body?.latitude);
    let longitude = Number(req.body?.longitude);
    let accuracy = Number(req.body?.accuracyMeters);
    let locationName = String(req.body?.locationName || '').trim();

    // If browser GPS was unavailable/denied on HTTP LAN IP or desktop, automatically fallback to network geolocation
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      const netLoc = await detectNetworkLocation();
      latitude = netLoc.latitude;
      longitude = netLoc.longitude;
      if (!locationName) locationName = netLoc.locationName;
      accuracy = 50;
    }
    if (!Number.isFinite(accuracy) || accuracy < 0) accuracy = 50;
    locationName = resolveLocationName(latitude, longitude, locationName);

    const maxSpeed = Number(process.env.MAX_PLAUSIBLE_SPEED_KMH || 120);
    let previous;
    try {
      previous = await ensureOriginBaselineForProduct(session.productId);
    } catch (error) {
      return res.status(500).json({ success: false, code: 'SCAN_HISTORY_UNAVAILABLE', message: `Could not read previous scan history: ${error.message}` });
    }

    let movement;
    try {
      movement = assessMovement({
        previous,
        current: { latitude, longitude, accuracyMeters: accuracy, serverReceivedAt: now, locationName },
        maxSpeedKmh: maxSpeed,
        maxAccuracyMeters: 50000
      });
    } catch (error) {
      return res.status(500).json({ success: false, code: 'INVALID_CASPG_CONFIG', message: error.message });
    }

    const {
      distanceKm,
      elapsedSeconds,
      minRequiredSeconds,
      formattedElapsed,
      formattedMinRequired,
      estimatedSpeedKmh: speed,
      caspgStatus,
      reasonCode,
      isDuplicateScan,
      previousLocationName,
      previousLatitude,
      previousLongitude,
      previousTimestamp,
      previousScanType,
      currentLocationName,
      explanation
    } = movement;

    const suspicious = caspgStatus === 'SUSPICIOUS_MOVEMENT';
    const scan = {
      id: crypto.randomUUID(),
      productId: session.productId,
      sessionId: session.id,
      userId: req.user.id,
      serverReceivedAt: now,
      latitude,
      longitude,
      accuracyMeters: Number.isFinite(accuracy) ? accuracy : 50,
      locationConsent: true,
      previousScanId: previous?.id || null,
      distanceKm,
      elapsedSeconds,
      estimatedSpeedKmh: speed,
      caspgStatus,
      reasonCode: `LOC:${currentLocationName || locationName}`,
      evidenceHash: null,
      chainAuditTxHash: null
    };
    const evidence = {
      productId: scan.productId,
      sessionId: scan.sessionId,
      serverReceivedAt: scan.serverReceivedAt,
      previousScanId: scan.previousScanId,
      previousLocation: previousLocationName,
      currentLocation: currentLocationName,
      distanceKm: scan.distanceKm,
      elapsedSeconds: scan.elapsedSeconds,
      minRequiredSeconds,
      estimatedSpeedKmh: scan.estimatedSpeedKmh,
      caspgStatus: scan.caspgStatus,
      reasonCode
    };
    try { scan.evidenceHash = blockchain.metadataHash(evidence); }
    catch { scan.evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`; }
    await store.insert('scanEvents', scan);

    let chainAudit = null;
    let auditError = null;
    try {
      chainAudit = await blockchain.recordScanAudit(session.productId, suspicious, speed || 0, scan.evidenceHash);
      scan.chainAuditTxHash = chainAudit.txHash;
      await store.update('scanEvents', scan.id, { chainAuditTxHash: chainAudit.txHash });
    } catch (error) {
      auditError = error.message;
    }

    const finalStatus = suspicious ? 'SUSPICIOUS_MOVEMENT' : 'NO_SUSPICIOUS_SIGNALS_DETECTED';
    const completedAt = new Date().toISOString();
    await store.update('sessions', session.id, { status: 'COMPLETED', gate3Status: caspgStatus, overallStatus: finalStatus, reasonCode, completedAt });
    await store.createAudit('GATE_3_CASPG_COMPLETED', req.user.id, 'VerificationSession', session.id, finalStatus, { caspgStatus, distanceKm, elapsedSeconds, minRequiredSeconds, estimatedSpeedKmh: speed, chainAuditTxHash: chainAudit?.txHash || null });

    const gate3Payload = {
      status: caspgStatus,
      distanceKm,
      elapsedSeconds,
      minRequiredSeconds,
      formattedElapsed,
      formattedMinRequired,
      estimatedSpeedKmh: speed,
      thresholdKmh: maxSpeed,
      previousLocationName,
      previousLatitude,
      previousLongitude,
      previousTimestamp,
      previousScanType,
      currentLocationName,
      currentLatitude: latitude,
      currentLongitude: longitude,
      currentTimestamp: now,
      reason: reasonCode,
      isDuplicateScan: Boolean(isDuplicateScan),
      explanation
    };
    const auditPayload = chainAudit ? { status: 'ANCHORED', txHash: chainAudit.txHash } : { status: 'RECORDED_OFF_CHAIN', message: auditError };

    if (suspicious) {
      return res.json({
        success: true,
        sessionId: session.id,
        gate3: gate3Payload,
        final: {
          status: finalStatus,
          title: 'Suspicious Product Detected — Impossible Travel Speed (Layer 3 Alert)',
          message: `This product was scanned ${distanceKm.toFixed(1)} km away from its previous location (${previousLocationName}) in only ${formattedElapsed}. At the maximum plausible threshold speed (${maxSpeed} km/h), travelling ${distanceKm.toFixed(1)} km requires at least ${formattedMinRequired}, but the implied speed was ${speed.toFixed(1)} km/h! This strongly indicates a cloned/copied QR code scanned in two distant places.`,
          explanation,
          gate3: gate3Payload,
          audit: auditPayload
        },
        audit: auditPayload
      });
    }

    return res.json({
      success: true,
      sessionId: session.id,
      gate3: gate3Payload,
      final: {
        status: 'NO_SUSPICIOUS_SIGNALS_DETECTED',
        title: 'Product Verified — All 3 Authenticity Layers Passed',
        message: 'Layer 1 (Blockchain Registration), Layer 2 (Siamese CNN Packaging Match), and Layer 3 (CASPG Location & Time Plausibility) all passed with zero suspicious signals.',
        explanation,
        gate3: gate3Payload,
        audit: auditPayload
      },
      audit: auditPayload
    });
  } catch (error) { next(error); }
}

async function getSession(req, res, next) {
  try {
    const session = await store.findById('sessions', req.params.sessionId);
    if (!session || !sameOwner(session, req.user)) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Verification session not found.' });
    const comparisons = (await store.all('imageComparisons')).filter(c => c.sessionId === session.id);
    const scans = (await store.all('scanEvents')).filter(s => s.sessionId === session.id);
    res.json({ success: true, session, comparisons, scans });
  } catch (error) { next(error); }
}

module.exports = { haversineMeters, formatDuration, detectDeviceLocation, startVerification, compareImage, recordLocationAndComplete, getSession };
