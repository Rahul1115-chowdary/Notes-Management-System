/**
 * Sliding-Window Rate Limiting Middleware
 * Protects endpoints against brute-force & denial of service attacks.
 */

const ipStore = new Map();

// Periodic cleanup of expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of ipStore.entries()) {
    if (now > data.resetTime) {
      ipStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Factory function to create custom rate limiters
 * @param {Object} options - { windowMs: time frame in ms, max: max requests in window }
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // Default: 15 minutes
  const max = options.max || 100; // Default: 100 requests per window
  const message = options.message || 'Too many requests from this IP, please try again later.';

  return function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.baseUrl || ''}${req.path}:${ip}`;
    const now = Date.now();

    let record = ipStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      ipStore.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: resetSeconds
      });
    }

    next();
  };
}

// Pre-configured limiters
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: 'API rate limit exceeded. Maximum 150 requests per 15 minutes allowed.'
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts. Please try again after 15 minutes.'
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter
};
