const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
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
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: { 
        type: String, 
        enum: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'], 
        default: 'unpaid' 
    },
    paymentMethod: { type: String, default: 'Bank Transfer (NEFT/RTGS/UPI)' },
    dueDate: { type: Date },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
