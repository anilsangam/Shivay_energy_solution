const mongoose = require('mongoose');

const webTestimonialSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    system: {
        type: String,
        required: true,
        default: 'Residential Rooftop Solar',
        trim: true
    },
    rating: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    },
    review: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String,
        default: '',
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

module.exports = mongoose.models.WebTestimonial || mongoose.model('WebTestimonial', webTestimonialSchema);
