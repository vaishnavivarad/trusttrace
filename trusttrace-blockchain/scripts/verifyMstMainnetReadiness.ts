import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = path.resolve(__dirname, "../artifacts/contracts/ProductAuth.sol/ProductAuth.json");

const MST_MAINNET_CHAIN_ID = 4646n;
const MST_TESTNET_CHAIN_ID = 54635n;
const RPC_CANDIDATES = [
  process.env.MST_MAINNET_RPC_URL || "https://mariorpc.mstblockchain.com",
].filter(Boolean);
const TESTNET_RPC_URL = process.env.MST_TESTNET_RPC_URL || "https://coralrpc.mstblockchain.com";

async function main() {
  console.log("=== TrustTrace MST Mainnet Readiness Pre-Flight Check (Read-Only) ===");
  console.log("Expected Chain ID: 4646 (0x1226) | Native Gas Currency: MSTC | Explorer: https://mstscan.com");

  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(`ProductAuth artifact not found at ${ARTIFACT_PATH}. Run 'npx hardhat compile' first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  console.log(`Loaded ProductAuth artifact (bytecode size: ${(artifact.bytecode.length - 2) / 2} bytes)`);

  let activeProvider: ethers.JsonRpcProvider | null = null;
  let activeRpc = "";

  for (const rpcUrl of RPC_CANDIDATES) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const net = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      console.log(`[RPC OK] ${rpcUrl} -> chainId=${net.chainId.toString()}, blockNumber=${blockNumber}`);
      if (net.chainId !== MST_MAINNET_CHAIN_ID) {
        console.warn(`[WARNING] RPC ${rpcUrl} returned chainId ${net.chainId}, expected ${MST_MAINNET_CHAIN_ID}`);
        continue;
      }
      activeProvider = provider;
      activeRpc = rpcUrl;
      break;
    } catch (err: any) {
      console.warn(`[RPC UNREACHABLE] ${rpcUrl}: ${err.message}`);
    }
  }

  if (!activeProvider) {
    console.log("Status: BLOCKED_BY_RPC_CONNECTIVITY — Could not reach an active MST Mainnet RPC endpoint.");
    process.exitCode = 1;
    return;
  }

  try {
    const testnetProvider = new ethers.JsonRpcProvider(TESTNET_RPC_URL);
    const tNet = await testnetProvider.getNetwork();
    const tBlock = await testnetProvider.getBlockNumber();
    console.log(`[TESTNET RPC OK] ${TESTNET_RPC_URL} -> chainId=${tNet.chainId.toString()} (expected ${MST_TESTNET_CHAIN_ID}), blockNumber=${tBlock}`);
  } catch (err: any) {
    console.warn(`[TESTNET RPC WARNING] ${TESTNET_RPC_URL}: ${err.message}`);
  }

  const feeData = await activeProvider.getFeeData();
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const deployTx = await factory.getDeployTransaction();
  const estimatedGas = await activeProvider.estimateGas(deployTx);
  const gasPrice = feeData.gasPrice ?? 1_000_000_000n;
  const estimatedCostWei = estimatedGas * gasPrice;

  console.log(`Active RPC: ${activeRpc}`);
  console.log(`Estimated ProductAuth deployment gas: ${estimatedGas.toString()} units`);
  console.log(`Current network gasPrice: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Estimated deployment cost: ${ethers.formatEther(estimatedCostWei)} MSTC`);

  const pk = process.env.MST_DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.log("Deployer Wallet Status: MST_DEPLOYER_PRIVATE_KEY not set (Read-Only Pre-Flight Complete; no transaction broadcast).");
    return;
  }

  const wallet = new ethers.Wallet(pk, activeProvider);
  const balance = await activeProvider.getBalance(wallet.address);
  console.log(`Configured Deployer Address: ${wallet.address}`);
  console.log(`Deployer Balance: ${ethers.formatEther(balance)} MSTC`);
  if (balance < estimatedCostWei) {
    console.warn("WARNING: Deployer wallet balance is below the estimated deployment gas cost in MSTC.");
  } else {
    console.log("Deployer wallet has sufficient MSTC balance for deployment (awaiting explicit approval).");
  }
}

main().catch((err) => {
  console.error("MST Mainnet Readiness Check Failed:", err.message);
  process.exitCode = 1;
});

