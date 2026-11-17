const mongoose = require('mongoose');

const webServiceSchema = new mongoose.Schema({
    serviceId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    icon: {
        type: String,
        default: 'icofont-home',
        trim: true
    },
    image: {
        type: String,
        default: '/images/slider/slider1.webp',
        trim: true
    },
    shortDesc: {
        type: String,
        required: true,
        trim: true
    },
    details: {
        type: String,
        default: '',
        trim: true
    },
    highlights: [{
        type: String,
        trim: true
    }],
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.models.WebService || mongoose.model('WebService', webServiceSchema);
