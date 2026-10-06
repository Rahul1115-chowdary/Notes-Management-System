/**
 * JWT Authentication & Verification Middleware
 * Generates and validates JSON Web Tokens for API requests.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'notes_app_super_secret_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for an authenticated user
 */
function generateToken(userPayload) {
  return jwt.sign(
    {
      id: userPayload.id || userPayload._id,
      email: userPayload.email,
      name: userPayload.name,
      role: userPayload.role || 'User'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Required Authentication Middleware
 * Checks for token in Authorization header (Bearer <token>) or x-access-token
 */
function verifyToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. Authorization token is required.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid token signature.'
    });
  }
}

/**
 * Optional Authentication Middleware
 * Attaches user to req if valid token is provided, but proceeds even if unauthenticated
 */
function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Ignore invalid token in optional auth
    }
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  optionalAuth,
  JWT_SECRET
};
