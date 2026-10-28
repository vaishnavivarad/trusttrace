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

const existingProduct = await productAuth.verifyProduct(productId);

if (existingProduct[5]) {
  console.log("Product already exists!");
  console.log("Product Name:", existingProduct[0]);
  console.log("Batch Number:", existingProduct[1]);
} else {
  console.log("Registering product...");

  const tx = await productAuth.registerProduct(
    productId,
    "Seabuckthorn Nourishing Oil",
    "BATCH001",
    "QmExampleImageCID"
  );

  await tx.wait();

  console.log("Product registered successfully!");
}