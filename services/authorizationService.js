/**
 * SHIVAY ENERGY SOLUTIONS - Central Authorization Engine
 * Single Source of Truth for RBAC + FBAC + Granular Action & Field Permissions
 * 
 * Provides centralized evaluation helpers, data scope isolation, maker-checker
 * rules, and stale session revocation management.
 */

const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    isValidPermission,
    isValidFieldPermission
} = require('../config/permissionRegistry');

const AUTH_CONFIG = require('../config/authConfig');
const AuditService = require('./auditService');
const mongoose = require('mongoose');

class AuthorizationService {
    /**
     * Check if a user is the single authoritative Primary Super Admin.
     * Evaluates centralized identity configuration with full system bypass.
     * 
     * @param {Object} user 
     * @returns {boolean}
     */
    static isPrimarySuperAdmin(user) {
        return AUTH_CONFIG.isPrimarySuperAdmin(user);
    }

    /**
     * Check if a user has an active, valid account status.
     * Inactive, suspended or rejected accounts are denied access.
     * 
     * @param {Object} user 
     * @returns {boolean}
     */
    static isAccountActive(user) {
        if (!user) return false;
        if (['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(user.status)) return false;
        return true;
    }

    /**
     * Evaluate single granular permission key (<module>.<feature>.<action>).
     * Deny access by default. Primary Super Admin receives unconditional bypass.
     * 
     * @param {Object} user - User document or session user object
     * @param {string} permissionKey - Canonical permission key
     * @returns {boolean}
     */
    static hasPermission(user, permissionKey) {
        if (!user || !permissionKey) return false;

        // Primary Super Admin Unconditional Bypass
        if (this.isPrimarySuperAdmin(user)) return true;

        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(user.permissions)) return false;
        return user.permissions.includes(permissionKey);
    }

    /**
     * Check if user possesses at least one of the specified permissions.
     * 
     * @param {Object} user 
     * @param {string[]} permissionKeys 
     * @returns {boolean}
     */
    static hasAnyPermission(user, permissionKeys = []) {
        if (!user) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) return false;
        return permissionKeys.some(key => this.hasPermission(user, key));
    }

