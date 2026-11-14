const mongoose = require('mongoose');

const projectNoteSchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: [true, 'Project reference is required']
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Author is required']
    },
    content: {
        type: String,
        required: [true, 'Note content cannot be empty'],
        trim: true
    },
    isInternalOnly: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

projectNoteSchema.index({ project: 1 });
projectNoteSchema.index({ author: 1 });
projectNoteSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ProjectNote || mongoose.model('ProjectNote', projectNoteSchema);
