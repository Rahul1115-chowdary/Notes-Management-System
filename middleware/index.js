/**
 * Master Middleware Index
 * Bundles all application middleware into a unified export module.
 */

const requestLogger = require('./requestLogger');
const { generateToken, verifyToken, optionalAuth } = require('./jwtAuth');
const { createRateLimiter, apiLimiter, authLimiter } = require('./rateLimiter');
const { validateSignup, validateLogin, validateNotePayload, sanitizeText } = require('./validator');
const { notFoundHandler, globalErrorHandler } = require('./errorHandler');

module.exports = {
  requestLogger,
  jwtAuth: {
    generateToken,
    verifyToken,
    optionalAuth
  },
  rateLimiter: {
    createRateLimiter,
    apiLimiter,
    authLimiter
  },
  validator: {
    validateSignup,
    validateLogin,
    validateNotePayload,
    sanitizeText
  },
  errorHandler: {
    notFoundHandler,
    globalErrorHandler
  }
};
