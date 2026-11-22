const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
    amount: { type: Number, required: true, min: [0.01, 'Payment amount must be greater than zero'] },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { type: String, default: 'Bank Transfer (NEFT/RTGS/UPI)' },
    transactionRef: { type: String, default: '', trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '', trim: true }
}, { _id: true });

const invoiceVersionSchema = new mongoose.Schema({
    version: { type: Number, required: true },
    customerName: { type: String },
    customerMobile: { type: String },
    customerGstin: { type: String },
    customerAddress: { type: String },
    plantCapacityKw: { type: Number },
    items: [{
        description: String,
        hsnCode: { type: String, default: '8541' },
        qty: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: { type: Number, required: true },
    gstRate: { type: Number, default: 12 },
    cgst: { type: Number },
    sgst: { type: Number },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, default: 'unpaid' },
    paymentMethod: { type: String },
    invoiceDate: { type: String },
    discomConsumerNo: { type: String },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    payments: [paymentTransactionSchema],
    updatedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    version: { type: Number, default: 1 },
    previousVersions: [invoiceVersionSchema],
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerName: { type: String, required: true },
    customerMobile: { type: String, required: true },
    customerGstin: { type: String },
    customerAddress: { type: String },
    plantCapacityKw: { type: Number },
    items: [{
        description: { type: String, required: true },
        hsnCode: { type: String, default: '8541' },
        qty: { type: Number, required: true, min: [0.001, 'Quantity must be positive'] },
        rate: { type: Number, required: true, min: [0, 'Rate cannot be negative'] },
        amount: { type: Number, required: true, min: [0, 'Amount cannot be negative'] }
    }],
    subtotal: { type: Number, required: true, min: [0, 'Subtotal cannot be negative'] },
    gstRate: { type: Number, default: 12 }, // Solar in India GST is typically 12% (concessional composite)
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    gstAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, min: [0, 'Total amount cannot be negative'] },
    paidAmount: { type: Number, default: 0, min: [0, 'Paid amount cannot be negative'] },
    balanceAmount: { 
        type: Number, 
        default: function() {
            return this.totalAmount !== undefined ? this.totalAmount : 0;
        }, 
        min: [0, 'Balance amount cannot be negative'] 
    },
    paymentStatus: { 
        type: String, 
        enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'], 
        default: 'unpaid' 
    },
    paymentMethod: { type: String, default: 'Bank Transfer (NEFT/RTGS/UPI)' },
    payments: [paymentTransactionSchema],
    invoiceDate: { type: String },
    discomConsumerNo: { type: String },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    dueDate: { type: Date },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

invoiceSchema.pre('validate', function() {
    if (this.totalAmount !== undefined && this.totalAmount !== null) {
        const paid = Number(this.paidAmount || 0);
        const total = Number(this.totalAmount || 0);
        this.balanceAmount = Math.max(0, Math.round((total - paid) * 100) / 100);
        if (paid === 0) {
            this.paymentStatus = 'unpaid';
        } else if (paid >= total && total > 0) {
            this.paymentStatus = 'paid';
        } else if (paid > 0 && paid < total) {
            this.paymentStatus = 'partially_paid';
        }
    }
});

invoiceSchema.index({ isArchived: 1, createdAt: -1 });
invoiceSchema.index({ branch: 1, isArchived: 1, createdAt: -1 });
invoiceSchema.index({ createdByUser: 1, isArchived: 1, createdAt: -1 });
invoiceSchema.index({ paymentStatus: 1 });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
