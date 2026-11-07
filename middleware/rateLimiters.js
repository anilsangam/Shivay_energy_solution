const rateLimit = require('express-rate-limit');

// Strict rate limiter for authentication routes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login requests per windowMs
    message: {
        success: false,
        message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for public enquiry & lead generation to prevent spam
const enquiryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: {
        success: false,
        message: 'Too many enquiry submissions from this IP. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// General API rate limiter
const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    loginLimiter,
    enquiryLimiter,
    generalApiLimiter
};
