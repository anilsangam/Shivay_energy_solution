const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    ticketId: { type: String, unique: true },
    customerName: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    systemCapacity: { type: String },
    category: { 
        type: String, 
        enum: ['inverter_error', 'generation_drop', 'panel_physical_damage', 'metering_issue', 'wiring_loose', 'general_service'],
        default: 'inverter_error'
    },
    description: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['submitted', 'assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'closed'], 
        default: 'submitted' 
    },
    assignedEngineer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    resolutionNotes: { type: String },
    resolvedAt: { type: Date }
}, { timestamps: true });

complaintSchema.pre('save', function(next) {
    if (!this.ticketId) {
        this.ticketId = 'SHIVAY-' + Math.floor(10000 + Math.random() * 90000);
    }
    next();
});

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);
