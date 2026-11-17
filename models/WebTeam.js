const mongoose = require('mongoose');

const webTeamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    designation: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    whatsapp: {
        type: String,
        default: '',
        trim: true
    },
    email: {
        type: String,
        default: '',
        trim: true
    },
    bio: {
        type: String,
        default: 'Available for technical consultation, rooftop feasibility checks, and project guidance.',
        trim: true
    },
    image: {
        type: String,
        default: '',
        trim: true
    },
    isFounder: {
        type: Boolean,
        default: false
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.models.WebTeam || mongoose.model('WebTeam', webTeamSchema);
