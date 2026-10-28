import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          // paris = no PUSH0/MCOPY opcodes, so the same bytecode is safe on MST Coral/Mainnet and local Hardhat.
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: process.env.LOCALHOST_RPC_URL ?? "http://127.0.0.1:8545",
      accounts: process.env.LOCALHOST_PRIVATE_KEY ? [process.env.LOCALHOST_PRIVATE_KEY] : ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",],
    },
    mstMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 4646,
      url: process.env.MST_MAINNET_RPC_URL ?? "https://mariorpc.mstblockchain.com",
      accounts: process.env.MST_DEPLOYER_PRIVATE_KEY ? [process.env.MST_DEPLOYER_PRIVATE_KEY] : [],
    },
    mstCoralTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 54635,
      url: process.env.MST_TESTNET_RPC_URL ?? "https://coralrpc.mstblockchain.com",
      accounts: process.env.MST_DEPLOYER_PRIVATE_KEY ? [process.env.MST_DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
