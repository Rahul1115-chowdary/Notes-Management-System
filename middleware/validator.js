/**
 * Input Validation & Sanitization Middleware
 * Validates request bodies and sanitizes against XSS / injection threats.
 */

// Helper to sanitize text strings (strip dangerous HTML/Script tags)
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

// Regex for basic email verification
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate Signup Request Payload
 */
function validateSignup(req, res, next) {
  const { name, email, password } = req.body || {};
  const errors = [];

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    errors.push('A valid email address is required.');
  }

  if (password && typeof password === 'string' && password.trim().length < 4) {
    errors.push('Password must be at least 4 characters long.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  // Sanitize input fields
  if (req.body.name) req.body.name = sanitizeText(req.body.name);
  if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();

  next();
}

/**
 * Validate Login Request Payload
 */
function validateLogin(req, res, next) {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: 'A valid email address is required for authentication.'
    });
  }

  req.body.email = req.body.email.toLowerCase().trim();
  next();
}

/**
 * Validate Note Payload (Creation / Modification)
 */
function validateNotePayload(req, res, next) {
  const { title, content } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Note title is required and cannot be empty.'
    });
  }

  // Sanitize title and content
  req.body.title = sanitizeText(title);
  if (content && typeof content === 'string') {
    req.body.content = sanitizeText(content);
  }

  next();
}

module.exports = {
  validateSignup,
  validateLogin,
  validateNotePayload,
  sanitizeText
};
