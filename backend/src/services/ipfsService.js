const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IPFS_GATEWAY = String(process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs').replace(/\/$/, '');
const CACHE_DIR = path.join(__dirname, '../../uploads/ipfs_cache');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const UNIXFS_SINGLE_CHUNK_MAX = 262144;

function getJwt() { return process.env.PINATA_JWT || ''; }
function ensureConfigured() {
  if (String(process.env.IPFS_PROVIDER || 'pinata').toLowerCase() !== 'pinata') throw new Error('Currently, configure IPFS_PROVIDER=pinata or implement the selected provider adapter.');
  if (!getJwt()) throw new Error('PINATA_JWT is missing. Configure a Pinata JWT to upload/retrieve real IPFS content.');
}
function encodeVarint(n) {
  const out = [];
  let v = Number(n);
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
}
function base58Encode(buffer) {
  if (!buffer || !buffer.length) return '';
  let x = BigInt('0x' + buffer.toString('hex'));
  let out = '';
  while (x > 0n) {
    const mod = Number(x % 58n);
    out = BASE58_ALPHABET[mod] + out;
    x /= 58n;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    out = '1' + out;
  }
  return out;
}
function unixFsLeafNode(buffer) {
  const lenVarint = encodeVarint(buffer.length);
  const unixfsData = Buffer.concat([
    Buffer.from([0x08, 0x02, 0x12]),
    lenVarint,
    buffer,
    Buffer.from([0x18]),
    lenVarint
  ]);
  return Buffer.concat([
    Buffer.from([0x0a]),
    encodeVarint(unixfsData.length),
    unixfsData
  ]);
}
function multihashToCidV0(digest) { return base58Encode(Buffer.concat([Buffer.from([0x12, 0x20]), digest])); }
function computeUnixFsCidV0(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length <= UNIXFS_SINGLE_CHUNK_MAX) {
    return multihashToCidV0(crypto.createHash('sha256').update(unixFsLeafNode(buffer)).digest());
  }
  // Multi-chunk file, default IPFS importer (Pinata pinFileToIPFS, CIDv0): fixed 256 KiB chunks,
  // UnixFS File leaves, balanced layout. One level of links covers up to 174 chunks (~44 MB).
  const chunks = [];
  for (let i = 0; i < buffer.length; i += UNIXFS_SINGLE_CHUNK_MAX) chunks.push(buffer.subarray(i, i + UNIXFS_SINGLE_CHUNK_MAX));
  if (chunks.length > 174) return null;
  const links = []; const blocksizes = [];
  for (const chunk of chunks) {
    const leaf = unixFsLeafNode(chunk);
    const hash = Buffer.concat([Buffer.from([0x12, 0x20]), crypto.createHash('sha256').update(leaf).digest()]);
    const link = Buffer.concat([Buffer.from([0x0a]), encodeVarint(hash.length), hash, Buffer.from([0x12, 0x00, 0x18]), encodeVarint(leaf.length)]);
    links.push(Buffer.concat([Buffer.from([0x12]), encodeVarint(link.length), link]));
    blocksizes.push(Buffer.concat([Buffer.from([0x20]), encodeVarint(chunk.length)]));
  }
  const unixfsRoot = Buffer.concat([Buffer.from([0x08, 0x02, 0x18]), encodeVarint(buffer.length), ...blocksizes]);
  const root = Buffer.concat([...links, Buffer.from([0x0a]), encodeVarint(unixfsRoot.length), unixfsRoot]);
  return multihashToCidV0(crypto.createHash('sha256').update(root).digest());
}
function verifyBufferMatchesCid(cid, buffer) {
  if (!cid || !/^[A-Za-z0-9]+$/.test(cid) || !Buffer.isBuffer(buffer) || buffer.length < 16) {
    return { valid: false, reason: 'Invalid CID or buffer length < 16 bytes' };
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const computedCid = cid.startsWith('Qm') ? computeUnixFsCidV0(buffer) : null;
  if (computedCid) {
    return {
      valid: computedCid === cid,
      computedCid,
      expectedCid: cid,
      sha256,
      byteLength: buffer.length,
      reason: computedCid === cid ? 'CIDv0 UnixFS SHA-256 multihash verified' : `CID mismatch: content hashes to ${computedCid}, expected ${cid}`
    };
  }
  return { valid: true, computedCid: null, expectedCid: cid, sha256, byteLength: buffer.length, reason: 'CIDv1 or >44 MB content: SHA-256 recorded, CID not recomputed' };
}
function cacheVerifiedBuffer(cid, buffer, contentType) {
  try {
    if (!cid || !/^[A-Za-z0-9]+$/.test(cid) || !Buffer.isBuffer(buffer) || buffer.length < 16) return false;
    const check = verifyBufferMatchesCid(cid, buffer);
    if (!check.valid) {
      throw new Error(`Refusing to cache mismatched content for CID ${cid}: ${check.reason}`);
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const binPath = path.join(CACHE_DIR, `${cid}.bin`);
    if (fs.existsSync(binPath)) {
      const existing = fs.readFileSync(binPath);
      const existingSha = crypto.createHash('sha256').update(existing).digest('hex');
      if (existingSha !== check.sha256) {
        const existingCheck = verifyBufferMatchesCid(cid, existing);
        if (existingCheck.valid) {
          return false;
        }
      }
    }
    fs.writeFileSync(binPath, buffer);
    fs.writeFileSync(path.join(CACHE_DIR, `${cid}.meta.json`), JSON.stringify({
      cid,
      contentType: contentType || 'application/octet-stream',
      sha256: check.sha256,
      byteLength: buffer.length,
      computedCid: check.computedCid,
      cachedAt: new Date().toISOString()
    }, null, 2));
    return true;
  } catch {
    return false;
  }
}
function readCachedBuffer(cid) {
  try {
    const binPath = path.join(CACHE_DIR, `${cid}.bin`);
    const metaPath = path.join(CACHE_DIR, `${cid}.meta.json`);
    if (!fs.existsSync(binPath)) return null;
    const buffer = fs.readFileSync(binPath);
    if (buffer.length < 16) return null;
    const check = verifyBufferMatchesCid(cid, buffer);
    if (!check.valid) {
      return null;
    }
    let contentType = 'image/jpeg';
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.sha256 && meta.sha256 !== check.sha256) return null;
      if (meta.contentType) contentType = meta.contentType;
    }
    return { buffer, contentType };
  } catch { return null; }
}
async function uploadFile(file, fileName) {
  ensureConfigured();
  if (!file || !file.buffer || !file.mimetype) throw new Error('A valid uploaded image file is required.');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), fileName || file.originalname || 'reference-image');
  form.append('pinataMetadata', JSON.stringify({ name: `TrustTrace-${fileName || 'reference-image'}` }));
  // Pin as CIDv0 explicitly so the returned CID can be recomputed locally from the exact uploaded bytes.
  form.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getJwt()}` },
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.IpfsHash || !/^[A-Za-z0-9]+$/.test(body.IpfsHash)) {
    throw new Error(`IPFS image upload failed (${response.status}). ${body.error?.details || body.error?.reason || body.error || body.message || 'Check provider credentials and quota.'}`);
  }
  const uploaded = Buffer.from(file.buffer);
  const check = verifyBufferMatchesCid(body.IpfsHash, uploaded);
  if (check.computedCid && !check.valid) {
    // The pinned CID does not represent the bytes the manufacturer selected: never register it.
    throw new Error(`IPFS integrity check failed: pinned CID ${body.IpfsHash} does not match the uploaded image (${check.computedCid}).`);
  }
  cacheVerifiedBuffer(body.IpfsHash, uploaded, file.mimetype);
  return { cid: body.IpfsHash, size: body.PinSize || file.size || file.buffer.length, sha256: check.sha256, cidVerifiedLocally: Boolean(check.computedCid && check.valid) };
}
async function uploadJson(value, fileName) {
  ensureConfigured();
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getJwt()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinataMetadata: { name: `TrustTrace-${fileName || 'metadata'}` }, pinataContent: value }),
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.IpfsHash) throw new Error(`IPFS metadata upload failed (${response.status}). ${body.error?.details || body.error?.reason || body.error || body.message || 'Check provider credentials.'}`);
  return { cid: body.IpfsHash };
}
async function retrieveBuffer(cid) {
  if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) throw new Error('Reference image CID is missing or has an invalid format.');
  const cached = readCachedBuffer(cid);
  if (cached) return cached;
  const gateways = Array.from(new Set([IPFS_GATEWAY, 'https://ipfs.io/ipfs', 'https://dweb.link/ipfs']));
  let lastError = null;
  for (const gw of gateways) {
    try {
      const response = await fetch(`${gw}/${encodeURIComponent(cid)}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        lastError = new Error(`Could not retrieve IPFS content CID ${cid} from ${gw} (HTTP ${response.status}).`);
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 16) {
        lastError = new Error('Retrieved IPFS content is empty or invalid.');
        continue;
      }
      const buffer = Buffer.from(arrayBuffer);
      const check = verifyBufferMatchesCid(cid, buffer);
      if (!check.valid) {
        lastError = new Error(`Retrieved content from ${gw} failed CID integrity check: ${check.reason}`);
        continue;
      }
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      cacheVerifiedBuffer(cid, buffer, contentType);
      return { buffer, contentType };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Could not retrieve IPFS content CID ${cid}. Check pinning/gateway configuration.`);
}
function gatewayUrl(cid) { return `${IPFS_GATEWAY}/${encodeURIComponent(cid)}`; }
module.exports = {
  ensureConfigured,
  uploadFile,
  uploadJson,
  retrieveBuffer,
  gatewayUrl,
  computeUnixFsCidV0,
  verifyBufferMatchesCid,
  cacheVerifiedBuffer,
  readCachedBuffer
};
