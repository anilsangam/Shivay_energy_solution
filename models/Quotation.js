const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
    quotationNumber: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerMobile: { type: String, required: true },
    customerEmail: { type: String },
    customerAddress: { type: String },
    plantCapacityKw: { type: Number, required: true },
    panelSpecs: { type: String, default: '540W Mono PERC Half-Cut (DCR Compliant)' },
    panelQty: { type: Number },
    inverterSpecs: { type: String, default: 'On-Grid Dual MPPT Inverter' },
    grossAmount: { type: Number, required: true },
    estimatedSubsidy: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    validUntil: { type: Date },
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    status: { 
        type: String, 
        enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'], 
        default: 'sent' 
    }
}, { timestamps: true });

module.exports = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
