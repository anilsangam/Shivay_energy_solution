const mongoose = require('mongoose');

const webProjectSchema = new mongoose.Schema({
    projectId: {
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
    category: {
        type: String,
        required: true,
        default: 'Residential Solar',
        trim: true
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    capacity: {
        type: String,
        default: '3 kW',
        trim: true
    },
    type: {
        type: String,
        default: 'Residential On-Grid',
        trim: true
    },
    year: {
        type: String,
        default: '2024',
        trim: true
    },
    image: {
        type: String,
        default: '/images/projects/1.webp',
        trim: true
    },
    panels: {
        type: String,
        default: 'Mono PERC Half-Cut',
        trim: true
    },
    inverter: {
        type: String,
        default: 'Dual MPPT On-Grid Inverter',
        trim: true
    },
    impact: {
        type: String,
        default: 'Zero electricity bill',
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
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

module.exports = mongoose.models.WebProject || mongoose.model('WebProject', webProjectSchema);
