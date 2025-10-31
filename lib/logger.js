/**
 * Production logging utility
 * @module lib/logger
 */

const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Log error with context
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export function logError(message, error, context = {}) {
  const logEntry = {
    level: LOG_LEVELS.ERROR,
    timestamp: new Date().toISOString(),
    message,
    error: {
      name: error?.name,
      message: error?.message,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    },
    context,
    environment: process.env.NODE_ENV,
  };

  console.error(JSON.stringify(logEntry));

  // TODO: Send to external logging service (e.g., Sentry, LogRocket, CloudWatch)
  // if (process.env.NODE_ENV === 'production') {
  //   sendToExternalLogger(logEntry);
  // }
}

/**
 * Log warning
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
export function logWarn(message, context = {}) {
  const logEntry = {
    level: LOG_LEVELS.WARN,
    timestamp: new Date().toISOString(),
    message,
    context,
    environment: process.env.NODE_ENV,
  };

  console.warn(JSON.stringify(logEntry));
}

/**
 * Log info
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 */
export function logInfo(message, context = {}) {
  const logEntry = {
    level: LOG_LEVELS.INFO,
    timestamp: new Date().toISOString(),
    message,
    context,
    environment: process.env.NODE_ENV,
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Log API request
 * @param {Object} request - Request object
 * @param {Object} response - Response data
 * @param {number} duration - Request duration in ms
 */
export function logApiRequest(request, response, duration) {
  const logEntry = {
    level: LOG_LEVELS.INFO,
    timestamp: new Date().toISOString(),
    type: 'api_request',
    method: request.method,
    path: request.url,
    status: response.status,
    duration,
    environment: process.env.NODE_ENV,
  };

  console.log(JSON.stringify(logEntry));
}
