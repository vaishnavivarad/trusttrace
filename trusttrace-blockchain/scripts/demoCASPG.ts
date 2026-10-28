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

const productId = "DEMO001";

console.log("======================================");
console.log("        TRUSTTRACE - CASPG DEMO");
console.log("======================================");


// --------------------------------------
// REGISTER DEMO PRODUCT
// --------------------------------------

const existing = await productAuth.verifyProduct(productId);

if (!existing[5]) {

  console.log("\nRegistering CASPG demo product...");

  const registerTx = await productAuth.registerProduct(
    productId,
    "CASPG Demo Product",
    "DEMO-BATCH-001",
    "QmDemoOriginalImageCID"
  );

  await registerTx.wait();

  console.log("Demo product registered!");

} else {

  console.log("\nCASPG demo product already registered.");

}


// --------------------------------------
// FIRST SCAN - PUNE
// --------------------------------------

console.log("\n======================================");
console.log("FIRST SCAN");
console.log("======================================");

console.log("Location : Pune");
console.log("Latitude : 18.300000");
console.log("Longitude: 73.500000");

const firstScanTx = await productAuth.scanProduct(
  productId,
  18300000,
  73500000,
  2
);

await firstScanTx.wait();

console.log("First scan recorded successfully.");


// --------------------------------------
// SECOND SCAN - DELHI REGION
// --------------------------------------

console.log("\n======================================");
console.log("SECOND SCAN");
console.log("======================================");

console.log("Location : Delhi Region");
console.log("Latitude : 28.000000");
console.log("Longitude: 77.500000");


// Preview without changing blockchain state

const preview = await productAuth.scanProduct.staticCall(
  productId,
  28000000,
  77500000,
  2
);

console.log("\nBlockchain Check");
console.log("--------------------");
console.log("Product Exists :", preview[0]);
console.log("Suspicious     :", preview[1]);


// Store actual second scan

if (preview[0] && preview[1]) {

  const secondScanTx = await productAuth.scanProduct(
    productId,
    28000000,
    77500000,
    2
  );

  await secondScanTx.wait();

  console.log("\nSecond scan recorded.");
  console.log("CASPG detected suspicious movement.");

}


// --------------------------------------
// FINAL RESULT
// --------------------------------------

const product = await productAuth.verifyProduct(productId);

console.log("\n======================================");
console.log("           CASPG RESULT");
console.log("======================================");

console.log("Product Name :", product[0]);
console.log("Batch Number :", product[1]);
console.log("Total Scans  :", product[6].toString());
console.log("Suspicious    :", product[7]);

console.log("\n--------------------------------------");

if (product[7]) {

  console.log("RESULT: SUSPICIOUS SCAN ACTIVITY");

  console.log(
    "Reason: Implausible movement between the two scan locations."
  );

} else {

  console.log("RESULT: NO SUSPICIOUS ACTIVITY");

}

console.log("======================================");