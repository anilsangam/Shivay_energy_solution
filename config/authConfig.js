/**
 * SHIVAY ENERGY SOLUTIONS - Central Authentication & Primary Super Admin Identity Configuration
 * 
 * Centralized, configurable root authority configuration.
 * Can be updated via environment or configuration without modifying authorization engine logic.
 */

const AUTH_CONFIG = {
    // Configured Primary Super Admin Email (Authoritative identity)
    primarySuperAdminEmail: (process.env.PRIMARY_SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@shivayenergy.com').trim().toLowerCase(),
    
    // Configured Primary Super Admin Employee ID (Deterministic identifier)
    primarySuperAdminEmployeeId: (process.env.PRIMARY_SUPER_ADMIN_EMPID || 'SES-ADMIN-01').trim(),

    /**
     * Determine whether a user is the single authoritative Primary Super Admin.
     * Evaluates explicit document flag, or configured centralized identity.
     * Never uses oldest-user or unverified employee ID promotion.
     * 
     * @param {Object} user - User document or session object
     * @returns {boolean} True if the user is the Primary Super Admin
     */
    isPrimarySuperAdmin: function(user) {
        if (!user) return false;
        
        // 1. Explicit document flag
        if (user.isPrimarySuperAdmin === true) {
            return true;
        }

        // 2. Strict configured identity match (Must have role SUPER_ADMIN)
        if (user.role === 'SUPER_ADMIN') {
            const email = (user.email || '').trim().toLowerCase();
            if (email && email === this.primarySuperAdminEmail) {
                return true;
            }
            if (this.primarySuperAdminEmployeeId && user.employeeId === this.primarySuperAdminEmployeeId) {
                return true;
            }
        }

        return false;
    }
};

module.exports = AUTH_CONFIG;
