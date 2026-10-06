/**
 * Global Error Handling & 404 Route Not Found Middleware
 */

/**
 * Handle 404 Route Not Found for unknown endpoints
 */
function notFoundHandler(req, res, next) {
  // If it's an API request, return JSON 404
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: `API Route not found: ${req.method} ${req.originalUrl}`
    });
  }
  
  // For page requests, continue to next or let Express handle static serving
  next();
}

/**
 * Centralized Global Error Handler Middleware
 */
function globalErrorHandler(err, req, res, next) {
  console.error(`❌ [Global Error Handler] Exception encountered on ${req.method} ${req.originalUrl}:`, err);

  const statusCode = err.statusCode || res.statusCode !== 200 ? res.statusCode : 500;
  
  res.status(statusCode >= 400 ? statusCode : 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = {
  notFoundHandler,
  globalErrorHandler
};
