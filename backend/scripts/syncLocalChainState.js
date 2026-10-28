require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const store = require('../src/services/appStore');
const blockchain = require('../src/services/blockchainService');

const ARTIFACT_PATH = path.resolve(
  __dirname,
  '../../trusttrace-blockchain/artifacts/contracts/ProductAuth.sol/ProductAuth.json'
);
const ENV_PATH = path.resolve(__dirname, '../.env');

function updateLocalEnvContractAddress(newAddress) {
  try {
    if (!fs.existsSync(ENV_PATH)) return false;
    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    const chainMatch = raw.match(/^\s*BLOCKCHAIN_CHAIN_ID\s*=\s*([^\r\n#]+)/m);
    const configuredChain = chainMatch ? chainMatch[1].trim() : '';
    // Never overwrite .env if configured for MST Coral Testnet (54635) or MST Mainnet (4646)
    if (configuredChain && configuredChain !== '31337') {
      return false;
    }
    let updated;
    if (/^\s*BLOCKCHAIN_CONTRACT_ADDRESS\s*=/m.test(raw)) {
      updated = raw.replace(
        /^(\s*BLOCKCHAIN_CONTRACT_ADDRESS\s*=\s*)([^\r\n]*)/m,
        `$1${newAddress}`
      );
    } else {
      updated = `${raw.replace(/\s*$/, '')}\nBLOCKCHAIN_CONTRACT_ADDRESS=${newAddress}\n`;
    }
    if (updated !== raw) {
      fs.writeFileSync(ENV_PATH, updated, 'utf8');
    }
    return true;
  } catch {
    return false;
  }
}

async function isValidProductAuthAt(provider, address) {
  if (!address || !ethers.isAddress(address)) return { valid: false, codeLength: 0 };
  try {
    const code = await provider.getCode(address);
    if (!code || code === '0x' || code === '0x0') return { valid: false, codeLength: 0 };
    const contract = new ethers.Contract(address, ['function owner() view returns (address)'], provider);
    const owner = await contract.owner();
    return { valid: ethers.isAddress(owner), codeLength: (code.length - 2) / 2, owner };
  } catch {
    return { valid: false, codeLength: 0 };
  }
}

async function ensureLocalContractDeployed() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
  const privateKey = process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('BLOCKCHAIN_RELAYER_PRIVATE_KEY is missing in backend/.env.');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const rawChainId = await provider.send('eth_chainId', []);
  const actualChainId = BigInt(String(rawChainId).trim()).toString(10);
  if (actualChainId !== '31337') {
    throw new Error(`syncLocalChainState is restricted to local Hardhat (chainId 31337), got chainId ${actualChainId}.`);
  }

  const signer = new ethers.Wallet(privateKey, provider);
  const localCfg = blockchain.readLocalDeploymentConfig();
  const envAddr = String(process.env.BLOCKCHAIN_CONTRACT_ADDRESS || '').trim();

  // Candidate addresses to inspect on the running local Hardhat node before deploying a new contract
  const candidates = Array.from(new Set([
    ethers.isAddress(envAddr) ? ethers.getAddress(envAddr) : null,
    localCfg?.contractAddress && ethers.isAddress(localCfg.contractAddress) ? ethers.getAddress(localCfg.contractAddress) : null,
    ethers.getCreateAddress({ from: signer.address, nonce: 0 }),
    ethers.getCreateAddress({ from: signer.address, nonce: 1 })
  ].filter(Boolean)));

  for (const candidate of candidates) {
    const check = await isValidProductAuthAt(provider, candidate);
    if (check.valid) {
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS = candidate;
      const blockNumber = await provider.getBlockNumber();
      blockchain.writeLocalDeploymentConfig({
        contractAddress: candidate,
        deployerAddress: check.owner || signer.address,
        bytecodeBytes: check.codeLength,
        blockNumber
      });
      updateLocalEnvContractAddress(candidate);
      console.log(`ProductAuth verified at ${candidate} on chainId 31337 (${check.codeLength} bytes).`);
      return { contractAddress: candidate, deployedNewContract: false, bytecodeBytes: check.codeLength };
    }
  }

  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(`Compiled ProductAuth artifact not found at ${ARTIFACT_PATH}. Run "npx hardhat build" in trusttrace-blockchain first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

  console.log('Fresh local Hardhat node detected (no ProductAuth bytecode found). Deploying ProductAuth...');
  const deployed = await factory.deploy();
  const deployTx = deployed.deploymentTransaction();
  await deployed.waitForDeployment();
  const deployedAddr = ethers.getAddress(await deployed.getAddress());

  const verifyCheck = await isValidProductAuthAt(provider, deployedAddr);
  if (!verifyCheck.valid) {
    throw new Error(`ProductAuth deployment failed bytecode verification at ${deployedAddr}.`);
  }

  process.env.BLOCKCHAIN_CONTRACT_ADDRESS = deployedAddr;
  const blockNumber = await provider.getBlockNumber();
  blockchain.writeLocalDeploymentConfig({
    contractAddress: deployedAddr,
    deployerAddress: signer.address,
    deploymentTxHash: deployTx ? deployTx.hash : null,
    bytecodeBytes: verifyCheck.codeLength,
    blockNumber
  });
  updateLocalEnvContractAddress(deployedAddr);
  console.log(`Deployed and verified ProductAuth at ${deployedAddr} (${verifyCheck.codeLength} bytes, block ${blockNumber}).`);
  return {
    contractAddress: deployedAddr,
    deployedNewContract: true,
    deploymentTxHash: deployTx ? deployTx.hash : null,
    bytecodeBytes: verifyCheck.codeLength
  };
}

async function syncState(options = {}) {
  const { keepStoreOpen = false } = options;
  const summary = {
    chainId: '31337',
    contractAddress: null,
    deployedNewContract: false,
    manufacturersAuthorized: [],
    manufacturersAlreadyAuthorized: [],
    productsRestored: [],
    productsAlreadyOnChain: [],
    skippedRecords: []
  };

  try {
    const deployInfo = await ensureLocalContractDeployed();
    const contractAddress = deployInfo.contractAddress;
    summary.contractAddress = contractAddress;
    summary.deployedNewContract = deployInfo.deployedNewContract;

    // 1. Idempotently restore all APPROVED manufacturer wallet authorizations from PostgreSQL
    const applications = await store.all('applications');
    const approvedApps = applications.filter(a => a.status === 'APPROVED');
    for (const app of approvedApps) {
      if (!app.walletAddress || !ethers.isAddress(app.walletAddress)) {
        summary.skippedRecords.push({
          type: 'ManufacturerApplication',
          id: app.id,
          companyName: app.companyName,
          reason: `Invalid or missing walletAddress: ${app.walletAddress || 'null'}`
        });
        continue;
      }
      const isAuth = await blockchain.isAuthorizedManufacturer(app.walletAddress);
      if (!isAuth) {
        const res = await blockchain.authorizeManufacturer(app.walletAddress);
        await store.update('applications', app.id, { authorizationTxHash: res.txHash });
        summary.manufacturersAuthorized.push({
          id: app.id,
          companyName: app.companyName,
          walletAddress: app.walletAddress,
          txHash: res.txHash
        });
        console.log(`Authorized manufacturer ${app.companyName} (${app.walletAddress}) -> tx ${res.txHash}`);
      } else {
        summary.manufacturersAlreadyAuthorized.push({
          id: app.id,
          companyName: app.companyName,
          walletAddress: app.walletAddress
        });
        console.log(`Manufacturer ${app.companyName} (${app.walletAddress}) already authorized on-chain.`);
      }
    }

    // 2. Idempotently restore all REGISTERED products from PostgreSQL
    const products = await store.all('products');
    const registeredProducts = products.filter(p => p.status === 'REGISTERED' && p.productId);
    for (const prod of registeredProducts) {
      if (!prod.manufacturerWallet || !ethers.isAddress(prod.manufacturerWallet) || !prod.referenceImageCID) {
        summary.skippedRecords.push({
          type: 'Product',
          productId: prod.productId,
          reason: 'Missing valid manufacturerWallet or referenceImageCID'
        });
        continue;
      }
      try {
        const onChain = await blockchain.verifyProduct(prod.productId);
        if (!onChain.exists) {
          const isWalletAuth = await blockchain.isAuthorizedManufacturer(prod.manufacturerWallet);
          if (!isWalletAuth) {
            await blockchain.authorizeManufacturer(prod.manufacturerWallet);
          }
          const metaHash = prod.metadataHash && /^0x[0-9a-fA-F]{64}$/.test(prod.metadataHash)
            ? prod.metadataHash
            : blockchain.metadataHash({ productId: prod.productId, name: prod.name, batchNumber: prod.batchNumber });
          const chainRes = await blockchain.registerProductOnChain(
            prod,
            { referenceImageCID: prod.referenceImageCID, metadataCID: prod.metadataCID || prod.referenceImageCID },
            metaHash
          );
          await store.update('products', prod.id, {
            txHash: chainRes.txHash,
            chainId: String(chainRes.chainId),
            contractAddress: chainRes.contractAddress || contractAddress
          });
          summary.productsRestored.push({
            productId: prod.productId,
            name: prod.name,
            txHash: chainRes.txHash,
            contractAddress
          });
          console.log(`Restored product ${prod.productId} (${prod.name}) on local Hardhat -> tx ${chainRes.txHash}`);
        } else {
          if (prod.contractAddress !== contractAddress || String(prod.chainId) !== '31337') {
            await store.update('products', prod.id, {
              contractAddress,
              chainId: '31337'
            });
          }
          summary.productsAlreadyOnChain.push({
            productId: prod.productId,
            name: prod.name,
            contractAddress
          });
          console.log(`Product ${prod.productId} (${prod.name}) already exists on-chain at ${contractAddress}.`);
        }
      } catch (prodErr) {
        summary.skippedRecords.push({
          type: 'Product',
          productId: prod.productId,
          reason: prodErr.message
        });
        console.warn(`Could not restore product ${prod.productId}: ${prodErr.message}`);
      }
    }
    console.log('Local Hardhat chain state is synchronized with PostgreSQL.');
    return summary;
  } finally {
    if (!keepStoreOpen) {
      await store.disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  syncState().catch(err => {
    console.error(`syncLocalChainState failed: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { syncState, ensureLocalContractDeployed, updateLocalEnvContractAddress };
