const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { isValidPermission, isValidFieldPermission } = require('../config/permissionRegistry');

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
        enum: ['SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER', 'EMPLOYEE'], 
        default: 'EMPLOYEE' 
    },
    branchId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Branch' 
    },
    managerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    status: { 
        type: String, 
        enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED'], 
        default: 'PENDING' 
    },
    isPrimarySuperAdmin: {
        type: Boolean,
        default: false
    },
    permissions: {
        type: [String],
        default: [],
        validate: {
            validator: function(perms) {
                if (!Array.isArray(perms)) return false;
                return perms.every(p => isValidPermission(p));
            },
            message: props => `Invalid permission key: ${props.value}`
        }
    },
    fieldPermissions: {
        type: [String],
        default: [],
        validate: {
            validator: function(fields) {
                if (!Array.isArray(fields)) return false;
                return fields.every(f => isValidFieldPermission(f));
            },
            message: props => `Invalid field permission key: ${props.value}`
        }
    },
    permissionVersion: {
        type: Number,
        default: 1
    },
    permissionMetadata: {
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        assignedAt: {
            type: Date,
            default: null
        },
        notes: {
            type: String,
            default: '',
            trim: true
        }
    },
    dataScope: {
        type: String,
        enum: ['OWN', 'ASSIGNED', 'BRANCH', 'MULTI_BRANCH', 'GLOBAL'],
        default: 'BRANCH'
    },
    authorizedBranches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    }],
    designation: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    address: {
        type: String,
        trim: true
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
        default: '' 
    },
    bloodGroup: {
        type: String,
        trim: true,
        default: 'B+'
    },
    alternateMobile: {
        type: String,
        trim: true,
        default: ''
    },
    joiningDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        default: () => new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000)
    },
    idCardNumber: {
        type: String,
        trim: true
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

// Alias managerId as manager
userSchema.virtual('manager').get(function() {
    return this.managerId;
}).set(function(m) {
    this.managerId = m;
});

// Indexes for query performance
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ managerId: 1 });
userSchema.index({ branchId: 1 });
userSchema.index({ branchId: 1, role: 1 });
userSchema.index({ status: 1, role: 1 });
userSchema.index({ isPrimarySuperAdmin: 1 }, { unique: true, partialFilterExpression: { isPrimarySuperAdmin: true } });
userSchema.index({ permissionVersion: 1 });

// Pre-save hook for Primary Super Admin security, permission versioning and password hashing
userSchema.pre('save', async function() {
    const AUTH_CONFIG = require('../config/authConfig');
    const isPrimary = this.isPrimarySuperAdmin || (this.email && this.email.toLowerCase() === (AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL || '').toLowerCase()) || (this.employeeId && this.employeeId === (AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMPLOYEE_ID || 'SES-ADMIN-01'));

    // Primary Super Admin Immutable Governance Protection
    if (!this.isNew && this._id) {
        if (this.isModified('isPrimarySuperAdmin') && !this.isPrimarySuperAdmin) {
            throw new Error('Security Violation: Primary Super Admin designation cannot be revoked.');
        }
        if (isPrimary) {
            if (this.isModified('role') && this.role !== 'SUPER_ADMIN') {
                throw new Error('Security Violation: Primary Super Admin role cannot be altered.');
            }
            if (this.isModified('status') && this.status !== 'ACTIVE') {
                throw new Error('Security Violation: Primary Super Admin account cannot be deactivated or suspended.');
            }
        }
    }

    // Auto-increment permissionVersion whenever security-relevant fields are modified
    if (this.isModified('permissions') || this.isModified('fieldPermissions') ||
        this.isModified('role') || this.isModified('status') ||
        this.isModified('dataScope') || this.isModified('branchId') ||
        this.isModified('authorizedBranches')) {
        this.permissionVersion = (this.permissionVersion || 1) + 1;
    }

    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    if (!this.isNew) {
        this.passwordChangedAt = new Date();
    }
});

