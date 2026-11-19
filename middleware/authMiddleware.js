const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');

/**
 * Authentication & Authorization Middleware for Shivay Energy Solutions
 */

// Generate or retrieve CSRF token and attach to res.locals
const setupCsrf = (req, res, next) => {
    if (req.session) {
        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        }
        res.locals.csrfToken = req.session.csrfToken;
    }
    next();
};

// Validate CSRF token for state-changing requests
const verifyCsrf = (req, res, next) => {
    // Exempt safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Exempt specific public forms where external users don't have a prior session (exact match only)
    const publicExemptions = new Set([
        '/api/enquiry',
        '/api/complaints',
        '/api/franchise',
        '/login',
        '/admin/login',
        '/manager/login',
        '/employee/login'
    ]);

    const currentPath = (req.path || '').toLowerCase();
    const fullPath = ((req.baseUrl || '') + currentPath).toLowerCase();

    if (publicExemptions.has(currentPath) || publicExemptions.has(fullPath)) {
        return next();
    }

    // Token must be delivered strictly via HTTP header or POST request body (NEVER query string)
    const token = req.headers['x-csrf-token'] || req.headers['csrf-token'] || (req.body && req.body._csrf);

    if (!token || !req.session || token !== req.session.csrfToken) {
        return res.status(403).json({
            success: false,
            message: 'Security validation failed: Invalid or missing CSRF token.'
        });
    }

    next();
};

// Ensure user is logged in and account is currently active
const requireAuth = (req, res, next) => {
    if (req._authVerified) {
        return next();
    }

    if (!req.session || !req.session.user) {
        if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please sign in to continue.'
            });
        }

        // Determine appropriate login screen
        const origUrl = req.originalUrl || req.url || '';
        if (origUrl.startsWith('/admin')) {
            return res.redirect(`/admin/login?returnUrl=${encodeURIComponent(origUrl)}`);
        } else if (origUrl.startsWith('/manager')) {
            return res.redirect(`/manager/login?returnUrl=${encodeURIComponent(origUrl)}`);
        } else {
            return res.redirect(`/employee/login?returnUrl=${encodeURIComponent(origUrl)}`);
        }
    }

    const handleInactiveUser = (status) => {
        if (typeof req.session.destroy === 'function') {
            req.session.destroy(() => {});
        }
        if (typeof res.clearCookie === 'function') {
            res.clearCookie('connect.sid');
        }
        if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(403).json({ success: false, message: `Your account has been ${status.toLowerCase()}. Active session expired.` });
        }
        return res.status(403).render('private/errors/403', {
            title: 'Account Inactive | Shivay Energy Solutions',
            message: `Your account has been ${status.toLowerCase()} by management. Please contact Super Admin.`
        });
    };

    const handlePendingUser = () => {
        if (typeof req.session.destroy === 'function') {
            req.session.destroy(() => {});
        }
        if (typeof res.clearCookie === 'function') {
            res.clearCookie('connect.sid');
        }
        if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(403).json({ success: false, message: 'Account approval pending. Please wait for Super Admin approval.' });
        }
        return res.status(403).render('private/errors/403', {
            title: 'Account Pending Approval | Shivay Energy Solutions',
            message: 'Your registration is currently pending verification. You will be notified once activated.'
        });
    };

    // 1. Fast check against cached session status
    const cachedStatus = req.session.user.status;
    if (['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(cachedStatus)) {
        return handleInactiveUser(cachedStatus);
    }
    if (cachedStatus === 'PENDING') {
        return handlePendingUser();
    }

    // 2. Fast synchronous in-memory check (for development & offline testing)
    const memUser = DataStore.getUserByIdSync ? DataStore.getUserByIdSync(req.session.user._id) : null;
    if (memUser) {
        if (['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(memUser.status)) {
            req.session.user.status = memUser.status;
            return handleInactiveUser(memUser.status);
        }
        if (memUser.status === 'PENDING') {
            req.session.user.status = memUser.status;
            return handlePendingUser();
        }
    }

    // 3. Live MongoDB check when database connection is active (Defense-in-depth)
    if (mongoose.connection && mongoose.connection.readyState === 1 && req.session.user._id && mongoose.isValidObjectId(req.session.user._id)) {
        User.findById(req.session.user._id).select('status role branchId').lean()
            .then(liveUser => {
                if (!liveUser) {
                    if (typeof req.session.destroy === 'function') req.session.destroy(() => {});
                    if (typeof res.clearCookie === 'function') res.clearCookie('connect.sid');
                    return res.status(401).json({ success: false, message: 'Account no longer exists.' });
                }
                if (['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(liveUser.status)) {
                    req.session.user.status = liveUser.status;
                    return handleInactiveUser(liveUser.status);
                }
                if (liveUser.status === 'PENDING') {
                    req.session.user.status = liveUser.status;
                    return handlePendingUser();
                }
                req.session.user.status = liveUser.status;
                req.session.user.role = liveUser.role;
                req.session.user.branchId = liveUser.branchId;
                req._authVerified = true;
                next();
            })
            .catch(() => {
                req._authVerified = true;
                next();
            });
        return;
    }

    req._authVerified = true;
    next();
};

// Require one of the specified roles
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return requireAuth(req, res, next);
        }

        const userRole = req.session.user.role;
        // Normalize role matching (e.g., MANAGER matches both MANAGER and BRANCH_MANAGER if either requested)
        const matched = roles.some(r => {
            if (r === userRole) return true;
            if (r === 'BRANCH_MANAGER' && userRole === 'MANAGER') return true;
            if (r === 'MANAGER' && userRole === 'BRANCH_MANAGER') return true;
            return false;
        });

        if (!matched) {
            // Log security incident
            AuditService.log({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                user: req.session.user._id,
                role: userRole,
                targetResource: req.originalUrl,
                ipAddress: req.ip,
                userAgent: typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'],
                details: { requiredRoles: roles, userRole }
            });

            if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(403).json({
                    success: false,
                    message: 'Access Denied: You do not possess the required permissions.'
                });
            }

            return res.status(403).render('private/errors/403', {
                title: 'Access Denied | Shivay Energy Solutions',
                message: `HTTP 403 Forbidden: Your role (${userRole}) is not permitted to access this resource.`,
                user: req.session.user
            });
        }

        // If requireAuth has already successfully authenticated and verified the user on this request, proceed directly
        if (req._authVerified) {
            return next();
        }

        // Otherwise (requireRole used independently without prior requireAuth in chain), perform full authentication/verification
        return requireAuth(req, res, next);
    };
};

