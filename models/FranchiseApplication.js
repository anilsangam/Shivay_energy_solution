const mongoose = require('mongoose');

const franchiseApplicationSchema = new mongoose.Schema({
    applicationId: {
        type: String,
        unique: true
    },
    applicantName: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        default: '',
        trim: true
    },
    state: {
        type: String,
        default: 'Madhya Pradesh',
        trim: true
    },
    district: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        default: '',
        trim: true
    },
    investmentCapacity: {
        type: String,
        default: '₹2 Lakh - ₹5 Lakh',
        trim: true
    },
    businessBackground: {
        type: String,
        default: '',
        trim: true
    },
    message: {
        type: String,
        default: '',
        trim: true
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'under_review', 'approved', 'rejected'],
        default: 'new'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: [{
        author: String,
        note: String,
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

franchiseApplicationSchema.pre('save', function(next) {
    if (!this.applicationId) {
        this.applicationId = 'FRA-' + Math.floor(100000 + Math.random() * 900000);
    }
    if (typeof next === 'function') {
        return next();
    }
});

module.exports = mongoose.models.FranchiseApplication || mongoose.model('FranchiseApplication', franchiseApplicationSchema);