    /**
     * Check if user possesses all of the specified permissions.
     * 
     * @param {Object} user 
     * @param {string[]} permissionKeys 
     * @returns {boolean}
     */
    static hasAllPermissions(user, permissionKeys = []) {
        if (!user) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) return false;
        return permissionKeys.every(key => this.hasPermission(user, key));
    }

    /**
     * Check whether a user can perform a manager-level operational action:
     * allowed for Super Admin, Branch Manager/Manager, OR an Employee explicitly granted
     * at least one of the required operational edit/manage/approve permissions.
     * Does NOT bypass Super Admin system/governance routes.
     */
    static hasOperationalPrivilege(user, permissionKeys = []) {
        if (!user) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;
        if (['SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER'].includes(user.role)) return true;
        const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
        return this.hasAnyPermission(user, keys.filter(Boolean));
    }

    /**
     * Check if user has entry access to a top-level functional module.
     * Access is granted if user has `<module>.module.access` OR any feature permission
     * within that module.
     * 
     * @param {Object} user 
     * @param {string} moduleKey - e.g. 'material', 'inventory', 'crm', 'attendance'
     * @returns {boolean}
     */
    static hasModuleAccess(user, moduleKey) {
        if (!user || !moduleKey) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(user.permissions)) return false;

        // Direct module access permission
        if (user.permissions.includes(`${moduleKey}.module.access`)) return true;

        // Prefix match: Has any capability inside this module
        const prefix = `${moduleKey}.`;
        return user.permissions.some(p => typeof p === 'string' && p.startsWith(prefix));
    }

    /**
     * Check if user has access to a specific feature within a module.
     * 
     * @param {Object} user 
     * @param {string} moduleKey - e.g. 'material'
     * @param {string} featureKey - e.g. 'catalog'
     * @returns {boolean}
     */
    static hasFeatureAccess(user, moduleKey, featureKey) {
        if (!user || !moduleKey || !featureKey) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(user.permissions)) return false;

        const prefix = `${moduleKey}.${featureKey}.`;
        return user.permissions.some(p => typeof p === 'string' && p.startsWith(prefix));
    }

    /**
     * Check if user can execute a specific action on a feature.
     * 
     * @param {Object} user 
     * @param {string} moduleKey - e.g. 'projects'
     * @param {string} featureKey - e.g. 'records'
     * @param {string} actionKey - e.g. 'view', 'create', 'edit', 'delete', 'approve'
     * @returns {boolean}
     */
    static hasActionAccess(user, moduleKey, featureKey, actionKey) {
        const canonicalKey = `${moduleKey}.${featureKey}.${actionKey}`;
        return this.hasPermission(user, canonicalKey);
    }

    /**
     * Check if user is authorized to view a sensitive or confidential data field.
     * 
     * @param {Object} user 
     * @param {string} fieldKey - e.g. 'fields.material.purchase_price.view'
     * @returns {boolean}
     */
    static hasFieldAccess(user, fieldKey) {
        if (!user || !fieldKey) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (!this.isAccountActive(user)) return false;

        if (!Array.isArray(user.fieldPermissions)) return false;
        return user.fieldPermissions.includes(fieldKey);
    }

    /**
     * Alias for hasFieldAccess to maintain API symmetry with hasPermission.
     */
    static hasFieldPermission(user, fieldKey) {
        return this.hasFieldAccess(user, fieldKey);
    }

    /**
     * Enforce branch-level data isolation.
     * Primary Super Admin can access all branches.
     * Users with branchId can only access records belonging to their assigned branch.
     * 
     * @param {Object} user 
     * @param {string|Object} targetBranchId 
     * @param {boolean} [allowEmptyContext=true] - Whether to allow missing branch for own user context
     * @returns {boolean}
     */
    static canAccessBranch(user, targetBranchId, allowEmptyContext = true) {
        if (!user) return false;
        if (!this.isAccountActive(user)) return false;
        if (this.isPrimarySuperAdmin(user)) return true;
        if (user.dataScope === 'GLOBAL') return true;

        // If no target branch specified, allow only when explicitly permitted context validation
        if (!targetBranchId) return allowEmptyContext === true;

        const normalizeId = (val) => {
            if (!val) return '';
            if (typeof val === 'object' && val._id) return val._id.toString();
            return val.toString();
        };

        const targetBranchStr = normalizeId(targetBranchId);

        // Check authorizedBranches if MULTI_BRANCH scope
        if (user.dataScope === 'MULTI_BRANCH' && Array.isArray(user.authorizedBranches)) {
            const hasBranch = user.authorizedBranches.some(b => normalizeId(b) === targetBranchStr);
            if (hasBranch) return true;
        }

        // User must have an assigned branch
        if (!user.branchId) return false;

        const userBranchStr = normalizeId(user.branchId);
        return userBranchStr === targetBranchStr;
    }

    /**
     * Specifically verify that a user can access a sensitive record's branch.
     * Strictly fails closed (deny) if the record has missing or unassigned branch.
     */
    static canAccessRecordBranch(user, recordOrBranch) {
        if (!recordOrBranch) return false;
        const branchId = typeof recordOrBranch === 'object' 
            ? (recordOrBranch.branchId || recordOrBranch.branch || null)
            : recordOrBranch;
        return this.canAccessBranch(user, branchId, false);
    }

    /**
     * Alias for getAccessibleDataScope.
     */
    static buildScopedQuery(user, moduleKey) {
        return this.getAccessibleDataScope(user, moduleKey);
    }

    /**
     * Construct the MongoDB data scope query filter for a given user and module.
     * Used by controllers to avoid duplicated and error-prone branch filtering.
     * 
     * @param {Object} user 
     * @param {string} moduleKey 
     * @returns {Object} { isGlobal, branchId, queryFilter, canViewAll }
     */
    static getAccessibleDataScope(user, moduleKey) {
        if (!user || !this.isAccountActive(user)) {
            return {
                isGlobal: false,
                branchId: null,
                queryFilter: { _id: null }, // Deny all
                canViewAll: false
            };
        }

        // Primary Super Admin or explicit GLOBAL data scope: Full global view
        if (this.isPrimarySuperAdmin(user) || user.dataScope === 'GLOBAL') {
            return {
                isGlobal: true,
                branchId: null,
                queryFilter: {},
                canViewAll: true
            };
        }

        // Check if user has company-wide view permission for this module
        const allViewKey = `${moduleKey}.all.view`;
        if (this.hasPermission(user, allViewKey)) {
            return {
                isGlobal: true,
                branchId: null,
                queryFilter: {},
                canViewAll: true
            };
        }

        // OWN data scope: Strictly restricted to records created by user within their assigned branch
        if (user.dataScope === 'OWN') {
            const rawBranchId = user.branchId ? (user.branchId._id || user.branchId) : null;
            const filter = { createdBy: user._id };
            if (rawBranchId) {
                filter.branchId = rawBranchId;
            }
            return {
                isGlobal: false,
                scope: 'OWN',
                branchId: rawBranchId,
                queryFilter: filter,
                canViewAll: false
            };
        }

        // ASSIGNED data scope: Created by, assigned to, or managed by user within their assigned branch
        if (user.dataScope === 'ASSIGNED') {
            const rawBranchId = user.branchId ? (user.branchId._id || user.branchId) : null;
            const filter = {
                $or: [
                    { createdBy: user._id },
                    { assignedEmployee: user._id },
                    { managerId: user._id }
                ]
            };
            if (rawBranchId) {
                filter.branchId = rawBranchId;
            }
            return {
                isGlobal: false,
                scope: 'ASSIGNED',
                branchId: rawBranchId,
                queryFilter: filter,
                canViewAll: false
            };
        }

        // MULTI_BRANCH data scope: Query records matching assigned branch or any authorized branch
        if (user.dataScope === 'MULTI_BRANCH' && Array.isArray(user.authorizedBranches) && user.authorizedBranches.length > 0) {
            const normalizeId = (val) => {
                if (!val) return null;
                if (typeof val === 'object' && val._id) return val._id;
                return val;
            };
            const branchIds = [normalizeId(user.branchId), ...user.authorizedBranches.map(normalizeId)].filter(Boolean);
            return {
                isGlobal: false,
                branchId: user.branchId ? (user.branchId._id || user.branchId) : null,
                queryFilter: { branchId: { $in: branchIds } },
                canViewAll: false
            };
        }

        // Branch-restricted scope (Default)
        if (user.branchId) {
            const rawBranchId = (user.branchId._id || user.branchId);
            return {
                isGlobal: false,
                branchId: rawBranchId,
                queryFilter: { branchId: rawBranchId },
                canViewAll: false
            };
        }

        // Fallback: strictly restricted to creator/assigned records
        return {
            isGlobal: false,
            branchId: null,
            queryFilter: {
                $or: [
                    { createdBy: user._id },
                    { assignedEmployee: user._id },
                    { managerId: user._id }
                ]
            },
            canViewAll: false
        };
    }

    /**
     * Enforce Maker-Checker approval restrictions.
     * Prevents self-approval of commercial quotations and unauthorized sign-offs.
     * Preserves single Branch Manager self-approval where business rule 1.1 applies.
     * 
     * Supports both signatures:
     * - canPerformMakerChecker(user, domain, record, options)
     * - canPerformMakerChecker(user, record, branchOrOptions)
     * 
     * @param {Object} user - The approving user
     * @param {string|Object} domainOrRecord - 'quotations' or the record object directly
     * @param {Object} recordOrBranch - The record or branch options
     * @param {Object} optionsOrBranch - Branch or options dictionary
     * @returns {Object} { allowed: boolean, reason?: string, rule?: string }
     */
    static canPerformMakerChecker(user, domainOrRecord, recordOrBranch = null, optionsOrBranch = {}) {
        if (!user || !this.isAccountActive(user)) {
            return { allowed: false, reason: 'Unauthenticated or inactive user.' };
        }

        // Primary Super Admin unconditional bypass
        if (this.isPrimarySuperAdmin(user)) {
            return { allowed: true };
        }

        let domain = 'quotations';
        let record = null;
        let branch = null;
        let options = {};

        if (typeof domainOrRecord === 'string') {
            domain = domainOrRecord;
            record = recordOrBranch;
            if (optionsOrBranch && optionsOrBranch.isSingleManagerBranch !== undefined) {
                branch = optionsOrBranch;
            } else {
                options = optionsOrBranch || {};
                branch = options.branch || null;
            }
        } else {
            // Invocation: canPerformMakerChecker(user, record, branchOrOptions)
            domain = 'quotations';
            record = domainOrRecord;
            if (recordOrBranch && recordOrBranch.isSingleManagerBranch !== undefined) {
                branch = recordOrBranch;
            } else {
                options = recordOrBranch || {};
                branch = options.branch || null;
            }
        }

        if (domain === 'quotations') {
            // Check basic approval permission
            if (!this.hasPermission(user, 'quotations.approval.approve')) {
                return { allowed: false, reason: 'Missing required permission: quotations.approval.approve' };
            }

            // Role Seniority Check: Employees can NEVER approve commercial quotations
            if (user.role === 'EMPLOYEE') {
                return { allowed: false, reason: 'Role hierarchy violation: Employees cannot approve commercial quotations.' };
            }

            if (record) {
                const total = Number(record.grandTotal !== undefined ? record.grandTotal : (record.netPayableAfterSubsidy !== undefined ? record.netPayableAfterSubsidy : (record.totalAmount !== undefined ? record.totalAmount : 0)));
                if (isNaN(total) || total < 0) {
                    return { allowed: false, reason: 'INVALID_FINANCIAL_TOTAL', message: 'Invalid quotation financial total.' };
                }

                const preparedById = (record.preparedBy?._id || record.preparedBy || record.createdBy?._id || record.createdBy || '').toString();
                const userId = (user._id?._id || user._id || '').toString();

                if (preparedById && userId && preparedById === userId) {
                    // Check Business Rule 1.1: Single Manager Branch exception (strictly requires verified branch configuration)
                    const isSingleManager = branch 
                        ? (branch.isSingleManagerBranch === true) 
                        : (options && options.isSingleManagerBranch === true);

                    if (isSingleManager) {
                        const limit = (branch && branch.singleManagerApprovalLimit) || (options && options.singleManagerApprovalLimit) || 500000;
                        if (total <= limit) {
                            return {
                                allowed: true,
                                rule: 'BUSINESS_RULE_1_1_SINGLE_MANAGER_EXCEPTION',
                                reason: 'Self-approval permitted for single-manager branch within financial threshold.'
                            };
                        } else {
                            return {
                                allowed: false,
                                reason: 'EXCEEDS_SINGLE_MANAGER_THRESHOLD',
                                message: `Quotation total (₹${total}) exceeds single-manager approval threshold (₹${limit}). Super Admin approval required.`
                            };
                        }
                    }

                    // Dual-authority branch or unverified branch configuration: Creator cannot approve their own quotation
                    return {
                        allowed: false,
                        reason: 'CANNOT_SELF_APPROVE',
                        message: 'Maker-Checker Separation: You cannot approve a quotation that you prepared. Another manager or Super Admin must review it.'
                    };
                }
            }

            return { allowed: true };
        }

        if (domain === 'projects') {
            if (!this.hasPermission(user, 'projects.completion.approve')) {
                return { allowed: false, reason: 'Missing required permission: projects.completion.approve' };
            }
            if (user.role === 'EMPLOYEE') {
                return { allowed: false, reason: 'Role hierarchy violation: Employees cannot give final project commissioning sign-off.' };
            }
            return { allowed: true };
        }

        if (domain === 'inventory') {
            if (!this.hasPermission(user, 'inventory.purchases.approve')) {
                return { allowed: false, reason: 'Missing required permission: inventory.purchases.approve' };
            }
            // Disallow self-approval for purchase adjustments if specified
            if (options.disallowSelfApproval && record) {
                const creatorId = (record.createdBy?._id || record.createdBy || '').toString();
                const userId = (user._id?._id || user._id || '').toString();
                if (creatorId && userId && creatorId === userId) {
                    return { allowed: false, reason: 'Maker-Checker Violation: You cannot approve your own purchase order.' };
                }
            }
            return { allowed: true };
        }

        // Unknown maker-checker domain: Fail closed (deny by default)
        return { allowed: false, reason: `Unknown maker-checker domain: ${domain}` };
    }

    /**
     * Prevent privilege escalation during user management operations.
     * Prevents non-primary admins from promoting themselves or assigning permissions they do not hold.
     * 
     * @param {Object} callerUser - The administrator or manager performing the action
     * @param {Object} targetUser - The user document being modified
     * @param {Object} requestedChanges - Requested role or permission changes
     * @returns {Object} { allowed: boolean, reason?: string }
     */
    static preventPrivilegeEscalation(callerUser, targetUser, requestedChanges = {}) {
        if (!callerUser) {
            return { allowed: false, reason: 'Caller identity required.' };
        }

        // Primary Super Admin can make any changes
        if (this.isPrimarySuperAdmin(callerUser)) {
            return { allowed: true };
        }

        const callerId = (callerUser._id?._id || callerUser._id || '').toString();
        const targetId = targetUser ? (targetUser._id?._id || targetUser._id || '').toString() : '';

        // 1. Prevent non-Primary Admin from creating or setting isPrimarySuperAdmin: true
        if (requestedChanges.isPrimarySuperAdmin === true) {
            return { allowed: false, reason: 'Security Violation: Only the Primary Super Admin can designate primary status.' };
        }

        // 2. Prevent modifying or tampering with the Primary Super Admin account
        if (targetUser && this.isPrimarySuperAdmin(targetUser)) {
            return { allowed: false, reason: 'Security Violation: Only the Primary Super Admin can modify the Primary Super Admin account.' };
        }

        // 3. Prevent Self-Privilege Escalation (User modifying their own permissions or role)
        if (callerId && targetId && callerId === targetId) {
            if (requestedChanges.role && requestedChanges.role !== callerUser.role) {
                return { allowed: false, reason: 'Privilege Escalation: Users cannot alter their own organizational role.' };
            }
            if (requestedChanges.permissions || requestedChanges.fieldPermissions) {
                return { allowed: false, reason: 'Privilege Escalation: Users cannot grant themselves additional permissions.' };
            }
        }

        // 4. Non-Super-Admin cannot create or promote anyone to SUPER_ADMIN
        if (requestedChanges.role === 'SUPER_ADMIN' && callerUser.role !== 'SUPER_ADMIN') {
            return { allowed: false, reason: 'Privilege Escalation: Only Super Admins can assign the SUPER_ADMIN role.' };
        }

        // 5. Delegation Boundary: A caller cannot delegate permissions they do not possess
        if (Array.isArray(requestedChanges.permissions)) {
            const callerPerms = Array.isArray(callerUser.permissions) ? callerUser.permissions : [];
            const illegalPerms = requestedChanges.permissions.filter(p => !callerPerms.includes(p));
            if (illegalPerms.length > 0) {
                return {
                    allowed: false,
                    reason: `Privilege Escalation: You cannot delegate permissions you do not possess (${illegalPerms.slice(0, 3).join(', ')}).`
                };
            }
        }

        // 6. Sensitive Field Delegation Boundary: A caller cannot delegate field permissions they do not possess
        if (Array.isArray(requestedChanges.fieldPermissions)) {
            const callerFieldPerms = Array.isArray(callerUser.fieldPermissions) ? callerUser.fieldPermissions : [];
            const illegalFields = requestedChanges.fieldPermissions.filter(f => !callerFieldPerms.includes(f));
            if (illegalFields.length > 0) {
                return {
                    allowed: false,
                    reason: `Privilege Escalation: You cannot delegate field permissions you do not possess (${illegalFields.slice(0, 3).join(', ')}).`
                };
            }
        }

        // 7. Authorized Branch Assignment Boundary: Non-global callers cannot assign branches outside their own authorization
        if (Array.isArray(requestedChanges.authorizedBranches) && callerUser.dataScope !== 'GLOBAL') {
            const callerBranches = (Array.isArray(callerUser.authorizedBranches) ? callerUser.authorizedBranches : []).map(b => (b._id || b).toString());
            if (callerUser.branchId) callerBranches.push((callerUser.branchId._id || callerUser.branchId).toString());
            const illegalBranches = requestedChanges.authorizedBranches.filter(b => !callerBranches.includes((b._id || b).toString()));
            if (illegalBranches.length > 0) {
                return {
                    allowed: false,
                    reason: 'Privilege Escalation: You cannot assign authorized branches outside your own assigned branches.'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Stale Session Invalidation & Permission Synchronization Engine.
     * Compares permissionVersion between session user and fresh database user.
     * Updates session permissions immediately upon revocation or modification.
     * 
     * @param {Object} sessionUser - The user object cached in req.session.user
     * @param {Object} freshUser - Freshly retrieved user record from DB or DataStore
     * @returns {Object} { valid: boolean, refreshed: boolean, reason?: string }
     */
    static validateAndSynchronizeSession(sessionUser, freshUser) {
        if (!freshUser) {
            return { valid: false, reason: 'USER_DELETED' };
        }

        // Inactive account check
        if (['SUSPENDED', 'INACTIVE', 'REJECTED', 'PENDING'].includes(freshUser.status)) {
            return { valid: false, reason: 'ACCOUNT_INACTIVE', status: freshUser.status };
        }

        // Version mismatch check: Revocation or permission update occurred
        const sessionVersion = sessionUser.permissionVersion || 0;
        const freshVersion = freshUser.permissionVersion || 1;

        if (sessionVersion !== freshVersion) {
            // Immediate hot-refresh of session credentials
            sessionUser.permissions = freshUser.permissions || [];
            sessionUser.fieldPermissions = freshUser.fieldPermissions || [];
            sessionUser.role = freshUser.role;
            sessionUser.branchId = freshUser.branchId;
            sessionUser.dataScope = freshUser.dataScope || 'BRANCH';
            sessionUser.authorizedBranches = freshUser.authorizedBranches || [];
            sessionUser.status = freshUser.status;
            sessionUser.isPrimarySuperAdmin = this.isPrimarySuperAdmin(freshUser);
            sessionUser.permissionVersion = freshVersion;

            return { valid: true, refreshed: true };
        }

        return { valid: true, refreshed: false };
    }

    /**
     * Mask or redact sensitive financial and PII fields based on field permissions.
     * 
     * @param {Object} user 
     * @param {Object|Array} data - Data record or array of records
     * @returns {Object|Array} Redacted copy
     */
    static filterSensitiveFields(user, data) {
        if (!data) return data;
        if (this.isPrimarySuperAdmin(user)) return data;

        const hasPurchasePrice = this.hasFieldAccess(user, 'fields.material.purchase_price.view');
        const hasWac = this.hasFieldAccess(user, 'fields.inventory.wac.view');
        const hasProfitMargin = this.hasFieldAccess(user, 'fields.inventory.profit_margin.view') || this.hasFieldAccess(user, 'fields.quotation.profit_margin.view');
        const hasCostBreakdown = this.hasFieldAccess(user, 'fields.quotation.cost_breakdown.view');
        const hasFinancialMetrics = this.hasFieldAccess(user, 'fields.invoice.financial_metrics.view') || this.hasFieldAccess(user, 'fields.reports.financial_metrics.view');
        const hasCustomerPii = this.hasFieldAccess(user, 'fields.customer.pii.view');

        const maskPhone = (phoneStr) => {
            if (!phoneStr || typeof phoneStr !== 'string') return phoneStr;
            const clean = phoneStr.replace(/[^0-9]/g, '');
            if (clean.length >= 10) {
                return 'XXXXXX' + clean.slice(-4);
            } else if (clean.length >= 4) {
                return 'XXXXXX' + clean.slice(-2);
            }
            return 'XXXXXX';
        };

        const maskEmail = (emailStr) => {
            if (!emailStr || typeof emailStr !== 'string') return emailStr;
            const atIdx = emailStr.indexOf('@');
            if (atIdx > 2) {
                return emailStr.substring(0, 2) + '****' + emailStr.substring(atIdx);
            }
            return '****' + (atIdx >= 0 ? emailStr.substring(atIdx) : '');
        };

        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return obj;
            if (mongoose && mongoose.isValidObjectId && (obj instanceof mongoose.Types.ObjectId || (typeof obj === 'object' && obj._bsontype === 'ObjectID'))) return obj;
            if (Array.isArray(obj)) {
                return obj.map(item => sanitizeObject(item));
            }

            let base = obj;
            if (typeof obj.toObject === 'function') {
                base = obj.toObject({ getters: false, virtuals: false });
            }

            const copy = { ...base };

            if (!hasPurchasePrice) {
                delete copy.purchasePrice;
                delete copy.purchase_price;
                delete copy.costPrice;
                delete copy.cost_price;
                delete copy.unitCost;
                delete copy.unit_cost;
                delete copy.unitPurchasePrice;
                delete copy.unit_purchase_price;
                delete copy.effectiveUnitCost;
            }
            if (!hasWac) {
                delete copy.wacPrice;
                delete copy.wac;
                delete copy.averageCost;
                delete copy.average_cost;
                delete copy.inventoryValuation;
                delete copy.inventory_valuation;
                delete copy.weightedAverageCost;
            }
            if (!hasProfitMargin) {
                delete copy.profitMargin;
                delete copy.profit_margin;
                delete copy.marginPercentage;
                delete copy.margin_percentage;
                delete copy.marginAmount;
                delete copy.margin_amount;
                delete copy.profitMarginPercentage;
            }
            if (!hasCostBreakdown) {
                delete copy.costBreakdown;
                delete copy.cost_breakdown;
                delete copy.internalCosting;
                delete copy.dealerMargin;
                delete copy.internalCost;
                delete copy.dealerCost;
            }
            if (!hasFinancialMetrics) {
                delete copy.financialMetrics;
                delete copy.financial_metrics;
                delete copy.netProfit;
                delete copy.net_profit;
                delete copy.grossTurnover;
                delete copy.gross_turnover;
            }
            if (!hasCustomerPii) {
                if (copy.mobile) copy.mobile = maskPhone(copy.mobile);
                if (copy.customerMobile) copy.customerMobile = maskPhone(copy.customerMobile);
                if (copy.clientMobile) copy.clientMobile = maskPhone(copy.clientMobile);
                if (copy.alternateMobile) copy.alternateMobile = maskPhone(copy.alternateMobile);
                if (copy.email) copy.email = maskEmail(copy.email);
            }

            // Recurse into nested object properties (e.g. populated customer, material, items, etc.)
            for (const key of Object.keys(copy)) {
                if (copy[key] && typeof copy[key] === 'object' && !(copy[key] instanceof Date) && !(mongoose && mongoose.isValidObjectId && copy[key] instanceof mongoose.Types.ObjectId)) {
                    copy[key] = sanitizeObject(copy[key]);
                }
            }

            return copy;
        };

        return Array.isArray(data) ? data.map(item => sanitizeObject(item)) : sanitizeObject(data);
    }
}

module.exports = AuthorizationService;
