const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');

/**
 * Authentication & Authorization Middleware for Shivay Energy Solutions
 */

// Helper to attach authorization methods directly to req and res.locals
const attachAuthorizationHelpers = (req, res) => {
    if (!req || !req.session || !req.session.user) return;
    if (res && !res.locals) res.locals = {};
    const user = req.session.user;

    req.hasPermission = (k) => AuthorizationService.hasPermission(user, k);
    req.hasAnyPermission = (keys) => AuthorizationService.hasAnyPermission(user, keys);
    req.hasAllPermissions = (keys) => AuthorizationService.hasAllPermissions(user, keys);
    req.hasModuleAccess = (m) => AuthorizationService.hasModuleAccess(user, m);
    req.hasFeatureAccess = (m, f) => AuthorizationService.hasFeatureAccess(user, m, f);
    req.hasActionAccess = (m, f, a) => AuthorizationService.hasActionAccess(user, m, f, a);
    req.hasFieldAccess = (f) => AuthorizationService.hasFieldAccess(user, f);
    req.canAccessBranch = (b) => AuthorizationService.canAccessBranch(user, b);
    req.getAccessibleDataScope = (m) => AuthorizationService.getAccessibleDataScope(user, m);

    res.locals.hasPermission = req.hasPermission;
    res.locals.hasAnyPermission = req.hasAnyPermission;
    res.locals.hasAllPermissions = req.hasAllPermissions;
    res.locals.hasModuleAccess = req.hasModuleAccess;
    res.locals.hasFeatureAccess = req.hasFeatureAccess;
    res.locals.hasActionAccess = req.hasActionAccess;
    res.locals.hasFieldAccess = req.hasFieldAccess;
    res.locals.canAccessBranch = req.canAccessBranch;
};

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
        AuthorizationService.validateAndSynchronizeSession(req.session.user, memUser);
    }

    // 3. Live MongoDB check when database connection is active (Defense-in-depth)
    if (mongoose.connection && mongoose.connection.readyState === 1 && req.session.user._id && mongoose.isValidObjectId(req.session.user._id)) {
        return User.findById(req.session.user._id).select('status role branchId isPrimarySuperAdmin permissions fieldPermissions permissionVersion').lean()
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
                AuthorizationService.validateAndSynchronizeSession(req.session.user, liveUser);
                attachAuthorizationHelpers(req, res);
                req._authVerified = true;
                next();
            })
            .catch(err => {
                // FAIL CLOSED: Never allow protected access to continue when live authentication verification fails
                console.error('[AUTH INFRASTRUCTURE FAILURE] MongoDB user verification failed:', err.message);
                if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
                    return res.status(503).json({
                        success: false,
                        message: 'Authentication service temporarily unavailable. Please retry shortly.'
                    });
                }
                return res.status(503).render('private/errors/500', {
                    title: 'Service Temporarily Unavailable | Shivay Energy Solutions',
                    message: 'Authentication service temporarily unavailable. Please retry shortly.',
                    user: null
                });
            });
    }

    attachAuthorizationHelpers(req, res);
    req._authVerified = true;
    next();
};

// Generic Access Denied / Security Incident Handler
const handleAccessDenied = (req, res, missingPermission, reason = null) => {
    const user = req.session ? req.session.user : null;
    const userRole = user ? user.role : 'ANONYMOUS';

    let clientIp = '127.0.0.1';
    try {
        clientIp = req.ip || (req.connection && req.connection.remoteAddress) || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    } catch (e) {
        clientIp = '127.0.0.1';
    }

    AuditService.log({
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        user: user ? user._id : null,
        role: userRole,
        targetResource: req.originalUrl || req.url,
        ipAddress: clientIp,
        userAgent: typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'],
        details: { missingPermission, reason, role: userRole }
    });

    if (req.xhr || (req.path && req.path.startsWith('/api/')) || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({
            success: false,
            message: reason || 'Access Denied: You do not possess the required permissions.'
        });
    }

    return res.status(403).render('private/errors/403', {
        title: 'Access Denied | Shivay Energy Solutions',
        message: reason || 'HTTP 403 Forbidden: You do not have permission to access this resource.',
        user
    });
};

