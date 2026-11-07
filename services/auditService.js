const AuditLog = require('../models/AuditLog');

class AuditService {
    static async log(eventData) {
        try {
            await AuditLog.create(eventData);
        } catch (err) {
            // Log to console if DB write fails, but don't crash request
            console.warn(`[AUDIT EVENT] ${eventData.action}: User=${eventData.user || 'Guest'} Details=${JSON.stringify(eventData.details || {})}`);
        }
    }
}

module.exports = AuditService;
