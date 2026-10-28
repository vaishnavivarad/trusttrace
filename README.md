# TrustTrace — Three-Layer Product Authenticity Verification

TrustTrace is a full-stack prototype for checking whether a product's QR-linked record is registered, whether the scanned packaging image matches the manufacturer's reference image, and whether the time/location pattern between scans suggests physically implausible movement.

## The three gates

1. **Gate 1 — Blockchain:** Read the Product ID from the deployed `ProductAuth` smart contract. If the ID is not registered on a successfully queried chain, stop and report `UNREGISTERED_PRODUCT`. If the chain cannot be reached, report `BLOCKCHAIN_UNAVAILABLE`; never call a network error counterfeit.
2. **Gate 2 — Siamese CNN:** Compare the manufacturer's reference packaging photo with the user's current photo using a shared-weight Siamese MobileNetV2 model. A validated mismatch stops the flow; a good match proceeds to Gate 3; poor image quality asks the user to retake the photo. If model weights or a validated threshold are missing, the service returns `MODEL_NOT_CONFIGURED` rather than inventing a match.
3. **Gate 3 — CASPG:** Ask for browser location permission only when Gate 3 starts. The server records the scan-arrival time, applies Haversine distance and a configurable maximum-speed heuristic, and stores detailed scan evidence off-chain. A minimal audit event/hash is written to the blockchain by the configured owner/relayer. GPS denial or poor accuracy is reported as unavailable/partial, not PASS.

The final message is **“No suspicious signals detected”**, never “100% genuine”. Packaging-image similarity and plausible travel do not prove authenticity.

## Repository layout

- `frontend/` — React + Vite frontend, Tailwind CSS v4 integration, responsive TrustTrace pages and dashboards.
- `backend/` — Node.js + Express API, authentication, manufacturer approval, product registration, QR service, IPFS integration, Gate 1/Gate 2/Gate 3 orchestration and application storage.
- `trusttrace-blockchain/` — Existing Hardhat 3 project, Solidity `ProductAuth.sol`, tests and Ignition deployment module.
- `ml-service/` — Python FastAPI Siamese CNN inference API, MobileNetV2 training script, dataset metadata templates and dataset validation/pair/split scripts.

## Requirements

- Node.js 22 or newer (Node 24 is fine).
- npm.
- Python 3.11 recommended for TensorFlow compatibility.
- A Pinata JWT (or configured supported provider) for real IPFS image/metadata uploads.
- Real, labelled product packaging images and a trained Siamese model before Gate 2 can produce real match/mismatch results.

## Important: install dependencies on your own computer

Do not copy a `node_modules` folder from another operating system. This ZIP intentionally excludes `node_modules`, `.env`, private keys, generated build files and personal data. Run `npm install` in each Node project folder on the computer where you will run TrustTrace.

## Local Windows setup

### 1. Install the existing Hardhat project

Open PowerShell:

```powershell
cd trusttrace-blockchain
npm install
```

### 2. Start the local Hardhat blockchain

Open **Terminal 1**:

```powershell
cd trusttrace-blockchain
npm run node:local
```

Leave this terminal running. The node prints local test accounts and their development-only private keys. Use an account from this local node for deployment/testing only. Never use a Hardhat test key on a public network or with real funds.

### 3. Deploy the updated ProductAuth contract

Open **Terminal 2**:

```powershell
cd trusttrace-blockchain
$env:LOCALHOST_PRIVATE_KEY = "PASTE_A_PRIVATE_KEY_PRINTED_BY_YOUR_LOCAL_HARDHAT_NODE"
npm run deploy:local
```

Copy the deployed `ProductAuth` address from the output. The account selected for deployment becomes the contract owner. The local chain is temporary: restarting it normally clears its records, so redeploy the contract and re-register products after a reset.

### 4. Configure and run the backend

In PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
notepad .env
npm install
```

Fill in these values in `backend/.env`:

- `SESSION_SECRET`: replace the placeholder with a long random secret.
- `BLOCKCHAIN_CONTRACT_ADDRESS`: the address printed after deployment.
- `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`
- `BLOCKCHAIN_CHAIN_ID=31337` for the local Hardhat node.
- `BLOCKCHAIN_RELAYER_PRIVATE_KEY`: the same **local Hardhat owner account** used to deploy `ProductAuth`. This backend account submits on-chain manufacturer authorization, product registration and audit transactions. Never commit this value.
- `PINATA_JWT`: a real Pinata JWT for real image/metadata uploads.
- `APP_BASE_URL=http://localhost:5173` for same-computer browser testing.
- `FRONTEND_ORIGIN=http://localhost:5173`.
- Choose a private `SEED_ADMIN_PASSWORD` of at least 12 characters.

By default, `STORAGE_MODE=file` stores application-only records in `backend/data/trusttrace-store.json` so that local UI testing does not require PostgreSQL. This file is created at runtime and is ignored by git. For persistent database mode, set `STORAGE_MODE=postgres`, set `DATABASE_URL`, then run `npx prisma generate` and `npx prisma migrate dev --name init` before starting the backend.

Create the initial local admin account:

```powershell
npm run seed:admin
```

Start the API:

```powershell
npm start
```

Check `http://localhost:5000/api/health`. The response explicitly reports whether the blockchain is reachable and whether IPFS/ML configuration is present.

### 5. Run the CNN service

