const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    taskId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'], default: 'PENDING' },
    completionDate: { type: Date },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const materialItemSchema = new mongoose.Schema({
    itemName: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    requiredQty: { type: Number, required: true, min: 0 },
    allocatedQty: { type: Number, default: 0, min: 0 },
    deliveredQty: { type: Number, default: 0, min: 0 },
    pendingQty: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'Nos', trim: true },
    status: {
        type: String,
        enum: ['PLANNED', 'ALLOCATED', 'DISPATCHED', 'DELIVERED'],
        default: 'PLANNED'
    },
    remarks: { type: String, trim: true }
}, { _id: true });

const projectDocumentSchema = new mongoose.Schema({
    documentId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: [
            'SITE_SURVEY',
            'INSTALLATION_PHOTO',
            'CUSTOMER_DOC',
            'EQUIPMENT_DOC',
            'COMMISSIONING_REPORT',
            'DISCOM_APPROVAL',
            'OTHER'
        ],
        default: 'OTHER'
    },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    path: { type: String, required: true },
    cloudinaryUrl: { type: String },
    cloudinaryPublicId: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: true }
}, { _id: true });

const projectSchema = new mongoose.Schema({
    projectNumber: {
        type: String,
        required: [true, 'Project number is required'],
        unique: true,
        trim: true
    },
    title: {
        type: String,
        required: [true, 'Project title is required'],
        trim: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    quotation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation'
    },
    quotationRequest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuotationRequest'
    },
    capacityKw: {
        type: Number,
        required: [true, 'Plant capacity in kW is required'],
        min: 0.1
    },
    projectType: {
        type: String,
        enum: [
            'RESIDENTIAL_ROOFTOP',
            'COMMERCIAL_ROOFTOP',
            'INDUSTRIAL',
            'AGRICULTURAL_PUMP_KUSUM',
            'OFF_GRID_STORAGE',
            'OTHER'
        ],
        default: 'RESIDENTIAL_ROOFTOP'
    },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    // Progress calculation strictly mapped to project milestone status
    progressPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    status: {
        type: String,
        enum: [
            // Standard Phase 3 Workflow Lifecycle
            'NOT_STARTED',
            'SITE_VISIT_PENDING',
            'SITE_VISIT_COMPLETED',
            'MATERIAL_PLANNING',
            'MATERIAL_READY',
            'INSTALLATION_IN_PROGRESS',
            'TESTING_AND_COMMISSIONING',
            'DISCOM_DOCUMENTATION',
            'COMPLETED',
            'ON_HOLD',
            'CANCELLED',
            // Legacy aliases for backward compatibility
            'PLANNING',
            'SITE_SURVEY',
            'DESIGN_APPROVAL',
            'NET_METER_APPLICATION',
            'MATERIAL_PROCUREMENT',
            'STRUCTURE_INSTALLATION',
            'PANEL_INVERTER_MOUNTING',
            'WIRING_TESTING',
            'DISCOM_INSPECTION',
            'METER_COMMISSIONED',
            'SUBSIDY_APPLIED',
            'SUBSIDY_CREDITED'
        ],
        default: 'NOT_STARTED'
    },
    statusReason: {
        type: String,
        trim: true
    },
    statusHistory: [{
        previousStatus: String,
        newStatus: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: String,
        reason: String,
        timestamp: { type: Date, default: Date.now }
    }],
    assignedManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedEngineer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedEmployees: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        roleInProject: { type: String, default: 'INSTALLATION_ENGINEER', trim: true },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },

    // Snapshot Customer & Site Coordinates
    customerContact: {
        name: { type: String, trim: true },
        mobile: { type: String, trim: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        city: { type: String, default: 'Raisen', trim: true },
        district: { type: String, default: 'Raisen', trim: true },
        state: { type: String, default: 'Madhya Pradesh', trim: true },
        pincode: { type: String, trim: true },
        consumerNumber: { type: String, trim: true },
        discom: { type: String, default: 'MPPKVVCL', trim: true }
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

    // Technical Equipment Snapshot
    solarRequirements: {
        capacityKw: { type: Number, default: 3 },
        systemType: { type: String, default: 'ON_GRID' },
        roofType: { type: String, default: 'RCC_FLAT' },
        panelSpecs: { type: String, default: '540W Mono PERC Half-Cut (DCR Compliant)' },
        panelQty: { type: Number, default: 0 },
        inverterSpecs: { type: String, default: 'On-Grid Dual MPPT Solar Inverter' },
        inverterQty: { type: Number, default: 1 },
        batterySpecs: { type: String },
        structureSpecs: { type: String, default: 'HDG Elevated Mounting Structure' }
    },

    // Financial Milestones Snapshot
    financials: {
        contractAmount: { type: Number, default: 0 },
        subsidyAmount: { type: Number, default: 0 },
        netPayable: { type: Number, default: 0 },
        advanceAmount: { type: Number, default: 0 },
        balanceAmount: { type: Number, default: 0 }
    },
    contractAmount: {
        type: Number,
        default: 0
    },
    subsidyAmount: {
        type: Number,
        default: 0
    },
    amountPaid: {
        type: Number,
        default: 0
    },

    // Site Visit & Survey Subsystem
    siteVisit: {
        scheduledDate: { type: Date },
        visitDate: { type: Date },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: {
            type: String,
            enum: ['NOT_SCHEDULED', 'PENDING', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED'],
            default: 'NOT_SCHEDULED'
        },
        inspectionRemarks: { type: String, trim: true },
        roofSuitability: {
            type: String,
            enum: ['EXCELLENT', 'GOOD', 'NEEDS_REINFORCEMENT', 'UNSUITABLE', 'PENDING'],
            default: 'PENDING'
        },
        roofType: { type: String, trim: true },
        availableAreaSqFt: { type: Number },
        shadowObservations: { type: String, trim: true },
        electricalConnectionDetails: { type: String, trim: true },
        sanctionedLoadKw: { type: Number },
        requiredMaterialRemarks: { type: String, trim: true },
        photos: [{
            name: String,
            path: String,
            uploadedAt: { type: Date, default: Date.now }
        }],
        submittedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        managerRemarks: { type: String, trim: true }
    },

    // Subsystems: Tasks, Materials & Documents
    tasks: [taskSchema],
    materials: [materialItemSchema],
    documents: [projectDocumentSchema],

    // Final Completion Clearance Subsystem
    completionDetails: {
        completedAt: { type: Date },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        commissioningRemarks: { type: String, trim: true },
        meterNumber: { type: String, trim: true },
        synchronizationDate: { type: Date }
    },

    internalRemarks: {
        type: String,
        trim: true
    },
    startDate: {
        type: Date
    },
    targetCompletionDate: {
        type: Date
    },
    actualCompletionDate: {
        type: Date
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

projectSchema.index({ status: 1 });
projectSchema.index({ customer: 1 });
projectSchema.index({ quotation: 1 });
projectSchema.index({ assignedManager: 1 });
projectSchema.index({ assignedEngineer: 1 });
projectSchema.index({ 'assignedEmployees.user': 1 });
projectSchema.index({ branch: 1 });

module.exports = mongoose.models.Project || mongoose.model('Project', projectSchema);