// Helper to normalize and flatten permission arguments (handles both spread and array declarations)
const normalizePermissionKeys = (...args) => {
    const flat = args.flat(Infinity);
    return flat
        .filter(k => typeof k === 'string' && k.trim().length > 0)
        .map(k => k.trim());
};

// Require one of the specified roles
const requireRole = (...roles) => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (!user) {
                return handleAccessDenied(req, res, 'auth.required', 'Authentication required.');
            }

            const userRole = user.role;
            // Normalize role matching (e.g., MANAGER matches both MANAGER and BRANCH_MANAGER if either requested)
            const matched = roles.some(r => {
                if (r === userRole) return true;
                if (r === 'BRANCH_MANAGER' && userRole === 'MANAGER') return true;
                if (r === 'MANAGER' && userRole === 'BRANCH_MANAGER') return true;
                return false;
            });

            if (!matched) {
                return handleAccessDenied(req, res, roles.join(','), `HTTP 403 Forbidden: Your role (${userRole}) is not permitted to access this resource.`);
            }

            // Governance Check: Newly created Super Admin with empty permissions
            // Role SUPER_ADMIN alone must NOT grant unrestricted application access if permissions are empty
            if (userRole === 'SUPER_ADMIN' && !AuthorizationService.isPrimarySuperAdmin(user)) {
                if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
                    return handleAccessDenied(req, res, 'admin.unauthorized', 'HTTP 403 Forbidden: Newly created Super Admin has no permissions assigned. Explicit permissions must be granted by the Primary Super Admin.');
                }
            }

            next();
        };

        // Authenticate & refresh session FIRST to prevent evaluating stale cached roles
        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require a specific granular permission (<module>.<feature>.<action>)
