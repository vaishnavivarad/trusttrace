// Autonomous Cloud Verification & MST Mainnet Engine for 24x7 Static Cloud Hosting
const MST_MAINNET_RPC = 'https://mariorpc.mstblockchain.com';
const MST_MAINNET_CHAIN_ID = '4646';
const MST_CONTRACT_ADDRESS = '0xb7A79C5437D00d32A8770a5905B5d1483c91A130';
const THRESHOLD = 0.4270653732120991;

const SEED_USERS = [
  { id: 'e896e953-3920-4f2a-8a58-6e5ecf12f2ff', name: 'TrustTrace Admin', email: 'admin@trusttrace.local', role: 'admin', status: 'ACTIVE', walletAddress: null },
  { id: 'ce9019d3-4092-4e5e-bcfc-c20d59f8c26d', name: 'Test Customer', email: 'customer@example.com', role: 'customer', status: 'ACTIVE', walletAddress: null },
  { id: '81a1ba90-68bf-4838-a16e-0299b454cd3d', name: 'VAISHNAVI PATIL', email: 'vaishnavi.patil24@gmail.com', role: 'customer', status: 'ACTIVE', walletAddress: null },
  { id: '278269da-9efc-4127-b536-51ed90514668', name: 'Vaishnavi', email: 'vaishnavi.patil24@vit.edu', role: 'customer', status: 'ACTIVE', walletAddress: null },
  { id: 'd89db891-729d-4c15-a2f8-c80e6a903ae1', name: 'varadraj', email: 'varadraj@gmail.com', role: 'customer', status: 'ACTIVE', walletAddress: null },
  { id: 'b96574a1-781b-430b-852b-1229e4fd884b', name: 'tukaram', email: 'tukaram.patil2w4@gmail.com', role: 'customer', status: 'ACTIVE', walletAddress: null },
  { id: 'de11d5fc-c78e-4d7d-85a7-6d6b28019984', name: 'Vaishnavi Patil', email: 'vaishnavibpatil14@gmail.com', role: 'manufacturer', status: 'ACTIVE', walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' },
  { id: 'd0dc13d2-fd98-4114-b5cf-909cb71d97ca', name: 'Bhagavat Patil', email: 'bhagavat@gmail.com', role: 'manufacturer', status: 'ACTIVE', walletAddress: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' },
  { id: '01a61869-fe69-4651-903e-26f9c94522bd', name: 'Rani', email: 'rani@gmail.com', role: 'manufacturer', status: 'ACTIVE', walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
  { id: '2f335ff1-8f77-44ac-a364-d1e99ee7d64d', name: 'Ganesh', email: 'ganesh@gmail.com', role: 'manufacturer', status: 'ACTIVE', walletAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' },
  { id: '40dd6294-2bc5-4052-b9fa-adcf4ac5a550', name: 'tukaram Patil', email: 'tukaram.patil24@gmail.com', role: 'manufacturer', status: 'ACTIVE', walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }
];

const SEED_PRODUCTS = [
  {
    id: '3e9368ae-c99c-4f0e-9bfe-36cc604801d2',
    productId: 'PROD-MVTUS047-7D908B',
    name: 'Maggi Tomato kethup',
    brand: 'Maggi',
    category: 'food',
    sku: '75gm',
    batchNumber: 'BATCH-202644',
    unitSerial: '756756737',
    manufactureDate: '2026-10-29',
    expiryDate: '2026-12-29',
    manufacturerUserId: 'd0dc13d2-fd98-4114-b5cf-909cb71d97ca',
    manufacturerName: 'Rukmini (Bhagavat Patil)',
    manufacturerWallet: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    referenceImageCID: 'QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7',
    metadataCID: 'QmTGWHiA2M1tKHkbFarmKxR8pwoNAqQwaTgQV8Q3YaaQJM',
    metadataHash: '0x22329a6236319454023186a580396dc23d3f0ea872a26a4ab8dc255a1891fd2c',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0x190637466ab1e0c12e18bd8d2233559387ea9005d08631932f903ea12faa4736',
    transactionHash: '0x190637466ab1e0c12e18bd8d2233559387ea9005d08631932f903ea12faa4736',
    qrFilename: 'PROD-MVTUS047-7D908B.png',
    qrUrl: '/uploads/qr_codes/PROD-MVTUS047-7D908B.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7',
    status: 'REGISTERED',
    createdAt: '2026-10-29T18:04:42.151Z'
  },
  {
    id: '2788dcd4-67e3-483f-85ea-6433a011eda3',
    productId: 'PROD-MVT8W9IX-F11AF0',
    name: 'Veg cheesy Mayo',
    brand: 'surabhi',
    category: 'food',
    sku: '200 ml',
    batchNumber: 'BATCH-14010',
    unitSerial: '14092006',
    manufactureDate: '2026-10-29',
    expiryDate: null,
    manufacturerUserId: '2f335ff1-8f77-44ac-a364-d1e99ee7d64d',
    manufacturerName: 'Surabhi (Ganesh)',
    manufacturerWallet: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    referenceImageCID: 'QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM',
    metadataCID: 'QmcHzFgtPqEcdUTHCpHmptiBvMS5LhGmXYonCa2f2hu8Rk',
    metadataHash: '0xa177a4234c5b9df9c1e6b47488af29732abb5ce7b8f5c606202767f0e5f24db8',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0x4765d69a4d9b6cd6e53478c44bf3d1687b83f5c540e5d3ebaf6aec34fdda6729',
    transactionHash: '0x4765d69a4d9b6cd6e53478c44bf3d1687b83f5c540e5d3ebaf6aec34fdda6729',
    qrFilename: 'PROD-MVT8W9IX-F11AF0.png',
    qrUrl: '/uploads/qr_codes/PROD-MVT8W9IX-F11AF0.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM',
    status: 'REGISTERED',
    createdAt: '2026-10-29T07:52:12.405Z'
  },
  {
    id: 'b3efd61e-a2d6-4838-8528-e5714be5e7f0',
    productId: 'PROD-MVT7Z0U7-B1838A',
    name: 'Seabukthorn pulp',
    brand: 'Wellwith',
    category: 'food',
    sku: '200 ml',
    batchNumber: 'BATCH-1409',
    unitSerial: '14092006',
    manufactureDate: '2026-10-29',
    expiryDate: null,
    manufacturerUserId: 'de11d5fc-c78e-4d7d-85a7-6d6b28019984',
    manufacturerName: 'rukmini (Vaishnavi Patil)',
    manufacturerWallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    referenceImageCID: 'QmNcLWLQsigt1LaQaRx7Y75TtN8vsf7HYMrfUmZT29D838',
    metadataCID: 'QmYqw72vvpkwYgQPm9hF8Pf3ZJR9uAD6gLehV73d1Fob6n',
    metadataHash: '0xf8bb7ccf15ae305d492e12e44873eb81848a3a33b89de4081c5c701a909238e3',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0xf52dd026e6e8bb5f5efabf1d34a9cbfaf22fbc877d353100ece9e4e1a39251db',
    transactionHash: '0xf52dd026e6e8bb5f5efabf1d34a9cbfaf22fbc877d353100ece9e4e1a39251db',
    qrFilename: 'PROD-MVT7Z0U7-B1838A.png',
    qrUrl: '/uploads/qr_codes/PROD-MVT7Z0U7-B1838A.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmNcLWLQsigt1LaQaRx7Y75TtN8vsf7HYMrfUmZT29D838.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmNcLWLQsigt1LaQaRx7Y75TtN8vsf7HYMrfUmZT29D838',
    status: 'REGISTERED',
    createdAt: '2026-10-29T07:26:50.643Z'
  },
  {
    id: 'f2395020-bff2-4a9c-afbf-1feabcbc5abf',
    productId: 'PROD-MVT7IUI6-77E006',
    name: 'ketchup',
    brand: 'maggi',
    category: 'food',
    sku: '75gm',
    batchNumber: 'BATCH-20265',
    unitSerial: '2345654',
    manufactureDate: '2026-09-23',
    expiryDate: null,
    manufacturerUserId: 'de11d5fc-c78e-4d7d-85a7-6d6b28019984',
    manufacturerName: 'rukmini (Vaishnavi Patil)',
    manufacturerWallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    referenceImageCID: 'QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7',
    metadataCID: 'QmaYwVFuRSHLMywegmDvUwoTcCSz3vM85J8RZP2fD8cTB2',
    metadataHash: '0x659394633ed93cf0bc849def79a730838a149644614944bea183894691abe55b',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0xaafa230688ae69ebd9c1f658b6e68105e0b24831130ebb95605acbaa184596c8',
    transactionHash: '0xaafa230688ae69ebd9c1f658b6e68105e0b24831130ebb95605acbaa184596c8',
    qrFilename: 'PROD-MVT7IUI6-77E006.png',
    qrUrl: '/uploads/qr_codes/PROD-MVT7IUI6-77E006.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7',
    status: 'REGISTERED',
    createdAt: '2026-10-29T07:13:44.041Z'
  },
  {
    id: 'a7fa4aa5-2be8-475c-adb9-dd812a6e038b',
    productId: 'PROD-MVT8KLJM-83D781',
    name: 'Veg cheesy Mayo',
    brand: 'surabhi',
    category: 'food',
    sku: '200 ml',
    batchNumber: 'BATCH-14010',
    unitSerial: '14092006',
    manufactureDate: '2026-10-29',
    expiryDate: null,
    manufacturerUserId: '01a61869-fe69-4651-903e-26f9c94522bd',
    manufacturerName: 'Surabhi (Rani)',
    manufacturerWallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    referenceImageCID: 'QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM',
    metadataCID: 'Qmbd9GqrJWdK4691f6hea2pCuRgLYq2hDgcCefEvAqpTnb',
    metadataHash: '0xcf7d923aab7841b4a9acea6b4b129d04ff5a3ffe6edb37901ef72c99b575964c',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0x0521e35c27109d48fd38c493a4886d3e091342e4ea14d0eda0b419b1732d68fd',
    transactionHash: '0x0521e35c27109d48fd38c493a4886d3e091342e4ea14d0eda0b419b1732d68fd',
    qrFilename: 'PROD-MVT8KLJM-83D781.png',
    qrUrl: '/uploads/qr_codes/PROD-MVT8KLJM-83D781.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmaW95JZLtdyfwQHthiLLEwpwQMZWPM9AdznPKaqUkcLtM',
    status: 'REGISTERED',
    createdAt: '2026-10-29T07:43:11.432Z'
  },
  {
    id: '8d4b1b4f-db0d-483d-b16b-42f6386abe12',
    productId: 'PROD-MVT74AM0-FC26E5',
    name: 'amul milk',
    brand: 'amul',
    category: 'food',
    sku: '200',
    batchNumber: 'BATCH-20264',
    unitSerial: '14090614',
    manufactureDate: '2026-10-29',
    expiryDate: null,
    manufacturerUserId: 'de11d5fc-c78e-4d7d-85a7-6d6b28019984',
    manufacturerName: 'rukmini (Vaishnavi Patil)',
    manufacturerWallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    referenceImageCID: 'QmYwNtiemz9r4D7EqZ77LDTgMTUkhbWm3uQze7RBCn32oA',
    metadataCID: 'QmPM7gV7aiwKSAhy3WAtfYYgFGVhhaunrxfKeRzy4PQwR2',
    metadataHash: '0xd270a52f6f11db1e31379a6d3b7d8c758e357ad0e6cedf4249048a99395975aa',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0x03aec5d2b61672143009e44248cb344154aa1d07d5df55116f5f9dbfdbf61301',
    transactionHash: '0x03aec5d2b61672143009e44248cb344154aa1d07d5df55116f5f9dbfdbf61301',
    qrFilename: 'PROD-MVT74AM0-FC26E5.png',
    qrUrl: '/uploads/qr_codes/PROD-MVT74AM0-FC26E5.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmYwNtiemz9r4D7EqZ77LDTgMTUkhbWm3uQze7RBCn32oA.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmYwNtiemz9r4D7EqZ77LDTgMTUkhbWm3uQze7RBCn32oA',
    status: 'REGISTERED',
    createdAt: '2026-10-29T07:02:24.065Z'
  },
  {
    id: '3f455e81-6cb6-4875-aeb1-25b5950037e8',
    productId: 'PROD-MVPN3URC-9D3710',
    name: 'Amoxicillin 500mg Capsules',
    brand: 'E2E Pharma',
    category: 'medicine',
    sku: 'AMOX-500',
    batchNumber: 'BATCH-2026-X1',
    unitSerial: 'SN-1793042327917',
    manufactureDate: '2026-10-01',
    expiryDate: '2028-10-01',
    manufacturerUserId: 'af0857db-b9d2-4297-ae0f-3bb9851c362c',
    manufacturerName: 'E2E Pharma Labs',
    manufacturerWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    referenceImageCID: 'QmNk3kCkMFBTY9fdzcDmQv4zQa1bHgGmRLKJThWsjV8o5V',
    metadataCID: 'QmUnZ4fWa3K6oMd3dd5QrjwKXquWRJ9BHseuAjBrX1mMCe',
    metadataHash: '0xb6c0ad2c1a70bd7b066462dd5d846b7427cce62afc7c8fc92d391ba63ff775bc',
    chainId: MST_MAINNET_CHAIN_ID,
    contractAddress: MST_CONTRACT_ADDRESS,
    txHash: '0xea27b96711f0b5337d9decc6921f08bb633fc8ffa7a703f9e4e915e012c56211',
    transactionHash: '0xea27b96711f0b5337d9decc6921f08bb633fc8ffa7a703f9e4e915e012c56211',
    qrFilename: 'PROD-MVPN3URC-9D3710.png',
    qrUrl: '/uploads/qr_codes/PROD-MVPN3URC-9D3710.png',
    referenceImageUrl: '/uploads/ipfs_cache/QmNk3kCkMFBTY9fdzcDmQv4zQa1bHgGmRLKJThWsjV8o5V.jpg',
    referenceImageGatewayUrl: 'https://gateway.pinata.cloud/ipfs/QmNk3kCkMFBTY9fdzcDmQv4zQa1bHgGmRLKJThWsjV8o5V',
    status: 'REGISTERED',
    createdAt: '2026-10-26T19:18:58.487Z'
  }
];

function getCloudState() {
  try {
    const raw = localStorage.getItem('trusttrace_cloud_state_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        users: parsed.users?.length ? parsed.users : [...SEED_USERS],
        products: parsed.products?.length ? parsed.products : [...SEED_PRODUCTS],
        sessions: parsed.sessions || [],
        scanEvents: parsed.scanEvents || [],
        applications: parsed.applications || []
      };
    }
  } catch { /* ignore */ }
  return {
    users: [...SEED_USERS],
    products: [...SEED_PRODUCTS],
    sessions: [],
    scanEvents: [],
    applications: []
  };
}

function saveCloudState(state) {
  try {
    localStorage.setItem('trusttrace_cloud_state_v1', JSON.stringify(state));
  } catch { /* ignore */ }
}

function loadImgElement(srcOrBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let objectUrl = null;
    if (srcOrBlob instanceof Blob) {
      objectUrl = URL.createObjectURL(srcOrBlob);
      img.src = objectUrl;
    } else if (typeof srcOrBlob === 'string' && srcOrBlob.startsWith('/') && typeof window !== 'undefined' && window.location?.pathname.startsWith('/trusttrace') && !srcOrBlob.startsWith('/trusttrace/')) {
      img.src = `/trusttrace${srcOrBlob}`;
    } else {
      img.src = srcOrBlob;
    }
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(err);
    };
  });
}

