/**
 * Deploy ProductAuth to MST Coral Testnet (chainId 54635) or MST Mainnet (chainId 4646) using ethers v6.
 *
 * Why a dedicated ethers v6 script instead of Hardhat Ignition:
 *   MST Blockchain blocks have baseFeePerGas = 0 while requiring gasPrice >= 1 gwei (1_000_000_000 wei).
 *   @nomicfoundation/ignition-core hardcodes maxPriorityFeePerGas = 0 for any chain with baseFeePerGas = 0
 *   except BNB Chain (56/97), causing `ProviderError: transaction gas price below minimum: gas tip cap 0`.
 *   Ethers v6 detects this properly and sends type-0 transactions with gasPrice >= 1 gwei.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.resolve(ROOT_DIR, 'artifacts/contracts/ProductAuth.sol/ProductAuth.json');

const NETWORKS = {
  coral: {
    name: 'MST Coral Testnet',
    chainId: '54635',
    rpcUrl: process.env.MST_TESTNET_RPC_URL || 'https://coralrpc.mstblockchain.com',
    symbol: 'tMSTC',
    explorer: 'https://coral.mstscan.com',
    minGasPriceWei: 1_000_000_000n,
  },
  mainnet: {
    name: 'MST Mainnet',
    chainId: '4646',
    rpcUrl: process.env.MST_MAINNET_RPC_URL || 'https://mariorpc.mstblockchain.com',
    symbol: 'MSTC',
    explorer: 'https://mstscan.com',
    minGasPriceWei: 1_000_000_000n,
  },
};

async function isValidProductAuthAt(provider, address) {
  if (!address || !ethers.isAddress(address)) return { valid: false };
  try {
    const code = await provider.getCode(address);
    if (!code || code === '0x' || code === '0x0') return { valid: false };
    const contract = new ethers.Contract(address, ['function owner() view returns (address)'], provider);
    const owner = await contract.owner();
    return { valid: ethers.isAddress(owner), owner, bytecodeBytes: (code.length - 2) / 2 };
  } catch {
    return { valid: false };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isMainnet = args.includes('--mainnet') || args.includes('mainnet');
  if (isMainnet && !args.includes('--confirm-mainnet')) {
    throw new Error('Mainnet deployment requires --mainnet --confirm-mainnet.');
  }
  const net = isMainnet ? NETWORKS.mainnet : NETWORKS.coral;

  let rawKey = (process.env.MST_DEPLOYER_PRIVATE_KEY || process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY || '').trim();
  if (!rawKey) {
    const backendEnvPath = path.resolve(ROOT_DIR, '../backend/.env');
    if (fs.existsSync(backendEnvPath)) {
      const envText = fs.readFileSync(backendEnvPath, 'utf8');
      const m = envText.match(/^\s*BLOCKCHAIN_RELAYER_PRIVATE_KEY\s*=\s*([^\r\n#]+)/m);
      if (m) rawKey = m[1].trim();
    }
  }
  if (!rawKey) {
    throw new Error(
      'MST_DEPLOYER_PRIVATE_KEY is not set in this PowerShell session.\n' +
      'Run:\n  $env:MST_DEPLOYER_PRIVATE_KEY = "0xYOUR_PRIVATE_KEY"\n  npm run deploy:coral'
    );
  }
  if (!rawKey.startsWith('0x')) rawKey = `0x${rawKey}`;

  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(`Compiled artifact not found at ${ARTIFACT_PATH}. Run "npm run build" first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

  const provider = new ethers.JsonRpcProvider(net.rpcUrl);
  const rawChainId = await provider.send('eth_chainId', []);
  const liveChainId = BigInt(String(rawChainId).trim()).toString(10);
  if (liveChainId !== net.chainId) {
    throw new Error(`RPC chainId mismatch: expected ${net.chainId} (${net.name}), got ${liveChainId}.`);
  }

  const wallet = new ethers.Wallet(rawKey, provider);
  const balance = await provider.getBalance(wallet.address);
  const nonce = await provider.getTransactionCount(wallet.address);
  console.log(`=== ${net.name} (chainId ${liveChainId}) ===`);
  console.log(`Deployer address : ${wallet.address}`);
  console.log(`Wallet balance   : ${ethers.formatEther(balance)} ${net.symbol}`);
  console.log(`Current nonce    : ${nonce}`);

  const deployedJsonPath = path.resolve(ROOT_DIR, `ignition/deployments/chain-${net.chainId}/deployed_addresses.json`);
  const backendMetaPath = path.resolve(ROOT_DIR, `../backend/config/mst-${isMainnet ? 'mainnet' : 'coral'}-deployment.json`);

  // Idempotency check: if already deployed from this wallet or recorded in deployed_addresses.json, verify and reuse
  const candidates = [];
  if (fs.existsSync(deployedJsonPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(deployedJsonPath, 'utf8'));
      const addr = saved['ProductAuthModule#ProductAuth'];
      if (addr && ethers.isAddress(addr)) candidates.push(ethers.getAddress(addr));
    } catch { /* ignore */ }
  }
  for (let n = 0; n <= Math.min(nonce, 5); n++) {
    candidates.push(ethers.getCreateAddress({ from: wallet.address, nonce: n }));
  }

  for (const candidate of new Set(candidates)) {
    const check = await isValidProductAuthAt(provider, candidate);
    if (check.valid && check.owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log(`\nProductAuth is already deployed and verified at: ${candidate}`);
      console.log(`Owner            : ${check.owner}`);
      console.log(`Bytecode size    : ${check.bytecodeBytes} bytes`);
      console.log(`Explorer         : ${net.explorer}/address/${candidate}`);
      fs.mkdirSync(path.dirname(deployedJsonPath), { recursive: true });
      fs.writeFileSync(deployedJsonPath, JSON.stringify({ 'ProductAuthModule#ProductAuth': candidate }, null, 2));
      return;
    }
  }

  if (balance === 0n) {
    throw new Error(`Deployer wallet ${wallet.address} has 0 ${net.symbol}. Fund it first.`);
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice && feeData.gasPrice > net.minGasPriceWei ? feeData.gasPrice : net.minGasPriceWei;
  console.log(`Using gasPrice   : ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log('\nBroadcasting ProductAuth deployment transaction...');
  const contract = await factory.deploy({ type: 0, gasPrice });
  const deployTx = contract.deploymentTransaction();
  console.log(`Transaction hash : ${deployTx.hash}`);
  console.log(`Waiting for confirmation on ${net.name}...`);

  const receipt = await deployTx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deployment transaction failed (txHash: ${deployTx.hash}).`);
  }

  const contractAddress = ethers.getAddress(await contract.getAddress());
  const verify = await isValidProductAuthAt(provider, contractAddress);
  if (!verify.valid) {
    throw new Error(`Contract deployed at ${contractAddress}, but post-deploy bytecode/owner check failed.`);
  }

  fs.mkdirSync(path.dirname(deployedJsonPath), { recursive: true });
  fs.writeFileSync(deployedJsonPath, JSON.stringify({ 'ProductAuthModule#ProductAuth': contractAddress }, null, 2));

  const metadata = {
    network: net.name,
    chainId: Number(net.chainId),
    rpcUrl: net.rpcUrl,
    contractAddress,
    ownerAddress: verify.owner,
    deploymentTxHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    bytecodeBytes: verify.bytecodeBytes,
    explorerAddressUrl: `${net.explorer}/address/${contractAddress}`,
    explorerTxUrl: `${net.explorer}/tx/${deployTx.hash}`,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(backendMetaPath), { recursive: true });
  fs.writeFileSync(backendMetaPath, JSON.stringify(metadata, null, 2));

  console.log('\n=== ProductAuth Deployed & Verified Successfully ===');
  console.log(`Contract Address : ${contractAddress}`);
  console.log(`Owner Address    : ${verify.owner}`);
  console.log(`Transaction Hash : ${deployTx.hash}`);
  console.log(`Block Number     : ${receipt.blockNumber}`);
  console.log(`Bytecode Size    : ${verify.bytecodeBytes} bytes`);
  console.log(`Explorer URL     : ${metadata.explorerAddressUrl}`);
  console.log(`Saved metadata   : ${backendMetaPath}`);
}

main().catch((err) => {
  console.error(`\nDeployment error: ${err.message}`);
  process.exitCode = 1;
});

