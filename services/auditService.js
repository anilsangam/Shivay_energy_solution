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

class AuditService {
    static async log(eventData) {
        const entry = {
            _id: new mongoose.Types.ObjectId(),
            ...eventData,
            createdAt: new Date()
        };
        inMemoryLogs.unshift(entry);
        if (inMemoryLogs.length > 100) inMemoryLogs.pop();

        if (mongoose.connection.readyState === 1) {
            try {
                await AuditLog.create(eventData);
            } catch (err) {
                console.warn(`[AUDIT EVENT] ${eventData.action}: User=${eventData.user || 'Guest'}`);
            }
        } else {
            console.log(`[AUDIT EVENT] ${eventData.action}: User=${eventData.user || 'Guest'} Details=${JSON.stringify(eventData.details || {})}`);
        }
    }

    static async getRecentLogs(limit = 20) {
        if (mongoose.connection.readyState === 1) {
            try {
                return await AuditLog.find({})
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .populate('user', 'name email role employeeId')
                    .populate('targetUser', 'name email role employeeId');
            } catch (err) {
                return inMemoryLogs.slice(0, limit);
            }
        }
        return inMemoryLogs.slice(0, limit);
    }
}

module.exports = AuditService;
