const express = require('express');
const multer = require('multer');
const controller = require('../controllers/productController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

router.post('/register', requireAuth, requireRole('manufacturer'), upload.single('referenceImage'), controller.registerProduct);
router.get('/mine', requireAuth, requireRole('manufacturer'), controller.listMyProducts);
router.get('/verify/:productId', controller.legacyVerifyRedirect);
router.get('/:productId/qr', requireAuth, requireRole('manufacturer'), controller.getProductQr);
router.get('/:productId/image', controller.getProductReferenceImage);
router.get('/:productId', controller.getProduct);
module.exports = router;
