const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const qrService = require('../src/services/qrService');
const ipfsService = require('../src/services/ipfsService');
const blockchainService = require('../src/services/blockchainService');
const { publicProduct } = require('../src/controllers/productController');

test('QR generator encodes the configured TrustTrace verification URL and creates a valid PNG', async () => {
  const oldBase = process.env.APP_BASE_URL;
  const oldPublic = process.env.FRONTEND_PUBLIC_URL;
  delete process.env.FRONTEND_PUBLIC_URL;
  process.env.APP_BASE_URL = 'https://trusttrace.example.test';
  const productId = `PROD-TEST-${Date.now()}`;
  let generated;
  try {
    generated = await qrService.generateQRCode(productId);
    assert.equal(generated.verificationUrl, `https://trusttrace.example.test/verify/${productId}`);
    assert.equal(generated.publicPath, `/uploads/qr_codes/${productId}.png`);
    const bytes = await fs.readFile(generated.filePath);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.length > 1000, 'QR PNG should contain actual image data');
  } finally {
    if (generated?.filePath) await fs.rm(generated.filePath, { force: true });
    if (oldBase === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldBase;
    if (oldPublic === undefined) delete process.env.FRONTEND_PUBLIC_URL;
    else process.env.FRONTEND_PUBLIC_URL = oldPublic;
  }
});

