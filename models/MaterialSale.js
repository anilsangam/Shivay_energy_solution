const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: [true, 'Material reference is required.']
    },
    materialName: {
        type: String,
        required: [true, 'Material name snapshot is required.'],
        trim: true
    },
    sku: {
        type: String,
        required: [true, 'SKU snapshot is required.'],
        trim: true,
        uppercase: true
    },
    unit: {
        type: String,
        trim: true,
        default: 'Piece'
    },
    quantity: {
        type: Number,
        required: [true, 'Sale quantity is required.'],
        min: [1, 'Sale quantity must be at least 1.']
    },
    unitPrice: {
        type: Number,
        required: [true, 'Unit selling price is required.'],
        min: [0, 'Unit selling price cannot be negative.']
    },
    costPriceSnapshot: {
        type: Number,
        default: 0,
        min: [0, 'Cost price snapshot cannot be negative.']
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
        required: [true, 'Line total is required.'],
        min: [0, 'Line total cannot be negative.']
    },
    dispatchedQuantity: {
        type: Number,
        default: 0,
        min: [0, 'Dispatched quantity cannot be negative.']
    },
    returnedQuantity: {
        type: Number,
        default: 0,
        min: [0, 'Returned quantity cannot be negative.']
    },
    priceOverride: {
        isOverridden: { type: Boolean, default: false },
        originalPrice: { type: Number, default: 0 },
        customPrice: { type: Number, default: 0 },
        reason: { type: String, trim: true, default: '' },
        overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        overriddenAt: { type: Date }
    }
}, { _id: true });

const materialSaleSchema = new mongoose.Schema({
    saleNumber: {
        type: String,
        required: [true, 'Sale number is required.'],
        unique: true,
        trim: true,
        uppercase: true
    },
    saleDate: {
        type: Date,
        required: [true, 'Sale date is required.'],
        default: Date.now
    },
    status: {
        type: String,
        enum: ['DRAFT', 'CONFIRMED', 'PROCESSING', 'CANCELLED'],
        default: 'DRAFT',
        index: true
    },
    buyerType: {
        type: String,
        enum: ['EXISTING_CUSTOMER', 'NEW_CUSTOMER', 'BUSINESS_DEALER'],
        default: 'EXISTING_CUSTOMER'
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        index: true
    },
    // Immutable Customer Snapshot
    customerName: {
        type: String,
        required: [true, 'Customer name is required.'],
        trim: true
    },
    customerMobile: {
        type: String,
        required: [true, 'Customer mobile number is required.'],
        trim: true
    },
    customerEmail: {
        type: String,
        lowercase: true,
        trim: true,
        default: ''
    },
    customerAddress: {
        type: String,
        trim: true,
        default: ''
    },
    city: {
        type: String,
        trim: true,
        default: 'Raisen'
    },
    district: {
        type: String,
        trim: true,
        default: 'Raisen'
    },
    state: {
        type: String,
        trim: true,
        default: 'Madhya Pradesh'
    },
    pincode: {
        type: String,
        trim: true,
        default: ''
    },
    companyName: {
        type: String,
        trim: true,
        default: ''
    },
    contactPerson: {
        type: String,
        trim: true,
        default: ''
    },
    customerGstin: {
        type: String,
        trim: true,
        uppercase: true,
        default: ''
    },
    customerType: {
        type: String,
        enum: ['INDIVIDUAL', 'BUSINESS', 'CONTRACTOR', 'DEALER', 'OTHER'],
        default: 'INDIVIDUAL'
    },
    // Optional Link to Solar Project (Never mandatory)
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        index: true
    },
    projectNumber: {
        type: String,
        trim: true,
        default: ''
    },
    items: {
        type: [saleItemSchema],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'A material sale must have at least one line item.'
        }
    },
    subtotal: {
        type: Number,
        required: [true, 'Subtotal is required.'],
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
    grandTotal: {
        type: Number,
        required: [true, 'Grand total is required.'],
        min: [0, 'Grand total cannot be negative.']
    },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'],
        default: 'UNPAID'
    },
    paymentMethod: {
        type: String,
        default: 'Bank Transfer (NEFT/RTGS/UPI)'
    },
    dispatchStatus: {
        type: String,
        enum: ['NOT_DISPATCHED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'DELIVERED'],
        default: 'NOT_DISPATCHED',
        index: true
    },
    invoice: {
        invoiceNumber: { type: String, trim: true, default: '' },
        invoiceDate: { type: Date },
        generatedAt: { type: Date },
        snapshot: { type: mongoose.Schema.Types.Mixed }
    },
    confirmedAt: {
        type: Date
    },
    confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancelledAt: {
        type: Date
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancellationReason: {
        type: String,
        trim: true,
        default: ''
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

materialSaleSchema.index({ saleDate: -1 });
materialSaleSchema.index({ 'items.material': 1 });
materialSaleSchema.index({ 'invoice.invoiceNumber': 1 });

module.exports = mongoose.models.MaterialSale || mongoose.model('MaterialSale', materialSaleSchema);
