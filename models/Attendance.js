const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    checkInTime: { type: Date, default: Date.now },
    checkOutTime: { type: Date },
    checkInLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        isWithinGeofence: { type: Boolean, default: true }
    },
    checkOutLocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        isWithinGeofence: { type: Boolean, default: true }
    },
    photoUrl: { type: String },
    status: { 
        type: String, 
        enum: ['present', 'half_day', 'late', 'absent', 'on_leave'], 
        default: 'present' 
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
