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
    // Service Coverage & PIN Routing Configuration (Phase 4)
    serviceablePinCodes: [{ type: String, trim: true }],
    districts: [{ type: String, trim: true }],
    cities: [{ type: String, trim: true }],
    isActiveServiceCoverage: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

branchSchema.index({ isActive: 1 });
branchSchema.index({ serviceablePinCodes: 1 });

module.exports = mongoose.models.Branch || mongoose.model('Branch', branchSchema);
