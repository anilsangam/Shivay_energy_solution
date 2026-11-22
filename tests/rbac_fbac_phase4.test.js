/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 4 Verification
 * User Management & Granular Permission Assignment UI & Engine
 */

const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');

const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    getFullPermissionTree,
    isValidPermission,
    isValidFieldPermission
} = require('../config/permissionRegistry');

const AUTH_CONFIG = require('../config/authConfig');
const AuthorizationService = require('../services/authorizationService');
const AuditService = require('../services/auditService');
const DataStore = require('../services/dataStore');
const User = require('../models/User');
const adminController = require('../controllers/adminController');

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

// Mock HTTP helper for Controller invocations
function mockRequestResponse(options = {}) {
    const req = {
        params: options.params || {},
        body: options.body || {},
        query: options.query || {},
        headers: options.headers || {},
        ip: options.ip || '127.0.0.1',
        session: options.session || {
            user: options.user || {
                _id: new mongoose.Types.ObjectId(),
                name: 'Test Administrator',
                email: 'admin@shivayenergy.com',
                role: 'SUPER_ADMIN',
                isPrimarySuperAdmin: true,
                status: 'ACTIVE',
                permissions: Object.keys(PERMISSIONS),
                fieldPermissions: Object.keys(SENSITIVE_FIELDS),
                permissionVersion: 1
            }
        },
        csrfToken: () => 'mock-valid-csrf-token'
    };

    let statusCode = 200;
    let responseData = null;
    let renderedView = null;
    let viewData = null;

    const res = {
        status: function(code) {
            statusCode = code;
            return this;
        },
        json: function(data) {
            responseData = data;
            return this;
        },
        render: function(view, data) {
            renderedView = view;
            viewData = data;
            return this;
        },
        getStatusCode: () => statusCode,
        getResponseData: () => responseData,
        getRenderedView: () => renderedView,
        getViewData: () => viewData
    };

    return { req, res };
}

