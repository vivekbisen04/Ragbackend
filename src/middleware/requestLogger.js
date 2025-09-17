/**
 * Custom request logging middleware
 */

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Generate request ID
  req.requestId = Math.random().toString(36).substring(2, 15);

  // Log request start
  console.log(`📥 [${req.requestId}] ${req.method} ${req.url} - ${req.ip}`);

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log response
    console.log(`📤 [${req.requestId}] ${res.statusCode} - ${duration}ms`);

    // Log slow requests
    if (duration > 1000) {
      console.warn(`🐌 [${req.requestId}] Slow request: ${duration}ms`);
    }

    // Log errors
    if (res.statusCode >= 400) {
      console.error(`❌ [${req.requestId}] Error response: ${res.statusCode}`);
    }

    return originalJson.call(this, body);
  };

  next();
};

export default requestLogger;