test('QR generator prioritizes FRONTEND_PUBLIC_URL and rejects localhost in production', () => {
  const oldBase = process.env.APP_BASE_URL;
  const oldPublic = process.env.FRONTEND_PUBLIC_URL;
  const oldEnv = process.env.NODE_ENV;
  try {
    process.env.APP_BASE_URL = 'http://localhost:5173';
    process.env.FRONTEND_PUBLIC_URL = 'https://verify.trusttrace.app/';
    assert.equal(qrService.getVerificationUrl('PROD-PUB-001'), 'https://verify.trusttrace.app/verify/PROD-PUB-001');

    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_PUBLIC_URL = 'http://localhost:5173';
    assert.throws(() => qrService.getVerificationUrl('PROD-PUB-001'), /FRONTEND_PUBLIC_URL must be configured to a public non-localhost domain/);
  } finally {
    if (oldBase === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldBase;
    if (oldPublic === undefined) delete process.env.FRONTEND_PUBLIC_URL;
    else process.env.FRONTEND_PUBLIC_URL = oldPublic;
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
  }
});

test('IPFS service fails clearly if the provider credential is missing', () => {
  const oldJwt = process.env.PINATA_JWT;
  const oldProvider = process.env.IPFS_PROVIDER;
  process.env.PINATA_JWT = '';
  process.env.IPFS_PROVIDER = 'pinata';
  try {
    assert.throws(() => ipfsService.ensureConfigured(), /PINATA_JWT is missing/);
  } finally {
    if (oldJwt === undefined) delete process.env.PINATA_JWT;
    else process.env.PINATA_JWT = oldJwt;
    if (oldProvider === undefined) delete process.env.IPFS_PROVIDER;
    else process.env.IPFS_PROVIDER = oldProvider;
  }
});

test('blockchain service reports missing contract configuration instead of assuming a product is registered', () => {
  const oldRpc = process.env.BLOCKCHAIN_RPC_URL;
  const oldAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
  delete process.env.BLOCKCHAIN_RPC_URL;
  delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
  try {
    assert.match(blockchainService.configError(), /BLOCKCHAIN_RPC_URL is missing/);
  } finally {
    if (oldRpc === undefined) delete process.env.BLOCKCHAIN_RPC_URL;
    else process.env.BLOCKCHAIN_RPC_URL = oldRpc;
    if (oldAddress === undefined) delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    else process.env.BLOCKCHAIN_CONTRACT_ADDRESS = oldAddress;
  }
});


test('public product details prefer canonical blockchain fields over local database values', () => {
  const response = publicProduct(
    { productId: 'DB-TAMPERED', name: 'Database Name', brand: 'Database Brand', category: 'medicine', batchNumber: 'DB-BATCH', manufacturerWallet: '0x0000000000000000000000000000000000000001' },
    { productId: 'CHAIN-001', name: 'On-chain Name', batchNumber: 'CHAIN-BATCH', manufacturer: '0x0000000000000000000000000000000000000002', registeredAt: 123, referenceImageCID: 'bafyReferenceCid123', scanCount: 4, hasSuspiciousScan: false },
    { brand: 'On-chain Brand', category: 'food', sku: 'CHAIN-SKU', unitSerial: 'CHAIN-UNIT', manufactureDate: '2026-10-01', expiryDate: '2028-10-01' }
  );
  assert.equal(response.productId, 'CHAIN-001');
  assert.equal(response.name, 'On-chain Name');
  assert.equal(response.batchNumber, 'CHAIN-BATCH');
  assert.equal(response.manufacturerWallet, '0x0000000000000000000000000000000000000002');
  assert.equal(response.brand, 'On-chain Brand');
  assert.equal(response.category, 'food');
});

test('blockchain service queries eth_chainId and succeeds when RPC chain ID matches configured BLOCKCHAIN_CHAIN_ID across Localhat (31337), MST Testnet (54635), and MST Mainnet (4646)', async () => {
  const oldChainId = process.env.BLOCKCHAIN_CHAIN_ID;
  const oldAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
  process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const networks = [
    { name: 'Hardhat Local', decimal: '31337', hex: '0x7a69' },
    { name: 'MST Coral Testnet', decimal: '54635', hex: '0xd56b' },
    { name: 'MST Mainnet', decimal: '4646', hex: '0x1226' }
  ];
  try {
    for (const net of networks) {
      process.env.BLOCKCHAIN_CHAIN_ID = net.decimal;
      let ethChainIdCalled = 0;
      blockchainService.setCustomProviderForTests({
        async send(method) {
          if (method === 'eth_chainId') {
            ethChainIdCalled += 1;
            return net.hex;
          }
          throw new Error(`Unexpected RPC method: ${method}`);
        },
        async getCode() {
          return '0x6080604052';
        }
      });
      const verifiedChain = await blockchainService.getChainId();
      assert.equal(verifiedChain, net.decimal, `${net.name} chain ID should match`);
      assert.equal(ethChainIdCalled, 1, `eth_chainId must be queried for ${net.name}`);
    }
  } finally {
    blockchainService.setCustomProviderForTests(null);
    if (oldChainId === undefined) delete process.env.BLOCKCHAIN_CHAIN_ID;
    else process.env.BLOCKCHAIN_CHAIN_ID = oldChainId;
    if (oldAddress === undefined) delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    else process.env.BLOCKCHAIN_CONTRACT_ADDRESS = oldAddress;
  }
});

test('blockchain service rejects contract operations with CHAIN_ID_MISMATCH when RPC eth_chainId differs from BLOCKCHAIN_CHAIN_ID', async () => {
  const oldChainId = process.env.BLOCKCHAIN_CHAIN_ID;
  const oldAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
  process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const mismatchCases = [
    { configured: '31337', rpcHex: '0x1226', expectedActual: '4646' },
    { configured: '54635', rpcHex: '0x7a69', expectedActual: '31337' },
    { configured: '4646', rpcHex: '0xd56b', expectedActual: '54635' }
  ];
  try {
    for (const tc of mismatchCases) {
      process.env.BLOCKCHAIN_CHAIN_ID = tc.configured;
      let getCodeCalled = false;
      blockchainService.setCustomProviderForTests({
        async send(method) {
          if (method === 'eth_chainId') return tc.rpcHex;
          throw new Error(`Unexpected RPC method: ${method}`);
        },
        async getCode() {
          getCodeCalled = true;
          return '0x6080604052';
        }
      });
      await assert.rejects(
        () => blockchainService.verifyProduct('PROD-TEST-CHAIN-CHECK'),
        (err) => {
          assert.equal(err.code, 'CHAIN_ID_MISMATCH');
          assert.equal(err.expectedChainId, tc.configured);
          assert.equal(err.actualChainId, tc.expectedActual);
          assert.match(err.message, /CHAIN_ID_MISMATCH/);
          return true;
        }
      );
      assert.equal(getCodeCalled, false, 'Contract bytecode check must not proceed when chainId mismatches');
    }
  } finally {
    blockchainService.setCustomProviderForTests(null);
    if (oldChainId === undefined) delete process.env.BLOCKCHAIN_CHAIN_ID;
    else process.env.BLOCKCHAIN_CHAIN_ID = oldChainId;
    if (oldAddress === undefined) delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    else process.env.BLOCKCHAIN_CONTRACT_ADDRESS = oldAddress;
  }
});

test('IPFS CIDv0 content verification accepts matching UnixFS payload and rejects mismatched payload', () => {
  const sampleBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082', 'hex');
  const expectedCid = ipfsService.computeUnixFsCidV0(sampleBuffer);
  assert.ok(expectedCid.startsWith('Qm'));
  const validCheck = ipfsService.verifyBufferMatchesCid(expectedCid, sampleBuffer);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.computedCid, expectedCid);

  const tamperedBuffer = Buffer.from('ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909', 'hex');
  const invalidCheck = ipfsService.verifyBufferMatchesCid(expectedCid, tamperedBuffer);
  assert.equal(invalidCheck.valid, false);
  assert.match(invalidCheck.reason, /CID mismatch/);
});
