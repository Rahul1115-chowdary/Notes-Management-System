/**
 * Custom HTTP Request Logger Middleware
 * Tracks request method, URL, IP, status code, and execution time (ms).
 */

function requestLogger(req, res, next) {
  const start = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  
  // Attach listener on finish to calculate duration & status
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const colorCode = statusCode >= 500 ? '\x1b[31m' // Red
      : statusCode >= 400 ? '\x1b[33m' // Yellow
      : statusCode >= 300 ? '\x1b[36m' // Cyan
      : '\x1b[32m'; // Green
    const resetColor = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${colorCode}${req.method}${resetColor} ${req.originalUrl} -> ${colorCode}${statusCode}${resetColor} (${duration}ms) - IP: ${clientIp}`
    );

    // Set performance header
    try {
      res.setHeader('X-Response-Time', `${duration}ms`);
    } catch (e) {}
  });

  next();
}

module.exports = requestLogger;
