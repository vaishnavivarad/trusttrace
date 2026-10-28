const fs = require('fs');
const path = require('path');

const ABI = [
  'function owner() view returns (address)',
  'function authorizedManufacturers(address) view returns (bool)',
  'function authorizeManufacturer(address _manufacturer)',
  'function revokeManufacturer(address _manufacturer)',
  'function registerProduct(string _productId,string _name,string _batchNumber,string _referenceImageCID)',
  'function registerProductWithDetails(string _productId,string _name,string _brand,string _category,string _sku,string _batchNumber,string _unitSerial,string _manufactureDate,string _expiryDate,string _referenceImageCID,string _metadataCID,bytes32 _metadataHash,address _manufacturer)',
  'function verifyProduct(string _productId) view returns (string name,string batchNumber,string referenceImageCID,address manufacturer,uint256 registeredAt,bool exists,uint256 scanCount,bool hasSuspiciousScan)',
  'function verifyProductDetails(string _productId) view returns (string brand,string category,string sku,string unitSerial,string manufactureDate,string expiryDate,string metadataCID,bytes32 metadataHash)',
  'function recordScanAudit(string _productId,bool _suspicious,uint256 _impliedSpeedScaled,bytes32 _evidenceHash)',
  'function getScanCount(string _productId) view returns (uint256)',
  'function getLocationScanRecordCount(string _productId) view returns (uint256)'
];

const LOCAL_DEPLOYMENT_PATH = path.resolve(__dirname, '../../config/local-deployment.json');
let customTestProvider = null;
let autoRecoveryInProgress = false;

