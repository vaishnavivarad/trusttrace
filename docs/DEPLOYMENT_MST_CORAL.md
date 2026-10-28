# TrustTrace — Deployment Runbook (MST Coral Testnet)

Hosting choice (all free tier, no card required for most):

| Component | Host | Why / risk |
|---|---|---|
| Frontend | **Vercel** (Vite preset) | `frontend/vercel.json` does SPA rewrites for `/verify/:id` |
| Backend | **Render** Web Service (free) | Sleeps after 15 minutes idle, then ~50 s cold start. Keep it awake by pinging `/healthz` every 10 min with a free UptimeRobot monitor. Disk is ephemeral, so QR PNGs regenerate on demand |
| PostgreSQL | **Neon** (free) | Use the connection string with `sslmode=require` |
| ML service | **Hugging Face Space**, Docker SDK, CPU basic (free, 16 GB RAM) | Render's free tier has only 512 MB, which TensorFlow can exceed. A Space sleeps after about 48 h of no traffic |

> [!IMPORTANT]
> `TrustTrace/` has no Git repo of its own. The enclosing repo is `C:/Users/Admin`. Before you push, run `git init` **inside** `TrustTrace/`. Otherwise you could push your whole home folder.

## 1. Deploy ProductAuth to Coral (you run this. The key stays on your machine)
1. Create a **new** wallet in MetaMask. Do not use a Hardhat key. Add the network: RPC `https://coralrpc.mstblockchain.com`, chain ID `54635`, symbol `tMSTC`, explorer `https://coral.mstscan.com`.
2. Fund it at https://faucet.masterstroke.academy. Confirm the balance on https://coral.mstscan.com. Deployment needs about 0.0027 tMSTC (2,706,442 gas × 1 gwei, estimated live).
3. In PowerShell, keeping the key only in this session:
   ```powershell
   cd TrustTrace\trusttrace-blockchain
   $env:MST_DEPLOYER_PRIVATE_KEY = Read-Host -MaskInput "Deployer key"
   npm run deploy:coral        # Ignition asks you to confirm before it broadcasts
   Remove-Item Env:MST_DEPLOYER_PRIVATE_KEY
   ```
4. Look up the address in `ignition/deployments/chain-54635/deployed_addresses.json`. Then check `https://coral.mstscan.com/address/<addr>`.

## 2. Neon database
Create a project and copy the connection string. Then, from your machine:
```powershell
cd TrustTrace\backend
$env:DATABASE_URL = "<neon url>"; npx prisma migrate deploy
$env:SEED_ADMIN_EMAIL="..."; $env:SEED_ADMIN_PASSWORD="..."; $env:STORAGE_MODE="postgres"; npm run seed:admin
```
(Optional) If you want to bring over the local demo data, first make a backup with `pg_dump` of the local DB, then restore it into Neon.

## 3. ML service → Hugging Face Space (Docker)
Create the Space, then upload these files from `ml-service/`: `Dockerfile`, `.dockerignore`, `app.py`, `requirements-prod.txt`, `models/siamese_mobilenetv2.keras`, `models/threshold.json`. The model goes only to the Space, never to GitHub. Set the Space variable `SIMILARITY_DISTANCE_THRESHOLD=0.4270653732120991`, because the root `.gitignore` excludes `threshold.json`. Check: `https://<space>.hf.space/health` → `"status":"ready"`.

## 4. Backend → Render
Root dir `backend`. Build command: `npm ci --include=dev && npx prisma generate && npx prisma migrate deploy`. Start command: `npm start`. Health check path: `/api/health`. For the environment variables, copy every key from `backend/production.env.example` into Render's Environment and fill them in. `BLOCKCHAIN_RELAYER_PRIVATE_KEY` must be the **deployer** wallet (the contract owner).

## 5. Frontend → Vercel
Root dir `frontend`, framework Vite. Set env `VITE_API_BASE_URL=https://<render-backend>/api`, then redeploy. Copy the resulting Vercel URL into Render's `FRONTEND_PUBLIC_URL`, `FRONTEND_ORIGIN` and `APP_BASE_URL`, and restart.

## 6. Sync and QR
From your machine, with the Render env values exported in the shell:
```powershell
npm run sync:mst            # dry run: prints the plan
npm run sync:mst -- --apply # sends txs, checks receipts, logs each DB change
npm run qr:regenerate       # QR → https://<vercel>/verify/<productId> (Render also regenerates on demand)
```

## 7. Post-deploy checks
- `curl https://<backend>/api/health` should show `database: reachable` and `blockchain: reachable`
- Open `https://<vercel>/verify/<productId>` directly in a private window. It should show the details and the image
- Phone (HTTPS): scan the QR, log in as a customer, take the photo (Gate 2), allow GPS (Gate 3). Then confirm the scan-audit tx on coral.mstscan.com
- Restart Render, then reload the QR PNG and product page. Data should persist and the PNG should regenerate

