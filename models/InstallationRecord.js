const mongoose = require('mongoose');

const installedEquipmentSchema = new mongoose.Schema({
    materialName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    serialNumbers: [{ type: String, trim: true, uppercase: true }]
}, { _id: false });

const testResultsSchema = new mongoose.Schema({
    vocVolts: { type: Number, default: 0 },
    iscAmps: { type: Number, default: 0 },
    gridVoltageVolts: { type: Number, default: 230 },
    gridFrequencyHz: { type: Number, default: 50 },
    earthingResistanceOhms: { type: Number, default: 2.5 },
    isSyncTested: { type: Boolean, default: true },
    testingRemarks: { type: String, trim: true, default: '' }
}, { _id: false });

const installationRecordSchema = new mongoose.Schema({
    installationId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    technician: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    technicianName: {
        type: String,
        trim: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    },
    installedEquipment: [installedEquipmentSchema],
    testResults: testResultsSchema,
    photos: [{
        name: String,
        url: String,
        category: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    customerSignoff: {
        isHandoverConfirmed: { type: Boolean, default: false },
        signoffDate: { type: Date, default: null },
        customerFeedback: { type: String, trim: true, default: '' }
    },
    status: {
        type: String,
        enum: ['IN_PROGRESS', 'SUBMITTED', 'VERIFIED_COMPLETED', 'REVISION_REQUESTED'],
        default: 'IN_PROGRESS'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    managerRemarks: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

installationRecordSchema.index({ project: 1, status: 1 });
installationRecordSchema.index({ technician: 1, status: 1 });

module.exports = mongoose.models.InstallationRecord || mongoose.model('InstallationRecord', installationRecordSchema);