function setCustomProviderForTests(p) {
  customTestProvider = p || null;
}
function ethersLib() {
  try { return require('ethers'); }
  catch { throw new Error('The ethers dependency is missing. Run npm install in the backend folder.'); }
}
function readLocalDeploymentConfig() {
  try {
    if (!fs.existsSync(LOCAL_DEPLOYMENT_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(LOCAL_DEPLOYMENT_PATH, 'utf8'));
    if (String(data?.chainId || '') !== '31337') return null;
    return data;
  } catch {
    return null;
  }
}
function writeLocalDeploymentConfig(data) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_DEPLOYMENT_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_DEPLOYMENT_PATH, JSON.stringify({
      network: 'localhost',
      chainId: '31337',
      contractName: 'ProductAuth',
      ...data,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch { /* non-fatal */ }
}
function getConfiguredContractAddress() {
  const envAddr = String(process.env.BLOCKCHAIN_CONTRACT_ADDRESS || '').trim();
  const expectedChain = String(process.env.BLOCKCHAIN_CHAIN_ID || '').trim();
  if (!customTestProvider && expectedChain === '31337') {
    const ethers = ethersLib();
    const localCfg = readLocalDeploymentConfig();
    if (!ethers.isAddress(envAddr) && localCfg?.contractAddress && ethers.isAddress(localCfg.contractAddress)) {
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS = localCfg.contractAddress;
      return localCfg.contractAddress;
    }
  }
  return envAddr;
}
function configError() {
  if (!process.env.BLOCKCHAIN_RPC_URL) return 'BLOCKCHAIN_RPC_URL is missing.';
  if (!getConfiguredContractAddress()) return 'BLOCKCHAIN_CONTRACT_ADDRESS is missing. Deploy ProductAuth and set its address.';
  return null;
}
function provider() {
  if (customTestProvider) return customTestProvider;
  const issue = configError();
  if (issue) throw new Error(issue);
  const ethers = ethersLib();
  return new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
}
async function verifyConnectedChainId(customProv) {
  const p = customProv || provider();
  const rawChainId = await p.send('eth_chainId', []);
  if (rawChainId === undefined || rawChainId === null || String(rawChainId).trim() === '') {
    throw new Error('RPC node returned an empty eth_chainId response.');
  }
  const actualChainId = BigInt(String(rawChainId).trim()).toString(10);
  const expectedRaw = String(process.env.BLOCKCHAIN_CHAIN_ID || '').trim();
  if (expectedRaw) {
    const expectedChainId = BigInt(expectedRaw).toString(10);
    if (actualChainId !== expectedChainId) {
      const err = new Error(`CHAIN_ID_MISMATCH: Connected RPC node reported chainId ${actualChainId} (${rawChainId}), which does not match configured BLOCKCHAIN_CHAIN_ID ${expectedChainId}. Refusing to execute ProductAuth operations on the wrong network.`);
      err.code = 'CHAIN_ID_MISMATCH';
      err.expectedChainId = expectedChainId;
      err.actualChainId = actualChainId;
      throw err;
    }
  }
  return actualChainId;
}
function readContract() {
  const p = provider();
  const ethers = ethersLib();
  return new ethers.Contract(getConfiguredContractAddress(), ABI, p);
}
function writeContract() {
  const key = process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY;
  if (!key) throw new Error('BLOCKCHAIN_RELAYER_PRIVATE_KEY is missing. Set a dedicated local/testnet relayer key to write on-chain records.');
  const p = provider();
  const ethers = ethersLib();
  const wallet = new ethers.Wallet(key, p);
  return new ethers.Contract(getConfiguredContractAddress(), ABI, wallet);
}
async function ensureContractDeployed() {
  const p = provider();
  const chainId = await verifyConnectedChainId(p);
  let address = getConfiguredContractAddress();
  const ethers = ethersLib();
  let isValidAddr = ethers.isAddress(address);
  let code = isValidAddr ? await p.getCode(address) : '0x';

  if (
    (!isValidAddr || !code || code === '0x' || code === '0x0') &&
    !customTestProvider &&
    chainId === '31337' &&
    process.env.STORAGE_MODE === 'postgres' &&
    process.env.AUTO_RECOVER_LOCAL_CHAIN !== 'false' &&
    !autoRecoveryInProgress
  ) {
    autoRecoveryInProgress = true;
    try {
      const { syncState } = require('../../scripts/syncLocalChainState');
      await syncState({ keepStoreOpen: true });
      address = getConfiguredContractAddress();
      isValidAddr = ethers.isAddress(address);
      code = isValidAddr ? await p.getCode(address) : '0x';
    } catch (recErr) {
      console.warn(`Automatic local chain recovery failed: ${recErr.message}`);
    } finally {
      autoRecoveryInProgress = false;
    }
  }

  if (!isValidAddr) {
    throw new Error(`BLOCKCHAIN_CONTRACT_ADDRESS (${address}) is not a valid EVM address.`);
  }
  if (!code || code === '0x' || code === '0x0') {
    throw new Error(`No ProductAuth contract bytecode found at ${address} on chainId ${chainId}. Verify that ProductAuth is deployed and BLOCKCHAIN_CONTRACT_ADDRESS matches (or run "npm --prefix backend run sync:local-chain" for local Hardhat).`);
  }
  return chainId;
}
async function getDiagnostics() {
  const ethers = ethersLib();
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || null;
  const expectedChainId = String(process.env.BLOCKCHAIN_CHAIN_ID || '').trim() || null;
  const localCfg = readLocalDeploymentConfig();
  const configuredContractAddress = getConfiguredContractAddress() || null;
  const contractAddressValid = Boolean(configuredContractAddress && ethers.isAddress(configuredContractAddress));
  const diag = {
    rpcUrl,
    expectedChainId,
    actualChainId: null,
    chainIdMatches: false,
    configuredContractAddress,
    localDeploymentFileAddress: localCfg?.contractAddress || null,
    contractAddressValid,
    contractBytecodeExists: false,
    contractBytecodeBytes: 0,
    blockNumber: null,
    rpcReachable: false,
    needsLocalDeployment: false,
    error: null,
    recoveryCommand: 'npm --prefix backend run sync:local-chain',
    recoveryInstruction: 'If the local Hardhat node was restarted, click "Deploy & Sync Local Chain" or run "npm --prefix backend run sync:local-chain" to deploy ProductAuth and restore approved manufacturer authorizations and products.'
  };
  if (!rpcUrl) {
    diag.error = 'BLOCKCHAIN_RPC_URL is not configured.';
    return diag;
  }
  try {
    const p = customTestProvider || new ethers.JsonRpcProvider(rpcUrl);
    const rawHex = await p.send('eth_chainId', []);
    diag.rpcReachable = true;
    diag.actualChainId = BigInt(String(rawHex).trim()).toString(10);
    diag.chainIdMatches = Boolean(!expectedChainId || diag.actualChainId === BigInt(expectedChainId).toString(10));
    try { diag.blockNumber = Number(await p.getBlockNumber()); } catch { /* optional */ }
    if (!diag.chainIdMatches) {
      diag.error = `RPC chain ID (${diag.actualChainId}) does not match expected BLOCKCHAIN_CHAIN_ID (${expectedChainId}).`;
      return diag;
    }
    if (!contractAddressValid) {
      diag.needsLocalDeployment = diag.actualChainId === '31337';
      diag.error = `Configured contract address "${configuredContractAddress || ''}" is not a valid 42-character hex EVM address.`;
      return diag;
    }
    const code = await p.getCode(configuredContractAddress);
    diag.contractBytecodeExists = Boolean(code && code !== '0x' && code !== '0x0');
    diag.contractBytecodeBytes = diag.contractBytecodeExists ? (code.length - 2) / 2 : 0;
    diag.needsLocalDeployment = Boolean(diag.actualChainId === '31337' && !diag.contractBytecodeExists);
    if (!diag.contractBytecodeExists) {
      diag.error = `No ProductAuth contract bytecode found at ${configuredContractAddress} on chainId ${diag.actualChainId}.`;
    }
  } catch (err) {
    diag.error = `Could not reach RPC at ${rpcUrl}: ${err.message}`;
  }
  return diag;
}
async function getChainId() {
  return ensureContractDeployed();
}
async function isAuthorizedManufacturer(address) {
  if (!address) return false;
  await ensureContractDeployed();
  return Boolean(await readContract().authorizedManufacturers(address));
}
async function authorizeManufacturer(address) {
  const ethers = ethersLib();
  if (!ethers.isAddress(address)) throw new Error('Manufacturer wallet address is invalid.');
  await ensureContractDeployed();
  const contract = writeContract();
  const tx = await contract.authorizeManufacturer(address);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Manufacturer authorization transaction failed.');
  const confirmed = await isAuthorizedManufacturer(address);
  if (!confirmed) throw new Error('Manufacturer authorization transaction mined, but wallet is still not marked authorized on ProductAuth.');
  return { txHash: receipt.hash || tx.hash, blockNumber: receipt.blockNumber };
}
async function revokeManufacturer(address) {
  const ethers = ethersLib();
  if (!ethers.isAddress(address)) throw new Error('Manufacturer wallet address is invalid.');
  await ensureContractDeployed();
  const contract = writeContract();
  const tx = await contract.revokeManufacturer(address);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Manufacturer revocation transaction failed.');
  return { txHash: receipt.hash || tx.hash, blockNumber: receipt.blockNumber };
}
async function registerProductOnChain(product, cids, metadataHash) {
  const ethers = ethersLib();
  if (!ethers.isAddress(product.manufacturerWallet)) throw new Error('Manufacturer wallet address is invalid.');
  await ensureContractDeployed();
  const contract = writeContract();
  const tx = await contract.registerProductWithDetails(
    product.productId,
    product.name,
    product.brand,
    product.category,
    product.sku || '',
    product.batchNumber,
    product.unitSerial,
    product.manufactureDate || '',
    product.expiryDate || '',
    cids.referenceImageCID,
    cids.metadataCID || '',
    metadataHash,
    product.manufacturerWallet
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Product registration transaction failed on-chain.');
  // Confirm the product from the canonical chain record after the transaction.
  const chainRecord = await verifyProduct(product.productId);
  if (!chainRecord.exists || chainRecord.manufacturer.toLowerCase() !== product.manufacturerWallet.toLowerCase() || chainRecord.referenceImageCID !== cids.referenceImageCID) {
    throw new Error('Transaction receipt was mined, but post-registration chain verification did not match the expected manufacturer/reference image CID.');
  }
  const chainDetails = await verifyProductDetails(product.productId);
  if (String(chainDetails.metadataHash).toLowerCase() !== String(metadataHash).toLowerCase() || chainDetails.metadataCID !== (cids.metadataCID || '')) {
    throw new Error('Product was mined but the on-chain metadata proof did not match the expected metadata CID/hash.');
  }
  return { txHash: receipt.hash || tx.hash, blockNumber: receipt.blockNumber, chainId: await getChainId(), contractAddress: getConfiguredContractAddress() };
}
async function verifyProduct(productId) {
  await ensureContractDeployed();
  const c = readContract();
  const row = await c.verifyProduct(productId);
  return {
    productId,
    name: row.name,
    batchNumber: row.batchNumber,
    referenceImageCID: row.referenceImageCID,
    manufacturer: row.manufacturer,
    registeredAt: Number(row.registeredAt),
    exists: Boolean(row.exists),
    scanCount: Number(row.scanCount),
    hasSuspiciousScan: Boolean(row.hasSuspiciousScan)
  };
}
async function verifyProductDetails(productId) {
  await ensureContractDeployed();
  const c = readContract();
  const row = await c.verifyProductDetails(productId);
  return { brand: row.brand, category: row.category, sku: row.sku, unitSerial: row.unitSerial, manufactureDate: row.manufactureDate, expiryDate: row.expiryDate, metadataCID: row.metadataCID, metadataHash: row.metadataHash };
}
async function recordScanAudit(productId, suspicious, speedKmh, evidenceHash) {
  await ensureContractDeployed();
  const ethers = ethersLib();
  const speedScaled = BigInt(Math.max(0, Math.round(Number(speedKmh || 0) * 100)));
  const hash = /^0x[0-9a-fA-F]{64}$/.test(evidenceHash || '') ? evidenceHash : ethers.keccak256(ethers.toUtf8Bytes(String(evidenceHash || '')));
  const contract = writeContract();
  const tx = await contract.recordScanAudit(productId, Boolean(suspicious), speedScaled, hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error('The scan audit transaction failed.');
  return { txHash: receipt.hash || tx.hash, blockNumber: receipt.blockNumber, evidenceHash: hash };
}
function metadataHash(json) {
  const ethers = ethersLib();
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(json)));
}
module.exports = { ABI, configError, getChainId, getConfiguredContractAddress, readLocalDeploymentConfig, writeLocalDeploymentConfig, getDiagnostics, ensureContractDeployed, verifyConnectedChainId, setCustomProviderForTests, isAuthorizedManufacturer, authorizeManufacturer, revokeManufacturer, registerProductOnChain, verifyProduct, verifyProductDetails, recordScanAudit, metadataHash };
