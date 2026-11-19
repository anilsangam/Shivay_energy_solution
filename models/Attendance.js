const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    employeeId: { type: String, index: true },
    employeeName: { type: String },
    role: { type: String, default: 'Field Engineer' },
    type: { type: String, enum: ['check_in', 'check_out'], default: 'check_in' },
    timestamp: { type: String },
    locationName: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    isWithinGeofence: { type: Boolean, default: true },
    date: { type: String, required: true }, // Format: DD-MM-YYYY or YYYY-MM-DD
    checkInTime: { type: Date },
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

attendanceSchema.index({ employee: 1, date: -1 });
attendanceSchema.index({ employeeId: 1, date: -1 });
attendanceSchema.index({ branch: 1, date: -1 });
attendanceSchema.index({ type: 1, date: -1 });
attendanceSchema.index({ date: -1 });
// Enforce database-level uniqueness to prevent duplicate punches under concurrent requests
attendanceSchema.index({ employeeId: 1, date: 1, type: 1 }, { unique: true });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
