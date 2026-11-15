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
    // Customer Snapshot
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
    customerAlternateMobile: {
        type: String,
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
    state: {
        type: String,
        default: 'Madhya Pradesh',
        trim: true
    },
    pincode: {
        type: String,
        trim: true
    },
    consumerNumber: {
        type: String,
        trim: true
    },
    discom: {
        type: String,
        default: 'MPPKVVCL',
        trim: true
    },
    customerType: {
        type: String,
        enum: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL'],
        default: 'RESIDENTIAL'
    },
    // Solar Technical Requirements
    sanctionedLoadKw: {
        type: Number,
        default: 0
    },
    proposedCapacityKw: {
        type: Number,
        required: [true, 'Proposed capacity in kW is required'],
        min: [0.5, 'Minimum capacity is 0.5 kW']
    },
    systemType: {
        type: String,
        enum: ['ON_GRID', 'OFF_GRID', 'HYBRID', 'SOLAR_PUMP'],
        default: 'ON_GRID'
    },
    roofType: {
        type: String,
        enum: ['RCC_FLAT', 'TIN_SHED', 'TILED', 'GROUND_MOUNT', 'OTHER'],
        default: 'RCC_FLAT'
    },
    roofAreaSqFt: {
        type: Number,
        default: 0
    },
    monthlyElectricityBill: {
        type: Number,
        default: 0
    },
    monthlyUnitsKwh: {
        type: Number,
        default: 0
    },
    existingSolar: {
        type: Boolean,
        default: false
    },
    expectedBudget: {
        type: Number,
        default: 0
    },
    installationLocation: {
        type: String,
        trim: true
    },
    // Equipment & Line Requirements
    equipment: [{
        itemName: { type: String, required: true, trim: true },
        productRef: { type: String, trim: true },
        quantity: { type: Number, default: 1, min: 1 },
        specs: { type: String, trim: true },
        remarks: { type: String, trim: true }
    }],
    additionalRequirements: {
        type: String,
        trim: true
    },
    employeeNotes: {
        type: String,
        trim: true
    },
    customerInstructions: {
        type: String,
        trim: true
    },
    // Supporting Attachments
    attachments: [{
        fileId: { type: String, required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        path: { type: String, required: true },
        cloudinaryUrl: { type: String },
        cloudinaryPublicId: { type: String },
        category: { type: String, default: 'OTHER' }, // ELECTRICITY_BILL, SITE_PHOTO, ROOF_PHOTO, OTHER
        uploadedAt: { type: Date, default: Date.now }
    }],
    // Workflow Statuses
    status: {
        type: String,
        enum: [
            'DRAFT',
            'SUBMITTED',
            'UNDER_REVIEW',
            'REVISION_REQUESTED',
            'RESUBMITTED',
            'QUOTATION_PREPARED',
            'REJECTED'
        ],
        default: 'SUBMITTED'
    },
    revisionComments: {
        type: String,
        trim: true
    },
    rejectionReason: {
        type: String,
        trim: true
    },
    // Organizational Context
    assignedEmployee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedManager: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'User'
    },
    branch: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Branch'
    },
    // Linked Prepared Quotation (Phase 2 link)
    linkedQuotation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation'
    },
    notes: [{
        text: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for customerSnapshot
quotationRequestSchema.virtual('customerSnapshot').get(function() {
    return {
        name: this.customerName || (this.customer && this.customer.name) || 'Customer',
        mobile: this.customerMobile || (this.customer && this.customer.mobile) || '',
        alternateMobile: this.customerAlternateMobile || '',
        email: this.customerEmail || (this.customer && this.customer.email) || '',
        siteAddress: this.siteAddress || (this.customer && this.customer.address) || '',
        city: this.city || (this.customer && this.customer.city) || 'Raisen',
        district: this.district || (this.customer && this.customer.district) || 'Raisen',
        state: this.state || (this.customer && this.customer.state) || 'Madhya Pradesh',
        pincode: this.pincode || (this.customer && this.customer.pincode) || '',
        consumerNumber: this.consumerNumber || '',
        discom: this.discom || 'MPPKVVCL',
        customerType: this.customerType || 'RESIDENTIAL'
    };
});

// Virtual for solarRequirements
quotationRequestSchema.virtual('solarRequirements')
    .get(function() {
        return {
            proposedCapacityKw: this.proposedCapacityKw || 0,
            systemType: this.systemType || 'ON_GRID',
            roofType: this.roofType || 'RCC_FLAT',
            roofAreaSqFt: this.roofAreaSqFt || 0,
            monthlyElectricityBill: this.monthlyElectricityBill || 0,
            monthlyUnitsKwh: this.monthlyUnitsKwh || 0,
            existingSolarInstallation: this.existingSolar || false,
            budgetExpected: this.expectedBudget || 0,
            additionalRequirements: this.additionalRequirements || ''
        };
    })
    .set(function(v) {
        if (v && typeof v === 'object') {
            if (v.proposedCapacityKw !== undefined) this.proposedCapacityKw = v.proposedCapacityKw;
            if (v.systemType !== undefined) this.systemType = v.systemType;
            if (v.roofType !== undefined) this.roofType = v.roofType;
            if (v.roofAreaSqFt !== undefined) this.roofAreaSqFt = v.roofAreaSqFt;
            if (v.monthlyElectricityBill !== undefined) this.monthlyElectricityBill = v.monthlyElectricityBill;
            if (v.existingSolarInstallation !== undefined) this.existingSolar = v.existingSolarInstallation;
            if (v.budgetExpected !== undefined) this.expectedBudget = v.budgetExpected;
            if (v.additionalRequirements !== undefined) this.additionalRequirements = v.additionalRequirements;
        }
    });

quotationRequestSchema.index({ status: 1 });
quotationRequestSchema.index({ customer: 1 });
quotationRequestSchema.index({ customerMobile: 1 });
quotationRequestSchema.index({ assignedEmployee: 1 });
quotationRequestSchema.index({ assignedManager: 1 });
quotationRequestSchema.index({ branch: 1 });
quotationRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.models.QuotationRequest || mongoose.model('QuotationRequest', quotationRequestSchema);
