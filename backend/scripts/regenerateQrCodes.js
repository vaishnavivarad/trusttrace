require('dotenv').config();
const store = require('../src/services/appStore');
const blockchain = require('../src/services/blockchainService');
const { generateQRCode } = require('../src/services/qrService');

async function regenerateAllQrCodes() {
  try {
    const products = await store.all('products');
    const registered = products.filter(p => p.productId && (p.status === 'REGISTERED' || p.status === 'REGISTERED_QR_PENDING'));
    console.log(`Found ${registered.length} registered product(s) for QR regeneration.`);
    let updatedCount = 0;
    for (const prod of registered) {
      let existsOnChain = true;
      try {
        const chain = await blockchain.verifyProduct(prod.productId);
        existsOnChain = Boolean(chain.exists);
      } catch {
        // If chain is temporarily unreachable during offline regeneration, still allow file regeneration for REGISTERED products
        existsOnChain = prod.status === 'REGISTERED';
      }
      if (!existsOnChain) {
        console.warn(`Skipping ${prod.productId}: not found on-chain.`);
        continue;
      }
      const qr = await generateQRCode(prod.productId);
      await store.update('products', prod.id, {
        status: 'REGISTERED',
        qrFilename: qr.filename,
        qrUrl: qr.publicPath
      });
      updatedCount += 1;
      console.log(`Regenerated QR for ${prod.productId} -> ${qr.verificationUrl} (${qr.publicPath})`);
    }
    console.log(`Successfully regenerated ${updatedCount} QR code(s).`);
  } finally {
    await store.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  regenerateAllQrCodes().catch(err => {
    console.error(`QR regeneration failed: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { regenerateAllQrCodes };

