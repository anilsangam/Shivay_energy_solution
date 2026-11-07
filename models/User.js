const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Name is required'],
        trim: true 
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'], 
        unique: true, 
        lowercase: true, 
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    mobile: { 
        type: String, 
        required: [true, 'Mobile number is required'],
        trim: true 
    },
    employeeId: { 
        type: String, 
        unique: true, 
        sparse: true,
        trim: true 
    },
    password: { 
        type: String, 
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters long'] 
    },
    role: { 
        type: String, 
        enum: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'EMPLOYEE'], 
        default: 'EMPLOYEE' 
    },
    branchId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Branch' 
    },
    status: { 
        type: String, 
        enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'], 
        default: 'PENDING' 
    },
    failedLoginAttempts: { 
        type: Number, 
        default: 0 
    },
    lockUntil: { 
        type: Date 
    },
    lastLogin: { 
        type: Date 
    },
    passwordChangedAt: { 
        type: Date 
    },
    avatar: { 
        type: String, 
        default: '/images/misc/cst-1.webp' 
    }
}, { 
    timestamps: true 
});

// Alias branchId as branch for backward compatibility
userSchema.virtual('branch').get(function() {
    return this.branchId;
}).set(function(b) {
    this.branchId = b;
});

// Pre-save hook to hash password with bcrypt
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    if (!this.isNew) {
        this.passwordChangedAt = new Date();
    }
});

// Compare candidate password
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked due to excessive failed attempts
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Remove sensitive fields in JSON conversion
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.failedLoginAttempts;
    delete obj.lockUntil;
    return obj;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
