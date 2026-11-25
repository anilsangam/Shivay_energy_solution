const mongoose = require('mongoose');

const branchOverrideSchema = new mongoose.Schema({
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    policyType: {
        type: String,
        enum: ['FULL_PAYMENT_100', 'PARTIAL_ADVANCE_PERCENTAGE'],
        default: 'PARTIAL_ADVANCE_PERCENTAGE'
    },
    minAdvancePercentage: {
        type: Number,
        default: 20,
        min: 0,
        max: 100
    }
}, { _id: false });

const paymentExceptionSchema = new mongoose.Schema({
    exceptionId: { type: String, required: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, trim: true },
    status: { type: String, enum: ['REQUESTED', 'APPROVED', 'REJECTED'], default: 'REQUESTED' },
    reason: { type: String, required: true, trim: true },
    waivedPercentage: { type: Number, default: 0 },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' }
}, { _id: true, timestamps: true });

const paymentPolicySchema = new mongoose.Schema({
    policyKey: {
        type: String,
        required: true,
        unique: true,
        default: 'GLOBAL_PAYMENT_POLICY'
    },
    policyType: {
        type: String,
        enum: ['FULL_PAYMENT_100', 'PARTIAL_ADVANCE_PERCENTAGE'],
        default: 'PARTIAL_ADVANCE_PERCENTAGE'
    },
    defaultAdvancePercentage: {
        type: Number,
        default: 20,
        min: 0,
        max: 100
    },
    branchOverrides: [branchOverrideSchema],
    allowExceptionApproval: {
        type: Boolean,
        default: true
    },
    exceptions: [paymentExceptionSchema],
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.models.PaymentPolicy || mongoose.model('PaymentPolicy', paymentPolicySchema);
