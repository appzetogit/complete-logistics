import { ApiError } from '../../../utils/ApiError.js';

export const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: Object.values(error.errors).map((entry) => entry.message),
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate value error',
      details: error.keyValue,
    });
  }

  const details = error instanceof ApiError ? error.details : undefined;
  return res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    // Machine-readable reason (e.g. OUT_OF_ARRIVAL_RADIUS, INVALID_OTP) for apps to branch on.
    ...(details?.code ? { code: details.code } : {}),
    details,
  });
};
