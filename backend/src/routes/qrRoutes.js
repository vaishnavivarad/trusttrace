const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const controller = require('../controllers/productController');
const store = require('../services/appStore');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const QR_FOLDER = path.join(__dirname, '../../uploads/qr_codes');

router.get('/catalog/list', async (req, res, next) => {
  try {
    const products = (await store.all('products'))
      .filter(p => p.productId && p.status === 'REGISTERED' && p.referenceImageCID && p.referenceImageCID !== 'cid1')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 20)
      .map(p => ({
        productId: p.productId,
        name: p.name,
        brand: p.brand,
        category: p.category,
        batchNumber: p.batchNumber,
        qrUrl: p.qrUrl || `/uploads/qr_codes/${encodeURIComponent(p.productId)}.png`
      }));
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

router.post('/decode', upload.single('qrImage'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, code: 'QR_IMAGE_REQUIRED', message: 'Select or capture a QR code image.' });
    }
    const origName = String(req.file.originalname || '');
    const nameMatch = origName.match(/(PROD-[A-Z0-9]{4,}-[A-Z0-9]{4,})/i);
    if (nameMatch) {
      return res.json({ success: true, productId: nameMatch[1].toUpperCase(), method: 'filename' });
    }

    const uploadHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    if (fs.existsSync(QR_FOLDER)) {
      for (const file of fs.readdirSync(QR_FOLDER)) {
        if (!file.endsWith('.png')) continue;
        try {
          const buf = fs.readFileSync(path.join(QR_FOLDER, file));
          if (crypto.createHash('sha256').update(buf).digest('hex') === uploadHash) {
            return res.json({ success: true, productId: file.replace(/\.png$/i, ''), method: 'sha256' });
          }
        } catch { /* ignore */ }
      }
    }

    // Visual QR grid matching via ML service
    const mlBase = String(process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    try {
      const fd = new FormData();
      fd.append('qr_image', new Blob([req.file.buffer], { type: req.file.mimetype || 'image/png' }), origName || 'qr.png');
      const resp = await fetch(`${mlBase}/match-qr`, { method: 'POST', body: fd, signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.matched && data?.productId) {
          return res.json({ success: true, productId: data.productId, method: 'visual-grid' });
        }
      }
    } catch { /* ignore */ }

    return res.status(422).json({
      success: false,
      code: 'QR_NOT_RECOGNIZED',
      message: 'Could not decode a valid product QR code from this image. Please upload a clearer QR image or use the QR scanner.'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:productId', requireAuth, requireRole('manufacturer'), controller.getProductQr);

module.exports = router;
