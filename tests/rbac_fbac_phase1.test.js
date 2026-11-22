/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 1 Verification
 */

const assert = require('assert');
const mongoose = require('mongoose');
const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    isValidPermission,
    isValidFieldPermission,
    getAllPermissionKeys,
    getAllFieldPermissionKeys,
    filterValidPermissions,
    filterValidFieldPermissions,
    getPermissionsByModule,
    getFullPermissionTree
} = require('../config/permissionRegistry');

const User = require('../models/User');
const DataStore = require('../services/dataStore');
const adminController = require('../controllers/adminController');
const runMigration = require('../scripts/migrate_user_permissions');

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

async function runTestSuite() {
    console.log('='.repeat(70));
    console.log('🧪 RBAC + FBAC PHASE 1: DATA MODEL & PERMISSION REGISTRY TEST SUITE');
    console.log('='.repeat(70));

    console.log('\n--- 1. Canonical Permission Registry ---');

    it('Permission Registry registers all 15 required modules', () => {
        const expectedModules = [
            'attendance', 'projects', 'quotations', 'invoices', 'crm',
            'material', 'inventory', 'dispatch', 'complaints', 'franchise',
            'reports', 'users', 'branches', 'settings', 'cms'
        ];
        assert.strictEqual(Object.keys(MODULES).length, 15, 'Must contain exactly 15 canonical modules');
        for (const mod of expectedModules) {
            assert.ok(MODULES[mod], `Missing module in registry: ${mod}`);
            assert.strictEqual(MODULES[mod].id, mod, `Module ID mismatch for ${mod}`);
            assert.ok(MODULES[mod].name, `Missing module name for ${mod}`);
            assert.ok(MODULES[mod].category, `Missing module category for ${mod}`);
            assert.ok(MODULES[mod].icon, `Missing module icon for ${mod}`);
        }
    });

    it('All permission keys strictly follow <module>.<feature>.<action> format', () => {
        const allKeys = getAllPermissionKeys();
        assert.ok(allKeys.length >= 70, `Expected at least 70 granular permissions, found ${allKeys.length}`);
        for (const key of allKeys) {
            const parts = key.split('.');
            assert.strictEqual(parts.length, 3, `Permission key "${key}" must contain exactly 3 segments`);
            assert.ok(MODULES[parts[0]], `Segment 1 of "${key}" must be a valid module`);
            assert.ok(parts[1].length > 0, `Segment 2 of "${key}" must not be empty`);
            assert.ok(parts[2].length > 0, `Segment 3 of "${key}" must not be empty`);
        }
    });

    it('Sensitive fields registry strictly follows fields.<domain>.<field>.view format', () => {
        const allFieldKeys = getAllFieldPermissionKeys();
        assert.ok(allFieldKeys.length >= 6, `Expected at least 6 sensitive field permissions, found ${allFieldKeys.length}`);
        for (const key of allFieldKeys) {
            assert.ok(key.startsWith('fields.'), `Field key "${key}" must start with fields.`);
            assert.ok(key.endsWith('.view'), `Field key "${key}" must end with .view`);
        }
    });

    it('Validation functions accurately accept valid keys and reject invalid/arbitrary keys', () => {
        assert.strictEqual(isValidPermission('attendance.punch.create'), true);
        assert.strictEqual(isValidPermission('inventory.stock.view'), true);
        assert.strictEqual(isValidPermission('dispatch.orders.create'), true);
        assert.strictEqual(isValidPermission('material.catalog.manage'), true);

        // Invalids
        assert.strictEqual(isValidPermission('arbitrary.key.view'), false);
        assert.strictEqual(isValidPermission('attendance.punch'), false);
        assert.strictEqual(isValidPermission(''), false);
        assert.strictEqual(isValidPermission(null), false);

        // Fields
        assert.strictEqual(isValidFieldPermission('fields.material.purchase_price.view'), true);
        assert.strictEqual(isValidFieldPermission('fields.inventory.wac.view'), true);
        assert.strictEqual(isValidFieldPermission('fields.fake.view'), false);
    });

    it('getFullPermissionTree constructs a complete nested navigation structure', () => {
        const tree = getFullPermissionTree();
        assert.strictEqual(Object.keys(tree).length, 15);
        for (const modId of Object.keys(MODULES)) {
            assert.ok(tree[modId], `Tree must contain module ${modId}`);
            assert.ok(Array.isArray(tree[modId].permissions), `Tree module ${modId} must have permissions array`);
            assert.ok(tree[modId].permissions.length > 0, `Tree module ${modId} must contain at least one permission`);
        }
    });

    console.log('\n--- 2. User Data Model & Schema Methods ---');

    it('User Schema defaults: isPrimarySuperAdmin: false, permissions: [], version: 1', () => {
        const testUser = new User({
            name: 'New Test User',
            email: 'newuser@shivayenergy.com',
            mobile: '+91 99999 11111',
            password: 'password123',
            role: 'EMPLOYEE'
        });

        assert.strictEqual(testUser.isPrimarySuperAdmin, false, 'isPrimarySuperAdmin must default to false');
        assert.deepStrictEqual(testUser.permissions, [], 'permissions must default to empty array');
        assert.deepStrictEqual(testUser.fieldPermissions, [], 'fieldPermissions must default to empty array');
        assert.strictEqual(testUser.permissionVersion, 1, 'permissionVersion must default to 1');
    });

    it('Newly created Super Admin starts with all permissions OFF (empty array)', () => {
        const newAdmin = new User({
            name: 'Second Admin',
            email: 'secondadmin@shivayenergy.com',
            mobile: '+91 99999 22222',
            password: 'password123',
            role: 'SUPER_ADMIN'
        });

        assert.strictEqual(newAdmin.role, 'SUPER_ADMIN');
        assert.strictEqual(newAdmin.isPrimarySuperAdmin, false, 'New Super Admin must NOT be Primary Super Admin');
        assert.deepStrictEqual(newAdmin.permissions, [], 'New Super Admin must start with zero permissions');
        assert.strictEqual(newAdmin.hasPermission('quotations.approval.approve'), false, 'New Super Admin cannot access permissions by default');
        assert.strictEqual(newAdmin.hasPermission('inventory.stock.view'), false);
        assert.strictEqual(newAdmin.hasModuleAccess('inventory'), false);
    });

    it('Primary Super Admin has unconditional bypass across all permissions, fields, and modules', () => {
        const primaryAdmin = new User({
            name: 'Primary Admin',
            email: 'primary@shivayenergy.com',
            mobile: '+91 99999 33333',
            password: 'password123',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            permissions: [] // Even with empty array, Primary Super Admin bypasses
        });

        assert.strictEqual(primaryAdmin.isPrimarySuperAdmin, true);
        assert.strictEqual(primaryAdmin.hasPermission('quotations.approval.approve'), true);
        assert.strictEqual(primaryAdmin.hasPermission('material.catalog.create'), true);
        assert.strictEqual(primaryAdmin.hasPermission('dispatch.orders.create'), true);
        assert.strictEqual(primaryAdmin.hasFieldAccess('fields.material.purchase_price.view'), true);
        assert.strictEqual(primaryAdmin.hasModuleAccess('settings'), true);
        assert.strictEqual(primaryAdmin.hasModuleAccess('any_future_module'), true);
    });

    it('User with specific granular permissions is granted ONLY those permissions', () => {
        const specializedStaff = new User({
            name: 'Specialist Staff',
            email: 'specialist@shivayenergy.com',
            mobile: '+91 99999 44444',
            password: 'password123',
            role: 'EMPLOYEE',
            isPrimarySuperAdmin: false,
            permissions: [
                'attendance.punch.create',
                'material.catalog.view',
                'dispatch.orders.create'
            ],
            fieldPermissions: []
        });

        assert.strictEqual(specializedStaff.hasPermission('attendance.punch.create'), true);
        assert.strictEqual(specializedStaff.hasPermission('material.catalog.view'), true);
        assert.strictEqual(specializedStaff.hasPermission('dispatch.orders.create'), true);

        // Denied other actions in same module
        assert.strictEqual(specializedStaff.hasPermission('material.catalog.create'), false);
        assert.strictEqual(specializedStaff.hasPermission('dispatch.orders.edit'), false);
        assert.strictEqual(specializedStaff.hasPermission('quotations.requests.create'), false);
        assert.strictEqual(specializedStaff.hasPermission('inventory.stock.view'), false);

        // Module access
        assert.strictEqual(specializedStaff.hasModuleAccess('material'), true);
        assert.strictEqual(specializedStaff.hasModuleAccess('dispatch'), true);
        assert.strictEqual(specializedStaff.hasModuleAccess('inventory'), false);

        // Field access
        assert.strictEqual(specializedStaff.hasFieldAccess('fields.material.purchase_price.view'), false);
    });

    await itAsync('Schema validation rejects invalid or arbitrary permission strings', async () => {
        const invalidUser = new User({
            name: 'Bad Permission User',
            email: 'badperm@shivayenergy.com',
            mobile: '+91 99999 55555',
            password: 'password123',
            role: 'EMPLOYEE',
            permissions: ['invalid.arbitrary.key']
        });

        let validationErr = null;
        try {
            await invalidUser.validate();
        } catch (err) {
            validationErr = err;
        }
        assert.ok(validationErr, 'Validation must fail when invalid permission key is passed');
        assert.ok(validationErr.errors.permissions, 'Validation error must be on permissions field');
    });

    await itAsync('Schema validation rejects invalid sensitive field permission strings', async () => {
        const invalidFieldUser = new User({
            name: 'Bad Field User',
            email: 'badfield@shivayenergy.com',
            mobile: '+91 99999 66666',
            password: 'password123',
            role: 'EMPLOYEE',
            fieldPermissions: ['fields.invalid_field.view']
        });

        let validationErr = null;
        try {
            await invalidFieldUser.validate();
        } catch (err) {
            validationErr = err;
        }
        assert.ok(validationErr, 'Validation must fail when invalid field permission is passed');
        assert.ok(validationErr.errors.fieldPermissions, 'Validation error must be on fieldPermissions field');
    });

    console.log('\n--- 3. Primary Super Admin Protection & Governance ---');

    await itAsync('Pre-save hook prevents revoking isPrimarySuperAdmin on existing Primary Super Admin', async () => {
        const existingPrimary = new User({
            _id: new mongoose.Types.ObjectId(),
            name: 'Original Primary Admin',
            email: 'origadmin@shivayenergy.com',
            mobile: '+91 99999 77777',
            password: 'password123',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        });
        existingPrimary.isNew = false; // Simulate existing persisted document

        // Attempt to revoke primary admin flag
        existingPrimary.isPrimarySuperAdmin = false;
        let threwError = false;
        try {
            await existingPrimary.save();
        } catch (err) {
            threwError = true;
            assert.ok(err.message.includes('Security Violation: Primary Super Admin designation cannot be revoked'));
        }
        assert.ok(threwError, 'Attempting to revoke isPrimarySuperAdmin must throw Security Violation error');
    });

    await itAsync('Pre-save hook prevents altering role of Primary Super Admin to non-SUPER_ADMIN', async () => {
        const existingPrimary = new User({
            _id: new mongoose.Types.ObjectId(),
            name: 'Original Primary Admin',
            email: 'origadmin2@shivayenergy.com',
            mobile: '+91 99999 88888',
            password: 'password123',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        });
        existingPrimary.isNew = false;

        existingPrimary.role = 'MANAGER';
        let threwError = false;
        try {
            await existingPrimary.save();
        } catch (err) {
            threwError = true;
            assert.ok(err.message.includes('Security Violation: Primary Super Admin role cannot be altered'));
        }
        assert.ok(threwError, 'Attempting to change role of Primary Super Admin must throw Security Violation error');
    });

    await itAsync('Pre-save hook prevents deactivating or suspending Primary Super Admin', async () => {
        const existingPrimary = new User({
            _id: new mongoose.Types.ObjectId(),
            name: 'Original Primary Admin',
            email: 'origadmin3@shivayenergy.com',
            mobile: '+91 99999 99999',
            password: 'password123',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        });
        existingPrimary.isNew = false;

        existingPrimary.status = 'SUSPENDED';
        let threwError = false;
        try {
            await existingPrimary.save();
        } catch (err) {
            threwError = true;
            assert.ok(err.message.includes('Security Violation: Primary Super Admin account cannot be deactivated'));
        }
        assert.ok(threwError, 'Attempting to suspend Primary Super Admin must throw Security Violation error');
    });

    console.log('\n--- 4. Controller Level Governance Protections ---');

    await itAsync('adminController.updateUserStatus rejects deactivation of Primary Super Admin with HTTP 403', async () => {
        const mockPrimaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Admin',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };
        DataStore.addInMemoryUser(mockPrimaryAdmin);

        let statusCode = 200;
        let responseJson = null;

        const req = {
            body: { userId: mockPrimaryAdmin._id.toString(), status: 'SUSPENDED' },
            session: { user: { _id: 'admin-caller', role: 'SUPER_ADMIN', isPrimarySuperAdmin: false } },
            ip: '127.0.0.1'
        };

        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseJson = data; return res; }
        };

        await adminController.updateUserStatus(req, res);

        assert.strictEqual(statusCode, 403, 'Must return HTTP 403 Forbidden');
        assert.strictEqual(responseJson.success, false);
        assert.ok(responseJson.message.includes('Primary Super Admin account cannot be deactivated'));
    });

    await itAsync('adminController.resetUserPassword prevents unauthorized admin from resetting Primary Super Admin password', async () => {
        const mockPrimaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Admin',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };
        DataStore.addInMemoryUser(mockPrimaryAdmin);

        let statusCode = 200;
        let responseJson = null;

        const req = {
            body: { userId: mockPrimaryAdmin._id.toString(), newPassword: 'newPassword123' },
            session: { user: { _id: 'secondary-admin', role: 'SUPER_ADMIN', isPrimarySuperAdmin: false } },
            ip: '127.0.0.1'
        };

        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseJson = data; return res; }
        };

        await adminController.resetUserPassword(req, res);

        assert.strictEqual(statusCode, 403, 'Must return HTTP 403 Forbidden');
        assert.strictEqual(responseJson.success, false);
        assert.ok(responseJson.message.includes('Only the Primary Super Admin can modify the Primary Super Admin account'));
    });

    console.log('\n--- 5. Dry-Run Migration Execution & Parity ---');

    await itAsync('Migration script executes in dry-run mode without modifying records', async () => {
        // Run migration in offline dry-run mode
        process.argv = ['node', 'scripts/migrate_user_permissions.js', '--offline'];
        const result = await runMigration();

        assert.strictEqual(result.success, true, 'Migration dry-run must succeed');
        assert.strictEqual(result.isLiveExecution, false, 'Must be simulation/dry-run mode');
        assert.ok(result.summary.total > 0, 'Must check registered users');
        assert.strictEqual(result.summary.primarySuperAdmin, 1, 'Must identify exactly 1 designated Primary Super Admin');
        assert.strictEqual(result.summary.invalidKeysFound, 0, 'No invalid keys should be found in registry baselines');
    });

    console.log('='.repeat(70));
    console.log(`🎯 PHASE 1 VERIFICATION RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('='.repeat(70));

    if (testsFailed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runTestSuite().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runTestSuite;