The uploaded source ZIP did **not** contain a real labelled food/cosmetics/medicine packaging dataset or a trained model file. The included dataset folders and CSV files are templates, not a trained dataset. Gate 2 will intentionally report `MODEL_NOT_CONFIGURED` until the team supplies the actual dataset, trains/evaluates the model, and creates `models/siamese_mobilenetv2.keras` plus a validated threshold.

Create the Python environment from a new terminal:

```powershell
cd ml-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Start the service:

```powershell
uvicorn app:app --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/health`. Before training, it is expected to return `not_configured`; this is deliberate and must not be treated as a successful image match.

#### Dataset preparation (after real images are collected)

From the `ml-service/` directory, fill `dataset/metadata/products.csv`, `images.csv` and `image_sources.csv`. Store image paths relative to `dataset/`, e.g. `images/genuine/food/unit001_front.jpg`. Each physical product unit needs a unique `unit_id`; capture multiple views of the same unit for positive pairs. The split utility needs at least 6 separate units and keeps at least 2 units in each split. Use `simulated_modified` only for controlled modifications and use `verified_counterfeit` only when counterfeit status is independently verified.

```powershell
python scripts/split_by_unit.py --metadata dataset/metadata/images.csv --out dataset/metadata/split_manifest.csv
python scripts/create_pairs.py --images dataset/metadata/images.csv --splits dataset/metadata/split_manifest.csv --out dataset/metadata/pairs.csv
python scripts/validate_dataset.py --root dataset --images dataset/metadata/images.csv --splits dataset/metadata/split_manifest.csv
python scripts/train_siamese.py --pairs dataset/metadata/pairs.csv --image-root dataset --out-dir models --epochs 12
```

Do not report accuracy until the dataset has independent training/validation/test units and `models/evaluation_report.json` has been generated. A small or synthetic dataset may be suitable for pipeline testing but is not evidence of real-world counterfeit-detection accuracy.

### 6. Run the frontend

Open another terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The frontend talks to `http://localhost:5000/api` by default. The browser camera/geolocation APIs require localhost or HTTPS. For phone-based QR testing, the QR's `APP_BASE_URL` must be a host/tunnel that the phone can reach; `localhost` on the phone points to the phone itself, not the laptop.

## User roles and first demo

1. Log in using the seeded admin credentials. The admin account is created by `npm run seed:admin`.
2. Sign up as a manufacturer with a dedicated local/test wallet address.
3. In the admin dashboard, approve the application. This submits an on-chain `authorizeManufacturer` transaction from the configured contract-owner relayer account.
4. Log in as the approved manufacturer. Register a product and upload its manufacturing-time packaging photo. The system uploads the photo/metadata to IPFS, verifies the CID can be fetched, registers the record on-chain, verifies the transaction, and only then creates a QR code.
5. Sign in as a customer and scan the QR or enter the Product ID. Gate 1 checks the blockchain record; Gate 2 asks for a packaging image; Gate 3 asks for location permission.
6. Keep the three services running while testing: Hardhat node, backend, and frontend. Run the ML service as well after installing its requirements. Gate 2 stays unconfigured until a real model and threshold are available.

## Tests and actual validation status

`ProductAuth.getScanCount(productId)` reports the total scan/audit count maintained by the product record, including privacy-safe web audit events. `getLocationScanRecordCount(productId)` is only for the legacy coordinate-bearing demo records. The web application must keep detailed GPS off-chain and use `recordScanAudit` for a hash/status audit.

The backend test suite also checks the actual QR PNG output and confirms that missing IPFS/blockchain configuration is reported as an error rather than a successful verification.


Backend built-in tests:

```powershell
cd backend
npm test
```

Frontend lint:

```powershell
cd frontend
npm run lint
```

Hardhat compile/tests:

```powershell
cd trusttrace-blockchain
npm run build
npm test
```

Python syntax check (optional):

```powershell
cd ml-service
python -m compileall .
```

The source bundle has been syntax-checked for backend JavaScript, the backend unit test suite includes password/session/Haversine/CASPG cases, the frontend ESLint check passes, and Python files compile. Hardhat compile/tests and Vite production build could not be completed in this Linux build container because the provided original `node_modules` were Windows-specific and lacked their Linux optional binaries. This ZIP excludes `node_modules`; run `npm install` on your Windows laptop and run the commands above there. Do not interpret these environment-specific build blockers as a passed build.

## Honest system limitations

- An unregistered Product ID can be flagged only when the correct blockchain/network was successfully queried. An RPC failure is “verification unavailable”, not “fake”.
- A copied QR that points to a real product will pass Gate 1; Gate 2 and Gate 3 then run.
- Siamese CNN packaging comparison is not a chemical/product-source test; near-identical counterfeit packaging may match. Camera angle, glare and lighting can also cause false mismatches.
- CASPG's speed threshold is a heuristic. A fake scan at a plausible location/time interval may not be detected. GPS can be inaccurate or spoofed.
- If location permission is denied, Gate 3 is unavailable/partial; the app does not invent coordinates.
- A successful result means “No suspicious signals detected,” not guaranteed genuine.
- The uploaded source did not contain real product dataset images or trained Siamese weights. The included dataset structure is ready for data collection, not a claim that training has already happened.

## Secrets and safety

Never commit `.env` files, Pinata JWTs, real wallet private keys, session secrets or customer GPS data. Use only Hardhat development keys on the local test chain. Do not publish precise customer coordinates to a public blockchain. The application keeps detailed scan coordinates off-chain and anchors a minimal audit hash/status on-chain.
