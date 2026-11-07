const crypto = require('crypto');
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

    // Exempt specific public forms where external users don't have a prior session
    const publicExemptions = [
        '/api/enquiry',
        '/api/calculate-solar',
        '/api/complaints',
        '/api/franchise',
        '/admin/login',
        '/manager/login',
        '/employee/login',
        '/employee/register'
    ];

    if (publicExemptions.some(p => (req.path && req.path === p) || (req.originalUrl && req.originalUrl.startsWith(p)) || (req.path && req.path.startsWith(p)))) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf) || (req.query && req.query._csrf);

    if (!token || !req.session || token !== req.session.csrfToken) {
        return res.status(403).json({
            success: false,
            message: 'Security validation failed: Invalid or missing CSRF token.'
        });
    }

    next();
};

// Ensure user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.xhr || req.path.startsWith('/api/') || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please sign in to continue.'
            });
        }

        // Determine appropriate login screen
        if (req.originalUrl.startsWith('/admin')) {
            return res.redirect(`/admin/login?returnUrl=${encodeURIComponent(req.originalUrl)}`);
        } else if (req.originalUrl.startsWith('/manager')) {
            return res.redirect(`/manager/login?returnUrl=${encodeURIComponent(req.originalUrl)}`);
        } else {
            return res.redirect(`/employee/login?returnUrl=${encodeURIComponent(req.originalUrl)}`);
        }
    }

    // Verify account status
    if (req.session.user.status === 'SUSPENDED') {
        req.session.destroy(() => {});
        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: 'Your account is suspended. Contact Super Admin.' });
        }
        return res.status(403).render('errors/403', {
            title: 'Account Suspended | Shivay Energy Solutions',
            message: 'Your account has been suspended by management. Please contact Deepak Kushwaha / Rahul Saini.'
        });
    }

    if (req.session.user.status === 'PENDING') {
        req.session.destroy(() => {});
        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(403).json({ success: false, message: 'Account approval pending. Please wait for Super Admin approval.' });
        }
        return res.status(403).render('errors/403', {
            title: 'Account Pending Approval | Shivay Energy Solutions',
            message: 'Your registration is currently pending verification. You will be notified once activated.'
        });
    }

    next();
};

// Require one of the specified roles
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return requireAuth(req, res, next);
        }

        const userRole = req.session.user.role;
        if (!roles.includes(userRole)) {
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

            if (req.xhr || req.path.startsWith('/api/') || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(403).json({
                    success: false,
                    message: 'Access Denied: You do not possess the required permissions.'
                });
            }

            return res.status(403).render('errors/403', {
                title: 'Access Denied | Shivay Energy Solutions',
                message: `HTTP 403 Forbidden: Your role (${userRole}) is not permitted to access this resource.`,
                user: req.session.user
            });
        }

        next();
    };
};

// Shorthand helpers
const requireSuperAdmin = requireRole('SUPER_ADMIN');
const requireBranchManager = requireRole('SUPER_ADMIN', 'BRANCH_MANAGER');
const requireEmployee = requireRole('SUPER_ADMIN', 'BRANCH_MANAGER', 'EMPLOYEE');

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

            return res.status(403).render('errors/403', {
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
    requireBranchManager,
    requireEmployee,
    requireBranchAccess
};
