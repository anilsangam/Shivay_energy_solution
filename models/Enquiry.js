const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    enquiryId: { type: String, unique: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    state: { type: String, default: 'Madhya Pradesh' },
    district: { type: String, default: 'Raisen' },
    pincode: { type: String },
    address: { type: String },
    solarRequirement: { type: String, default: 'Residential Rooftop' },
    monthlyBill: { type: Number },
    message: { type: String },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    status: { 
        type: String, 
        enum: ['new', 'contacted', 'survey_scheduled', 'quotation_sent', 'converted', 'closed', 'cancelled'], 
        default: 'new' 
    },
    followUpDate: { type: Date },
    notes: [{
        author: String,
        note: String,
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

enquirySchema.pre('save', function(next) {
    if (!this.enquiryId) {
        this.enquiryId = 'ENQ-' + Math.floor(100000 + Math.random() * 900000);
    }
    next();
});

module.exports = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);
