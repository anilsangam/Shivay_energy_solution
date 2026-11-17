const mongoose = require('mongoose');

const dispatchItemSchema = new mongoose.Schema({
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
    orderedQuantity: {
        type: Number,
        required: true,
        min: 1
    },
    dispatchedQuantity: {
        type: Number,
        required: [true, 'Dispatched quantity is required.'],
        min: [1, 'Dispatched quantity must be at least 1.']
    }
}, { _id: false });

const dispatchStatusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        required: true
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    changedAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, { _id: false });

const materialDispatchSchema = new mongoose.Schema({
    dispatchNumber: {
        type: String,
        required: [true, 'Dispatch number is required.'],
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
    customerName: {
        type: String,
        trim: true,
        default: ''
    },
    dispatchDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    expectedDeliveryDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['NOT_DISPATCHED', 'PACKING', 'READY_FOR_DISPATCH', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'DELIVERY_FAILED'],
        default: 'READY_FOR_DISPATCH',
        index: true
    },
    items: {
        type: [dispatchItemSchema],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'A dispatch must have at least one material line item.'
        }
    },
    transporterName: {
        type: String,
        trim: true,
        default: ''
    },
    vehicleNumber: {
        type: String,
        trim: true,
        uppercase: true,
        default: ''
    },
    trackingNumber: {
        type: String,
        trim: true,
        default: '' // LR / Docket / e-Way bill #
    },
    shippingAddress: {
        type: String,
        trim: true,
        default: ''
    },
    contactPerson: {
        type: String,
        trim: true,
        default: ''
    },
    contactPhone: {
        type: String,
        trim: true,
        default: ''
    },
    dispatchNotes: {
        type: String,
        trim: true,
        default: ''
    },
    deliveredAt: {
        type: Date
    },
    deliveryNotes: {
        type: String,
        trim: true,
        default: ''
    },
    receivedBy: {
        type: String,
        trim: true,
        default: ''
    },
    statusHistory: [dispatchStatusHistorySchema],
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

materialDispatchSchema.index({ dispatchDate: -1 });

module.exports = mongoose.models.MaterialDispatch || mongoose.model('MaterialDispatch', materialDispatchSchema);