// Guard Primary Super Admin against direct query updates and deletions
const protectPrimarySuperAdminQuery = async function() {
    const AUTH_CONFIG = require('../config/authConfig');
    const query = this.getQuery ? this.getQuery() : {};
    const update = this.getUpdate ? this.getUpdate() : null;

    const primaryEmail = (AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL || 'admin@shivayenergy.com').toLowerCase();
    const primaryEmpId = AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMPLOYEE_ID || 'SES-ADMIN-01';

    const targetsPrimary = (query.isPrimarySuperAdmin === true) ||
        (query.email && typeof query.email === 'string' && query.email.toLowerCase() === primaryEmail) ||
        (query.employeeId === primaryEmpId);

    if (update) {
        const flatUpdate = update.$set || update;
        if (targetsPrimary) {
            if (flatUpdate.isPrimarySuperAdmin === false) {
                throw new Error('Security Violation: Primary Super Admin designation cannot be revoked.');
            }
            if (flatUpdate.role && flatUpdate.role !== 'SUPER_ADMIN') {
                throw new Error('Security Violation: Primary Super Admin role cannot be altered.');
            }
            if (flatUpdate.status && flatUpdate.status !== 'ACTIVE') {
                throw new Error('Security Violation: Primary Super Admin account cannot be deactivated or suspended.');
            }
        }
    }
};

const protectPrimarySuperAdminDelete = async function() {
    const AUTH_CONFIG = require('../config/authConfig');
    const query = this.getQuery ? this.getQuery() : {};
    const primaryEmail = (AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL || 'admin@shivayenergy.com').toLowerCase();
    const primaryEmpId = AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMPLOYEE_ID || 'SES-ADMIN-01';

    if (query.isPrimarySuperAdmin === true ||
        (query.email && typeof query.email === 'string' && query.email.toLowerCase() === primaryEmail) ||
        query.employeeId === primaryEmpId) {
        throw new Error('Security Violation: Primary Super Admin cannot be deleted.');
    }
};

userSchema.pre('findOneAndUpdate', protectPrimarySuperAdminQuery);
userSchema.pre('updateOne', protectPrimarySuperAdminQuery);
userSchema.pre('updateMany', protectPrimarySuperAdminQuery);
userSchema.pre('findOneAndDelete', protectPrimarySuperAdminDelete);
userSchema.pre('deleteOne', { document: false, query: true }, protectPrimarySuperAdminDelete);
userSchema.pre('deleteMany', { document: false, query: true }, protectPrimarySuperAdminDelete);

// Compare candidate password
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked due to excessive failed attempts
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Authorization Methods
userSchema.methods.hasPermission = function(permissionKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasPermission(this, permissionKey);
};

userSchema.methods.hasAnyPermission = function(permissionKeys = []) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasAnyPermission(this, permissionKeys);
};

userSchema.methods.hasAllPermissions = function(permissionKeys = []) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasAllPermissions(this, permissionKeys);
};

userSchema.methods.hasFieldAccess = function(fieldKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasFieldAccess(this, fieldKey);
};

userSchema.methods.hasModuleAccess = function(moduleKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasModuleAccess(this, moduleKey);
};

userSchema.methods.hasFeatureAccess = function(moduleKey, featureKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasFeatureAccess(this, moduleKey, featureKey);
};

userSchema.methods.hasActionAccess = function(moduleKey, featureKey, actionKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.hasActionAccess(this, moduleKey, featureKey, actionKey);
};

userSchema.methods.canAccessBranch = function(targetBranchId) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.canAccessBranch(this, targetBranchId);
};

userSchema.methods.getAccessibleDataScope = function(moduleKey) {
    const AuthorizationService = require('../services/authorizationService');
    return AuthorizationService.getAccessibleDataScope(this, moduleKey);
};

// Remove sensitive fields in JSON conversion
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.failedLoginAttempts;
    delete obj.lockUntil;
    return obj;
};

// Safe DTO representation for API responses and session persistence
userSchema.methods.toSafeDTO = function() {
    const obj = this.toObject ? this.toObject() : { ...this };
    delete obj.password;
    delete obj.failedLoginAttempts;
    delete obj.lockUntil;
    delete obj.__v;
    return obj;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
