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
            'ACCOUNT_DEACTIVATED',
            'USER_DELETED',
            'STATUS_CHANGE',
            'EMPLOYEE_APPROVED',
            'EMPLOYEE_REJECTED',
            'ROLE_CHANGE',
            'MANAGER_ASSIGNED',
            'BRANCH_REASSIGNED',
            'PERMISSIONS_UPDATE',
            'PERMISSIONS_UPDATED',
            'FIELD_PERMISSIONS_UPDATED',
            'DATA_SCOPE_CHANGED',
            'AUTHORIZED_BRANCHES_UPDATED',
            'INVOICE_GENERATED',
            'INVOICE_UPDATED',
            'INVOICE_MODIFIED',
            'INVOICE_CANCELLED',
            'INVOICE_PAYMENT_RECORDED',
            'INVOICE_PAYMENT_REVERSED',
            'QUOTATION_GENERATED',
            'QUOTATION_APPROVED',
            'QUOTATION_REJECTED',
            'ATTENDANCE_SUBMITTED',
            'ATTENDANCE_CORRECTED',
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            'PROFILE_UPDATED',
            'SETTINGS_UPDATED',
            'MATERIAL_CREATED',
            'MATERIAL_UPDATED',
            'MATERIAL_STATUS_CHANGED',
            'SUPPLIER_CREATED',
            'SUPPLIER_UPDATED',
            'PURCHASE_CREATED',
            'PURCHASE_RECEIVED',
            'PURCHASE_CANCELLED',
            'STOCK_ADJUSTED',
            'SELLING_PRICE_UPDATED',
            'LEAD_CREATED',
            'LEAD_IMPORTED',
            'LEAD_ASSIGNED',
            'LEAD_REASSIGNED',
            'LEAD_CALL_LOGGED',
            'LEAD_STATUS_CHANGED',
            'LEAD_FOLLOWUP_SCHEDULED',
            'LEAD_CONVERTED',
            'INSPECTION_CREATED',
            'INSPECTION_SUBMITTED',
            'INSPECTION_VERIFIED',
            'INSPECTION_PHOTO_UPLOADED',
            'CUSTOMER_DOCUMENT_UPLOADED',
            'CUSTOMER_ACCEPTED_QUOTATION',
            'CUSTOMER_REJECTED_QUOTATION',
            'PAYMENT_RECORDED',
            'PAYMENT_VERIFIED',
            'PAYMENT_REJECTED',
            'PAYMENT_EXCEPTION_APPROVED',
            'PROJECT_ACTIVATED',
            'PROJECT_ASSIGNED',
            'PROJECT_STATUS_UPDATED',
            'MATERIAL_ALLOCATED',
            'SERIAL_REGISTERED',
            'SERIAL_STATUS_UPDATED',
            'MATERIAL_DISPATCHED',
            'INSTALLATION_STARTED',
            'INSTALLATION_COMPLETED',
            'PROJECT_HANDOVER_COMPLETED',
            'COMPLAINT_CREATED',
            'COMPLAINT_ASSIGNED',
            'COMPLAINT_TRANSFERRED',
            'COMPLAINT_TECHNICIAN_ASSIGNED',
            'COMPLAINT_PROGRESS_UPDATED',
            'COMPLAINT_RESOLVED',
            'COMPLAINT_CLOSED',
            'COMPLAINT_REOPENED',
            'COMPLAINT_LINKED'
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

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, createdAt: -1 });
auditLogSchema.index({ branchId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
