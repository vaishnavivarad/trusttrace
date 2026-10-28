const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(String(password), salt, 64);
  const actual = Buffer.from(key).toString('hex');
  const a = Buffer.from(actual, 'hex'); const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { hashPassword, verifyPassword };
