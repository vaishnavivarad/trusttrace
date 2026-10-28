import { network } from "hardhat";

const { ethers } = await network.create();

// Our deployed ProductAuth contract address
const contractAddress = process.env.PRODUCT_AUTH_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const [signer] = await ethers.getSigners();

const productAuth = await ethers.getContractAt(
  "ProductAuth",
  contractAddress,
  signer
);

console.log("Connected to ProductAuth:", await productAuth.getAddress());

console.log("Owner address:", await productAuth.owner());

console.log("ProductAuth contract connected successfully!");
console.log("\nRegistering product...");

const tx = await productAuth.registerProduct(
  "PROD001",
  "Seabuckthorn Nourishing Oil",
  "BATCH001",
  "QmExampleImageCID"
);

await tx.wait();

console.log("Product registered successfully!");

const product = await productAuth.verifyProduct("PROD001");

console.log("Product Name:", product[0]);
console.log("Batch Number:", product[1]);
console.log("Reference Image CID:", product[2]);
console.log("Manufacturer:", product[3]);
console.log("Registered:", product[5]);
console.log("Scan Count:", product[6]);
console.log("Suspicious:", product[7]);

// --------------------------------------
// FIRST SCAN - Pune
// --------------------------------------

console.log("\nFirst scan - Pune...");

const firstScanTx = await productAuth.scanProduct(
  "PROD001",
  18300000,
  73500000,
  2
);

await firstScanTx.wait();

console.log("First scan completed successfully!");

// --------------------------------------
// SECOND SCAN - Distant location
// This should trigger CASPG
// --------------------------------------

console.log("\nChecking second scan for suspicious activity...");

const suspiciousPreview = await productAuth.scanProduct.staticCall(
  "PROD001",
  28000000,
  77500000,
  2
);

console.log("Product exists:", suspiciousPreview[0]);
console.log("Suspicious detected:", suspiciousPreview[1]);

// --------------------------------------
// Store the second scan on blockchain
// --------------------------------------

if (suspiciousPreview[1]) {
  const secondScanTx = await productAuth.scanProduct(
    "PROD001",
    28000000,
    77500000,
    2
  );

  await secondScanTx.wait();

  console.log("Suspicious scan stored on blockchain!");
}

// --------------------------------------
// Verify updated product status
// --------------------------------------

const updatedProduct = await productAuth.verifyProduct("PROD001");

console.log("\nUpdated Product Status:");
console.log("Product Name:", updatedProduct[0]);
console.log("Scan Count:", updatedProduct[6]);
console.log("Suspicious:", updatedProduct[7]);