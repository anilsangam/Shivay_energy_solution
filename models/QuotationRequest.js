const mongoose = require('mongoose');

const quotationRequestSchema = new mongoose.Schema({
    requestNumber: {
        type: String,
        required: [true, 'Request number is required'],
        unique: true,
        trim: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    customerName: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true
    },
    customerMobile: {
        type: String,
        required: [true, 'Customer mobile is required'],
        trim: true
    },
    customerEmail: {
        type: String,
        lowercase: true,
        trim: true
    },
    siteAddress: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        default: 'Raisen',
        trim: true
    },
    district: {
        type: String,
        default: 'Raisen',
        trim: true
    },
    sanctionedLoadKw: {
        type: Number
    },
    proposedCapacityKw: {
        type: Number,
        required: [true, 'Proposed capacity in kW is required']
    },
    roofType: {
        type: String,
        enum: ['RCC_FLAT', 'TIN_SHED', 'TILED', 'GROUND_MOUNT', 'OTHER'],
        default: 'RCC_FLAT'
    },
    systemType: {
        type: String,
        enum: ['ON_GRID', 'OFF_GRID', 'HYBRID', 'SOLAR_PUMP'],
        default: 'ON_GRID'
    },
    monthlyElectricityBill: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['SUBMITTED', 'ASSIGNED', 'SURVEY_SCHEDULED', 'SURVEY_COMPLETED', 'QUOTATION_PREPARED', 'APPROVED', 'REJECTED', 'CANCELLED'],
        default: 'SUBMITTED'
    },
    assignedEmployee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    notes: [{
        text: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

quotationRequestSchema.index({ requestNumber: 1 });
quotationRequestSchema.index({ status: 1 });
quotationRequestSchema.index({ customer: 1 });
quotationRequestSchema.index({ assignedEmployee: 1 });
quotationRequestSchema.index({ assignedManager: 1 });
quotationRequestSchema.index({ branch: 1 });

module.exports = mongoose.models.QuotationRequest || mongoose.model('QuotationRequest', quotationRequestSchema);
