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

console.log("======================================");
console.log("       TRUSTTRACE BLOCKCHAIN DEMO");
console.log("======================================");

console.log("\nSmart Contract:");
console.log("ProductAuth connected");
console.log("Contract Address:", await productAuth.getAddress());

console.log("\n--------------------------------------");
console.log("GATE 1 - PRODUCT REGISTRATION");
console.log("--------------------------------------");

const productId = "DEMO001";

const existingProduct = await productAuth.verifyProduct(productId);

if (!existingProduct[5]) {
  console.log("Registering demo product...");

  const registerTx = await productAuth.registerProduct(
    productId,
    "Seabuckthorn Nourishing Oil",
    "DEMO-BATCH-001",
    "QmDemoOriginalImageCID"
  );

  await registerTx.wait();

  console.log("Product registered successfully!");
} else {
  console.log("Demo product already registered.");
}

const product = await productAuth.verifyProduct(productId);

console.log("\nProduct Information");
console.log("Product ID:", productId);
console.log("Name:", product[0]);
console.log("Batch:", product[1]);
console.log("Registered:", product[5]);
console.log("Suspicious:", product[7]);

console.log("\n--------------------------------------");
console.log("GATE 1 - UNREGISTERED PRODUCT CHECK");
console.log("--------------------------------------");

const fakeResult = await productAuth.scanProduct.staticCall(
  "FAKE-DEMO-001",
  18300000,
  73500000,
  2
);

console.log("Product Exists:", fakeResult[0]);
console.log("Suspicious:", fakeResult[1]);

console.log("\n--------------------------------------");
console.log("GATE 3 - CASPG NORMAL SCAN");
console.log("--------------------------------------");

const normalScan = await productAuth.scanProduct(
  productId,
  18300000,
  73500000,
  2
);

await normalScan.wait();

console.log("Location: Pune");
console.log("Normal scan stored successfully.");

console.log("\n--------------------------------------");
console.log("GATE 3 - CASPG SUSPICIOUS SCAN");
console.log("--------------------------------------");

const suspiciousPreview = await productAuth.scanProduct.staticCall(
  productId,
  28000000,
  77500000,
  2
);

console.log("Second scan location: Distant location");
console.log("Product Exists:", suspiciousPreview[0]);
console.log("Suspicious Detected:", suspiciousPreview[1]);

if (suspiciousPreview[1]) {
  const suspiciousScan = await productAuth.scanProduct(
    productId,
    28000000,
    77500000,
    2
  );

  await suspiciousScan.wait();

  console.log("Suspicious scan stored on blockchain.");
}

const finalProduct = await productAuth.verifyProduct(productId);

console.log("\n======================================");
console.log("           FINAL RESULT");
console.log("======================================");

console.log("Product:", finalProduct[0]);
console.log("Batch:", finalProduct[1]);
console.log("Registered:", finalProduct[5]);
console.log("Total Scans:", finalProduct[6].toString());
console.log("CASPG Suspicious:", finalProduct[7]);

if (finalProduct[7]) {
  console.log("\nRESULT: SUSPICIOUS SCAN ACTIVITY DETECTED");
} else {
  console.log("\nRESULT: NO CASPG ANOMALY DETECTED");
}

console.log("\n======================================");
console.log("              DEMO COMPLETE");
console.log("======================================");