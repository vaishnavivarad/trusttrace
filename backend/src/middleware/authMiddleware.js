const { verify } = require('../services/tokenService');
const store = require('../services/appStore');
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    const payload = match ? verify(match[1]) : null;
    if (!payload) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' });
    const user = await store.findById('users', payload.sub);
    if (!user || user.status === 'DISABLED' || user.status === 'REJECTED') {
      return res.status(401).json({ success: false, code: 'SESSION_INVALID', message: 'Your session is no longer valid. Please sign in again.' });
    }
    req.user = { id: user.id, name: user.name, email: user.email, role: String(user.role).toLowerCase(), status: user.status, walletAddress: user.walletAddress || null };
    next();
  } catch (error) { next(error); }
}
function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    if (!req.user || !allowed.includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
module.exports = { requireAuth, requireRole };
