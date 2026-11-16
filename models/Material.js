const mongoose = require('mongoose');

const MATERIAL_CATEGORIES = [
    'Solar Panels',
    'Solar Inverters',
    'Batteries',
    'Mounting Structures',
    'ACDB / DCDB',
    'Cables and Wires',
    'Earthing Materials',
    'Accessories',
    'Other'
];

const MATERIAL_UNITS = [
    'Piece',
    'Set',
    'Meter',
    'Kg',
    'Box',
    'Roll',
    'Bundle',
    'Other'
];

const materialSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Material name is required.'],
        trim: true,
        maxlength: 200
    },
    sku: {
        type: String,
        required: [true, 'Unique SKU / Material Code is required.'],
        unique: true,
        trim: true,
        uppercase: true,
        maxlength: 50
    },
    category: {
        type: String,
        required: [true, 'Material category is required.'],
        enum: MATERIAL_CATEGORIES,
        default: 'Other'
    },
    brand: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ''
    },
    model: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ''
    },
    technicalSpecifications: {
        type: String,
        trim: true,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    unit: {
        type: String,
        required: [true, 'Unit of measurement is required.'],
        enum: MATERIAL_UNITS,
        default: 'Piece'
    },
    minStockAlert: {
        type: Number,
        default: 5,
        min: [0, 'Minimum stock alert threshold cannot be negative.']
    },
    defaultSellingPrice: {
        type: Number,
        default: 0,
        min: [0, 'Default selling price cannot be negative.']
    },
    // Stock is maintained strictly via confirmed Purchases & Inventory Transactions (never arbitrary manual master edits)
    currentStock: {
        type: Number,
        default: 0,
        min: [0, 'Current stock balance cannot be negative.']
    },
    weightedAverageCost: {
        type: Number,
        default: 0,
        min: [0, 'Weighted average cost cannot be negative.']
    },
    isActive: {
        type: Boolean,
        default: true,
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

materialSchema.index({ sku: 1 }, { unique: true });
materialSchema.index({ name: 'text', brand: 'text', model: 'text', sku: 'text' });
materialSchema.index({ category: 1, isActive: 1 });

materialSchema.statics.CATEGORIES = MATERIAL_CATEGORIES;
materialSchema.statics.UNITS = MATERIAL_UNITS;

module.exports = mongoose.models.Material || mongoose.model('Material', materialSchema);
