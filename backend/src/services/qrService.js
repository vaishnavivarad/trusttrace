const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const QR_FOLDER = path.join(__dirname, '../../uploads/qr_codes');

function isLocalhostUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(urlStr || ''));
  }
}

function getVerificationUrl(productId) {
  const configuredBase = String(process.env.FRONTEND_PUBLIC_URL || process.env.APP_BASE_URL || '').trim();
  if (process.env.NODE_ENV === 'production') {
    if (!configuredBase || isLocalhostUrl(configuredBase)) {
      throw new Error('FRONTEND_PUBLIC_URL must be configured to a public non-localhost domain in production before generating QR verification links.');
    }
  }
  const base = (configuredBase || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/verify/${encodeURIComponent(productId)}`;
}
async function generateQRCode(productId) {
  if (!productId || !/^[A-Za-z0-9_-]{3,100}$/.test(productId)) throw new Error('Invalid Product ID for QR generation.');
  fs.mkdirSync(QR_FOLDER, { recursive: true });
  const verificationUrl = getVerificationUrl(productId);
  const filename = `${productId}.png`;
  const filePath = path.join(QR_FOLDER, filename);
  await QRCode.toFile(filePath, verificationUrl, { errorCorrectionLevel: 'H', margin: 2, width: 640, color: { dark: '#12233F', light: '#FFFFFF' } });
  return { filename, filePath, verificationUrl, publicPath: `/uploads/qr_codes/${encodeURIComponent(filename)}` };
}
module.exports = { generateQRCode, getVerificationUrl };
