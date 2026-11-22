/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 3 Verification
 * Route, API and Data-Level Authorization Enforcement
 */

const assert = require('assert');
const mongoose = require('mongoose');
const express = require('express');

const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES
} = require('../config/permissionRegistry');

const AUTH_CONFIG = require('../config/authConfig');
const AuthorizationService = require('../services/authorizationService');
const User = require('../models/User');
const {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireManager,
    requireBranchManager,
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

const superAdminRoutes = require('../routes/privateroute/superadminroutes');
const managerRoutes = require('../routes/privateroute/managerroutes');
const employeeRoutes = require('../routes/privateroute/employeeroutes');
const webRoutes = require('../routes/webRoutes');

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

// Helper to simulate request through middleware
function executeMiddleware(middleware, req, res) {
    return new Promise((resolve) => {
        let nextCalled = false;
        middleware(req, res, () => {
            nextCalled = true;
            resolve({ nextCalled, res });
        });
        // In case response was sent without calling next
        setTimeout(() => {
            if (!nextCalled) resolve({ nextCalled: false, res });
        }, 50);
    });
}

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        jsonData: null,
        renderedView: null,
        renderedData: null,
        redirectUrl: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        render(view, data) {
            this.renderedView = view;
            this.renderedData = data;
            return this;
        },
        redirect(url) {
            this.redirectUrl = url;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        },
        send(content) {
            this.sendData = content;
            return this;
        }
    };
}