// Shorthand helpers
const requireSuperAdmin = requireRole('SUPER_ADMIN');
const requireManager = requireRole('SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER');
const requireBranchManager = requireRole('SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER');
const requireEmployee = requireRole('SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER', 'EMPLOYEE');

// Validate MongoDB ObjectIds to prevent IDOR and CastErrors
const validateObjectId = (...paramNames) => {
    return (req, res, next) => {
        for (const name of paramNames) {
            const val = req.params[name] || req.body[name] || req.query[name];
            if (val && !mongoose.isValidObjectId(val)) {
                if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid identifier format: ${name}`
                    });
                }
                return res.status(400).render('private/errors/403', {
                    title: 'Invalid Request | Shivay Energy Solutions',
                    message: `Invalid format for identifier parameter '${name}'.`,
                    user: req.session ? req.session.user : null
                });
            }
        }
        next();
    };
};

// Validate branch access for Branch Managers
const requireBranchAccess = (branchParamName = 'branchId') => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return requireAuth(req, res, next);
        }

        // Super Admin has access across all branches
        if (req.session.user.role === 'SUPER_ADMIN') {
            return next();
        }

        const requestedBranch = req.params[branchParamName] || req.body[branchParamName] || req.query[branchParamName];
        const userBranch = req.session.user.branchId ? req.session.user.branchId.toString() : null;

        if (requestedBranch && userBranch && requestedBranch.toString() !== userBranch) {
            AuditService.log({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                user: req.session.user._id,
                role: req.session.user.role,
                targetResource: req.originalUrl,
                ipAddress: req.ip,
                details: { attemptedBranch: requestedBranch, permittedBranch: userBranch }
            });

            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: You cannot access records outside your assigned branch.'
                });
            }

            return res.status(403).render('private/errors/403', {
                title: 'Branch Restriction | Shivay Energy Solutions',
                message: 'HTTP 403: You do not have permission to access or modify records of another branch.',
                user: req.session.user
            });
        }

        next();
    };
};

module.exports = {
    setupCsrf,
    verifyCsrf,
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireManager,
    requireBranchManager,
    requireEmployee,
    requireBranchAccess,
    validateObjectId
};