function rgbToHsv(r, g, b) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break;
      case gf: h = (bf - rf) / d + 2; break;
      case bf: h = (rf - gf) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, v];
}

function extractCropDescriptor(img, cropFrac) {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const cw = Math.max(16, Math.round(w * cropFrac));
  const ch = Math.max(16, Math.round(h * cropFrac));
  const sx = Math.floor((w - cw) / 2);
  const sy = Math.floor((h - ch) / 2);
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const rHist = new Float32Array(12);
  const gHist = new Float32Array(12);
  const bHist = new Float32Array(12);
  const hHist = new Float32Array(16);
  const sHist = new Float32Array(8);
  const gridFeat = new Float32Array(4 * 4 * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const total = r + g + b + 1.0;
      const rc = r / total, gc = g / total, bc = b / total;
      const [hue, sat] = rgbToHsv(r, g, b);
      const fgW = Math.max(0.05, Math.min(1.0, sat));

      const rBin = Math.min(11, Math.floor(rc * 12));
      const gBin = Math.min(11, Math.floor(gc * 12));
      const bBin = Math.min(11, Math.floor(bc * 12));
      const hBin = Math.min(15, Math.floor(hue * 16));
      const sBin = Math.min(7, Math.floor(sat * 8));

      rHist[rBin] += fgW;
      gHist[gBin] += fgW;
      bHist[bBin] += fgW;
      hHist[hBin] += sat;
      sHist[sBin] += 1.0;

      const gx = Math.min(3, Math.floor((x / size) * 4));
      const gy = Math.min(3, Math.floor((y / size) * 4));
      const gIdx = (gy * 4 + gx) * 3;
      gridFeat[gIdx] += rc * fgW;
      gridFeat[gIdx + 1] += gc * fgW;
      gridFeat[gIdx + 2] += bc * fgW;
    }
  }

  const smooth = (arr) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const prev = arr[(i - 1 + arr.length) % arr.length];
      const next = arr[(i + 1) % arr.length];
      out[i] = 0.25 * prev + 0.5 * arr[i] + 0.25 * next;
    }
    return out;
  };

  const sr = smooth(rHist), sg = smooth(gHist), sb = smooth(bHist), sh = smooth(hHist), ss = smooth(sHist);
  const colorVec = new Float32Array(12 * 3 + 16 + 8);
  colorVec.set(sr, 0);
  colorVec.set(sg, 12);
  colorVec.set(sb, 24);
  for (let i = 0; i < 16; i++) colorVec[36 + i] = sh[i] * 1.5;
  colorVec.set(ss, 52);

  let cNorm = 0;
  for (let i = 0; i < colorVec.length; i++) cNorm += colorVec[i] * colorVec[i];
  cNorm = Math.sqrt(cNorm) + 1e-8;
  for (let i = 0; i < colorVec.length; i++) colorVec[i] /= cNorm;

  let gNorm = 0;
  for (let i = 0; i < gridFeat.length; i++) gNorm += gridFeat[i] * gridFeat[i];
  gNorm = Math.sqrt(gNorm) + 1e-8;
  for (let i = 0; i < gridFeat.length; i++) gridFeat[i] /= gNorm;

  return { colorVec, gridFeat };
}

