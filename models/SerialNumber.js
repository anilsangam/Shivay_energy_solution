const mongoose = require('mongoose');

const serialMovementSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['INWARDED', 'ALLOCATED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RETURNED', 'DAMAGED', 'STATUS_CHANGE']
    },
    fromStatus: {
        type: String,
        required: true
    },
    toStatus: {
        type: String,
        required: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        default: null
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const serialNumberSchema = new mongoose.Schema({
    serialNumber: {
        type: String,
        required: [true, 'Serial number is required'],
        unique: true,
        trim: true,
        uppercase: true
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
        trim: true,
        uppercase: true
    },
    brand: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        enum: ['SOLAR_PANEL', 'SOLAR_INVERTER', 'BATTERY', 'NET_METER', 'GENERATOR', 'OTHER'],
        default: 'SOLAR_INVERTER'
    },
    status: {
        type: String,
        enum: ['INWARDED', 'AVAILABLE', 'RESERVED', 'ALLOCATED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RETURNED', 'DAMAGED'],
        default: 'AVAILABLE',
        index: true
    },
    currentBranch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true
    },
    allocatedProject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null,
        index: true
    },
    allocatedCustomer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null
    },
    inwardedAt: {
        type: Date,
        default: Date.now
    },
    installedAt: {
        type: Date,
        default: null
    },
    installedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    movementHistory: [serialMovementSchema]
}, {
    timestamps: true
});

serialNumberSchema.index({ currentBranch: 1, status: 1 });
serialNumberSchema.index({ allocatedProject: 1, status: 1 });
serialNumberSchema.index({ material: 1, status: 1 });

module.exports = mongoose.models.SerialNumber || mongoose.model('SerialNumber', serialNumberSchema);
