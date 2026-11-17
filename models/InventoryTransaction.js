const mongoose = require('mongoose');

const TRANSACTION_TYPES = [
    'PURCHASE_RECEIPT',
    'STOCK_ADJUSTMENT',
    'PROJECT_ALLOCATION',
    'SALES_DISPATCH',
    'RETURN_IN',
    'SALES_OUT',
    'SALES_RETURN_GOOD',
    'SALES_RETURN_DAMAGED',
    'SALES_RETURN_DEFECTIVE'
];

const inventoryTransactionSchema = new mongoose.Schema({
    transactionNumber: {
        type: String,
        required: [true, 'Transaction reference number is required.'],
        unique: true,
        trim: true,
        uppercase: true
    },
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: [true, 'Material reference is required.'],
        index: true
    },
    transactionType: {
        type: String,
        required: [true, 'Transaction type is required.'],
        enum: TRANSACTION_TYPES,
        index: true
    },
    quantityIn: {
        type: Number,
        default: 0,
        min: [0, 'Quantity in cannot be negative.']
    },
    quantityOut: {
        type: Number,
        default: 0,
        min: [0, 'Quantity out cannot be negative.']
    },
    unitCost: {
        type: Number,
        default: 0,
        min: [0, 'Unit cost cannot be negative.']
    },
    totalCost: {
        type: Number,
        default: 0,
        min: [0, 'Total cost cannot be negative.']
    },
    balanceAfter: {
        type: Number,
        required: [true, 'Balance after transaction is required.'],
        min: [0, 'Resulting inventory balance cannot be negative.']
    },
    sourceReferenceType: {
        type: String,
        enum: ['Purchase', 'StockAdjustment', 'Project', 'Sales', 'MaterialSale', 'MaterialReturn', 'MaterialDispatch', 'None'],
        default: 'None'
    },
    sourceReferenceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    sourceReferenceNumber: {
        type: String,
        trim: true,
        default: ''
    },
    transactionDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User who performed the transaction is required.']
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

inventoryTransactionSchema.index({ material: 1, transactionDate: -1 });
inventoryTransactionSchema.index({ sourceReferenceType: 1, sourceReferenceId: 1 });

inventoryTransactionSchema.statics.TRANSACTION_TYPES = TRANSACTION_TYPES;

module.exports = mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', inventoryTransactionSchema);
