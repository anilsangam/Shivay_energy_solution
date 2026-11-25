const mongoose = require('mongoose');

const customerDocumentSchema = new mongoose.Schema({
    documentId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    quotationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation'
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    category: {
        type: String,
        enum: [
            'IDENTITY_PROOF',
            'ADDRESS_PROOF',
            'ELECTRICITY_BILL',
            'SITE_PHOTOGRAPHS',
            'PROPERTY_DOCUMENTS',
            'BANK_PAYMENT_DOCUMENTS',
            'OTHER'
        ],
        default: 'OTHER'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    originalFilename: {
        type: String,
        required: true,
        trim: true
    },
    fileUrl: {
        type: String,
        required: true,
        trim: true
    },
    mimeType: {
        type: String,
        default: 'application/octet-stream'
    },
    fileSizeBytes: {
        type: Number,
        default: 0
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

customerDocumentSchema.index({ customerId: 1 });
customerDocumentSchema.index({ leadId: 1 });
customerDocumentSchema.index({ quotationId: 1 });
customerDocumentSchema.index({ projectId: 1 });
customerDocumentSchema.index({ category: 1 });

module.exports = mongoose.models.CustomerDocument || mongoose.model('CustomerDocument', customerDocumentSchema);
