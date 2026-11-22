const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

const inMemoryLogs = [
    {
        _id: 'log-seed-1',
        action: 'LOGIN_SUCCESS',
        role: 'SUPER_ADMIN',
        targetResource: '/admin',
        ipAddress: '127.0.0.1',
        details: { portal: 'ADMIN', system: 'Shivay Energy Control Panel' },
        createdAt: new Date()
    },
    {
        _id: 'log-seed-2',
        action: 'ROLE_CHANGE',
        role: 'SUPER_ADMIN',
        targetResource: '/api/admin/users/create',
        ipAddress: '127.0.0.1',
        details: { note: 'Role-based access control verified' },
        createdAt: new Date(Date.now() - 3600000)
    }
];

// Sensitive keys that must NEVER be persisted in audit log details
const SENSITIVE_KEY_REGEX = /(password|passwd|pwd|token|accesstoken|refreshtoken|otp|secret|session|sessionid|cookie|cvv|pin|creditcard|authorization|apikey|authheader)/i;

function sanitizeAuditDetails(data) {
    if (!data || typeof data !== 'object') return data;
    if (data instanceof Date || (typeof mongoose !== 'undefined' && data instanceof mongoose.Types.ObjectId)) {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(item => sanitizeAuditDetails(item));
    }

    const clean = {};
    for (const key of Object.keys(data)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
            clean[key] = '[REDACTED]';
        } else if (typeof data[key] === 'object' && data[key] !== null) {
            clean[key] = sanitizeAuditDetails(data[key]);
        } else {
            clean[key] = data[key];
        }
    }
    return clean;
}

class AuditService {
    static sanitizeAuditDetails(data) {
        return sanitizeAuditDetails(data);
    }
    /**
     * Standard asynchronous audit logging (non-blocking)
     */
    static async log(eventData) {
        if (!eventData || !eventData.action) return;

        const sanitizedDetails = sanitizeAuditDetails(eventData.details || {});
        const sanitizedData = {
            ...eventData,
            details: sanitizedDetails
        };

        const entry = {
            _id: new mongoose.Types.ObjectId(),
            ...sanitizedData,
            createdAt: new Date()
        };
        inMemoryLogs.unshift(entry);
        if (inMemoryLogs.length > 200) inMemoryLogs.pop();

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                await AuditLog.create(sanitizedData);
            } catch (err) {
                console.warn(`[AUDIT EVENT] ${sanitizedData.action}: User=${sanitizedData.user || 'Guest'}`);
            }
        } else {
            console.log(`[AUDIT EVENT] ${sanitizedData.action}: User=${sanitizedData.user || 'Guest'} Details=${JSON.stringify(sanitizedDetails)}`);
        }
    }

    /**
     * Durable audit logging for critical operations (permissions, roles, financial modifications)
     * Throws on failure when MongoDB is active to prevent un-audited privileged mutations.
     */
    static async logDurable(eventData) {
        if (!eventData || !eventData.action) {
            throw new Error('Audit action is required for durable audit logging.');
        }

        const sanitizedDetails = sanitizeAuditDetails(eventData.details || {});
        const sanitizedData = {
            ...eventData,
            details: sanitizedDetails
        };

        const entry = {
            _id: new mongoose.Types.ObjectId(),
            ...sanitizedData,
            createdAt: new Date()
        };
        inMemoryLogs.unshift(entry);
        if (inMemoryLogs.length > 200) inMemoryLogs.pop();

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                return await AuditLog.create(sanitizedData);
            } catch (err) {
                console.error('[CRITICAL AUDIT PERSISTENCE FAILURE]', err.message);
                throw new Error(`Durable audit logging failed: ${err.message}`);
            }
        } else {
            console.log(`[AUDIT EVENT DURABLE] ${sanitizedData.action}: User=${sanitizedData.user || 'Guest'} Details=${JSON.stringify(sanitizedDetails)}`);
            return entry;
        }
    }

    /**
     * Retrieve recent logs with support for pagination and filtering
     */
    static async getRecentLogs(limit = 20, options = {}) {
        const page = Math.max(1, parseInt(options.page) || 1);
        const actualLimit = Math.max(1, parseInt(limit) || 20);
        const skip = (page - 1) * actualLimit;

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const query = {};
                if (options.branchId) query.branchId = options.branchId;
                if (options.action) query.action = options.action;

                return await AuditLog.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(actualLimit)
                    .populate('user', 'name email role employeeId')
                    .populate('targetUser', 'name email role employeeId')
                    .lean();
            } catch (err) {
                return inMemoryLogs.slice(skip, skip + actualLimit);
            }
        }
        return inMemoryLogs.slice(skip, skip + actualLimit);
    }
}

module.exports = AuditService;
