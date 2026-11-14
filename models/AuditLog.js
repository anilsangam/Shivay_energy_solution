const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            'LOGIN_SUCCESS',
            'LOGIN_FAILED',
            'LOGOUT',
            'PASSWORD_CHANGE',
            'ACCOUNT_SUSPENDED',
            'ACCOUNT_ACTIVATED',
            'EMPLOYEE_APPROVED',
            'EMPLOYEE_REJECTED',
            'ROLE_CHANGE',
            'BRANCH_REASSIGNED',
            'INVOICE_GENERATED',
            'INVOICE_MODIFIED',
            'QUOTATION_GENERATED',
            'ATTENDANCE_SUBMITTED',
            'ATTENDANCE_CORRECTED',
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'MANAGER_ASSIGNED',
            'PROFILE_UPDATED',
            'STATUS_CHANGE'
        ]
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    role: String,
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    targetResource: String,
    ipAddress: String,
    userAgent: String,
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    details: mongoose.Schema.Types.Mixed
}, { timestamps: true });

auditLogSchema.index({ user: 1 });
auditLogSchema.index({ targetUser: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
