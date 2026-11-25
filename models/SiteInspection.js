const mongoose = require('mongoose');

const inspectionPhotoSchema = new mongoose.Schema({
    photoId: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    originalName: {
        type: String,
        trim: true,
        default: 'site_photo.jpg'
    },
    category: {
        type: String,
        enum: ['ROOF_TOP', 'METER_BOX', 'DISTRIBUTION_BOX', 'SHADOW_ANALYSIS', 'INVERTER_LOCATION', 'STRUCTURE_AREA', 'OTHER'],
        default: 'ROOF_TOP'
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    accuracyMeters: {
        type: Number,
        default: null
    },
    isGpsVerified: {
        type: Boolean,
        default: false
    },
    gpsUnavailableReason: {
        type: String,
        trim: true,
        default: ''
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const siteInspectionSchema = new mongoose.Schema({
    inspectionId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    assignedFieldEngineer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
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
    siteAddress: {
        type: String,
        trim: true,
        default: ''
    },
    city: {
        type: String,
        trim: true,
        default: 'Raisen'
    },
    district: {
        type: String,
        trim: true,
        default: 'Raisen'
    },
    state: {
        type: String,
        trim: true,
        default: 'Madhya Pradesh'
    },
    pincode: {
        type: String,
        trim: true,
        default: ''
    },
    coordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        accuracyMeters: { type: Number, default: null },
        isGpsVerified: { type: Boolean, default: false },
        gpsUnavailableReason: { type: String, trim: true, default: '' }
    },
    roofType: {
        type: String,
        enum: ['RCC_FLAT', 'METAL_SHEET', 'SLOPED_TILE', 'ASBESTOS', 'GROUND_MOUNT', 'OTHER'],
        default: 'RCC_FLAT'
    },
    totalRoofAreaSqFt: {
        type: Number,
        default: 0,
        min: 0
    },
    shadowFreeAreaSqFt: {
        type: Number,
        default: 0,
        min: 0
    },
    sanctionedLoadKw: {
        type: Number,
        default: 0,
        min: 0
    },
    monthlyBillAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    monthlyUnitsKwh: {
        type: Number,
        default: 0,
        min: 0
    },
    discomConsumerNo: {
        type: String,
        trim: true,
        default: ''
    },
    discom: {
        type: String,
        trim: true,
        default: 'MPPKVVCL'
    },
    connectionPhase: {
        type: String,
        enum: ['SINGLE_PHASE', 'THREE_PHASE'],
        default: 'SINGLE_PHASE'
    },
    recommendedCapacityKw: {
        type: Number,
        default: 0,
        min: 0
    },
    dcCableLengthMeters: {
        type: Number,
        default: 0,
        min: 0
    },
    acCableLengthMeters: {
        type: Number,
        default: 0,
        min: 0
    },
    inverterLocation: {
        type: String,
        trim: true,
        default: ''
    },
    earthingPitLocation: {
        type: String,
        trim: true,
        default: ''
    },
    structureHeightFt: {
        type: Number,
        default: 0,
        min: 0
    },
    technicalObservations: {
        type: String,
        trim: true,
        default: ''
    },
    measurementsNotes: {
        type: String,
        trim: true,
        default: ''
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    },
    photos: [inspectionPhotoSchema],
    status: {
        type: String,
        enum: ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REVISION_REQUESTED'],
        default: 'DRAFT'
    },
    submittedAt: {
        type: Date
    },
    verifiedAt: {
        type: Date
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verificationNotes: {
        type: String,
        trim: true,
        default: ''
    },
    quotationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation'
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

siteInspectionSchema.index({ leadId: 1 });
siteInspectionSchema.index({ customerId: 1 });
siteInspectionSchema.index({ assignedFieldEngineer: 1, status: 1 });
siteInspectionSchema.index({ branch: 1, status: 1 });
siteInspectionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.SiteInspection || mongoose.model('SiteInspection', siteInspectionSchema);
