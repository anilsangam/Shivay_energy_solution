const mongoose = require('mongoose');

const callRecordSchema = new mongoose.Schema({
    caller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    callerName: {
        type: String,
        trim: true
    },
    callDate: {
        type: Date,
        default: Date.now
    },
    callOutcome: {
        type: String,
        enum: ['Connected', 'No Answer', 'Busy', 'Invalid Number', 'Call Back Requested'],
        required: true
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    nextFollowUpDate: {
        type: Date
    },
    previousStatus: {
        type: String,
        trim: true
    },
    updatedStatus: {
        type: String,
        trim: true
    }
}, { _id: true, timestamps: true });

const assignmentRecordSchema = new mongoose.Schema({
    previousOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    previousOwnerName: {
        type: String,
        trim: true
    },
    newOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    newOwnerName: {
        type: String,
        trim: true
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedByName: {
        type: String,
        trim: true
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    reason: {
        type: String,
        trim: true,
        default: 'Assignment'
    }
}, { _id: true, timestamps: true });

const commentSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorName: {
        type: String,
        trim: true
    },
    comment: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const leadSchema = new mongoose.Schema({
    leadId: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Lead contact / customer name is required'],
        trim: true
    },
    mobile: {
        type: String,
        required: [true, 'Mobile number is required'],
        trim: true
    },
    alternateMobile: {
        type: String,
        trim: true,
        default: ''
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        default: ''
    },
    address: {
        type: String,
        trim: true,
        default: ''
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
        trim: true,
        default: ''
    },
    solarRequirement: {
        type: String,
        default: 'Residential Rooftop (PM Surya Ghar)',
        trim: true
    },
    monthlyBill: {
        type: Number,
        default: 0
    },
    leadSource: {
        type: String,
        enum: ['WEBSITE', 'BULK_IMPORT', 'CSV', 'EXCEL', 'COPY_PASTE', 'MANUAL', 'REFERRAL', 'CAMPAIGN', 'WALK_IN', 'COLD_CALL', 'OTHER'],
        default: 'MANUAL'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    assignedTelecaller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedFieldEngineer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    leadPriority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    leadStatus: {
        type: String,
        enum: ['New', 'Contacted', 'Qualified', 'Follow-up Required', 'Not Interested', 'Disqualified', 'Converted'],
        default: 'New'
    },
    callStatus: {
        type: String,
        enum: ['Not Called', 'Called'],
        default: 'Not Called'
    },
    followUpDate: {
        type: Date
    },
    callHistory: [callRecordSchema],
    assignmentHistory: [assignmentRecordSchema],
    comments: [commentSchema],
    convertedCustomerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    convertedAt: {
        type: Date
    },
    inspectionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SiteInspection'
    },
    inspectionStatus: {
        type: String,
        enum: ['PENDING', 'SCHEDULED', 'COMPLETED', 'VERIFIED'],
        default: 'PENDING'
    },
    quotationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation'
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    linkedEnquiryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Enquiry'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true
});

leadSchema.index({ mobile: 1 });
leadSchema.index({ leadStatus: 1, branch: 1, createdAt: -1 });
leadSchema.index({ callStatus: 1, createdAt: -1 });
leadSchema.index({ assignedTelecaller: 1, leadStatus: 1 });
leadSchema.index({ assignedFieldEngineer: 1, leadStatus: 1 });
leadSchema.index({ followUpDate: 1 });
leadSchema.index({ branch: 1, createdAt: -1 });
leadSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
