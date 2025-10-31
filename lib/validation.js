/**
 * Request validation utilities
 * @module lib/validation
 */

/**
 * Validate required fields in request body
 * @param {Object} body - Request body
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateRequiredFields(body, requiredFields) {
  const missingFields = requiredFields.filter(field => {
    return !body || body[field] === undefined || body[field] === null || body[field] === '';
  });

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string input (basic XSS prevention)
 * @param {string} input - Input string
 * @returns {string}
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim()
    .slice(0, 10000); // Limit length
}

/**
 * Validate and sanitize form data
 * @param {Object} formData - Form data object
 * @returns {Object} - Sanitized form data
 */
export function sanitizeFormData(formData) {
  if (!formData || typeof formData !== 'object') {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeFormData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Validate request body size
 * @param {Object} body - Request body
 * @param {number} maxSizeKB - Maximum size in KB
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateBodySize(body, maxSizeKB = 1000) {
  const bodyString = JSON.stringify(body);
  const sizeKB = Buffer.byteLength(bodyString, 'utf8') / 1024;

  if (sizeKB > maxSizeKB) {
    return {
      valid: false,
      error: `Request body too large: ${sizeKB.toFixed(2)}KB (max: ${maxSizeKB}KB)`,
    };
  }

  return { valid: true };
}
