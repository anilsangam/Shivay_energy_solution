const mongoose = require('mongoose');
const crypto = require('crypto');

const progressHistorySchema = new mongoose.Schema({
    previousStatus: { type: String, trim: true },
    newStatus: { type: String, required: true, trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeName: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now },
    remarks: { type: String, trim: true },
    workPerformed: { type: String, trim: true },
    visitDateTime: { type: Date },
    nextVisitDate: { type: Date },
    materialRequired: { type: String, trim: true },
    delayReason: { type: String, trim: true },
    evidencePhotos: [{ type: String, trim: true }],
    evidenceCategory: { type: String, trim: true }
}, { _id: true });

const assignmentHistorySchema = new mongoose.Schema({
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    technicianName: { type: String, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    remarks: { type: String, trim: true }
}, { _id: true });

const branchTransferHistorySchema = new mongoose.Schema({
    fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    previousBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    toBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    newBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true },
    transferReason: { type: String, trim: true },
    transferredAt: { type: Date, default: Date.now },
    timestamp: { type: Date, default: Date.now }
}, { _id: true });

const reopeningRecordSchema = new mongoose.Schema({
    reopenedAt: { type: Date, default: Date.now },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managerName: { type: String, trim: true },
    reason: { type: String, required: true, trim: true }
}, { _id: true });

const complaintSchema = new mongoose.Schema({
    // Unique Ticket / Complaint ID (e.g. CMP-2611-AB12 or SHIVAY-10492)
    ticketId: { type: String, unique: true, index: true },
    complaintId: { type: String, index: true },

    // Linked Customer and Project (Optional, Safe Multi-Scenario Matching)
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },

    // Customer Identity & Contact
    customerName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    systemCapacity: { type: String, trim: true },

    // Service Address & Geolocation (Immutable original + current address)
    originalServiceAddress: { type: mongoose.Schema.Types.Mixed },
    serviceAddress: { type: String, required: true, trim: true },
    state: { type: String, default: 'Madhya Pradesh', trim: true },
    district: { type: String, default: 'Raisen', trim: true },
    city: { type: String, default: 'Raisen', trim: true },
    pinCode: { type: String, required: true, trim: true, index: true },

    // Classification
    category: { type: String, default: 'inverter_error', trim: true },
    complaintCategory: { type: String, trim: true },
    description: { type: String, required: true, trim: true },

    // Routing & Assignment
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    branchRoutingMethod: {
        type: String,
        enum: ['AUTO_EXACT_PIN', 'AUTO_DISTRICT_CITY', 'MANUAL_ASSIGNED', 'UNASSIGNED', 'MULTIPLE_MATCHES'],
        default: 'UNASSIGNED'
    },
    assignedEngineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Controlled Status Progression
    status: {
        type: String,
        enum: [
            // Canonical capitalized workflow statuses
            'Submitted',
            'Assigned',
            'Visit Scheduled',
            'On The Way',
            'Site Visited',
            'Work In Progress',
            'Waiting for Material',
            'Waiting for Customer',
            'Resolved',
            'Unable to Resolve',
            'Closed',
            'Reopened',
            // Legacy lowercase compatibility
            'submitted',
            'assigned',
            'in_progress',
            'waiting_for_parts',
            'resolved',
            'closed'
        ],
        default: 'Submitted',
        index: true
    },

    // Append-Only Audit & Operational Histories
    assignmentHistory: [assignmentHistorySchema],
    branchTransferHistory: [branchTransferHistorySchema],
    progressHistory: [progressHistorySchema],

    // Resolution & Signoff Details
    resolutionDetails: {
        resolvedAt: { type: Date },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        workPerformed: { type: String, trim: true },
        remarks: { type: String, trim: true },
        beforePhotos: [{ type: String }],
        afterPhotos: [{ type: String }]
    },

    // Manager Closure Details (Maker-Checker)
    closureDetails: {
        closedAt: { type: Date },
        approvedAt: { type: Date },
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        managerName: { type: String, trim: true },
        remarks: { type: String, trim: true },
        closureRemarks: { type: String, trim: true },
        rating: { type: Number, min: 1, max: 5 }
    },

    // Reopening Details
    reopeningDetails: { type: mongoose.Schema.Types.Mixed },

    // Legacy fields
    resolutionNotes: { type: String },
    resolvedAt: { type: Date }
}, { timestamps: true });

// Composite Indexes
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ branch: 1, status: 1 });
complaintSchema.index({ assignedTechnician: 1, status: 1 });

complaintSchema.pre('save', function(next) {
    // Generate unique collision-safe ID if missing
    if (!this.ticketId) {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        this.ticketId = `CMP-${dateStr}-${randomHex}`;
    }
    if (!this.complaintId) {
        this.complaintId = this.ticketId;
    }
    if (!this.originalServiceAddress && this.serviceAddress) {
        this.originalServiceAddress = this.serviceAddress;
    }
    if (this.customer && !this.customerId) {
        this.customerId = this.customer;
    }
    if (this.project && !this.projectId) {
        this.projectId = this.project;
    }
    if (this.branch && !this.branchId) {
        this.branchId = this.branch;
    }
    if (this.assignedTechnician && !this.assignedEngineer) {
        this.assignedEngineer = this.assignedTechnician;
    } else if (this.assignedEngineer && !this.assignedTechnician) {
        this.assignedTechnician = this.assignedEngineer;
    }
    if (typeof next === 'function') {
        return next();
    }
});

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);
