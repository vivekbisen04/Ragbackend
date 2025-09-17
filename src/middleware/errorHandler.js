/**
 * Global error handling middleware for Express
 */

class APIError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('❌ Error occurred:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Default error
  let message = 'Internal Server Error';
  let statusCode = 500;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = 'Resource not found';
    statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    message = 'Duplicate field value entered';
    statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(val => val.message).join(', ');
    statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Token expired';
    statusCode = 401;
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    message = err.message || 'Too many requests, please try again later';
    statusCode = 429;
  }

  // Redis connection errors
  if (err.code === 'ECONNREFUSED' && err.syscall === 'connect') {
    message = 'Database connection failed';
    statusCode = 503;
  }

  // Qdrant errors
  if (err.message && err.message.includes('Qdrant')) {
    message = 'Vector database error';
    statusCode = 503;
  }

  // API specific errors
  if (err instanceof APIError) {
    message = err.message;
    statusCode = err.statusCode;
  }

  // Jina AI API errors
  if (err.response && err.response.status === 422) {
    message = 'Invalid input for AI service';
    statusCode = 400;
  }

  if (err.response && err.response.status === 401) {
    message = 'AI service authentication failed';
    statusCode = 503;
  }

  // Parse error messages from axios responses
  if (err.response && err.response.data) {
    if (typeof err.response.data === 'string') {
      message = err.response.data;
    } else if (err.response.data.message) {
      message = err.response.data.message;
    } else if (err.response.data.detail) {
      message = err.response.data.detail;
    }
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  // Add additional error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.originalError = err.message;
  }

  // Add request context for debugging
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.request = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    };
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error types
class ValidationError extends APIError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class UnauthorizedError extends APIError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends APIError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class ConflictError extends APIError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

class ServiceUnavailableError extends APIError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

export default errorHandler;

export {
  APIError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError,
  asyncHandler
};