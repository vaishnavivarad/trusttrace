const crypto = require('crypto');
const RAW_SECRET = process.env.SESSION_SECRET || '';
if (process.env.NODE_ENV === 'production' && (RAW_SECRET.length < 32 || /replace-with|change-before|development-only/i.test(RAW_SECRET))) {
  // Refuse to sign tokens with a guessable secret on a public deployment.
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters when NODE_ENV=production.');
}
const SECRET = RAW_SECRET || 'development-only-secret-change-before-deployment';
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest();
  let got;
  try { got = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function makeToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: user.id, role: user.role, iat: now, exp: now + 60 * 60 * 8 });
}
module.exports = { makeToken, verify, sign };
