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
            'MILESTONE',
            'SITE_VISIT',
            'INSPECTION',
            'MATERIAL_DISPATCH',
            'INSTALLATION_STEP',
            'DISCOM_UPDATE',
            'STATUS_CHANGE',
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
