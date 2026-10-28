
import { expect } from "chai";
import { network } from "hardhat";

describe("ProductAuth", function () {
  it("Should register a product successfully", async function () {
    const { ethers } = await network.connect();

    const productAuth = await ethers.deployContract("ProductAuth");

    await productAuth.registerProduct(
      "PROD001",
      "Seabuckthorn Nourishing Oil",
      "BATCH001",
      "QmExampleImageCID"
    );

    const product = await productAuth.verifyProduct("PROD001");

    expect(product[0]).to.equal("Seabuckthorn Nourishing Oil");
    expect(product[1]).to.equal("BATCH001");
    expect(product[5]).to.equal(true);
    expect(product[6]).to.equal(0);
  });

  it("Should detect an unregistered product", async function () {
    const { ethers } = await network.connect();

    const productAuth = await ethers.deployContract("ProductAuth");

    const result = await productAuth.scanProduct.staticCall(
      "FAKE001",
      18000000,
      73500000,
      2
    );

    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(true);
  });

  
  it("Should detect suspicious activity due to impossible travel speed", async function () {
    const { ethers } = await network.connect();

    const productAuth = await ethers.deployContract("ProductAuth");

    // Register genuine product
    await productAuth.registerProduct(
      "PROD002",
      "Seabuckthorn Oil",
      "BATCH002",
      "QmExampleImageCID"
    );

    // First scan: Pune location
    await productAuth.scanProduct(
      "PROD002",
      18300000,
      73500000,
      2
    );

    // Second scan: Distant location immediately
    // Context: PUBLIC_VERIFICATION = 2
    const result = await productAuth.scanProduct.staticCall(
      "PROD002",
      28000000,
      77500000,
      2
    );

    // Product exists, but suspicious travel is detected
    expect(result[0]).to.equal(true);
    expect(result[1]).to.equal(true);

    // Confirm suspicious flag is stored
    await productAuth.scanProduct(
      "PROD002",
      28000000,
      77500000,
      2
    );

    const product = await productAuth.verifyProduct("PROD002");

    expect(product[7]).to.equal(true);
  });
  it("Should register an extended product record for an authorized manufacturer", async function () {
    const { ethers } = await network.connect();
    const [owner, manufacturer] = await ethers.getSigners();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.authorizeManufacturer(manufacturer.address);
    await contract.registerProductWithDetails(
      "PROD-DETAIL-001", "Herbal Shampoo", "HerbalCo", "cosmetics", "SH-200",
      "BATCH-01", "UNIT-001", "2026-10-01", "2028-10-01", "QmReferenceCID",
      "QmMetadataCID", ethers.keccak256(ethers.toUtf8Bytes("metadata")), manufacturer.address
    );
    const base = await contract.verifyProduct("PROD-DETAIL-001");
    const details = await contract.verifyProductDetails("PROD-DETAIL-001");
    expect(base[5]).to.equal(true);
    expect(base[3]).to.equal(manufacturer.address);
    expect(details[0]).to.equal("HerbalCo");
    expect(details[1]).to.equal("cosmetics");
    expect(details[2]).to.equal("SH-200");
    expect(details[3]).to.equal("UNIT-001");
    expect(details[4]).to.equal("2026-10-01");
    expect(details[5]).to.equal("2028-10-01");
  });

  it("Should reject relayed registration for a wallet not authorized on-chain", async function () {
    const { ethers } = await network.connect();
    const [, manufacturer] = await ethers.getSigners();
    const contract = await ethers.deployContract("ProductAuth");
    await expect(contract.registerProductWithDetails(
      "PROD-UNAUTH-001", "Product", "Brand", "food", "SKU", "BATCH", "UNIT",
      "2026-10-01", "", "QmReferenceCID", "QmMetadataCID", ethers.ZeroHash, manufacturer.address
    )).to.be.revertedWith("Manufacturer not authorized");
  });

  it("Should record a minimal immutable scan audit without exposing coordinates", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.registerProduct("PROD-AUDIT-001", "Audit test", "BATCH", "QmCID");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("scan evidence"));
    await expect(contract.recordScanAudit("PROD-AUDIT-001", true, 15000, hash))
      .to.emit(contract, "ScanAuditRecorded");
    const product = await contract.verifyProduct("PROD-AUDIT-001");
    expect(product[6]).to.equal(1);
    expect(product[7]).to.equal(true);
  });

  it("Should prevent non-owner accounts from writing raw scan coordinates to the public chain", async function () {
    const { ethers } = await network.connect();
    const [owner, other] = await ethers.getSigners();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.registerProduct("PROD-PRIVACY-001", "Privacy test product", "BATCH-1", "QmReferenceCID");
    await expect(contract.connect(other).scanProduct("PROD-PRIVACY-001", 18300000, 73500000, 2))
      .to.be.revertedWith("Only owner can perform this action");
    // The application path writes only a minimal audit event with an evidence hash.
    const hash = ethers.keccak256(ethers.toUtf8Bytes("private scan evidence"));
    await expect(contract.recordScanAudit("PROD-PRIVACY-001", false, 0, hash))
      .to.emit(contract, "ScanAuditRecorded");
  });

  it("Should reject a repeated unit serial within the same manufacturer and batch", async function () {
    const { ethers } = await network.connect();
    const [owner, manufacturer] = await ethers.getSigners();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.authorizeManufacturer(manufacturer.address);
    const args = ["PROD-UNIT-001", "Product", "Brand", "food", "SKU", "BATCH-UNIT", "UNIT-001", "2026-10-01", "", "QmReferenceCID", "QmMetadataCID", ethers.ZeroHash, manufacturer.address];
    await contract.registerProductWithDetails(...args);
    args[0] = "PROD-UNIT-002";
    await expect(contract.registerProductWithDetails(...args))
      .to.be.revertedWith("Unit serial already registered for this manufacturer and batch");
  });


  it("Should count privacy-safe web scan audits without exposing customer GPS records", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.registerProduct(
      "PROD-AUDIT-COUNT-NEW-001",
      "TrustTrace Audit Demo",
      "BATCH-AUDIT-NEW-001",
      "QmExampleImageCID"
    );

    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("demo-evidence"));
    await contract.recordScanAudit("PROD-AUDIT-COUNT-NEW-001", false, 2500, evidenceHash);

    const product = await contract.verifyProduct("PROD-AUDIT-COUNT-NEW-001");
    expect(product[6]).to.equal(1);
    expect(await contract.getScanCount("PROD-AUDIT-COUNT-NEW-001")).to.equal(1);
    expect(await contract.getLocationScanRecordCount("PROD-AUDIT-COUNT-NEW-001")).to.equal(0);
  });

  it("Should keep total scan count consistent across legacy location scans and web audit scans", async function () {
    const { ethers } = await network.connect();
    const contract = await ethers.deployContract("ProductAuth");
    await contract.registerProduct("PROD-AUDIT-COUNT-NEW-002", "TrustTrace Count Demo", "BATCH-COUNT-NEW", "QmExampleImageCID");

    await contract.scanProduct("PROD-AUDIT-COUNT-NEW-002", 18300000, 73500000, 2);
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("second-demo-evidence"));
    await contract.recordScanAudit("PROD-AUDIT-COUNT-NEW-002", false, 1000, evidenceHash);

    const product = await contract.verifyProduct("PROD-AUDIT-COUNT-NEW-002");
    expect(product[6]).to.equal(2);
    expect(await contract.getScanCount("PROD-AUDIT-COUNT-NEW-002")).to.equal(2);
    expect(await contract.getLocationScanRecordCount("PROD-AUDIT-COUNT-NEW-002")).to.equal(1);
  });

});