async function runPhase3TestSuite() {
    console.log('='.repeat(70));
    console.log('🧪 RBAC + FBAC PHASE 3: ROUTE, API & DATA AUTHORIZATION TEST SUITE');
    console.log('='.repeat(70));

    // -------------------------------------------------------------
    console.log('\n--- 1. Direct Unauthorized Route Access (HTTP 403) ---');
    // -------------------------------------------------------------

    await itAsync('Direct unauthorized GET URL access (/admin/invoices) returns HTTP 403 for employee lacking permission', async () => {
        const employee = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['attendance.personal.view', 'attendance.punch.create'],
            fieldPermissions: []
        };

        const req = {
            session: { user: employee },
            _authVerified: true,
            xhr: true,
            path: '/admin/invoices'
        };
        const res = createMockRes();

        const guard = requirePermission('invoices.records.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'Unauthorized employee must not proceed');
        assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403');
        assert.strictEqual(res.jsonData.success, false);
        assert.match(res.jsonData.message, /invoices\.records\.view/);
    });

    await itAsync('Direct unauthorized GET URL access (/admin/users) returns HTTP 403 for employee lacking users permission', async () => {
        const employee = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.create'],
            fieldPermissions: []
        };

        const req = {
            session: { user: employee },
            _authVerified: true,
            xhr: true,
            path: '/admin/users'
        };
        const res = createMockRes();

        const guard = requirePermission('users.employees.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.jsonData.success, false);
    });

    await itAsync('Unauthorized POST request (/api/admin/materials) returns HTTP 403 for employee without material.catalog.create', async () => {
        const employee = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'], // Only view, NOT create
            fieldPermissions: []
        };

        const req = {
            session: { user: employee },
            _authVerified: true,
            xhr: true,
            path: '/api/admin/materials'
        };
        const res = createMockRes();

        const guard = requirePermission('material.catalog.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.jsonData.success, false);
    });

    // -------------------------------------------------------------
    console.log('\n--- 2. Delegated Permission Access (HTTP 200 / Granted) ---');
    // -------------------------------------------------------------

    await itAsync('Employee WITH delegated material.catalog.create is allowed access to POST /api/admin/materials', async () => {
        const delegatedEmployee = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.create'],
            fieldPermissions: []
        };

        const req = {
            session: { user: delegatedEmployee },
            _authVerified: true,
            xhr: true,
            path: '/api/admin/materials'
        };
        const res = createMockRes();

        const guard = requirePermission('material.catalog.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'User with explicit delegated permission must proceed');
    });

    await itAsync('Employee WITH delegated inventory.purchases.create is allowed to initiate stock-in purchases', async () => {
        const purchaseOfficer = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['inventory.purchases.create'],
            fieldPermissions: []
        };

        const req = {
            session: { user: purchaseOfficer },
            _authVerified: true,
            xhr: true,
            path: '/api/admin/purchases'
        };
        const res = createMockRes();

        const guard = requirePermission('inventory.purchases.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true);
    });

    await itAsync('Primary Super Admin bypasses all route guards unconditionally', async () => {
        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Primary Super Admin',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE',
            permissions: [],
            fieldPermissions: []
        };

        const req = {
            session: { user: primaryAdmin },
            _authVerified: true,
            xhr: true,
            path: '/api/admin/materials'
        };
        const res = createMockRes();

        const guard = requirePermission('material.catalog.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'Primary Super Admin must always bypass route guards');
    });

    // -------------------------------------------------------------
    console.log('\n--- 3. Cross-Branch Isolation Enforcement ---');
    // -------------------------------------------------------------

    await itAsync('Manager from Raisen branch cannot access records belonging to Bhopal branch (HTTP 403)', async () => {
        const raisenBranchId = new mongoose.Types.ObjectId().toString();
        const bhopalBranchId = new mongoose.Types.ObjectId().toString();

        const raisenManager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            branchId: raisenBranchId,
            permissions: ['projects.records.view']
        };

        const req = {
            session: { user: raisenManager },
            _authVerified: true,
            xhr: true,
            params: { branchId: bhopalBranchId }
        };
        const res = createMockRes();

        const branchGuard = requireBranchAccess('branchId');
        const outcome = await executeMiddleware(branchGuard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'Cross-branch access must be blocked');
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.jsonData.success, false);
        assert.match(res.jsonData.message, /branch/i);
    });

    await itAsync('Manager can access records belonging to their own assigned branch (HTTP 200)', async () => {
        const raisenBranchId = new mongoose.Types.ObjectId().toString();

        const raisenManager = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            branchId: raisenBranchId,
            permissions: ['projects.records.view']
        };

        const req = {
            session: { user: raisenManager },
            _authVerified: true,
            xhr: true,
            params: { branchId: raisenBranchId }
        };
        const res = createMockRes();

        const branchGuard = requireBranchAccess('branchId');
        const outcome = await executeMiddleware(branchGuard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'Same branch access must be permitted');
    });

    await itAsync('Primary Super Admin bypasses branch boundaries across all branches', async () => {
        const bhopalBranchId = new mongoose.Types.ObjectId().toString();

        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const req = {
            session: { user: primaryAdmin },
            _authVerified: true,
            xhr: true,
            params: { branchId: bhopalBranchId }
        };
        const res = createMockRes();

        const branchGuard = requireBranchAccess('branchId');
        const outcome = await executeMiddleware(branchGuard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'Primary Super Admin can access all branch records');
    });

    // -------------------------------------------------------------
    console.log('\n--- 4. Sensitive Field Protection & Redaction ---');
    // -------------------------------------------------------------

    it('Material details API redacts purchasePrice, unitCost, and weightedAverageCost when user lacks field permissions', () => {
        const standardStaff = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: []
        };

        const sampleMaterial = {
            _id: 'mat-001',
            name: 'Waaree 540W Mono PERC Panel',
            sku: 'MAT-0001',
            purchasePrice: 10500,
            unitCost: 10200,
            weightedAverageCost: 10350,
            currentStock: 45,
            defaultSellingPrice: 14000
        };

        const sanitized = AuthorizationService.filterSensitiveFields(standardStaff, sampleMaterial);

        assert.strictEqual(sanitized.name, 'Waaree 540W Mono PERC Panel');
        assert.strictEqual(sanitized.defaultSellingPrice, 14000);
        assert.strictEqual(sanitized.purchasePrice, undefined, 'purchasePrice must be deleted');
        assert.strictEqual(sanitized.unitCost, undefined, 'unitCost must be deleted');
        assert.strictEqual(sanitized.weightedAverageCost, undefined, 'weightedAverageCost must be deleted');
    });

    it('Material details API preserves purchasePrice and weightedAverageCost for user WITH field permissions', () => {
        const financeStaff = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: ['fields.material.purchase_price.view', 'fields.inventory.wac.view']
        };

        const sampleMaterial = {
            _id: 'mat-001',
            name: 'Waaree 540W Mono PERC Panel',
            purchasePrice: 10500,
            weightedAverageCost: 10350,
            defaultSellingPrice: 14000
        };

        const sanitized = AuthorizationService.filterSensitiveFields(financeStaff, sampleMaterial);

        assert.strictEqual(sanitized.purchasePrice, 10500, 'purchasePrice must be preserved');
        assert.strictEqual(sanitized.weightedAverageCost, 10350, 'weightedAverageCost must be preserved');
    });

    it('Quotation financial preview redacts profitMargin, marginPercentage, and internalCosting for user lacking permissions', () => {
        const salesStaff = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.preparation.view'],
            fieldPermissions: []
        };

        const financials = {
            grossTotal: 180000,
            grandTotal: 180000,
            estimatedSubsidy: 78000,
            netPayableAfterSubsidy: 102000,
            profitMargin: 22000,
            marginPercentage: 12.2,
            internalCosting: {
                baseCost: 135000,
                bosCost: 15000,
                installationCost: 8000
            },
            dealerMargin: 10000
        };

        const sanitized = AuthorizationService.filterSensitiveFields(salesStaff, financials);

        assert.strictEqual(sanitized.grossTotal, 180000);
        assert.strictEqual(sanitized.netPayableAfterSubsidy, 102000);
        assert.strictEqual(sanitized.profitMargin, undefined, 'profitMargin must be redacted');
        assert.strictEqual(sanitized.marginPercentage, undefined, 'marginPercentage must be redacted');
        assert.strictEqual(sanitized.internalCosting, undefined, 'internalCosting must be redacted');
        assert.strictEqual(sanitized.dealerMargin, undefined, 'dealerMargin must be redacted');
    });

    it('CSV report export masks customer mobile number when user lacks fields.customer.pii.view', () => {
        const userWithoutPii = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['reports.analytics.view', 'reports.export.export'],
            fieldPermissions: []
        };

        const customerRecord = {
            name: 'Ramesh Patel',
            mobile: '9826012345',
            customerMobile: '9826012345',
            email: 'ramesh.patel@example.com'
        };

        const sanitized = AuthorizationService.filterSensitiveFields(userWithoutPii, customerRecord);

        assert.strictEqual(sanitized.mobile, 'XXXXXX2345', 'Customer phone must be masked as XXXXXX1234');
        assert.strictEqual(sanitized.customerMobile, 'XXXXXX2345', 'customerMobile must be masked');
        assert.match(sanitized.email, /\*\*\*\*/, 'Customer email must be masked');
    });

    it('CSV report export unmasks customer mobile number when user possesses fields.customer.pii.view', () => {
        const userWithPii = {
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['reports.analytics.view', 'reports.export.export'],
            fieldPermissions: ['fields.customer.pii.view']
        };

        const customerRecord = {
            name: 'Ramesh Patel',
            mobile: '9826012345',
            email: 'ramesh.patel@example.com'
        };

        const sanitized = AuthorizationService.filterSensitiveFields(userWithPii, customerRecord);

        assert.strictEqual(sanitized.mobile, '9826012345', 'Phone must remain intact for authorized auditor');
        assert.strictEqual(sanitized.email, 'ramesh.patel@example.com', 'Email must remain intact');
    });

    // -------------------------------------------------------------
    console.log('\n--- 5. Shared Lookup Endpoints (/api/customers/search) ---');
    // -------------------------------------------------------------

    await itAsync('Shared customer lookup (/api/customers/search) is accessible via crm.search.view', async () => {
        const crmUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['crm.search.view'],
            fieldPermissions: []
        };

        const req = {
            session: { user: crmUser },
            _authVerified: true,
            xhr: true,
            path: '/api/customers/search'
        };
        const res = createMockRes();

        const guard = requireAnyPermission('crm.search.view', 'quotations.requests.create', 'quotations.preparation.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'User with crm.search.view must be allowed');
    });

    await itAsync('Shared customer lookup (/api/customers/search) is accessible via quotations.requests.create (without CRM)', async () => {
        const quotationUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.create'], // NO CRM permissions
            fieldPermissions: []
        };

        const req = {
            session: { user: quotationUser },
            _authVerified: true,
            xhr: true,
            path: '/api/customers/search'
        };
        const res = createMockRes();

        const guard = requireAnyPermission('crm.search.view', 'quotations.requests.create', 'quotations.preparation.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'Quotation creator must be allowed to lookup customer');
    });

    await itAsync('Shared customer lookup blocks users without CRM OR Quotation permissions', async () => {
        const inventoryUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['inventory.stock.view'],
            fieldPermissions: []
        };

        const req = {
            session: { user: inventoryUser },
            _authVerified: true,
            xhr: true,
            path: '/api/customers/search'
        };
        const res = createMockRes();

        const guard = requireAnyPermission('crm.search.view', 'quotations.requests.create', 'quotations.preparation.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'User lacking both permissions must be denied');
        assert.strictEqual(res.statusCode, 403);
    });

    await itAsync('Attachment endpoint (/attachments/:filename) is accessible via quotations.requests.view', async () => {
        const staff = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.view']
        };

        const req = {
            session: { user: staff },
            _authVerified: true,
            xhr: true,
            path: '/attachments/discom_sanction.pdf'
        };
        const res = createMockRes();

        const guard = requireAnyPermission('quotations.requests.view', 'quotations.records.view', 'projects.documents.view');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true);
    });

    // -------------------------------------------------------------
    console.log('\n--- 6. Business Rule 1.1: Maker-Checker Preservation ---');
    // -------------------------------------------------------------

    it('Dual-authority branch: Creator CANNOT approve their own quotation (maker-checker separation enforced)', () => {
        const managerId = new mongoose.Types.ObjectId();
        const manager = {
            _id: managerId,
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.approval.approve']
        };

        const quotation = {
            _id: new mongoose.Types.ObjectId(),
            preparedBy: managerId, // Manager created it
            grandTotal: 150000,
            status: 'PENDING_APPROVAL'
        };

        const branch = {
            _id: new mongoose.Types.ObjectId(),
            isSingleManagerBranch: false // Dual authority branch
        };

        const canApprove = AuthorizationService.canPerformMakerChecker(manager, quotation, branch);
        assert.strictEqual(canApprove.allowed, false, 'Maker-checker must prevent self-approval in dual-authority branch');
        assert.strictEqual(canApprove.reason, 'CANNOT_SELF_APPROVE');
    });

    it('Single Manager branch: Designated Single Manager CAN self-approve within commercial threshold', () => {
        const managerId = new mongoose.Types.ObjectId();
        const manager = {
            _id: managerId,
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.approval.approve']
        };

        const quotation = {
            _id: new mongoose.Types.ObjectId(),
            preparedBy: managerId,
            grandTotal: 300000, // Under threshold (500000)
            status: 'PENDING_APPROVAL'
        };

        const branch = {
            _id: new mongoose.Types.ObjectId(),
            isSingleManagerBranch: true,
            singleManagerApprovalLimit: 500000
        };

        const canApprove = AuthorizationService.canPerformMakerChecker(manager, quotation, branch);
        assert.strictEqual(canApprove.allowed, true, 'Designated Single Manager can self-approve under limit');
        assert.strictEqual(canApprove.rule, 'BUSINESS_RULE_1_1_SINGLE_MANAGER_EXCEPTION');
    });

    it('Single Manager branch: Designated Single Manager CANNOT self-approve exceeding threshold', () => {
        const managerId = new mongoose.Types.ObjectId();
        const manager = {
            _id: managerId,
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.approval.approve']
        };

        const quotation = {
            _id: new mongoose.Types.ObjectId(),
            preparedBy: managerId,
            grandTotal: 650000, // Exceeds threshold (500000)
            status: 'PENDING_APPROVAL'
        };

        const branch = {
            _id: new mongoose.Types.ObjectId(),
            isSingleManagerBranch: true,
            singleManagerApprovalLimit: 500000
        };

        const canApprove = AuthorizationService.canPerformMakerChecker(manager, quotation, branch);
        assert.strictEqual(canApprove.allowed, false, 'Quotation exceeding single manager threshold must be blocked');
        assert.strictEqual(canApprove.reason, 'EXCEEDS_SINGLE_MANAGER_THRESHOLD');
    });

    it('Primary Super Admin can approve ANY quotation regardless of creator or branch', () => {
        const primaryAdmin = {
            _id: new mongoose.Types.ObjectId(),
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            status: 'ACTIVE'
        };

        const quotation = {
            _id: new mongoose.Types.ObjectId(),
            preparedBy: primaryAdmin._id,
            grandTotal: 5000000,
            status: 'PENDING_APPROVAL'
        };

        const canApprove = AuthorizationService.canPerformMakerChecker(primaryAdmin, quotation, null);
        assert.strictEqual(canApprove.allowed, true, 'Primary Super Admin has full approval authority');
    });

    // -------------------------------------------------------------
    console.log('\n--- 7. Session Hot-refresh on Permission Version Mismatch ---');
    // -------------------------------------------------------------

    it('validateAndSynchronizeSession immediately refreshes credentials when permissionVersion increments', () => {
        const sessionUser = {
            _id: 'usr-1',
            role: 'EMPLOYEE',
            permissions: ['attendance.punch.create'],
            fieldPermissions: [],
            permissionVersion: 1
        };

        const freshUserFromDb = {
            _id: 'usr-1',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['attendance.punch.create', 'material.catalog.create', 'material.catalog.view'],
            fieldPermissions: ['fields.material.purchase_price.view'],
            permissionVersion: 2 // Incremented after delegation
        };

        const result = AuthorizationService.validateAndSynchronizeSession(sessionUser, freshUserFromDb);

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.refreshed, true);
        assert.strictEqual(sessionUser.permissionVersion, 2);
        assert.deepStrictEqual(sessionUser.permissions, ['attendance.punch.create', 'material.catalog.create', 'material.catalog.view']);
        assert.deepStrictEqual(sessionUser.fieldPermissions, ['fields.material.purchase_price.view']);
    });

    it('validateAndSynchronizeSession invalidates session immediately if account status is suspended', () => {
        const sessionUser = {
            _id: 'usr-2',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissionVersion: 1
        };

        const suspendedUser = {
            _id: 'usr-2',
            status: 'SUSPENDED',
            permissionVersion: 2
        };

        const result = AuthorizationService.validateAndSynchronizeSession(sessionUser, suspendedUser);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, 'ACCOUNT_INACTIVE');
    });

    // -------------------------------------------------------------
    console.log('\n--- 8. Router Integrity & Sub-Router Exports Parity ---');
    // -------------------------------------------------------------

    it('All sub-routers are mounted and export cleanly with no undefined middleware functions', () => {
        assert.ok(webRoutes, 'webRoutes must load cleanly');
        assert.ok(superAdminRoutes, 'superAdminRoutes must load cleanly');
        assert.ok(managerRoutes, 'managerRoutes must load cleanly');
        assert.ok(employeeRoutes, 'employeeRoutes must load cleanly');

        // Verify sub-router stacks
        assert.ok(superAdminRoutes.stack && superAdminRoutes.stack.length > 30, 'Super Admin routes must have full route table');
        assert.ok(managerRoutes.stack && managerRoutes.stack.length > 20, 'Manager routes must have full route table');
        assert.ok(employeeRoutes.stack && employeeRoutes.stack.length > 15, 'Employee routes must have full route table');

        // Check for any missing/undefined route handlers
        [...superAdminRoutes.stack, ...managerRoutes.stack, ...employeeRoutes.stack].forEach(layer => {
            if (layer.route) {
                layer.route.stack.forEach(s => {
                    assert.strictEqual(typeof s.handle, 'function', `Handler in route ${layer.route.path} must be a function`);
                });
            }
        });
    });

    // -------------------------------------------------------------
    console.log('\n--- 9. Focused Security Verification: Shared Endpoints, Status, Attachments & Deep Scrubbing ---');
    // -------------------------------------------------------------

    await itAsync('POST /api/customers/create strictly requires crm.customers.create (quotations.requests.create is rejected)', async () => {
        const quoteCreator = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.create'], // ONLY quotations, NO crm.customers.create
            fieldPermissions: []
        };

        const req = {
            session: { user: quoteCreator },
            _authVerified: true,
            xhr: true,
            path: '/api/customers/create',
            body: { name: 'Customer Test', mobile: '9826011111' }
        };
        const res = createMockRes();

        const guard = requirePermission('crm.customers.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'Quotation creator without crm.customers.create must be denied');
        assert.strictEqual(res.statusCode, 403);
    });

    await itAsync('POST /api/customers/create allows user with explicit crm.customers.create', async () => {
        const crmAgent = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['crm.customers.create'],
            fieldPermissions: []
        };

        const req = {
            session: { user: crmAgent },
            _authVerified: true,
            xhr: true,
            path: '/api/customers/create',
            body: { name: 'Customer Test', mobile: '9826011111' }
        };
        const res = createMockRes();

        const guard = requirePermission('crm.customers.create');
        const outcome = await executeMiddleware(guard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'User with crm.customers.create must proceed');
    });

    await itAsync('Quotation Request Status: Reject permission CANNOT authorize approval (HTTP 403)', async () => {
        const rejectorStaff = {
            _id: new mongoose.Types.ObjectId(),
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.requests.reject'] // Only reject permission
        };

        const req = {
            session: { user: rejectorStaff },
            _authVerified: true,
            xhr: true,
            body: { status: 'APPROVED' } // Attempting approval
        };
        const res = createMockRes();

        const { requireQuotationRequestStatusPermission } = require('../middleware/authMiddleware');
        const statusGuard = requireQuotationRequestStatusPermission();
        const outcome = await executeMiddleware(statusGuard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'Reject permission must not authorize approval');
        assert.strictEqual(res.statusCode, 403);
        assert.match(res.jsonData.message, /quotations\.approval\.approve/);
    });

    await itAsync('Quotation Request Status: Approval permission authorizes approval', async () => {
        const approver = {
            _id: new mongoose.Types.ObjectId(),
            role: 'MANAGER',
            status: 'ACTIVE',
            permissions: ['quotations.approval.approve']
        };

        const req = {
            session: { user: approver },
            _authVerified: true,
            xhr: true,
            body: { status: 'APPROVED' }
        };
        const res = createMockRes();

        const { requireQuotationRequestStatusPermission } = require('../middleware/authMiddleware');
        const statusGuard = requireQuotationRequestStatusPermission();
        const outcome = await executeMiddleware(statusGuard, req, res);

        assert.strictEqual(outcome.nextCalled, true, 'User with quotations.approval.approve can approve');
    });

    await itAsync('Attachment Security: Directory traversal sequences in filename are strictly blocked (HTTP 400)', async () => {
        const staff = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['quotations.requests.view']
        };

        const req = {
            session: { user: staff },
            params: { filename: '../../../etc/passwd' }
        };
        const res = createMockRes();

        const quotationController = require('../controllers/quotationController');
        await quotationController.serveAttachment(req, res);

        assert.strictEqual(res.statusCode, 400, 'Must block path traversal with HTTP 400');
        assert.match(res.renderedData.message, /path traversal/i);
    });

    await itAsync('Attachment Security: Unrelated project document permission does NOT grant access to quotation attachments', async () => {
        const projectEngineer = {
            _id: new mongoose.Types.ObjectId(),
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['projects.documents.view'] // Unrelated module permission
        };

        const req = {
            session: { user: projectEngineer },
            _authVerified: true,
            xhr: true,
            path: '/attachments/roof_drawing.pdf'
        };
        const res = createMockRes();

        // Enforced on route: requireAnyPermission('quotations.requests.view', 'quotations.records.detail')
        const attachmentGuard = requireAnyPermission('quotations.requests.view', 'quotations.records.detail');
        const outcome = await executeMiddleware(attachmentGuard, req, res);

        assert.strictEqual(outcome.nextCalled, false, 'Unrelated module permission must be blocked');
        assert.strictEqual(res.statusCode, 403);
    });

    it('Data Security: filterSensitiveFields performs deep recursive sanitization on nested populated objects and item arrays', () => {
        const staffWithoutPricing = {
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            permissions: ['material.catalog.view'],
            fieldPermissions: []
        };

        const populatedDocument = {
            _id: 'po-101',
            supplierName: 'Solar Tech Ltd',
            customer: {
                name: 'Anand Sharma',
                mobile: '9826099999',
                email: 'anand.sharma@example.com'
            },
            items: [
                {
                    materialName: '400W Mono Panel',
                    unitPrice: 9500,
                    purchasePrice: 9200,
                    unitCost: 9000,
                    weightedAverageCost: 9100,
                    quantity: 20
                },
                {
                    materialName: '5kW Inverter',
                    purchasePrice: 45000,
                    weightedAverageCost: 44000,
                    quantity: 1
                }
            ]
        };

        const scrubbed = AuthorizationService.filterSensitiveFields(staffWithoutPricing, populatedDocument);

        assert.strictEqual(scrubbed.supplierName, 'Solar Tech Ltd');
        // Nested customer PII masked
        assert.strictEqual(scrubbed.customer.mobile, 'XXXXXX9999');
        assert.match(scrubbed.customer.email, /\*\*\*\*/);
        // Nested items array costs scrubbed
        assert.strictEqual(scrubbed.items[0].purchasePrice, undefined, 'Nested purchasePrice must be deleted');
        assert.strictEqual(scrubbed.items[0].unitCost, undefined, 'Nested unitCost must be deleted');
        assert.strictEqual(scrubbed.items[0].weightedAverageCost, undefined, 'Nested WAC must be deleted');
        assert.strictEqual(scrubbed.items[1].purchasePrice, undefined, 'Second item purchasePrice deleted');
        assert.strictEqual(scrubbed.items[1].weightedAverageCost, undefined, 'Second item WAC deleted');
        assert.strictEqual(scrubbed.items[0].quantity, 20, 'Non-sensitive field preserved');
    });

    // =============================================================
    console.log('\n' + '='.repeat(70));
    console.log(`📊 PHASE 3 VERIFICATION SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('='.repeat(70));

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runPhase3TestSuite().catch(err => {
    console.error('Fatal Suite Error:', err);
    process.exit(1);
});
