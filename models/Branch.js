const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contactNumber: { type: String, required: true },
    email: { type: String },
    state: { type: String, default: 'Madhya Pradesh' },
    district: { type: String, default: 'Raisen' },
    city: { type: String, default: 'Raisen' },
    address: { type: String, required: true },
    coordinates: {
        latitude: { type: Number, default: 23.3315 },
        longitude: { type: Number, default: 77.7807 }
    },
    geofenceRadiusMeters: { type: Number, default: 500 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Branch || mongoose.model('Branch', branchSchema);
