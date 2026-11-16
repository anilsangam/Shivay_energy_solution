const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Supplier / Business name is required.'],
        trim: true,
        maxlength: 200
    },
    contactPerson: {
        type: String,
        required: [true, 'Contact person name is required.'],
        trim: true,
        maxlength: 100
    },
    mobile: {
        type: String,
        required: [true, 'Valid mobile number is required.'],
        trim: true,
        maxlength: 20
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    address: {
        type: String,
        trim: true,
        default: ''
    },
    gstin: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 20,
        default: ''
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE'],
        default: 'ACTIVE',
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

supplierSchema.index({ name: 1 });
supplierSchema.index({ mobile: 1 });
supplierSchema.index({ status: 1 });

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
