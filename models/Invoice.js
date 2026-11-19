const mongoose = require('mongoose');

const invoiceVersionSchema = new mongoose.Schema({
    version: { type: Number, required: true },
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
    paymentStatus: { type: String },
    paymentMethod: { type: String },
    invoiceDate: { type: String },
    plantCapacityKw: { type: Number },
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
        description: String,
        hsnCode: { type: String, default: '8541' },
        qty: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: { type: Number, required: true },
    gstRate: { type: Number, default: 12 }, // Solar in India GST is typically 12% (concessional composite)
    cgst: { type: Number },
    sgst: { type: Number },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: { 
        type: String, 
        enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'], 
        default: 'paid' 
    },
    paymentMethod: { type: String, default: 'Bank Transfer (NEFT/RTGS/UPI)' },
    invoiceDate: { type: String },
    discomConsumerNo: { type: String },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    dueDate: { type: Date },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

invoiceSchema.index({ isArchived: 1, createdAt: -1 });
invoiceSchema.index({ branch: 1, isArchived: 1, createdAt: -1 });
invoiceSchema.index({ createdByUser: 1, isArchived: 1, createdAt: -1 });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
