const mongoose = require('mongoose');

const webProductSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        default: 'Inverters',
        trim: true
    },
    capacityRange: {
        type: String,
        default: '1 kW - 100 kW',
        trim: true
    },
    efficiency: {
        type: String,
        default: 'Up to 98.6%',
        trim: true
    },
    warranty: {
        type: String,
        default: '5 to 10 Years Warranty',
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    features: [{
        type: String,
        trim: true
    }],
    bestFor: {
        type: String,
        default: '',
        trim: true
    },
    startingPrice: {
        type: String,
        default: 'Ask for quote',
        trim: true
    },
    image: {
        type: String,
        default: '/images/services/3.webp',
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

module.exports = mongoose.models.WebProduct || mongoose.model('WebProduct', webProductSchema);