async function runPhase4Tests() {
    console.log('======================================================================');
    console.log('🧪 RBAC + FBAC PHASE 4: USER PERMISSION MANAGEMENT VERIFICATION');
    console.log('======================================================================\n');

    // -------------------------------------------------------------
    console.log('--- 1. Granular Permission Assignment Engine ---');
    // -------------------------------------------------------------
    await itAsync('Primary Super Admin can assign specific granular permissions to an employee', async () => {
        const targetId = new mongoose.Types.ObjectId();
        const employee = {
            _id: targetId,
            name: 'Vikram Solanki',
            email: 'vikram.assigned@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: [],
            permissionVersion: 1,
            dataScope: 'BRANCH',
            authorizedBranches: []
        };
        DataStore.addInMemoryUser(employee);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Admin',
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const assignedPerms = [
            'quotations.requests.create',
            'quotations.preparation.view',
            'material.catalog.view'
        ];

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            body: {
                permissions: assignedPerms,
                fieldPermissions: [],
                dataScope: 'BRANCH',
                notes: 'Assigned quotation drafting and catalogue viewing rights'
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponseData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.permissionCount, 3);
        assert.strictEqual(data.permissionVersion, 2);

        // Verify updated user state in DataStore
        const updated = await DataStore.getUserById(targetId);
        assert.strictEqual(updated.permissions.length, 3);
        assert.ok(updated.permissions.includes('quotations.requests.create'));
        assert.ok(updated.permissions.includes('material.catalog.view'));
        assert.strictEqual(updated.permissionVersion, 2);
        assert.strictEqual(updated.permissionMetadata.notes, 'Assigned quotation drafting and catalogue viewing rights');
    });

    // -------------------------------------------------------------
    console.log('\n--- 2. Permission Revocation ---');
    // -------------------------------------------------------------
    await itAsync('Primary Super Admin can revoke all permissions from an account', async () => {
        const targetId = new mongoose.Types.ObjectId();
        const staff = {
            _id: targetId,
            name: 'Rohan Verma',
            email: 'rohan.revoke@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['projects.tasks.view', 'attendance.punch.create'],
            fieldPermissions: [],
            permissionVersion: 2
        };
        DataStore.addInMemoryUser(staff);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            body: {
                permissions: [],
                fieldPermissions: [],
                notes: 'Revoked all permissions during audit'
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);

        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponseData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.permissionCount, 0);
        assert.strictEqual(data.permissionVersion, 3);

        const updated = await DataStore.getUserById(targetId);
        assert.strictEqual(updated.permissions.length, 0);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'projects.tasks.view'), false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 3. Secondary Super Admin Zero-Access Baseline ---');
    // -------------------------------------------------------------
    it('Newly created secondary Super Admin starts with zero permissions by default', () => {
        const secondaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Secondary Admin',
            email: 'secondary@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: []
        };

        assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'material.catalog.view'), false);
        assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'invoices.records.view'), false);
        assert.strictEqual(AuthorizationService.hasModuleAccess(secondaryAdmin, 'settings'), false);
    });

    await itAsync('Primary Super Admin can explicitly grant selected admin features to secondary Super Admin', async () => {
        const secondaryAdminId = new mongoose.Types.ObjectId();
        const secondaryAdmin = {
            _id: secondaryAdminId,
            name: 'Secondary Admin 2',
            email: 'sec2@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: [],
            permissionVersion: 1
        };
        DataStore.addInMemoryUser(secondaryAdmin);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: secondaryAdminId.toString() },
            body: {
                permissions: [
                    'material.module.access',
                    'material.catalog.view',
                    'material.catalog.create',
                    'material.catalog.edit'
                ],
                fieldPermissions: []
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);

        assert.strictEqual(res.getStatusCode(), 200);
        const updated = await DataStore.getUserById(secondaryAdminId);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'material.catalog.create'), true);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'invoices.records.create'), false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 4. Delegated Administrative Capabilities to Employees ---');
    // -------------------------------------------------------------
    await itAsync('Employee receives delegated admin capability without gaining unrelated admin rights', async () => {
        const employeeId = new mongoose.Types.ObjectId();
        const employee = {
            _id: employeeId,
            name: 'Aakash Verma',
            email: 'aakash.del@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: [],
            permissionVersion: 1
        };
        DataStore.addInMemoryUser(employee);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: employeeId.toString() },
            body: {
                permissions: [
                    'material.module.access',
                    'material.catalog.create',
                    'material.suppliers.create'
                ]
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);

        assert.strictEqual(res.getStatusCode(), 200);
        const updated = await DataStore.getUserById(employeeId);

        // Allowed delegated capabilities
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'material.catalog.create'), true);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'material.suppliers.create'), true);

        // Strictly denied unrelated administrative capabilities
        assert.strictEqual(AuthorizationService.hasModuleAccess(updated, 'users'), false);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'users.employees.create'), false);
        assert.strictEqual(AuthorizationService.hasPermission(updated, 'settings.general.edit'), false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 5. Sensitive Field Permissions Assignment & Scrubbing ---');
    // -------------------------------------------------------------
    await itAsync('Assigning sensitive field permissions enables visibility of confidential procurement data', async () => {
        const staffId = new mongoose.Types.ObjectId();
        const staff = {
            _id: staffId,
            name: 'Pooja Procurement',
            email: 'pooja.proc@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: [],
            permissionVersion: 1
        };
        DataStore.addInMemoryUser(staff);

        const sampleMaterial = {
            name: 'Solar Panel 540W Mono PERC',
            sku: 'SP-540-MONO',
            ratedPowerW: 540,
            purchasePrice: 12500,
            unitCost: 12500,
            weightedAverageCost: 12200,
            sellingPrice: 16500
        };

        // Before assignment: purchasePrice and WAC are scrubbed
        const redactedBefore = AuthorizationService.filterSensitiveFields(staff, sampleMaterial);
        assert.strictEqual(redactedBefore.purchasePrice, undefined);
        assert.strictEqual(redactedBefore.weightedAverageCost, undefined);
        assert.strictEqual(redactedBefore.sellingPrice, 16500);

        // Assign field permission
        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: staffId.toString() },
            body: {
                permissions: ['material.catalog.view'],
                fieldPermissions: ['fields.material.purchase_price.view']
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 200);

        const updatedStaff = await DataStore.getUserById(staffId);
        const visibleAfter = AuthorizationService.filterSensitiveFields(updatedStaff, sampleMaterial);
        assert.strictEqual(visibleAfter.purchasePrice, 12500);
        assert.strictEqual(visibleAfter.sellingPrice, 16500);
    });

    // -------------------------------------------------------------
    console.log('\n--- 6. Branch and Data Scope UI & Enforcement ---');
    // -------------------------------------------------------------
    it('Data scope OWN restricts query scope to creator records only', () => {
        const user = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            dataScope: 'OWN'
        };

        const scope = AuthorizationService.getAccessibleDataScope(user, 'projects');
        assert.strictEqual(scope.isGlobal, false);
        assert.deepStrictEqual(scope.queryFilter, { createdBy: user._id });
    });

    it('Data scope MULTI_BRANCH grants access across authorized branches while blocking unauthorized branches', () => {
        const branchA = new mongoose.Types.ObjectId();
        const branchB = new mongoose.Types.ObjectId();
        const branchC = new mongoose.Types.ObjectId();

        const multiBranchManager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            branchId: branchA,
            dataScope: 'MULTI_BRANCH',
            authorizedBranches: [branchA, branchB]
        };

        assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchManager, branchA), true);
        assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchManager, branchB), true);
        assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchManager, branchC), false);
    });

    await itAsync('Non-Primary Super Admin cannot assign GLOBAL enterprise data scope (HTTP 403)', async () => {
        const targetId = new mongoose.Types.ObjectId();
        DataStore.addInMemoryUser({ _id: targetId, role: 'EMPLOYEE', status: 'ACTIVE', permissions: [] });

        const secondaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: 'sec.admin@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: ['users.employees.manage']
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            body: {
                permissions: [],
                dataScope: 'GLOBAL' // Attempting to grant GLOBAL scope without being Primary Admin
            },
            user: secondaryAdmin
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 403);
        assert.ok(res.getResponseData().message.includes('Only the Primary Super Admin can grant GLOBAL'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 7. Unauthorized Assignment & Invalid Key Rejection ---');
    // -------------------------------------------------------------
    await itAsync('Submitting invalid or fabricated permission strings is rejected with HTTP 400', async () => {
        const targetId = new mongoose.Types.ObjectId();
        DataStore.addInMemoryUser({ _id: targetId, role: 'EMPLOYEE', status: 'ACTIVE', permissions: [] });

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            body: {
                permissions: ['hacked.fake.permission', 'material.catalog.view']
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 400);
        assert.ok(res.getResponseData().message.includes('Invalid permission keys detected'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 8. Self-Escalation Prevention ---');
    // -------------------------------------------------------------
    await itAsync('Administrator cannot modify their own permissions (Self-Privilege Escalation Blocked)', async () => {
        const callerAdminId = new mongoose.Types.ObjectId();
        const adminUser = {
            _id: callerAdminId,
            name: 'Secondary Admin Self',
            email: 'sec.self@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: ['users.employees.manage']
        };
        DataStore.addInMemoryUser(adminUser);

        const { req, res } = mockRequestResponse({
            params: { id: callerAdminId.toString() }, // Calling with own user ID
            body: {
                permissions: ['users.employees.manage', 'invoices.records.create']
            },
            user: adminUser
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 403);
        assert.ok(res.getResponseData().message.includes('Users cannot modify their own permissions'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 9. Primary Super Admin Governance & Protection ---');
    // -------------------------------------------------------------
    await itAsync('Primary Super Admin permissions are protected and cannot be modified or revoked (HTTP 403)', async () => {
        const primaryAdminId = new mongoose.Types.ObjectId();
        const primaryAdmin = {
            _id: primaryAdminId,
            name: 'Deepak Kushwaha',
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE',
            permissions: Object.keys(PERMISSIONS)
        };
        DataStore.addInMemoryUser(primaryAdmin);

        const anotherAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: 'rogue.admin@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: false,
            status: 'ACTIVE',
            permissions: ['users.employees.manage']
        };

        const { req, res } = mockRequestResponse({
            params: { id: primaryAdminId.toString() }, // Attempting to modify Primary Super Admin
            body: {
                permissions: [] // Attempting to strip permissions from Primary Admin
            },
            user: anotherAdmin
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 403);
        assert.ok(res.getResponseData().message.includes('Primary Super Admin permissions are protected'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 10. Immediate Session Synchronization ---');
    // -------------------------------------------------------------
    it('Session credentials immediately hot-refresh when permissionVersion mismatches', () => {
        const sessionUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            permissions: ['material.catalog.view'],
            fieldPermissions: [],
            permissionVersion: 1,
            status: 'ACTIVE'
        };

        const freshDbUser = {
            _id: sessionUser._id,
            role: 'EMPLOYEE',
            permissions: ['material.catalog.view', 'material.catalog.create', 'dispatch.orders.view'],
            fieldPermissions: ['fields.material.purchase_price.view'],
            permissionVersion: 2, // Incremented version
            status: 'ACTIVE'
        };

        const syncResult = AuthorizationService.validateAndSynchronizeSession(sessionUser, freshDbUser);
        assert.strictEqual(syncResult.valid, true);
        assert.strictEqual(syncResult.refreshed, true);
        assert.strictEqual(sessionUser.permissionVersion, 2);
        assert.strictEqual(sessionUser.permissions.length, 3);
        assert.strictEqual(sessionUser.fieldPermissions.length, 1);
        assert.ok(sessionUser.permissions.includes('material.catalog.create'));
    });

    // -------------------------------------------------------------
    console.log('\n--- 11. Audit Logging Verification ---');
    // -------------------------------------------------------------
    await itAsync('Every permission update creates an immutable PERMISSIONS_UPDATE audit event', async () => {
        const targetId = new mongoose.Types.ObjectId();
        const testUser = {
            _id: targetId,
            name: 'Audit Test User',
            email: 'audit.user@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: []
        };
        DataStore.addInMemoryUser(testUser);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Admin Logger',
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            body: {
                permissions: ['attendance.punch.create'],
                notes: 'Logging test'
            },
            user: primaryAdmin
        });

        await adminController.updateUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 200);

        const recentLogs = await AuditService.getRecentLogs(5);
        const permLog = recentLogs.find(l => l.action === 'PERMISSIONS_UPDATE' && l.targetUser && l.targetUser.toString() === targetId.toString());
        assert.ok(permLog, 'PERMISSIONS_UPDATE audit log entry must exist');
        assert.strictEqual(permLog.details.targetEmail, 'audit.user@shivayenergy.com');
        assert.strictEqual(permLog.details.permissionCount, 1);
    });

    // -------------------------------------------------------------
    console.log('\n--- 12. View Rendering & UI Data Completeness ---');
    // -------------------------------------------------------------
    await itAsync('adminController.getUserPermissions renders user-permissions view with 15 canonical modules', async () => {
        const targetId = new mongoose.Types.ObjectId();
        const staff = {
            _id: targetId,
            name: 'Deepa Patel',
            email: 'deepa.view@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['attendance.punch.create']
        };
        DataStore.addInMemoryUser(staff);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() },
            user: primaryAdmin
        });

        await adminController.getUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 200);
        assert.strictEqual(res.getRenderedView(), 'private/admin/user-permissions');

        const viewData = res.getViewData();
        assert.ok(viewData.permissionTree);
        assert.strictEqual(Object.keys(viewData.permissionTree).length, 15, 'Must contain all 15 canonical modules');
        assert.strictEqual(Object.keys(viewData.sensitiveFields).length, 6, 'Must contain all 6 sensitive fields');
        assert.strictEqual(viewData.canEdit, true);
        assert.strictEqual(viewData.isTargetPrimaryAdmin, false);
    });

    await itAsync('EJS template compiler compiles user-permissions.ejs without 500 error for URL /admin/users/6aef3ef3b0008fe0e12ef13c/permissions', async () => {
        const ejs = require('ejs');
        const path = require('path');
        const companyData = require('../config/company');

        const targetId = '6aef3ef3b0008fe0e12ef13c';
        const targetStaff = {
            _id: targetId,
            name: 'Pooja Patel',
            email: 'pooja@shivayenergy.com',
            mobile: '+91 94250 12345',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            employeeId: 'SES-EMP-03',
            permissions: ['quotations.requests.create', 'attendance.punch.create'],
            fieldPermissions: ['fields.material.purchase_price.view'],
            dataScope: 'BRANCH',
            authorizedBranches: [],
            permissionVersion: 1
        };
        DataStore.addInMemoryUser(targetStaff);

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Deepak Kushwaha',
            email: AUTH_CONFIG.primarySuperAdminEmail,
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const { req, res } = mockRequestResponse({
            params: { id: targetId },
            user: primaryAdmin
        });

        await adminController.getUserPermissions(req, res);
        assert.strictEqual(res.getStatusCode(), 200);

        const viewData = res.getViewData();
        const templatePath = path.join(__dirname, '../views/private/admin/user-permissions.ejs');

        const html = await new Promise((resolve, reject) => {
            ejs.renderFile(templatePath, viewData, (err, str) => {
                if (err) return reject(err);
                resolve(str);
            });
        });

        assert.ok(html && html.length > 10000, 'HTML must render completely');
        assert.ok(html.includes('Pooja Patel'), 'Must contain target user name');
        assert.ok(html.includes('6aef3ef3b0008fe0e12ef13c'), 'Must contain target user ID');
        assert.ok(html.includes('quotations.requests.create'), 'Must contain assigned quotation permission');
        assert.ok(html.includes('material.catalog.create'), 'Must contain unassigned material permission');

        // Verify all 117 permissions render with safe lowercase attributes for searching
        const { getAllPermissionKeys } = require('../config/permissionRegistry');
        const allKeys = getAllPermissionKeys();
        assert.strictEqual(allKeys.length, 117);
        allKeys.forEach(k => {
            assert.ok(html.includes(k), `Rendered HTML must include permission key: ${k}`);
        });

        // Verify assigned permissions are marked checked
        assert.ok(html.includes('id="perm_quotations.requests.create" value="quotations.requests.create" data-module="quotations" data-feature="requests" checked'));
        // Verify unassigned permissions are not marked checked
        assert.ok(html.includes('id="perm_material.catalog.create" value="material.catalog.create" data-module="material" data-feature="catalog"'));
        assert.ok(!html.includes('id="perm_material.catalog.create" value="material.catalog.create" data-module="material" data-feature="catalog" checked'));
    });

    await itAsync('adminController.getUserPermissionsJson returns accurate permission metadata JSON', async () => {
        const targetId = new mongoose.Types.ObjectId();
        const staff = {
            _id: targetId,
            name: 'Nitin Sharma',
            email: 'nitin.json@shivayenergy.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: [],
            dataScope: 'BRANCH',
            authorizedBranches: [],
            permissionVersion: 1
        };
        DataStore.addInMemoryUser(staff);

        const { req, res } = mockRequestResponse({
            params: { id: targetId.toString() }
        });

        await adminController.getUserPermissionsJson(req, res);
        assert.strictEqual(res.getStatusCode(), 200);
        const data = res.getResponseData();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.user.name, 'Nitin Sharma');
        assert.deepStrictEqual(data.permissions, ['material.catalog.view']);
        assert.strictEqual(data.dataScope, 'BRANCH');
    });

    // -------------------------------------------------------------
    console.log('\n======================================================================');
    console.log(`🎯 PHASE 4 VERIFICATION RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('======================================================================\n');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runPhase4Tests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
