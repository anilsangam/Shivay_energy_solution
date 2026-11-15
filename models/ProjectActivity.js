const mongoose = require('mongoose');

const projectActivitySchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: [true, 'Project reference is required']
    },
    activityType: {
        type: String,
        enum: [
            'PROJECT_CREATED',
            'STATUS_CHANGE',
            'EMPLOYEE_ASSIGNED',
            'TASK_CREATED',
            'TASK_UPDATED',
            'SITE_VISIT',
            'SITE_VISIT_SUBMITTED',
            'SITE_VISIT_REVIEWED',
            'MATERIAL_DISPATCH',
            'MATERIAL_ALLOCATED',
            'MATERIAL_DELIVERED',
            'INSTALLATION_STEP',
            'DOCUMENT_UPLOADED',
            'DISCOM_UPDATE',
            'MILESTONE',
            'INSPECTION',
            'PROJECT_COMPLETED',
            'PROJECT_HELD',
            'PROJECT_CANCELLED',
            'NOTE_ADDED'
        ],
        required: [true, 'Activity type is required']
    },
    title: {
        type: String,
        required: [true, 'Activity title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User who performed activity is required']
    },
    location: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    attachments: [{
        name: String,
        url: String,
        fileType: String,
        uploadedAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

projectActivitySchema.index({ project: 1 });
projectActivitySchema.index({ performedBy: 1 });
projectActivitySchema.index({ activityType: 1 });
projectActivitySchema.index({ createdAt: -1 });

module.exports = mongoose.models.ProjectActivity || mongoose.model('ProjectActivity', projectActivitySchema);
