const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: [true, 'Material reference is required.']
    },
    materialName: {
        type: String,
        required: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    unit: {
        type: String,
        trim: true,
        default: 'Piece'
    },
    soldQuantity: {
        type: Number,
        required: true,
        min: 1
    },
    returnedQuantity: {
        type: Number,
        required: [true, 'Returned quantity is required.'],
        min: [1, 'Returned quantity must be at least 1.']
    },
    condition: {
        type: String,
        enum: ['GOOD', 'DAMAGED', 'DEFECTIVE', 'PENDING_INSPECTION'],
        default: 'PENDING_INSPECTION'
    },
    inspectionNotes: {
        type: String,
        trim: true,
        default: ''
    },
    restocked: {
        type: Boolean,
        default: false
    },
    restockedQuantity: {
        type: Number,
        default: 0
    },
    nonSellableRecorded: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const materialReturnSchema = new mongoose.Schema({
    returnNumber: {
        type: String,
        required: [true, 'Return number is required.'],
        unique: true,
        trim: true,
        uppercase: true
    },
    sale: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MaterialSale',
        required: [true, 'Material sale reference is required.'],
        index: true
    },
    saleNumber: {
        type: String,
        required: true,
        trim: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    customerName: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['REQUESTED', 'RECEIVED', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'COMPLETED'],
        default: 'REQUESTED',
        index: true
    },
    items: {
        type: [returnItemSchema],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'A material return must have at least one line item.'
        }
    },
    returnReason: {
        type: String,
        required: [true, 'Return reason is required.'],
        trim: true
    },
    receivedDate: {
        type: Date,
        default: Date.now
    },
    inspectingUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    inspectedAt: {
        type: Date
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectedAt: {
        type: Date
    },
    rejectionReason: {
        type: String,
        trim: true,
        default: ''
    },
    refundStatus: {
        type: String,
        enum: ['NOT_APPLICABLE', 'PENDING', 'CREDIT_NOTE_ISSUED', 'REFUNDED'],
        default: 'NOT_APPLICABLE'
    },
    refundAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    notes: {
        type: String,
        trim: true,
        default: ''
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

materialReturnSchema.index({ createdAt: -1 });

module.exports = mongoose.models.MaterialReturn || mongoose.model('MaterialReturn', materialReturnSchema);
