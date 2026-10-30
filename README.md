

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Proposed 3-Layer Solution](#3-proposed-3-layer-solution)
4. [MST Blockchain Implementation & Deployed Smart Contracts](#4-mst-blockchain-implementation--deployed-smart-contracts)
5. [Smart Contract Functionality](#5-smart-contract-functionality)
6. [System Architecture & Workflow](#6-system-architecture--workflow)
7. [Key Features Implemented](#7-key-features-implemented)
8. [Technology Stack](#8-technology-stack)
9. [Repository Structure](#9-repository-structure)
10. [Step-by-Step Local Setup & Execution Guide](#10-step-by-step-local-setup--execution-guide)
11. [Step-by-Step Demo & Evaluation Walkthrough](#11-step-by-step-demo--evaluation-walkthrough)
12. [Third-Party Libraries, Credits & Licenses](#12-third-party-libraries-credits--licenses)
13. [Originality Declaration & Team Details](#13-originality-declaration--team-details)

---

## 1. Project Overview

**TrustTrace** is an original full-stack product provenance and counterfeit-detection platform that combines **MST Blockchain smart contracts**, **Pinata IPFS decentralized storage**, **PostgreSQL (Prisma ORM)**, **Siamese CNN deep learning**, and **geolocation travel-speed analysis**.

It enables brand manufacturers to register genuine product units on the **MST Blockchain**, administrators to govern trusted manufacturer onboarding, and everyday customers to verify whether a physical product is genuine or suspicious from any smartphone or desktop browser before purchasing.

---

## 2. Problem Statement

Counterfeit products in packaged food, pharmaceuticals/medicines, and cosmetics pose severe health and economic risks. While many supply-chain systems use QR codes linked to blockchain records, they suffer from a critical **physical-digital gap**:

1. **QR Code Cloning / Replay Attacks:** A genuine QR code is printed visibly on the outside of a package. Counterfeiters can easily photocopy or reprint that genuine QR code onto thousands of counterfeit packages.
2. **No Physical Package Verification:** Standard QR scanners only check whether the digital Product ID exists on-chain—they cannot verify whether the physical box in the buyer's hand matches the manufacturer's original packaging.
3. **Blind to Duplicate Scans Across Locations:** If a copied QR code is scanned simultaneously in different cities within minutes, traditional trackers still show a "Valid" blockchain record.

---

## 3. Proposed 3-Layer Solution

TrustTrace solves this problem by verifying **who** registered the product, **what** the physical package looks like, and **where/when** the QR code is scanned through three independent verification gates:

- **Gate 1 (Layer 1 — Permissioned MST Blockchain Check):**
  Verifies that the manufacturer was approved by the platform Admin, their EVM wallet is authorized on the `ProductAuth` smart contract, and the scanned Product ID exists on **MST Mainnet (Chain ID: `4646`)**.
- **Gate 2 (Layer 2 — Siamese CNN Packaging Image Check):**
  Compares the customer’s live photo of the physical package against the manufacturer’s original registration-time reference photo stored on **Pinata IPFS Cloud** using a **Siamese MobileNetV2 Hybrid CNN** model (`similarity >= 72%` / `distance <= 0.28`).
- **Gate 3 (Layer 3 — CASPG Scan-Context & Travel-Speed Check):**
  The **Context-Aware Scan Provenance Graph (CASPG)** records the manufacturer’s GPS origin coordinates at registration and compares them with customer scan GPS locations and timestamps using the **Haversine distance formula**. If the same QR code is scanned across distant locations faster than physically possible (implied speed `> 120 km/h` outside a `2.5 km` local area buffer), TrustTrace flags it as a suspected cloned QR code.

---

## 4. MST Blockchain Implementation & Deployed Smart Contracts

TrustTrace is deployed and verified on the **MST Mainnet** and configured for **MST Testnet**:

| Parameter | Details |
| :--- | :--- |
| **Primary Network** | **MST Mainnet** |
| **Chain ID** | `4646` |
| **RPC Endpoint** | `https://mariorpc.mstblockchain.com` |
| **Secondary Network** | **MST Coral Testnet** (`Chain ID: 54635`, RPC: `https://coralrpc.mstblockchain.com`) |
| **`ProductAuth.sol` Contract Address (MST Mainnet)** | `0xb7A79C5437D00d32A8770a5905B5d1483c91A130` |
| **`TrustTraceCloudDB.sol` Contract Address (MST Mainnet)** | `0xb3865b1bC48DA803A2d20B737aaA5B90f241768e` |
| **Solidity Compiler Version** | `0.8.28` / `0.8.34` (EVM Target: `paris`, Optimizer enabled) |

### Sample Verified On-Chain Transactions (MST Mainnet `4646`)
- **`TrustTraceCloudDB` Deployment Tx:** `0x47b73a2c68bac98305a0d9487e4da7d7a6ba0febc2c6711e5c1b78b0e75ee5a1`
- **Manufacturer Wallet Authorization Tx (`authorizeManufacturer`):** `0x23b800254c39f5290dc77ed602d6bb504334987ed39bf01ba0f58fd2c606373e`
- **Product Registration Tx (`registerProductWithDetails`):** `0xef6311fe53ca29839c8d718b9eb0fe05f919b5d3e764f172ccb5d0129c0f7997`

---

## 5. Smart Contract Functionality

### 1. `ProductAuth.sol` (`0xb7A79C5437D00d32A8770a5905B5d1483c91A130`)
- **`authorizeManufacturer(address _manufacturer)` & `revokeManufacturer(address _manufacturer)`:**
  Restricted to the contract owner (Admin). Approves or revokes manufacturer EVM wallet addresses on-chain so unapproved accounts cannot register products.
- **`registerProductWithDetails(...)`:**
  Verifies that the manufacturer wallet is authorized and the `productId` is unique. Stores core and extended product provenance on-chain (`productId`, `name`, `brand`, `category`, `sku`, `batchNumber`, `unitSerial`, `manufactureDate`, `expiryDate`, `manufacturer`, `referenceImageCID`, `metadataCID`, and `keccak256` `metadataHash`).
- **`verifyProduct(string _productId)` & `verifyProductDetails(string _productId)`:**
  Read-only (`view`) functions invoked during Layer 1 verification to fetch canonical product records and IPFS reference image CIDs from MST Mainnet.
- **`recordScanAudit(string _productId, bytes32 _scanHash, bool _isSuspicious)`:**
  Increments the product’s on-chain scan counter (`scanCount`), updates `hasSuspiciousScan`, and logs a cryptographic scan audit hash on-chain while preserving user GPS privacy.

### 2. `TrustTraceCloudDB.sol` (`0xb3865b1bC48DA803A2d20B737aaA5B90f241768e`)
- **`setLatestStateCID(string _cid)` & `latestStateCID()`:**
  Anchors the latest Pinata IPFS cloud state CID on MST Mainnet, enabling real-time cross-device synchronization between laptops and mobile phones.

---


1. **Controlled Manufacturer Onboarding & Admin Approval Gate:** Manufacturers cannot register products immediately after signup; Admin approval and on-chain wallet authorization are strictly enforced.
2. **Wallet Selection Helper & Binding:** Manufacturers can select or enter their EVM wallet address during registration, which is bound to their profile and verified on-chain.
3. **IPFS-Backed Product Registration:** Packaging reference photos and product metadata JSON are pinned to Pinata IPFS Cloud before minting on MST Mainnet.
4. **Cross-Device QR Code Scanning (Camera + File Upload):** Customers can scan QR codes using their live smartphone/laptop camera or upload a QR image from any device.
5. **Siamese MobileNetV2 Hybrid CNN (Layer 2):** Compares customer package photos with manufacturer reference photos using deep feature embeddings, HSV histograms, spatial grid descriptors, and 256-bit perceptual `dHash`.
6. **Automatic GPS Origin & CASPG Travel-Speed Analysis (Layer 3):** Automatically detects GPS coordinates and locality names (via OpenStreetMap Nominatim) and flags impossible travel speeds above `120 km/h`.
7. **Real-Time Cross-Device Synchronization:** Powered by `TrustTraceCloudDB` on MST Mainnet + Pinata IPFS + PostgreSQL (`Prisma ORM`), so products or accounts created on one device work immediately on any other device.

---

## 8. Technology Stack

- **Frontend:** React 18, Vite 5, Modern Responsive CSS, Lucide React Icons, HTML5 Canvas & Camera APIs
- **Backend API:** Node.js, Express.js, Multer, Scrypt Password Hashing, Bearer Token Authentication
- **Database:** PostgreSQL, Prisma ORM (`User`, `ManufacturerApplication`, `Product`, `VerificationSession`, `ScanEvent`, `ImageComparison`, `AuditLog`)
- **Blockchain:** Solidity (`^0.8.28`), Hardhat 3, Ethers.js v6, MST Mainnet (`Chain ID: 4646`), MST Testnet (`Chain ID: 54635`)
- **Decentralized Storage:** Pinata IPFS Cloud API (`pinFileToIPFS`, `pinJSONToIPFS`)
- **AI / Machine Learning:** Python 3.11, FastAPI, TensorFlow / Keras (`siamese_mobilenetv2.keras`), Pillow, NumPy
- **Geolocation & QR:** Browser Geolocation API, OpenStreetMap Nominatim Reverse Geocoding, `qrcode`, `jsQR`, HTML5 `BarcodeDetector`

---

###**npm**
- **Python** (v3.10 or v3.11 recommended for TensorFlow)
- **PostgreSQL** (optional for local development; `STORAGE_MODE=file` is supported out-of-the-box and syncs with `TrustTraceCloudDB`)

### Step 1: Clone the Repository
```powershell
git clone https://github.com/vaishnavivarad/trusttrace.git
cd trusttrace
```

### Step 2: Install & Compile Smart Contracts (Optional — Contracts are already deployed on MST Mainnet)
```powershell
cd trusttrace-blockchain
npm install
npx hardhat compile
```

### Step 3: Configure & Start the Backend Server (`Port 5000`)
```powershell
cd ../backend
npm install
Copy-Item .env.example .env
```
Ensure your `backend/.env` is configured for MST Mainnet (`Chain ID: 4646`) and Pinata IPFS:
```env
PORT=5000
STORAGE_MODE=file
BLOCKCHAIN_RPC_URL=https://mariorpc.mstblockchain.com
BLOCKCHAIN_CHAIN_ID=4646
BLOCKCHAIN_CONTRACT_ADDRESS=0xb7A79C5437D00d32A8770a5905B5d1483c91A130
IPFS_PROVIDER=pinata
IPFS_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
ML_SERVICE_URL=http://127.0.0.1:8000
MAX_PLAUSIBLE_SPEED_KMH=120
```
*(To use PostgreSQL mode, set `STORAGE_MODE=postgres`, provide `DATABASE_URL`, and run `npx prisma generate` and `npx prisma migrate dev`.)*

Seed the initial Admin account and start the backend:
```powershell
npm run seed:admin
npm run dev
```
Verify backend health at: `http://localhost:5000/api/health`

### Step 4: Start the Python Siamese CNN Microservice (`Port 8000`)
Open a new terminal:
```powershell
cd ml-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
Verify ML service health at: `http://127.0.0.1:8000/health`

### Step 5: Start the Frontend Web App (`Port 5173`)
Open a new terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---



## 12. Third-Party Libraries, Credits & Licenses

All third-party open-source frameworks, libraries, and public APIs used in this project are properly credited below and comply with their respective open-source licenses:

| Library / Service | Purpose in TrustTrace | License |
| :--- | :--- | :--- |
| **React & React DOM** (`react`, `react-dom`) | Frontend user interface components and state management | MIT License |
| **Vite** (`vite`) | Frontend build tool and development bundler | MIT License |
| **Lucide React** (`lucide-react`) | UI icons across dashboards and verification screens | ISC License |
| **Node.js & Express** (`express`, `cors`, `dotenv`, `multer`) | Backend REST API server and multipart image upload handling | MIT License |
| **Prisma ORM & PostgreSQL** (`@prisma/client`, `prisma`) | Relational database schema and ORM queries | Apache-2.0 / PostgreSQL License |
| **Hardhat & Ethers.js v6** (`hardhat`, `ethers`) | Solidity compilation, deployment, and MST Blockchain RPC interaction | MIT License |
| **Solidity** (`solc`) | Smart contract programming language (`ProductAuth.sol`, `TrustTraceCloudDB.sol`) | GPL-3.0 / MIT |
| **TensorFlow & Keras** (`tensorflow`, `keras`, `numpy`, `Pillow`) | Siamese MobileNetV2 CNN architecture and image processing | Apache-2.0 / BSD License |
| **FastAPI & Uvicorn** (`fastapi`, `uvicorn`) | Python microservice for Siamese CNN image similarity inference | MIT / BSD-3-Clause License |
| **QRCode & jsQR** (`qrcode`, `jsQR`, `pngjs`) | QR code PNG generation and client/server QR decoding | MIT / Apache-2.0 License |
| **Pinata IPFS API** (`pinata.cloud`) | Decentralized IPFS pinning for reference images and metadata JSON | Pinata Developer Terms |
| **OpenStreetMap Nominatim API** | Reverse geocoding of GPS coordinates into human-readable locality names | ODbL (Open Database License) |

---

## 13. Originality Declaration & Team Details

### Declaration of Originality
We hereby confirm that **TrustTrace** submitted for the **MST Blockchain BUILDATHON 2026** is an original project designed and developed by our team. The complete source code is publicly accessible in this GitHub repository for review. All third-party libraries, tools, and APIs used have been appropriately credited above in compliance with their respective licenses.

### Team Members — Department of CSE (Data Science)
- Vaishnavi Patil
- Siddhi Khambare
- Sakshi Mahapure
- Shravani Khot

**Project Guide:** Prof. Dhammjyoti Dhawase