const requirePermission = (permissionKey) => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (AuthorizationService.hasPermission(user, permissionKey)) {
                return next();
            }
            return handleAccessDenied(req, res, permissionKey, `Missing required permission: ${permissionKey}`);
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require at least one of the specified permissions (supports both spread and array inputs)
const requireAnyPermission = (...permissionKeys) => {
    const normalized = normalizePermissionKeys(...permissionKeys);
    return (req, res, next) => {
        if (normalized.length === 0) {
            return handleAccessDenied(req, res, 'invalid_permission_declaration', 'Access Denied: Malformed or empty permission declaration.');
        }

        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (AuthorizationService.hasAnyPermission(user, normalized)) {
                return next();
            }
            return handleAccessDenied(req, res, normalized.join(' | '), 'Access Denied: Missing required permission.');
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require all of the specified permissions (supports both spread and array inputs)
const requireAllPermissions = (...permissionKeys) => {
    const normalized = normalizePermissionKeys(...permissionKeys);
    return (req, res, next) => {
        if (normalized.length === 0) {
            return handleAccessDenied(req, res, 'invalid_permission_declaration', 'Access Denied: Malformed or empty permission declaration.');
        }

        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (AuthorizationService.hasAllPermissions(user, normalized)) {
                return next();
            }
            return handleAccessDenied(req, res, normalized.join(' & '), 'Access Denied: You do not possess all required permissions.');
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require access to a top-level module
const requireModuleAccess = (moduleKey) => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (AuthorizationService.hasModuleAccess(user, moduleKey)) {
                return next();
            }
            return handleAccessDenied(req, res, `${moduleKey}.module.access`, `Access to ${moduleKey} module is not permitted for your account.`);
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require access to a specific action
const requireActionAccess = (moduleKey, featureKey, actionKey) => {
    const key = `${moduleKey}.${featureKey}.${actionKey}`;
    return requirePermission(key);
};

// Require access to a sensitive field
const requireFieldAccess = (fieldKey) => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (AuthorizationService.hasFieldAccess(user, fieldKey)) {
                return next();
            }
            return handleAccessDenied(req, res, fieldKey, 'Confidential field access restricted.');
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Hybrid Authorize Middleware: Evaluates combination of module, permission, role, and branch scope
const authorize = (options = {}) => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (!user) {
                return handleAccessDenied(req, res, 'auth.required', 'Authentication required.');
            }

            // Primary Super Admin bypass
            if (AuthorizationService.isPrimarySuperAdmin(user)) {
                return next();
            }

            // 1. Check Module Access if specified
            if (options.module && !AuthorizationService.hasModuleAccess(user, options.module)) {
                return handleAccessDenied(req, res, `${options.module}.module.access`, `Access to ${options.module} module is not permitted.`);
            }

            // 2. Check Specific Permission
            if (options.permission && !AuthorizationService.hasPermission(user, options.permission)) {
                return handleAccessDenied(req, res, options.permission, `Missing required permission: ${options.permission}`);
            }

            // 3. Check Any Permission
            if (Array.isArray(options.anyPermission) && !AuthorizationService.hasAnyPermission(user, options.anyPermission)) {
                return handleAccessDenied(req, res, options.anyPermission.join(' | '), 'Missing required permission.');
            }

            // 4. Check All Permissions
            if (Array.isArray(options.allPermissions) && !AuthorizationService.hasAllPermissions(user, options.allPermissions)) {
                return handleAccessDenied(req, res, options.allPermissions.join(' & '), 'Missing one or more required permissions.');
            }

            // 5. Check Branch Access
            if (options.checkBranch) {
                const branchParam = options.branchParam || 'branchId';
                const targetBranch = (req.params && req.params[branchParam]) || 
                                     (req.body && req.body[branchParam]) || 
                                     (req.query && req.query[branchParam]);
                if (targetBranch && !AuthorizationService.canAccessBranch(user, targetBranch)) {
                    return handleAccessDenied(req, res, 'branch.isolation', 'Branch access restricted: You cannot access records of another branch.');
                }
            }

            next();
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
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
            const val = (req.params && req.params[name]) || (req.body && req.body[name]) || (req.query && req.query[name]);
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
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (!user) return requireAuth(req, res, next);

            // Primary Super Admin has access across all branches
            if (AuthorizationService.isPrimarySuperAdmin(user)) {
                return next();
            }

            const requestedBranch = (req.params && req.params[branchParamName]) || 
                                    (req.body && req.body[branchParamName]) || 
                                    (req.query && req.query[branchParamName]);
            if (requestedBranch && !AuthorizationService.canAccessBranch(user, requestedBranch)) {
                return handleAccessDenied(req, res, 'branch.isolation', 'Forbidden: You cannot access records outside your assigned branch.');
            }

            next();
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
    };
};

// Require appropriate action permission for quotation request status transitions
// Prevents using reject permission to approve, and vice versa
const requireQuotationRequestStatusPermission = () => {
    return (req, res, next) => {
        const evaluate = () => {
            const user = req.session ? req.session.user : null;
            if (!user) return requireAuth(req, res, next);
            if (AuthorizationService.isPrimarySuperAdmin(user)) return next();

            const targetStatus = ((req.body && req.body.status) || '').toUpperCase().trim();
            if (!targetStatus) {
                return handleAccessDenied(req, res, 'quotations.status.missing', 'Invalid request: Target status is required.');
            }

            if (targetStatus === 'REJECTED') {
                if (!AuthorizationService.hasPermission(user, 'quotations.requests.reject')) {
                    return handleAccessDenied(req, res, 'quotations.requests.reject', 'Missing required permission: quotations.requests.reject');
                }
            } else if (targetStatus === 'APPROVED' || targetStatus === 'APPROVE') {
                if (!AuthorizationService.hasPermission(user, 'quotations.approval.approve')) {
                    return handleAccessDenied(req, res, 'quotations.approval.approve', 'Missing required permission: quotations.approval.approve');
                }
            } else {
                // UNDER_REVIEW, REVISION_REQUESTED, RESUBMITTED
                if (!AuthorizationService.hasPermission(user, 'quotations.requests.edit') &&
                    !AuthorizationService.hasPermission(user, 'quotations.requests.reject')) {
                    return handleAccessDenied(req, res, 'quotations.requests.edit', 'Missing required permission: quotations.requests.edit');
                }
            }
            next();
        };

        if (req._authVerified) {
            return evaluate();
        }
        return requireAuth(req, res, () => evaluate());
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
    validateObjectId,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
    requireModuleAccess,
    requireActionAccess,
    requireFieldAccess,
    requireQuotationRequestStatusPermission,
    authorize,
    normalizePermissionKeys,
    AuthorizationService
};
