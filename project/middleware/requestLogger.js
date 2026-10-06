/**
 * Custom HTTP Request Logger Middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const colorCode = statusCode >= 500 ? '\x1b[31m'
      : statusCode >= 400 ? '\x1b[33m'
      : statusCode >= 300 ? '\x1b[36m'
      : '\x1b[32m';
    const resetColor = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${colorCode}${req.method}${resetColor} ${req.originalUrl} -> ${colorCode}${statusCode}${resetColor} (${duration}ms) - IP: ${clientIp}`
    );

    try {
      res.setHeader('X-Response-Time', `${duration}ms`);
    } catch (e) {}
  });

  next();
}

module.exports = requestLogger;
