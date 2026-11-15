const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
    description: { type: String, required: true, trim: true },
    productRef: { type: String, trim: true },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0.1, default: 1 },
    unit: { type: String, default: 'Nos', trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    taxableAmount: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 12, min: 0 }, // e.g. 12%
    lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
    quotationNumber: {
        type: String,
        required: [true, 'Quotation number is required'],
        unique: true,
        trim: true
    },
    version: {
        type: Number,
        default: 1,
        min: 1
    },
    previousVersion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation',
        default: null
    },
    quotationRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuotationRequest'
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    // Customer Snapshot
    customerName: { type: String, required: true, trim: true },
    customerMobile: { type: String, required: true, trim: true },
    customerEmail: { type: String, lowercase: true, trim: true },
    customerAddress: { type: String, trim: true },
    city: { type: String, default: 'Raisen', trim: true },
    district: { type: String, default: 'Raisen', trim: true },
    state: { type: String, default: 'Madhya Pradesh', trim: true },
    pincode: { type: String, trim: true },
    consumerNumber: { type: String, trim: true },
    discom: { type: String, default: 'MPPKVVCL', trim: true },

    // Technical Specifications
    plantCapacityKw: { type: Number, required: true, min: 0.5 },
    systemType: { type: String, default: 'ON_GRID', trim: true },
    panelSpecs: { type: String, default: '540W Mono PERC Half-Cut (DCR Compliant)', trim: true },
    panelQty: { type: Number, default: 0 },
    inverterSpecs: { type: String, default: 'On-Grid Dual MPPT Solar Inverter', trim: true },
    inverterQty: { type: Number, default: 1 },
    batterySpecs: { type: String, trim: true },
    structureSpecs: { type: String, default: 'HDG Elevated Mounting Structure (Wind speed 150 km/h)', trim: true },

    // Line Items
    lineItems: [lineItemSchema],

    // Financial Values (Server-Side Authoritative)
    subtotal: { type: Number, required: true, default: 0 },
    itemDiscountsTotal: { type: Number, default: 0 },
    specialDiscount: { type: Number, default: 0 },
    taxableValue: { type: Number, required: true, default: 0 },
    gstRate: { type: Number, default: 12 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalGstAmount: { type: Number, required: true, default: 0 },
    grossTotal: { type: Number, required: true, default: 0 }, // taxableValue + totalGstAmount
    estimatedSubsidy: { type: Number, default: 0 }, // PM Surya Ghar Subsidy
    grandTotal: { type: Number, required: true, default: 0 }, // grossTotal - specialDiscount
    netPayableAfterSubsidy: { type: Number, required: true, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    // Subsidy Verification & Lifecycle Snapshot (Authoritative)
    subsidyDetails: {
        schemeName: { type: String, default: 'PM Surya Ghar: Muft Bijli Yojana' },
        status: {
            type: String,
            enum: ['ESTIMATED', 'UNVERIFIED', 'VERIFIED', 'SUBMITTED', 'APPROVED', 'CREDITED', 'INELIGIBLE'],
            default: 'ESTIMATED'
        },
        estimatedAmount: { type: Number, default: 0 },
        disclaimer: {
            type: String,
            default: 'Subsidy shown is an indicative estimate subject to applicable government scheme guidelines, customer eligibility, DISCOM verification, installation requirements and final government approval. Actual subsidy may differ.'
        },
        applicationNumber: { type: String, trim: true },
        verifiedAt: { type: Date }
    },

    // Payment Milestone Policy Snapshot (Auditable & Immutable per quotation)
    paymentPolicy: {
        basis: {
            type: String,
            enum: ['CONTRACT_VALUE', 'CUSTOMER_CONTRIBUTION', 'CUSTOM_MILESTONES'],
            default: 'CONTRACT_VALUE'
        },
        advancePercentage: { type: Number, default: 20 },
        advanceAmount: { type: Number, default: 0 },
        deliveryPercentage: { type: Number, default: 60 },
        deliveryAmount: { type: Number, default: 0 },
        commissioningPercentage: { type: Number, default: 20 },
        commissioningAmount: { type: Number, default: 0 },
        totalMilestonesAmount: { type: Number, default: 0 }
    },

    // Tax Compliance Snapshot
    taxSnapshot: {
        isIntraState: { type: Boolean, default: true },
        gstRate: { type: Number, default: 12 },
        cgstRate: { type: Number, default: 6 },
        sgstRate: { type: Number, default: 6 },
        igstRate: { type: Number, default: 0 },
        taxMethod: { type: String, default: 'STANDARD_SOLAR_GST' },
        caVerificationStatus: { type: String, default: 'PENDING_CA_REVIEW' }
    },

    // Terms & Conditions
    validUntil: { type: Date, required: true },
    paymentTerms: {
        type: String,
        default: '20% advance with work order, 60% on material delivery at site, 20% on testing and commissioning.',
        trim: true
    },
    deliveryTerms: {
        type: String,
        default: 'Material delivery within 7-10 working days from advance payment.',
        trim: true
    },
    warrantyTerms: {
        type: String,
        default: '25 Years linear performance warranty on Solar PV Modules; 5 Years comprehensive replacement on Solar Inverter; 5 Years on EPC Workmanship.',
        trim: true
    },
    scopeOfWork: {
        type: String,
        default: 'Design, engineering, supply, installation, testing and commissioning of rooftop solar PV power plant, including liaison for Net Metering approval with MPPKVVCL.',
        trim: true
    },
    exclusions: {
        type: String,
        default: 'Civil masonry alteration, incoming grid supply enhancement, meter test fee / DISCOM deposit if demanded directly.',
        trim: true
    },
    notes: { type: String, trim: true },
    termsAndConditions: { type: String, trim: true },

    // Workflow & Approval
    status: {
        type: String,
        enum: [
            'DRAFT',
            'PENDING_APPROVAL',
            'APPROVED',
            'SHARED',
            'CUSTOMER_ACCEPTED',
            'CUSTOMER_REJECTED',
            'EXPIRED',
            'CANCELLED'
        ],
        default: 'PENDING_APPROVAL'
    },
    preparedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedEmployee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    approvalComments: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    branch: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Branch'
    },
    pdfPath: { type: String, trim: true },

    // Customer Engagement & Acceptance
    sharedAt: { type: Date },
    shareChannel: { type: String, enum: ['WHATSAPP', 'EMAIL', 'DIRECT_DOWNLOAD', 'MANUAL'], default: null },
    customerResponse: {
        status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
        responseDate: { type: Date },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: { type: String, trim: true },
        acceptanceToken: { type: String, unique: true, sparse: true },
        tokenExpiresAt: { type: Date }
    }
}, {
    timestamps: true,
    strictPopulate: false
});

quotationSchema.index({ status: 1 });
quotationSchema.index({ preparedBy: 1 });
quotationSchema.index({ approvedBy: 1 });
quotationSchema.index({ customerId: 1 });
quotationSchema.index({ quotationRequestId: 1 });
quotationSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
