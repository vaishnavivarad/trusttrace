import { network } from "hardhat";

const { ethers } = await network.create();

const contractAddress = process.env.PRODUCT_AUTH_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const [signer] = await ethers.getSigners();

const productAuth = await ethers.getContractAt(
  "ProductAuth",
  contractAddress,
  signer
);

const productId = "PROD001";

console.log("Scanning product...");

const tx = await productAuth.scanProduct(
  productId,
  18300000,
  73500000,
  2
);

await tx.wait();

console.log("Scan completed successfully!");

const product = await productAuth.verifyProduct(productId);

console.log("\nProduct Status");
console.log("--------------------");
console.log("Product Name:", product[0]);
console.log("Batch Number:", product[1]);
console.log("Registered:", product[5]);
console.log("Scan Count:", product[6]);
console.log("Suspicious:", product[7]);