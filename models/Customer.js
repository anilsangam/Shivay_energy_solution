const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    mobile: {
        type: String,
        required: [true, 'Primary mobile number is required'],
        trim: true
    },
    alternateMobile: {
        type: String,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        default: 'Raisen',
        trim: true
    },
    district: {
        type: String,
        default: 'Raisen',
        trim: true
    },
    state: {
        type: String,
        default: 'Madhya Pradesh',
        trim: true
    },
    pincode: {
        type: String,
        trim: true
    },
    consumerNumber: {
        type: String,
        trim: true
    },
    discom: {
        type: String,
        default: 'MPPKVVCL',
        trim: true
    },
    gstin: {
        type: String,
        trim: true
    },
    customerType: {
        type: String,
        enum: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'INSTITUTIONAL'],
        default: 'RESIDENTIAL'
    },
    status: {
        type: String,
        enum: ['LEAD', 'CONTACTED', 'SURVEYED', 'ACTIVE', 'INACTIVE'],
        default: 'LEAD'
    },
    assignedEmployee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedBranch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: [{
        text: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

customerSchema.index({ mobile: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ assignedEmployee: 1 });
customerSchema.index({ assignedBranch: 1 });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
