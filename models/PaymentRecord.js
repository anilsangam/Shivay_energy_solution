const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
    paymentId: {
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
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    amount: {
        type: Number,
        required: [true, 'Payment amount is required'],
        min: [0.01, 'Payment amount must be greater than zero']
    },
    paymentMode: {
        type: String,
        enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI_ONLINE', 'OTHER'],
        default: 'BANK_TRANSFER'
    },
    transactionRef: {
        type: String,
        trim: true,
        default: ''
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    receiptUrl: {
        type: String,
        trim: true,
        default: ''
    },
    receiptFilename: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['PENDING', 'VERIFIED', 'FAILED', 'PARTIALLY_PAID', 'REJECTED'],
        default: 'PENDING'
    },
    enteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
    rejectionReason: {
        type: String,
        trim: true,
        default: ''
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

paymentRecordSchema.index({ customerId: 1 });
paymentRecordSchema.index({ quotationId: 1 });
paymentRecordSchema.index({ projectId: 1 });
paymentRecordSchema.index({ branch: 1, status: 1 });
paymentRecordSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', paymentRecordSchema);
