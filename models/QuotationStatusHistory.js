const mongoose = require('mongoose');

const quotationStatusHistorySchema = new mongoose.Schema({
    quotation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation',
        required: [true, 'Quotation reference is required']
    },
    quotationNumber: {
        type: String,
        trim: true
    },
    previousStatus: {
        type: String,
        required: [true, 'Previous status is required']
    },
    newStatus: {
        type: String,
        required: [true, 'New status is required']
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User modifying status is required']
    },
    role: {
        type: String,
        trim: true
    },
    comments: {
        type: String,
        trim: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

quotationStatusHistorySchema.index({ quotation: 1 });
quotationStatusHistorySchema.index({ changedBy: 1 });
quotationStatusHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.models.QuotationStatusHistory || mongoose.model('QuotationStatusHistory', quotationStatusHistorySchema);
