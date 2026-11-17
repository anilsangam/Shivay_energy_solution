const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: [true, 'Material reference is required.']
    },
    materialName: {
        type: String,
        trim: true,
        default: ''
    },
    sku: {
        type: String,
        trim: true,
        uppercase: true,
        default: ''
    },
    unit: {
        type: String,
        trim: true,
        default: 'Piece'
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required.'],
        min: [1, 'Quantity must be at least 1.']
    },
    unitPurchasePrice: {
        type: Number,
        required: [true, 'Unit purchase price is required.'],
        min: [0, 'Unit purchase price cannot be negative.']
    },
    gstRate: {
        type: Number,
        default: 0,
        min: [0, 'GST rate cannot be negative.']
    },
    taxAmount: {
        type: Number,
        default: 0,
        min: [0, 'Tax amount cannot be negative.']
    },
    lineTotal: {
        type: Number,
        required: true,
        min: [0, 'Line total cannot be negative.']
    }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
    purchaseNumber: {
        type: String,
        required: [true, 'Purchase order number is required.'],
        unique: true,
        trim: true,
        uppercase: true
    },
    purchaseDate: {
        type: Date,
        required: [true, 'Purchase date is required.'],
        default: Date.now
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: [true, 'Supplier reference is required.']
    },
    supplierInvoiceNumber: {
        type: String,
        trim: true,
        default: ''
    },
    invoiceAttachment: {
        type: String,
        trim: true,
        default: ''
    },
    items: {
        type: [purchaseItemSchema],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'A purchase must have at least one material line item.'
        }
    },
    subtotal: {
        type: Number,
        required: true,
        min: [0, 'Subtotal cannot be negative.']
    },
    taxTotal: {
        type: Number,
        default: 0,
        min: [0, 'Tax total cannot be negative.']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative.']
    },
    additionalCharges: {
        type: Number,
        default: 0,
        min: [0, 'Additional charges cannot be negative.']
    },
    totalAmount: {
        type: Number,
        required: true,
        min: [0, 'Total amount cannot be negative.']
    },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'],
        default: 'UNPAID'
    },
    paidAmount: {
        type: Number,
        default: 0,
        min: [0, 'Paid amount cannot be negative.']
    },
    status: {
        type: String,
        enum: ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'],
        default: 'DRAFT',
        index: true
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    receivedAt: {
        type: Date
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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

purchaseSchema.index({ supplier: 1, status: 1 });
purchaseSchema.index({ purchaseDate: -1 });

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