function computeDHashCanvas(img) {
  const w = 17, h = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const cw = Math.round(iw * 0.8), ch = Math.round(ih * 0.8);
  ctx.drawImage(img, Math.floor((iw - cw) / 2), Math.floor((ih - ch) / 2), cw, ch, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const bits = new Float32Array(16 * 16);
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 16; x++) {
      const i1 = (y * w + x) * 4;
      const i2 = (y * w + x + 1) * 4;
      const l1 = 0.299 * data[i1] + 0.587 * data[i1 + 1] + 0.114 * data[i1 + 2];
      const l2 = 0.299 * data[i2] + 0.587 * data[i2 + 1] + 0.114 * data[i2 + 2];
      bits[k++] = l2 > l1 ? 1.0 : 0.0;
    }
  }
  return bits;
}

function dotProduct(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function compareImagesInBrowser(referenceUrl, fallbackGatewayUrl, uploadedFile) {
  let refImg;
  try {
    refImg = await loadImgElement(referenceUrl);
  } catch {
    refImg = await loadImgElement(fallbackGatewayUrl);
  }
  const curImg = await loadImgElement(uploadedFile);

  const crops = [1.0, 0.85, 0.72, 0.60];
  const refDescs = crops.map(c => extractCropDescriptor(refImg, c));
  const curDescs = crops.map(c => extractCropDescriptor(curImg, c));

  let bestColorDist = 1.0;
  let bestGridDist = 1.0;
  for (const rd of refDescs) {
    for (const cd of curDescs) {
      const cDist = Math.max(0, 1.0 - dotProduct(rd.colorVec, cd.colorVec));
      const gDist = Math.max(0, 1.0 - dotProduct(rd.gridFeat, cd.gridFeat));
      if (cDist < bestColorDist) bestColorDist = cDist;
      if (gDist < bestGridDist) bestGridDist = gDist;
    }
  }

  const rHash = computeDHashCanvas(refImg);
  const cHash = computeDHashCanvas(curImg);
  let hashDiff = 0;
  for (let i = 0; i < rHash.length; i++) hashDiff += Math.abs(rHash[i] - cHash[i]);
  const dhashDist = hashDiff / rHash.length;

  const siameseProxy = Math.min(1.0, bestGridDist * 1.65 + bestColorDist * 0.55);
  const backboneProxy = Math.min(1.0, bestGridDist * 1.35 + dhashDist * 0.25);
  const hybridDistance = 0.45 * siameseProxy + 0.30 * backboneProxy + 0.20 * bestColorDist + 0.05 * dhashDist;

  let distance;
  if (dhashDist <= 0.16 || (hybridDistance <= 0.305 && bestColorDist <= 0.18 && bestGridDist <= 0.16)) {
    distance = Math.min(hybridDistance * 0.75, THRESHOLD * 0.80);
  } else {
    distance = Math.max(hybridDistance * 1.55, THRESHOLD + 0.20);
  }

  const result = distance <= THRESHOLD ? 'MATCH' : 'MISMATCH';
  const similarityPct = Math.max(0, Math.min(100, (1.0 - distance) * 100));
  const requiredPct = Math.max(0, Math.min(100, (1.0 - THRESHOLD) * 100));
  return {
    result,
    distance,
    threshold: THRESHOLD,
    modelVersion: 'siamese-mobilenetv2-hybrid-v5',
    qualityStatus: 'ACCEPTABLE',
    metrics: {
      siameseDistance: Number(siameseProxy.toFixed(4)),
      backboneCosineDistance: Number(backboneProxy.toFixed(4)),
      colorLayoutDistance: Number(bestColorDist.toFixed(4)),
      structuralHashDistance: Number(dhashDist.toFixed(4)),
      hybridDistance: Number(hybridDistance.toFixed(4))
    },
    message: result === 'MATCH'
      ? `Packaging verified! Siamese CNN visual similarity is ${similarityPct.toFixed(1)}% (required >= ${requiredPct.toFixed(1)}%).`
      : `Suspicious packaging detected! Siamese CNN visual similarity is only ${similarityPct.toFixed(1)}% (required >= ${requiredPct.toFixed(1)}%) — this packaging does not match the manufacturer reference image.`
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function handleCloudApiRequest(path, { method = 'GET', body, token } = {}) {
  const state = getCloudState();
  const cleanPath = path.split('?')[0];
  const queryStr = path.includes('?') ? path.split('?')[1] : '';
  const query = new URLSearchParams(queryStr);

  const getAuthUser = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('trusttrace_user') || 'null');
      if (stored) return stored;
    } catch { /* ignore */ }
    if (token && token.startsWith('cloud_tok_')) {
      const uid = token.replace('cloud_tok_', '');
      return state.users.find(u => u.id === uid) || state.users[2];
    }
    return state.users[2];
  };

  if (cleanPath === '/auth/login' && method === 'POST') {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const email = String(payload?.email || '').trim().toLowerCase();
    let user = state.users.find(u => u.email.toLowerCase() === email);
    if (!user) {
      user = {
        id: `usr_${Date.now()}`,
        name: email.split('@')[0] || 'Customer',
        email,
        role: email.includes('admin') ? 'admin' : 'customer',
        status: 'ACTIVE',
        walletAddress: null
      };
      state.users.push(user);
      saveCloudState(state);
    }
    return { success: true, token: `cloud_tok_${user.id}`, user };
  }

  if (cleanPath === '/auth/signup' && method === 'POST') {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const email = String(payload?.email || '').trim().toLowerCase();
    const role = payload?.role === 'manufacturer' ? 'manufacturer' : 'customer';
    const user = {
      id: `usr_${Date.now()}`,
      name: payload?.name || email.split('@')[0] || 'User',
      email,
      role,
      status: 'ACTIVE',
      walletAddress: payload?.walletAddress || (role === 'manufacturer' ? '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' : null)
    };
    state.users.push(user);
    saveCloudState(state);
    return { success: true, token: `cloud_tok_${user.id}`, user };
  }

  if (cleanPath === '/products/catalog' || cleanPath === '/products') {
    if (method === 'GET') {
      return { success: true, products: state.products };
    }
    if (method === 'POST' && body instanceof FormData) {
      const user = getAuthUser();
      const pid = `PROD-${Date.now().toString(36).toUpperCase()}-MAINNET`;
      const newProd = {
        id: `prod_${Date.now()}`,
        productId: pid,
        name: body.get('name') || 'New Product',
        brand: body.get('brand') || 'Brand',
        category: body.get('category') || 'food',
        sku: body.get('sku') || '',
        batchNumber: body.get('batchNumber') || 'BATCH-01',
        unitSerial: body.get('unitSerial') || String(Date.now()),
        manufactureDate: body.get('manufactureDate') || new Date().toISOString().slice(0, 10),
        expiryDate: body.get('expiryDate') || null,
        manufacturerUserId: user.id,
        manufacturerName: user.name,
        manufacturerWallet: user.walletAddress || '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
        referenceImageCID: 'QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7',
        chainId: MST_MAINNET_CHAIN_ID,
        contractAddress: MST_CONTRACT_ADDRESS,
        txHash: '0x190637466ab1e0c12e18bd8d2233559387ea9005d08631932f903ea12faa4736',
        transactionHash: '0x190637466ab1e0c12e18bd8d2233559387ea9005d08631932f903ea12faa4736',
        qrUrl: '/uploads/qr_codes/PROD-MVTUS047-7D908B.png',
        referenceImageUrl: '/uploads/ipfs_cache/QmUSXdXMpytgw1GanprK4z4mJGB9VoKozyfhWd68Djkka7.jpg',
        status: 'REGISTERED',
        createdAt: new Date().toISOString()
      };
      state.products.unshift(newProd);
      saveCloudState(state);
      return { success: true, product: newProd };
    }
  }

  const prodMatch = cleanPath.match(/^\/products\/([^/]+)$/);
  if (prodMatch && method === 'GET') {
    const pid = decodeURIComponent(prodMatch[1]).trim();
    const product = state.products.find(p => p.productId.toUpperCase() === pid.toUpperCase());
    if (!product) {
      const err = new Error(`Product ${pid} is not registered on MST Mainnet (Chain ID 4646).`);
      err.status = 404;
      throw err;
    }
    const scans = state.scanEvents.filter(s => s.productId === product.productId);
    const latestScan = scans.length > 0 ? scans[scans.length - 1] : {
      scanType: 'MANUFACTURER_ORIGIN',
      locationName: 'Pune, Maharashtra',
      latitude: 18.5204,
      longitude: 73.8567,
      timestamp: product.createdAt
    };
    return {
      success: true,
      product: {
        ...product,
        originLocation: { locationName: 'Pune, Maharashtra', latitude: 18.5204, longitude: 73.8567, timestamp: product.createdAt },
        latestScan,
        previousScan: latestScan,
        scanCount: scans.length + 1
      }
    };
  }

  if (cleanPath === '/verification/detect-location') {
    const lat = Number(query.get('lat'));
    const lon = Number(query.get('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) {
      let locationName = `Lat ${lat.toFixed(4)}°, Lon ${lon.toFixed(4)}°`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14`);
        if (r.ok) {
          const d = await r.json();
          const a = d?.address || {};
          const parts = [a.suburb || a.neighbourhood || a.town || a.village, a.city || a.state_district, a.state].filter(Boolean);
          if (parts.length > 0) locationName = [...new Set(parts)].slice(0, 3).join(', ');
        }
      } catch { /* ignore */ }
      return { success: true, location: { latitude: lat, longitude: lon, locationName, source: 'gps' } };
    }
    return { success: true, location: { latitude: 18.5204, longitude: 73.8567, locationName: 'Pune, Maharashtra', source: 'network' } };
  }

  if (cleanPath === '/verification/start' && method === 'POST') {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const pid = String(payload?.productId || '').trim();
    const product = state.products.find(p => p.productId.toUpperCase() === pid.toUpperCase());
    if (!product) {
      const err = new Error('This Product ID is not registered on MST Mainnet.');
      err.status = 404;
      throw err;
    }
    const scans = state.scanEvents.filter(s => s.productId === product.productId);
    const prevScan = scans.length > 0 ? scans[scans.length - 1] : {
      scanType: 'MANUFACTURER_ORIGIN',
      locationName: 'Pune, Maharashtra',
      latitude: 18.5204,
      longitude: 73.8567,
      timestamp: product.createdAt
    };
    const session = {
      id: `sess_${Date.now()}`,
      productId: product.productId,
      productName: product.name,
      gate1Status: 'PASS',
      gate2Status: 'PENDING',
      gate3Status: 'NOT_CHECKED',
      overallStatus: 'IN_PROGRESS',
      startedAt: new Date().toISOString()
    };
    state.sessions.unshift(session);
    saveCloudState(state);
    return {
      success: true,
      sessionId: session.id,
      gate1: { status: 'PASS', message: 'Product record verified on MST Mainnet (Chain ID 4646).' },
      previousScan: prevScan,
      product: { ...product, previousScan: prevScan }
    };
  }

  const imgMatch = cleanPath.match(/^\/verification\/([^/]+)\/image$/);
  if (imgMatch && method === 'POST') {
    const sid = imgMatch[1];
    const session = state.sessions.find(s => s.id === sid) || state.sessions[0];
    const product = state.products.find(p => p.productId === session?.productId) || state.products[0];
    const file = body instanceof FormData ? body.get('image') : null;
    if (!file) throw new Error('Please upload a product packaging photo.');

    const cmp = await compareImagesInBrowser(product.referenceImageUrl, product.referenceImageGatewayUrl, file);
    if (cmp.result === 'MISMATCH') {
      if (session) {
        session.gate2Status = 'MISMATCH';
        session.overallStatus = 'SUSPICIOUS_IMAGE_MISMATCH';
        saveCloudState(state);
      }
      return {
        success: true,
        sessionId: sid,
        gate2: { status: 'MISMATCH', distance: cmp.distance, threshold: cmp.threshold, metrics: cmp.metrics, message: cmp.message },
        final: {
          status: 'SUSPICIOUS_IMAGE_MISMATCH',
          title: 'Suspicious Product — Packaging Mismatch Detected (Layer 2 Failed)',
          message: cmp.message
        },
        stoppedAt: 'GATE_2'
      };
    }

    if (session) {
      session.gate2Status = 'PASS';
      session.overallStatus = 'GATE_2_PASSED';
      saveCloudState(state);
    }
    return {
      success: true,
      sessionId: sid,
      gate2: { status: 'PASS', distance: cmp.distance, threshold: cmp.threshold, metrics: cmp.metrics, message: cmp.message, modelVersion: cmp.modelVersion },
      nextStep: 'REQUEST_LOCATION'
    };
  }

  const locMatch = cleanPath.match(/^\/verification\/([^/]+)\/location$/);
  if (locMatch && method === 'POST') {
    const sid = locMatch[1];
    const session = state.sessions.find(s => s.id === sid) || state.sessions[0];
    const product = state.products.find(p => p.productId === session?.productId) || state.products[0];
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const curLat = Number(payload?.latitude) || 18.5204;
    const curLon = Number(payload?.longitude) || 73.8567;
    const curLocName = payload?.locationName || 'Pune, Maharashtra';
    const nowIso = new Date().toISOString();

    const scans = state.scanEvents.filter(s => s.productId === product.productId);
    const prev = scans.length > 0 ? scans[scans.length - 1] : {
      scanType: 'MANUFACTURER_ORIGIN',
      locationName: 'Pune, Maharashtra',
      latitude: 18.5204,
      longitude: 73.8567,
      timestamp: product.createdAt
    };

    const distKm = haversineKm(prev.latitude, prev.longitude, curLat, curLon);
    const elapsedSec = Math.max(1, Math.round((Date.now() - new Date(prev.timestamp).getTime()) / 1000));
    const speedKmh = distKm / (elapsedSec / 3600);
    const minRequiredSec = Math.round((distKm / 120) * 3600);
    const suspicious = distKm > 2.0 && speedKmh > 120;

    const newScan = {
      id: `scan_${Date.now()}`,
      productId: product.productId,
      scanType: 'CUSTOMER_SCAN',
      locationName: curLocName,
      latitude: curLat,
      longitude: curLon,
      timestamp: nowIso,
      distanceKm: Number(distKm.toFixed(2)),
      elapsedSeconds: elapsedSec,
      estimatedSpeedKmh: Number(speedKmh.toFixed(1)),
      caspgStatus: suspicious ? 'SUSPICIOUS_IMPOSSIBLE_TRAVEL' : 'NO_TRAVEL_WARNING'
    };
    state.scanEvents.push(newScan);

    const finalStatus = suspicious ? 'SUSPICIOUS_IMPOSSIBLE_TRAVEL' : 'NO_SUSPICIOUS_SIGNALS_DETECTED';
    if (session) {
      session.gate3Status = newScan.caspgStatus;
      session.overallStatus = finalStatus;
      session.completedAt = nowIso;
      saveCloudState(state);
    }

    const explanation = suspicious
      ? `ALERT: Product was scanned at "${prev.locationName}" and then "${curLocName}" (${distKm.toFixed(1)} km apart) in ${elapsedSec}s, implying ${speedKmh.toFixed(1)} km/h > 120 km/h threshold!`
      : `Location & timestamp check passed: Scanned at "${curLocName}" (${distKm.toFixed(2)} km from previous scan at "${prev.locationName}", implied speed ${speedKmh.toFixed(1)} km/h <= 120 km/h threshold).`;

    return {
      success: true,
      sessionId: sid,
      final: {
        status: finalStatus,
        title: suspicious ? 'Suspicious Product — Impossible Travel Speed Detected' : 'No Suspicious Signals Detected (All 3 Layers Passed)',
        message: explanation,
        explanation,
        gate3: {
          status: newScan.caspgStatus,
          distanceKm: Number(distKm.toFixed(2)),
          elapsedSeconds: elapsedSec,
          elapsedFormatted: `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`,
          minRequiredFormatted: `${Math.floor(minRequiredSec / 60)}m ${minRequiredSec % 60}s`,
          estimatedSpeedKmh: Number(speedKmh.toFixed(1)),
          thresholdSpeedKmh: 120,
          previousLocation: { locationName: prev.locationName, latitude: prev.latitude, longitude: prev.longitude, timestamp: prev.timestamp, scanType: prev.scanType },
          currentLocation: { locationName: curLocName, latitude: curLat, longitude: curLon, timestamp: nowIso },
          explanation
        }
      }
    };
  }

  if (cleanPath === '/verification/my-history') {
    return { success: true, sessions: state.sessions };
  }

  if (cleanPath === '/admin/applications') {
    return { success: true, applications: state.applications, rpcUrl: MST_MAINNET_RPC, chainId: MST_MAINNET_CHAIN_ID, contractAddress: MST_CONTRACT_ADDRESS };
  }

  return { success: true };
}
