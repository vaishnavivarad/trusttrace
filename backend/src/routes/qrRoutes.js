const express = require('express');
const controller = require('../controllers/productController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const router = express.Router();
router.get('/:productId', requireAuth, requireRole('manufacturer'), controller.getProductQr);
module.exports = router;
