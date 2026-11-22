/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 2 Verification
 * Central Authorization Engine, Evaluators, Middleware & Security Enforcement
 */

const assert = require('assert');
const mongoose = require('mongoose');
const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES
} = require('../config/permissionRegistry');

const AUTH_CONFIG = require('../config/authConfig');
const AuthorizationService = require('../services/authorizationService');
const User = require('../models/User');
const DataStore = require('../services/dataStore');
const {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireManager,
    requireEmployee,
    requireBranchAccess,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
    requireModuleAccess,
    requireActionAccess,
    requireFieldAccess,
    authorize
} = require('../middleware/authMiddleware');

let testsPassed = 0;
let testsFailed = 0;

function it(name, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        testsFailed++;
    }
}

async function itAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        testsFailed++;
    }
}

async function runPhase2TestSuite() {
    console.log('='.repeat(70));
    console.log('🧪 RBAC + FBAC PHASE 2: CENTRAL AUTHORIZATION ENGINE TEST SUITE');
    console.log('='.repeat(70));

    // -------------------------------------------------------------
    console.log('\n--- 1. Primary Super Admin Full-Access & Bypass ---');
    // -------------------------------------------------------------

    it('Primary Super Admin has unconditional bypass across all modules, permissions, and fields', () => {
        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Root Admin',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE',
            permissions: [], // Even empty permissions array must bypass
            fieldPermissions: []
        };

        // All Module Access
        assert.strictEqual(AuthorizationService.isPrimarySuperAdmin(primaryAdmin), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'attendance'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'projects'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'quotations'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'invoices'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'material'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'inventory'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'dispatch'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'settings'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'any_future_module'), true);

        // Granular Permissions
        assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'quotations.approval.approve'), true);
        assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'inventory.purchases.approve'), true);
        assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'material.catalog.create'), true);

        // Sensitive Fields
        assert.strictEqual(AuthorizationService.hasFieldAccess(primaryAdmin, 'fields.material.purchase_price.view'), true);
        assert.strictEqual(AuthorizationService.hasFieldAccess(primaryAdmin, 'fields.inventory.wac.view'), true);
        assert.strictEqual(AuthorizationService.hasFieldAccess(primaryAdmin, 'fields.quotation.profit_margin.view'), true);

        // Branch Bypass
        assert.strictEqual(AuthorizationService.canAccessBranch(primaryAdmin, 'any-branch-id'), true);
        assert.strictEqual(AuthorizationService.canAccessBranch(primaryAdmin, null), true);

        // Global Data Scope
        const scope = AuthorizationService.getAccessibleDataScope(primaryAdmin, 'quotations');
        assert.strictEqual(scope.isGlobal, true);
        assert.strictEqual(scope.canViewAll, true);
        assert.deepStrictEqual(scope.queryFilter, {});
    });

    it('Centralized Primary Super Admin identity matches configured credentials without hardcoding', () => {
        const configuredAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Configured Enterprise Head',
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE'
        };

        assert.strictEqual(AUTH_CONFIG.isPrimarySuperAdmin(configuredAdmin), true);
        assert.strictEqual(AuthorizationService.isPrimarySuperAdmin(configuredAdmin), true);
    });

    // -------------------------------------------------------------
    console.log('\n--- 2. New Super Admin Default & Zero-Access Baseline ---');
    // -------------------------------------------------------------

    it('Newly created Super Admin defaults to empty permissions and has zero application access', () => {
        const secondaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Secondary Admin',
            email: 'newadmin@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: [],
            permissionVersion: 1
        };

        // Role SUPER_ADMIN alone does NOT grant access
        assert.strictEqual(AuthorizationService.isPrimarySuperAdmin(secondaryAdmin), false);
        assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'quotations.approval.approve'), false);
        assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'material.catalog.view'), false);
        assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'invoices.records.create'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(secondaryAdmin, 'invoices'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(secondaryAdmin, 'settings'), false);
        assert.strictEqual(AuthorizationService.hasFieldAccess(secondaryAdmin, 'fields.material.purchase_price.view'), false);
    });

    await itAsync('requireSuperAdmin blocks secondary Super Admin with empty permissions (HTTP 403)', async () => {
        const emptyAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Empty Admin',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            permissions: [],
            status: 'ACTIVE'
        };

        let statusCode = 200;
        let responseJson = null;

        const req = {
            session: { user: emptyAdmin },
            _authVerified: true,
            xhr: true,
            path: '/api/admin/users',
            ip: '127.0.0.1'
        };

        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseJson = data; return res; }
        };

        const middleware = requireSuperAdmin;
        let nextCalled = false;
        await middleware(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false, 'Next must not be called when secondary admin has empty permissions');
        assert.strictEqual(statusCode, 403, 'Must return HTTP 403 Forbidden');
        assert.strictEqual(responseJson.success, false);
        assert.ok(responseJson.message.includes('Newly created Super Admin has no permissions assigned'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 3. Explicit Permission Assignment & Granular Scope ---');
    // -------------------------------------------------------------

    it('User with explicitly assigned permissions is granted ONLY those capabilities', () => {
        const specializedManager = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Operations Lead',
            role: 'MANAGER',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: [
                'material.module.access',
                'material.catalog.view',
                'material.catalog.create',
                'dispatch.orders.view'
            ],
            fieldPermissions: []
        };

        // Allowed
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'material.catalog.view'), true);
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'material.catalog.create'), true);
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'dispatch.orders.view'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'material'), true);
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'dispatch'), true);

        // Denied other actions in same module
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'material.catalog.edit'), false);
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'material.catalog.delete'), false);
        assert.strictEqual(AuthorizationService.hasPermission(specializedManager, 'dispatch.orders.create'), false);

        // Denied other modules
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'quotations'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'invoices'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'users'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(specializedManager, 'settings'), false);
    });

    it('hasAnyPermission and hasAllPermissions evaluate compound permissions correctly', () => {
        const user = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['attendance.punch.create', 'projects.tasks.view']
        };

        // hasAnyPermission
        assert.strictEqual(AuthorizationService.hasAnyPermission(user, ['attendance.punch.create', 'invoices.records.view']), true);
        assert.strictEqual(AuthorizationService.hasAnyPermission(user, ['quotations.records.view', 'invoices.records.view']), false);

        // hasAllPermissions
        assert.strictEqual(AuthorizationService.hasAllPermissions(user, ['attendance.punch.create', 'projects.tasks.view']), true);
        assert.strictEqual(AuthorizationService.hasAllPermissions(user, ['attendance.punch.create', 'quotations.records.view']), false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 4. Action-Level Permissions Enforcement ---');
    // -------------------------------------------------------------

    it('hasActionAccess evaluates specific canonical action verbs', () => {
        const engineer = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: [
                'projects.records.view',
                'projects.tasks.edit'
            ]
        };

        assert.strictEqual(AuthorizationService.hasActionAccess(engineer, 'projects', 'records', 'view'), true);
        assert.strictEqual(AuthorizationService.hasActionAccess(engineer, 'projects', 'tasks', 'edit'), true);
        assert.strictEqual(AuthorizationService.hasActionAccess(engineer, 'projects', 'records', 'create'), false);
        assert.strictEqual(AuthorizationService.hasActionAccess(engineer, 'projects', 'completion', 'approve'), false);
    });

    await itAsync('requirePermission middleware enforces granular action permissions on API routes', async () => {
        const viewOnlyUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view']
        };

        // 1. Authorized action
        let authorizedNext = false;
        const authReq = { session: { user: viewOnlyUser }, _authVerified: true };
        const authRes = {};
        await requirePermission('material.catalog.view')(authReq, authRes, () => { authorizedNext = true; });
        assert.strictEqual(authorizedNext, true, 'User with permission must proceed to next()');

        // 2. Unauthorized action
        let unauthorizedNext = false;
        let blockedStatus = 200;
        let blockedJson = null;
        const unauthReq = {
            session: { user: viewOnlyUser },
            _authVerified: true,
            xhr: true,
            path: '/api/materials/create'
        };
        const unauthRes = {
            status: (code) => { blockedStatus = code; return unauthRes; },
            json: (data) => { blockedJson = data; return unauthRes; }
        };
        await requirePermission('material.catalog.create')(unauthReq, unauthRes, () => { unauthorizedNext = true; });
        assert.strictEqual(unauthorizedNext, false, 'User lacking permission must be blocked');
        assert.strictEqual(blockedStatus, 403, 'Must return HTTP 403');
        assert.strictEqual(blockedJson.success, false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 5. Field-Level Permissions & Sensitive Data Masking ---');
    // -------------------------------------------------------------

    it('filterSensitiveFields redacts confidential financial metrics from users lacking field permissions', () => {
        const standardStaff = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: [] // No sensitive field permissions
        };

        const sampleMaterial = {
            _id: 'mat-101',
            name: '540W Mono PERC Solar Panel',
            sku: 'SP-540-MONO',
            currentStock: 120,
            purchasePrice: 11500, // Sensitive
            unitCost: 11200,      // Sensitive
            retailPrice: 14500
        };

        const redacted = AuthorizationService.filterSensitiveFields(standardStaff, sampleMaterial);
        assert.strictEqual(redacted.name, '540W Mono PERC Solar Panel');
        assert.strictEqual(redacted.retailPrice, 14500);
        assert.strictEqual(redacted.purchasePrice, undefined, 'Purchase price must be redacted');
        assert.strictEqual(redacted.unitCost, undefined, 'Unit cost must be redacted');
    });

    it('filterSensitiveFields preserves confidential data for users WITH explicit field permissions', () => {
        const procurementManager = {
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: ['fields.material.purchase_price.view']
        };

        const sampleMaterial = {
            _id: 'mat-102',
            name: '10kW Grid Tie Inverter',
            purchasePrice: 65000,
            retailPrice: 78000
        };

        const result = AuthorizationService.filterSensitiveFields(procurementManager, sampleMaterial);
        assert.strictEqual(result.purchasePrice, 65000, 'User with field permission must see purchase price');
    });

    // -------------------------------------------------------------
    console.log('\n--- 6. Branch-Level Data Isolation ---');
    // -------------------------------------------------------------

    it('canAccessBranch enforces multi-branch boundaries', () => {
        const branchRaisenManager = {
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            branchId: 'br-raisen-01'
        };

        // Same branch -> Allowed
        assert.strictEqual(AuthorizationService.canAccessBranch(branchRaisenManager, 'br-raisen-01'), true);

        // Different branch -> Denied
        assert.strictEqual(AuthorizationService.canAccessBranch(branchRaisenManager, 'br-bhopal-02'), false);

        // No branch specified -> Acting in own context -> Allowed
        assert.strictEqual(AuthorizationService.canAccessBranch(branchRaisenManager, null), true);
    });

    it('getAccessibleDataScope constructs properly scoped database queries', () => {
        const branchStaff = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            branchId: 'br-raisen-01',
            permissions: ['projects.records.view']
        };

        const scope = AuthorizationService.getAccessibleDataScope(branchStaff, 'projects');
        assert.strictEqual(scope.isGlobal, false);
        assert.strictEqual(scope.canViewAll, false);
        assert.deepStrictEqual(scope.queryFilter, { branchId: 'br-raisen-01' });
    });

    // -------------------------------------------------------------
    console.log('\n--- 7. Permission Revocation & Immediate Session Invalidation ---');
    // -------------------------------------------------------------

    it('validateAndSynchronizeSession immediately invalidates stale sessions when permissions are revoked', () => {
        // User session currently holds 'invoices.records.create' with version 1
        const staleSessionUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['invoices.records.view', 'invoices.records.create'],
            fieldPermissions: [],
            permissionVersion: 1
        };

        // Fresh database document: Admin revoked 'invoices.records.create' -> version bumped to 2
        const freshDbUser = {
            _id: staleSessionUser._id,
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['invoices.records.view'], // Revoked create permission
            fieldPermissions: [],
            permissionVersion: 2
        };

        const syncResult = AuthorizationService.validateAndSynchronizeSession(staleSessionUser, freshDbUser);
        assert.strictEqual(syncResult.valid, true);
        assert.strictEqual(syncResult.refreshed, true, 'Session must be refreshed on version mismatch');

        // Session permissions are now hot-updated
        assert.strictEqual(staleSessionUser.permissions.includes('invoices.records.create'), false);
        assert.strictEqual(staleSessionUser.permissionVersion, 2);

        // Revocation takes effect immediately on authorization check
        assert.strictEqual(AuthorizationService.hasPermission(staleSessionUser, 'invoices.records.create'), false);
    });

    it('validateAndSynchronizeSession marks session invalid if user account was suspended', () => {
        const sessionUser = {
            _id: new mongoose.Types.ObjectId(),
            status: 'ACTIVE',
            permissionVersion: 1
        };

        const suspendedUser = {
            _id: sessionUser._id,
            status: 'SUSPENDED',
            permissionVersion: 2
        };

        const syncResult = AuthorizationService.validateAndSynchronizeSession(sessionUser, suspendedUser);
        assert.strictEqual(syncResult.valid, false);
        assert.strictEqual(syncResult.reason, 'ACCOUNT_INACTIVE');
    });

    // -------------------------------------------------------------
    console.log('\n--- 8. Delegated Administrative Capabilities to Employees ---');
    // -------------------------------------------------------------

    it('Primary Super Admin can delegate individual admin capabilities to an employee without granting full admin rights', () => {
        const delegatedEmployee = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Senior Catalog Specialist',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            isPrimarySuperAdmin: false,
            // Granted administrative material creation & supplier onboarding capabilities
            permissions: [
                'material.module.access',
                'material.catalog.view',
                'material.catalog.create',
                'material.suppliers.view',
                'material.suppliers.create'
            ],
            fieldPermissions: []
        };

        // Allowed delegated administrative actions
        assert.strictEqual(AuthorizationService.hasPermission(delegatedEmployee, 'material.catalog.create'), true);
        assert.strictEqual(AuthorizationService.hasPermission(delegatedEmployee, 'material.suppliers.create'), true);

        // Stays strictly locked out of unrelated administrative governance
        assert.strictEqual(AuthorizationService.hasModuleAccess(delegatedEmployee, 'users'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(delegatedEmployee, 'settings'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(delegatedEmployee, 'invoices'), false);
        assert.strictEqual(AuthorizationService.hasPermission(delegatedEmployee, 'users.employees.create'), false);
        assert.strictEqual(AuthorizationService.hasPermission(delegatedEmployee, 'settings.company.edit'), false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 9. Privilege Escalation Prevention ---');
    // -------------------------------------------------------------

    it('preventPrivilegeEscalation blocks unauthorized attempts to elevate permissions', () => {
        const secondaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            permissions: ['users.employees.view']
        };

        // Attempt 1: Secondary admin attempts to claim Primary Super Admin status
        const attempt1 = AuthorizationService.preventPrivilegeEscalation(secondaryAdmin, secondaryAdmin, {
            isPrimarySuperAdmin: true
        });
        assert.strictEqual(attempt1.allowed, false);
        assert.ok(attempt1.reason.includes('Only the Primary Super Admin can designate primary status'));

        // Attempt 2: User attempts to modify their own role/permissions (Self-Escalation)
        const attempt2 = AuthorizationService.preventPrivilegeEscalation(secondaryAdmin, secondaryAdmin, {
            role: 'SUPER_ADMIN',
            permissions: ['quotations.approval.approve']
        });
        assert.strictEqual(attempt2.allowed, false);
        assert.ok(attempt2.reason.includes('Privilege Escalation'));

        // Attempt 3: Caller attempts to delegate permissions they do not possess
        const manager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'MANAGER',
            permissions: ['projects.records.view']
        };
        const subordinate = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE'
        };
        const attempt3 = AuthorizationService.preventPrivilegeEscalation(manager, subordinate, {
            permissions: ['projects.records.view', 'settings.security.edit'] // Manager doesn't have settings permission
        });
        assert.strictEqual(attempt3.allowed, false);
        assert.ok(attempt3.reason.includes('cannot delegate permissions you do not possess'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 10. Maker-Checker Approval Restrictions ---');
    // -------------------------------------------------------------

    it('canPerformMakerChecker blocks employees from approving commercial quotations', () => {
        const employee = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.create', 'quotations.preparation.create', 'quotations.approval.approve']
        };

        const result = AuthorizationService.canPerformMakerChecker(employee, 'quotations');
        assert.strictEqual(result.allowed, false);
        assert.ok(result.reason.includes('Role hierarchy violation'));
    });

    it('canPerformMakerChecker preserves single Branch Manager self-approval per Business Rule 1.1', () => {
        const branchManager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.approval.approve']
        };

        const quotation = {
            _id: 'q-101',
            preparedBy: branchManager._id
        };

        const result = AuthorizationService.canPerformMakerChecker(branchManager, 'quotations', quotation, { isSingleManagerBranch: true });
        assert.strictEqual(result.allowed, true);
    });

    it('canPerformMakerChecker blocks purchase order self-approval when disallowSelfApproval is set', () => {
        const purchaser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['inventory.purchases.approve']
        };

        const purchaseOrder = {
            _id: 'po-101',
            createdBy: purchaser._id
        };

        const result = AuthorizationService.canPerformMakerChecker(purchaser, 'inventory', purchaseOrder, {
            disallowSelfApproval: true
        });
        assert.strictEqual(result.allowed, false);
        assert.ok(result.reason.includes('Maker-Checker Violation'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 11. Hybrid Authorize Middleware Integration ---');
    // -------------------------------------------------------------

    await itAsync('authorize middleware validates module, permission, and branch isolation in one pipeline', async () => {
        const staffUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            branchId: 'br-raisen-01',
            permissions: ['material.module.access', 'material.catalog.create']
        };

        // Allowed request
        let allowed = false;
        const validReq = {
            session: { user: staffUser },
            _authVerified: true,
            params: { branchId: 'br-raisen-01' }
        };
        const validRes = {};
        await authorize({
            module: 'material',
            permission: 'material.catalog.create',
            checkBranch: true
        })(validReq, validRes, () => { allowed = true; });
        assert.strictEqual(allowed, true);

        // Denied on branch isolation
        let deniedBranch = false;
        let branchStatusCode = 200;
        const breachReq = {
            session: { user: staffUser },
            _authVerified: true,
            params: { branchId: 'br-other-02' },
            xhr: true
        };
        const breachRes = {
            status: (c) => { branchStatusCode = c; return breachRes; },
            json: () => {}
        };
        await authorize({
            module: 'material',
            permission: 'material.catalog.create',
            checkBranch: true
        })(breachReq, breachRes, () => { deniedBranch = true; });
        assert.strictEqual(deniedBranch, false);
        assert.strictEqual(branchStatusCode, 403);
    });

    console.log('='.repeat(70));
    console.log(`🎯 PHASE 2 VERIFICATION RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('='.repeat(70));

    if (testsFailed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runPhase2TestSuite().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runPhase2TestSuite;
