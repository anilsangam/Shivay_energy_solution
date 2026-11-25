const mongoose = require('mongoose');

const projectMaterialAllocationSchema = new mongoose.Schema({
    allocationId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: [true, 'Project reference is required'],
        index: true
    },
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: [true, 'Material reference is required']
    },
    materialName: {
        type: String,
        required: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    unit: {
        type: String,
        default: 'Piece',
        trim: true
    },
    allocatedQuantity: {
        type: Number,
        required: [true, 'Allocated quantity is required'],
        min: [1, 'Allocated quantity must be at least 1']
    },
    dispatchedQuantity: {
        type: Number,
        default: 0,
        min: 0
    },
    installedQuantity: {
        type: Number,
        default: 0,
        min: 0
    },
    allocatedSerials: [{
        type: String,
        trim: true,
        uppercase: true
    }],
    dispatchedSerials: [{
        type: String,
        trim: true,
        uppercase: true
    }],
    installedSerials: [{
        type: String,
        trim: true,
        uppercase: true
    }],
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true
    },
    allocatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    allocatedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['ALLOCATED', 'PARTIALLY_DISPATCHED', 'FULLY_DISPATCHED', 'INSTALLED', 'CANCELLED'],
        default: 'ALLOCATED'
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

projectMaterialAllocationSchema.index({ project: 1, material: 1 });
projectMaterialAllocationSchema.index({ branch: 1, status: 1 });

module.exports = mongoose.models.ProjectMaterialAllocation || mongoose.model('ProjectMaterialAllocation', projectMaterialAllocationSchema);
