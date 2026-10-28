/**
 * Idempotent PostgreSQL -> MST (Coral Testnet / Mainnet) ProductAuth sync.
 *
 * DRY-RUN BY DEFAULT: prints the plan and changes nothing. Pass --apply to send transactions.
 * Safety rules:
 *  - Runs only when BLOCKCHAIN_CHAIN_ID is 54635 (Coral) or 4646 (Mainnet) AND the live eth_chainId matches.
 *  - Mainnet additionally requires --allow-mainnet.
 *  - Refuses a localhost DATABASE_URL unless --allow-local-db (protects local 31337 rows).
 *  - Relayer wallet must equal the contract owner().
 *  - Skips manufacturers already authorized and products that already exist on-chain.
 *  - Skips (never reverts on) unit serials already registered under another product ID.
 *  - Updates a DB row only after receipt.status === 1 and a post-tx on-chain read; every change is logged.
 *
 * Usage: node scripts/syncMstState.js [--apply] [--allow-local-db] [--allow-mainnet]
 */
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const { ethers } = require('ethers');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALLOWED_CHAINS = { '54635': 'MST Coral Testnet', '4646': 'MST Mainnet' };

function isLocalDb(url) {
  try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname); } catch { return false; }
}

async function main() {
  const expected = String(process.env.BLOCKCHAIN_CHAIN_ID || '').trim();
  if (!ALLOWED_CHAINS[expected]) throw new Error(`BLOCKCHAIN_CHAIN_ID must be 54635 or 4646 (got "${expected}"). Use syncLocalChainState for 31337.`);
  if (expected === '4646' && !args.has('--allow-mainnet')) throw new Error('Mainnet sync requires --allow-mainnet and explicit approval.');
  if (process.env.STORAGE_MODE !== 'postgres') throw new Error('STORAGE_MODE=postgres is required.');
  if (isLocalDb(process.env.DATABASE_URL) && !args.has('--allow-local-db')) throw new Error('DATABASE_URL points at localhost. Refusing to rewrite local Hardhat rows; pass --allow-local-db only if intended.');
  if (!process.env.BLOCKCHAIN_CONTRACT_ADDRESS || !ethers.isAddress(process.env.BLOCKCHAIN_CONTRACT_ADDRESS)) throw new Error('BLOCKCHAIN_CONTRACT_ADDRESS must be the deployed MST ProductAuth address.');
  if (!process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY) throw new Error('BLOCKCHAIN_RELAYER_PRIVATE_KEY is not set (set it in the environment; never commit it).');

  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const live = BigInt(await provider.send('eth_chainId', [])).toString(10);
  if (live !== expected) throw new Error(`RPC chainId ${live} does not match BLOCKCHAIN_CHAIN_ID ${expected}.`);
  const contractAddress = ethers.getAddress(process.env.BLOCKCHAIN_CONTRACT_ADDRESS);
  const code = await provider.getCode(contractAddress);
  if (!code || code === '0x') throw new Error(`No bytecode at ${contractAddress} on ${ALLOWED_CHAINS[expected]}.`);

  const store = require('../src/services/appStore');
  const blockchain = require('../src/services/blockchainService');
  const signer = new ethers.Wallet(process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY, provider);
  const ro = new ethers.Contract(contractAddress, [...blockchain.ABI, 'function registeredUnitSerials(bytes32) view returns (bool)'], provider);
  const owner = await ro.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) throw new Error(`Relayer ${signer.address} is not the contract owner ${owner}; every write would revert.`);
  const balance = await provider.getBalance(signer.address);
  console.log(`${ALLOWED_CHAINS[expected]} (${live}) | contract ${contractAddress} | owner/relayer ${owner} | balance ${ethers.formatEther(balance)} | mode ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const summary = { authorized: [], alreadyAuthorized: [], registered: [], alreadyOnChain: [], skipped: [], dbUpdates: [] };
  try {
    const apps = (await store.all('applications')).filter(a => a.status === 'APPROVED');
    const products = (await store.all('products')).filter(p => p.status === 'REGISTERED' && p.productId);
    const wallets = new Map();
    for (const a of apps) if (a.walletAddress && ethers.isAddress(a.walletAddress)) wallets.set(a.walletAddress.toLowerCase(), a);
    for (const p of products) if (p.manufacturerWallet && ethers.isAddress(p.manufacturerWallet) && !wallets.has(p.manufacturerWallet.toLowerCase())) wallets.set(p.manufacturerWallet.toLowerCase(), null);

    for (const [wallet, app] of wallets) {
      if (await ro.authorizedManufacturers(wallet)) { summary.alreadyAuthorized.push(wallet); continue; }
      if (!APPLY) { summary.authorized.push({ wallet, planned: true }); continue; }
      const res = await blockchain.authorizeManufacturer(ethers.getAddress(wallet)); // waits for receipt + re-reads state
      summary.authorized.push({ wallet, txHash: res.txHash });
      if (app) { await store.update('applications', app.id, { authorizationTxHash: res.txHash }); summary.dbUpdates.push({ table: 'applications', id: app.id, authorizationTxHash: res.txHash }); }
    }

    for (const p of products) {
      try {
        if (!p.manufacturerWallet || !ethers.isAddress(p.manufacturerWallet) || !p.referenceImageCID) { summary.skipped.push({ productId: p.productId, reason: 'missing wallet or referenceImageCID' }); continue; }
        const onChain = await ro.verifyProduct(p.productId);
        if (onChain.exists) {
          if (onChain.manufacturer.toLowerCase() !== p.manufacturerWallet.toLowerCase() || onChain.referenceImageCID !== p.referenceImageCID) {
            summary.skipped.push({ productId: p.productId, reason: 'exists on-chain with DIFFERENT manufacturer/CID; not touching DB' }); continue;
          }
          summary.alreadyOnChain.push(p.productId);
          if (APPLY && (String(p.chainId) !== live || String(p.contractAddress || '').toLowerCase() !== contractAddress.toLowerCase())) {
            await store.update('products', p.id, { chainId: live, contractAddress });
            summary.dbUpdates.push({ table: 'products', productId: p.productId, chainId: live, contractAddress, note: 'already on-chain; txHash left unchanged' });
          }
          continue;
        }
        const unitKey = ethers.solidityPackedKeccak256(['address', 'string', 'string'], [p.manufacturerWallet, p.batchNumber, p.unitSerial]);
        if (await ro.registeredUnitSerials(unitKey)) { summary.skipped.push({ productId: p.productId, reason: 'unit serial already registered under another product ID' }); continue; }
        const metaHash = /^0x[0-9a-fA-F]{64}$/.test(p.metadataHash || '') ? p.metadataHash : blockchain.metadataHash({ productId: p.productId, name: p.name, batchNumber: p.batchNumber });
        if (!APPLY) { summary.registered.push({ productId: p.productId, planned: true }); continue; }
        const res = await blockchain.registerProductOnChain(p, { referenceImageCID: p.referenceImageCID, metadataCID: p.metadataCID || '' }, metaHash); // receipt + on-chain re-verification
        await store.update('products', p.id, { txHash: res.txHash, chainId: live, contractAddress });
        summary.registered.push({ productId: p.productId, txHash: res.txHash });
        summary.dbUpdates.push({ table: 'products', productId: p.productId, previousChainId: p.chainId, previousTxHash: p.txHash, txHash: res.txHash, chainId: live, contractAddress });
      } catch (err) {
        summary.skipped.push({ productId: p.productId, reason: err.shortMessage || err.message });
      }
    }
  } finally {
    await store.disconnect().catch(() => {});
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) console.log('Dry run only. Re-run with --apply to send transactions.');
}

main().catch(err => { console.error(`syncMstState failed: ${err.message}`); process.exitCode = 1; });

