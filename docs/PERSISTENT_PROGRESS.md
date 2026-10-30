# TrustTrace — Persistent Progress Note

Last Updated: 2026-10-29

## Current Repository & Architecture Status
- **Root Repository**: `https://github.com/vaishnavivarad/trusttrace.git` (branch: `main`, clean commit `321b1a4`)
- **Components**:
  1. `frontend`: React 18, Vite, Tailwind CSS. Build tested, SPA routing `vercel.json` and `_redirects` in place.
  2. `backend`: Node.js Express 5, Prisma 6 with PostgreSQL. Tested with 27/27 unit/integration tests passing.
  3. `trusttrace-blockchain`: Solidity 0.8.34, Hardhat 3, `evmVersion: "paris"` (zero PUSH0 / MCOPY opcodes for complete MST node compatibility). 15/15 tests passing.
  4. `ml-service`: FastAPI, TensorFlow/Keras Siamese MobileNetV2 (threshold: 0.427065). 5/5 pipeline tests passing.
- **Image Identity Fix**:
  - Pinned directly to Pinata as CIDv0 (`pinataOptions: { cidVersion: 0 }`).
  - Local UnixFS multihash verification before database or cache writes.
  - End-to-end verified with 2 distinct products: original reference images are never overwritten by customer verification uploads.
- **Verification Gates**:
  - Gate 1: On-chain ledger & product details validation.
  - Gate 2: Siamese CNN packaging image comparison (`MATCH` / `MISMATCH`).
  - Gate 3: CASPG duplicate scan & impossible travel speed check with privacy-preserving minimal on-chain audit anchor (`recordScanAudit`).

## Phase Roadmap & Action Items
- **Phase 0**: Repository & state inspection [COMPLETED]
- **Phase 1**: Reproducible cloud deployment configuration for Vercel (Frontend), Render (Backend), Neon (Database), and Pinata (Storage).
- **Phase 2**: MST Coral Testnet (Chain ID 54635, RPC `https://coralrpc.mstblockchain.com`) deployment & verification.
- **Phase 3**: Public HTTPS QR code verification with mobile deep linking.
- **Phase 4**: Guaranteed product detail & reference image retrieval.
- **Phase 5**: 3-Gate verification validation.
- **Phase 6**: Comprehensive end-to-end test suite execution.

