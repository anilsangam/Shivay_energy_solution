const mongoose = require('mongoose');

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
    capacityKw: {
        type: Number,
        required: [true, 'Plant capacity in kW is required']
    },
    projectType: {
        type: String,
        enum: ['RESIDENTIAL_ROOFTOP', 'COMMERCIAL_ROOFTOP', 'INDUSTRIAL', 'AGRICULTURAL_PUMP_KUSUM', 'OFF_GRID_STORAGE', 'OTHER'],
        default: 'RESIDENTIAL_ROOFTOP'
    },
    status: {
        type: String,
        enum: [
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
            'SUBSIDY_CREDITED',
            'COMPLETED',
            'ON_HOLD',
            'CANCELLED'
        ],
        default: 'PLANNING'
    },
    assignedManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedEngineer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
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
    startDate: {
        type: Date
    },
    targetCompletionDate: {
        type: Date
    },
    actualCompletionDate: {
        type: Date
    }
}, {
    timestamps: true
});

projectSchema.index({ projectNumber: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ customer: 1 });
projectSchema.index({ assignedManager: 1 });
projectSchema.index({ assignedEngineer: 1 });
projectSchema.index({ branch: 1 });

module.exports = mongoose.models.Project || mongoose.model('Project', projectSchema);
