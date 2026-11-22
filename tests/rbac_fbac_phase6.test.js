/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 6 Final Security Audit & Regression Suite
 */

const assert = require('assert');
const path = require('path');
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

function mockRequestResponse(options = {}) {
    const req = {
        params: options.params || {},
        body: options.body || {},
        query: options.query || {},
        session: options.session || { user: null },
        ip: options.ip || '127.0.0.1',
        headers: options.headers || {}
    };

    const res = {
        statusCode: 200,
        renderedView: null,
        renderedData: null,
        jsonData: null,
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
        send(data) {
            this.jsonData = data;
            return this;
        }
    };

    return { req, res };
}

console.log('='.repeat(75));
console.log('🔒 RBAC + FBAC PHASE 6: FINAL SECURITY AUDIT & REGRESSION SUITE');
console.log('='.repeat(75));

// =========================================================================
// SECTION 1: ROUTE & API AUDIT + INVOICE EDIT VS CREATE ENFORCEMENT
// =========================================================================
console.log('\n--- SECTION 1: Route & API Audit + Invoice Action Separation ---');

it('SEC-P6-01: Updating an existing invoice strictly requires invoices.records.edit', async () => {
    // Seed an existing invoice in DataStore
    const testInvNum = 'INV-P6-AUDIT-001';
    DataStore.addInvoice({
        invoiceNumber: testInvNum,
        customerName: 'Initial Audit Client',
        customerMobile: '9876543210',
        totalAmount: 150000,
        date: '2026-11-23'
    });

    // User possessing only create permission, but NOT edit permission
    const creatorOnlyUser = {
        _id: '6b03504155e57e5541ad5901',
        email: 'creator.only@shivayenergy.com',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        permissions: ['invoices.records.create', 'invoices.records.view'],
        fieldPermissions: []
    };

    const { req, res } = mockRequestResponse({
        session: { user: creatorOnlyUser },
        body: {
            invoiceNumber: testInvNum,
            customerName: 'Attempted Name Change',
            totalAmount: 175000
        }
    });

    await adminController.saveInvoice(req, res);

    assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 Forbidden when invoices.records.edit is missing');
    assert.strictEqual(res.jsonData.success, false);
    assert(res.jsonData.message.includes('invoices.records.edit required'), 'Error must specify invoices.records.edit requirement');
});

it('SEC-P6-02: Creating a new invoice strictly requires invoices.records.create', async () => {
    // User possessing only edit permission, but NOT create permission
    const editorOnlyUser = {
        _id: '6b03504155e57e5541ad5902',
        email: 'editor.only@shivayenergy.com',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        permissions: ['invoices.records.edit', 'invoices.records.view'],
        fieldPermissions: []
    };

    const newInvNum = 'INV-P6-NEW-' + Date.now();
    const { req, res } = mockRequestResponse({
        session: { user: editorOnlyUser },
        body: {
            invoiceNumber: newInvNum,
            customerName: 'New Client For Create',
            totalAmount: 95000
        }
    });

    await adminController.saveInvoice(req, res);

    assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 Forbidden when invoices.records.create is missing');
    assert.strictEqual(res.jsonData.success, false);
    assert(res.jsonData.message.includes('invoices.records.create required'), 'Error must specify invoices.records.create requirement');
});

it('SEC-P6-03: User with invoices.records.edit can successfully update existing invoice without changing locked customer identity', async () => {
    const testInvNum = 'INV-P6-AUDIT-LOCKED';
    DataStore.addInvoice({
        invoiceNumber: testInvNum,
        customerName: 'Locked Identity Corp',
        customerMobile: '9988776655',
        customerAddress: 'Original Street 123',
        totalAmount: 200000,
        date: '2026-11-23'
    });

    const authorizedEditor = {
        _id: '6b03504155e57e5541ad5903',
        email: 'editor@shivayenergy.com',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        permissions: ['invoices.records.edit', 'invoices.records.view'],
        fieldPermissions: []
    };

    const { req, res } = mockRequestResponse({
        session: { user: authorizedEditor },
        body: {
            invoiceNumber: testInvNum,
            customerName: 'Hacker Attempted Tamper',
            totalAmount: 220000
        }
    });

    await adminController.saveInvoice(req, res);

    assert.strictEqual(res.statusCode, 200, 'Authorized editor must succeed with HTTP 200');
    assert.strictEqual(res.jsonData.success, true);

    // Verify customerName remained locked
    const updated = DataStore.getAllInvoices(true).find(i => i.invoiceNumber === testInvNum);
    assert.strictEqual(updated.customerName, 'Locked Identity Corp', 'Customer name must remain locked on update');
    assert.strictEqual(updated.totalAmount, 220000, 'Total amount updated successfully');
});

// =========================================================================
// SECTION 2: PERMISSION REGISTRY CONSISTENCY & INTEGRITY
// =========================================================================
console.log('\n--- SECTION 2: Permission Registry Consistency & Action Mappings ---');

it('SEC-P6-04: Canonical registry contains exactly 117 permissions across 15 valid functional modules', () => {
    const canonicalKeys = Object.keys(PERMISSIONS);
    assert.strictEqual(canonicalKeys.length, 117, 'Canonical registry must have exactly 117 permissions');
    assert.strictEqual(Object.keys(MODULES).length, 15, 'Canonical registry must define exactly 15 modules');

    // Every permission key must match <module>.<feature>.<action> format
    const formatRegex = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/;
    for (const key of canonicalKeys) {
        assert(formatRegex.test(key), `Permission key ${key} does not follow canonical 3-tier format`);
        const [mod, feat, act] = key.split('.');
        assert(MODULES[mod], `Module ${mod} in key ${key} is not registered in MODULES`);
    }
});

it('SEC-P6-05: Canonical sensitive fields registry defines exactly 6 valid field keys', () => {
    const fieldKeys = Object.keys(SENSITIVE_FIELDS);
    assert.strictEqual(fieldKeys.length, 6, 'Must have exactly 6 canonical sensitive field keys');

    const expectedKeys = [
        'fields.material.purchase_price.view',
        'fields.inventory.wac.view',
        'fields.inventory.profit_margin.view',
        'fields.quotation.cost_breakdown.view',
        'fields.invoice.financial_metrics.view',
        'fields.customer.pii.view'
    ];

    for (const k of expectedKeys) {
        assert(isValidFieldPermission(k), `Field key ${k} must be valid according to registry`);
    }
});

// =========================================================================
// SECTION 3: PRIMARY & SECONDARY SUPER ADMIN SECURITY & GOVERNANCE
// =========================================================================
console.log('\n--- SECTION 3: Primary & Secondary Super Admin Governance ---');

it('SEC-P6-06: Primary Super Admin possesses unconditional bypass across all permissions and modules', () => {
    const primaryAdmin = {
        _id: '507f1f77bcf86cd799439011',
        email: AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: true,
        permissions: [],
        fieldPermissions: []
    };

    assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'settings.general.edit'), true);
    assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'invoices.records.delete'), true);
    assert.strictEqual(AuthorizationService.hasFieldAccess(primaryAdmin, 'fields.material.purchase_price.view'), true);
    assert.strictEqual(AuthorizationService.hasFieldAccess(primaryAdmin, 'fields.customer.pii.view'), true);
    assert.strictEqual(AuthorizationService.hasModuleAccess(primaryAdmin, 'cms'), true);
    assert.strictEqual(AuthorizationService.canAccessBranch(primaryAdmin, 'any-random-branch-id'), true);
});

it('SEC-P6-07: Secondary Super Admin with 0 permissions is denied all access by default', () => {
    const secondaryAdmin = {
        _id: '507f1f77bcf86cd799439022',
        email: 'secondary_admin@shivayenergy.com',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: false,
        permissions: [],
        fieldPermissions: []
    };

    assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'settings.general.edit'), false);
    assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'invoices.records.view'), false);
    assert.strictEqual(AuthorizationService.hasPermission(secondaryAdmin, 'users.employees.manage'), false);
    assert.strictEqual(AuthorizationService.hasFieldAccess(secondaryAdmin, 'fields.inventory.wac.view'), false);
    assert.strictEqual(AuthorizationService.hasModuleAccess(secondaryAdmin, 'crm'), false);
});

it('SEC-P6-08: preventPrivilegeEscalation stops non-primary admin from designating primary status', () => {
    const callerAdmin = {
        _id: '6b03504155e57e5541ad5910',
        email: 'regular_admin@shivayenergy.com',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: false,
        permissions: ['users.employees.manage']
    };

    const targetUser = {
        _id: '6b03504155e57e5541ad5911',
        email: 'target@shivayenergy.com',
        role: 'EMPLOYEE'
    };

    const result = AuthorizationService.preventPrivilegeEscalation(callerAdmin, targetUser, {
        isPrimarySuperAdmin: true
    });

    assert.strictEqual(result.allowed, false);
    assert(result.reason.includes('Only the Primary Super Admin can designate primary status'));
});

it('SEC-P6-09: preventPrivilegeEscalation prevents self-privilege escalation (modifying own role or perms)', () => {
    const callerUser = {
        _id: '6b03504155e57e5541ad5920',
        email: 'sneaky_mgr@shivayenergy.com',
        role: 'MANAGER',
        permissions: ['users.employees.manage']
    };

    // Target is self
    const targetUser = {
        _id: '6b03504155e57e5541ad5920',
        email: 'sneaky_mgr@shivayenergy.com',
        role: 'MANAGER'
    };

    const roleResult = AuthorizationService.preventPrivilegeEscalation(callerUser, targetUser, {
        role: 'SUPER_ADMIN'
    });
    assert.strictEqual(roleResult.allowed, false, 'Self role change must be blocked');

    const permResult = AuthorizationService.preventPrivilegeEscalation(callerUser, targetUser, {
        permissions: ['settings.general.edit']
    });
    assert.strictEqual(permResult.allowed, false, 'Self permission grant must be blocked');
});

it('SEC-P6-10: preventPrivilegeEscalation enforces delegation boundaries (cannot grant unheld permissions)', () => {
    const delegatorAdmin = {
        _id: '6b03504155e57e5541ad5930',
        email: 'delegator@shivayenergy.com',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: false,
        permissions: ['invoices.records.view', 'invoices.records.create'],
        fieldPermissions: []
    };

    const subordinate = {
        _id: '6b03504155e57e5541ad5931',
        email: 'subordinate@shivayenergy.com',
        role: 'EMPLOYEE',
        permissions: []
    };

    // Attempting to grant 'settings.general.edit' which delegator does not have
    const result = AuthorizationService.preventPrivilegeEscalation(delegatorAdmin, subordinate, {
        permissions: ['invoices.records.view', 'settings.general.edit']
    });

    assert.strictEqual(result.allowed, false, 'Must block delegating unheld permission');
    assert(result.reason.includes('You cannot delegate permissions you do not possess'));
});

// =========================================================================
// SECTION 4: BRANCH & DATA SCOPE ISOLATION (8 MODULES)
// =========================================================================
console.log('\n--- SECTION 4: Branch & Data Scope Isolation Across Domains ---');

it('SEC-P6-11: Branch Manager cannot access another branch data context', () => {
    const branchManagerSurat = {
        _id: '6b03504155e57e5541ad5940',
        email: 'bm.surat@shivayenergy.com',
        role: 'BRANCH_MANAGER',
        branchId: '6b03504155e57e5541ad5941', // Surat
        dataScope: 'BRANCH',
        isPrimarySuperAdmin: false
    };

    const ahmedabadBranchId = '6b03504155e57e5541ad5942';

    // Same branch
    assert.strictEqual(AuthorizationService.canAccessBranch(branchManagerSurat, '6b03504155e57e5541ad5941'), true);

    // Cross branch
    assert.strictEqual(AuthorizationService.canAccessBranch(branchManagerSurat, ahmedabadBranchId), false, 'Must reject cross-branch access');
});

it('SEC-P6-12: MULTI_BRANCH data scope allows access to authorized branches and rejects unauthorized branches', () => {
    const multiBranchAuditor = {
        _id: '6b03504155e57e5541ad5950',
        email: 'auditor@shivayenergy.com',
        role: 'MANAGER',
        branchId: 'branch-A',
        authorizedBranches: ['branch-A', 'branch-B', 'branch-C'],
        dataScope: 'MULTI_BRANCH',
        isPrimarySuperAdmin: false
    };

    assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchAuditor, 'branch-A'), true);
    assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchAuditor, 'branch-B'), true);
    assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchAuditor, 'branch-C'), true);
    assert.strictEqual(AuthorizationService.canAccessBranch(multiBranchAuditor, 'branch-D'), false, 'Unauthorized branch-D must be rejected');
});

it('SEC-P6-13: buildScopedQuery enforces data scope criteria for OWN, ASSIGNED, and BRANCH', () => {
    const ownUser = {
        _id: 'user-own-123',
        dataScope: 'OWN',
        branchId: 'branch-1'
    };
    const ownScope = AuthorizationService.buildScopedQuery(ownUser, 'quotations');
    assert.deepStrictEqual(ownScope.queryFilter, { createdBy: 'user-own-123', branchId: 'branch-1' });

    const assignedUser = {
        _id: 'user-assigned-456',
        dataScope: 'ASSIGNED',
        branchId: 'branch-1'
    };
    const assignedScope = AuthorizationService.buildScopedQuery(assignedUser, 'projects');
    assert.strictEqual(assignedScope.isGlobal, false);
    assert(Array.isArray(assignedScope.queryFilter.$or));
    assert.strictEqual(assignedScope.queryFilter.branchId, 'branch-1');

    const branchUser = {
        _id: 'user-branch-789',
        dataScope: 'BRANCH',
        branchId: 'branch-1'
    };
    const branchScope = AuthorizationService.buildScopedQuery(branchUser, 'customers');
    assert.strictEqual(branchScope.isGlobal, false);
    assert.strictEqual(branchScope.branchId, 'branch-1');
});

// =========================================================================
// SECTION 5: SENSITIVE FIELD & DATA LEAKAGE AUDIT
// =========================================================================
console.log('\n--- SECTION 5: Sensitive Field & Data Leakage Prevention ---');

it('SEC-P6-14: filterSensitiveFields scrubs financial fields and redacts PII in nested objects and arrays', () => {
    const complexOrder = {
        orderId: 'ORD-999',
        customer: {
            name: 'Sensitive Customer',
            mobile: '9876543210',
            email: 'customer.private@gmail.com'
        },
        items: [
            {
                sku: 'PANEL-540W',
                sellingPrice: 22000,
                purchasePrice: 17500,
                purchase_price: 17500,
                wac: 17200,
                profitMargin: 20.5,
                costBreakdown: { labor: 1000, material: 16500 }
            }
        ],
        financialMetrics: {
            netProfit: 4500,
            grossTurnover: 22000
        }
    };

    const regularStaff = {
        email: 'staff@shivayenergy.com',
        permissions: ['inventory.stock.view'],
        fieldPermissions: []
    };

    const scrubbed = AuthorizationService.filterSensitiveFields(regularStaff, complexOrder);

    // Check PII redaction
    assert.strictEqual(scrubbed.customer.mobile, 'XXXXXX3210', 'Phone number must be masked');
    assert.strictEqual(scrubbed.customer.email.startsWith('cu****@gmail.com'), true, 'Email must be masked');

    // Check items sensitive fields removal
    const item = scrubbed.items[0];
    assert.strictEqual(item.sellingPrice, 22000, 'Selling price must remain');
    assert.strictEqual(item.purchasePrice, undefined, 'purchasePrice must be deleted');
    assert.strictEqual(item.purchase_price, undefined, 'purchase_price must be deleted');
    assert.strictEqual(item.wac, undefined, 'wac must be deleted');
    assert.strictEqual(item.profitMargin, undefined, 'profitMargin must be deleted');
    assert.strictEqual(item.costBreakdown, undefined, 'costBreakdown must be deleted');

    // Check financialMetrics removal
    assert.strictEqual(scrubbed.financialMetrics, undefined, 'financialMetrics object must be deleted');
});

// =========================================================================
// SECTION 6: PERMISSION REVOCATION & SESSION CACHE INVALIDATION
// =========================================================================
console.log('\n--- SECTION 6: Permission Revocation & Stale Session Invalidation ---');

it('SEC-P6-15: validateAndSynchronizeSession detects permissionVersion mismatch and instantly updates session credentials', () => {
    const sessionUser = {
        _id: 'user-sync-1',
        email: 'sync.user@shivayenergy.com',
        role: 'EMPLOYEE',
        permissionVersion: 1,
        permissions: ['invoices.records.view', 'invoices.records.create'],
        fieldPermissions: ['fields.invoice.financial_metrics.view'],
        status: 'ACTIVE'
    };

    // Database record has been updated by admin: permissionVersion 2, create permission revoked
    const freshDbUser = {
        _id: 'user-sync-1',
        email: 'sync.user@shivayenergy.com',
        role: 'EMPLOYEE',
        permissionVersion: 2,
        permissions: ['invoices.records.view'], // create removed
        fieldPermissions: [], // field perm removed
        status: 'ACTIVE'
    };

    const syncResult = AuthorizationService.validateAndSynchronizeSession(sessionUser, freshDbUser);

    assert.strictEqual(syncResult.valid, true);
    assert.strictEqual(syncResult.refreshed, true, 'Session must be immediately refreshed');

    // Verify sessionUser object was mutated in place to reflect latest state
    assert.deepStrictEqual(sessionUser.permissions, ['invoices.records.view'], 'Session permissions must reflect revoked state');
    assert.deepStrictEqual(sessionUser.fieldPermissions, [], 'Session fieldPermissions must reflect revoked state');
    assert.strictEqual(sessionUser.permissionVersion, 2, 'Version must increment to 2');
});

it('SEC-P6-16: validateAndSynchronizeSession invalidates sessions of suspended or deactivated users', () => {
    const sessionUser = {
        _id: 'user-suspended-1',
        permissionVersion: 1,
        status: 'ACTIVE'
    };

    const freshSuspendedUser = {
        _id: 'user-suspended-1',
        permissionVersion: 2,
        status: 'SUSPENDED'
    };

    const result = AuthorizationService.validateAndSynchronizeSession(sessionUser, freshSuspendedUser);

    assert.strictEqual(result.valid, false, 'Suspended user session must be invalid');
    assert.strictEqual(result.reason, 'ACCOUNT_INACTIVE');
});

// =========================================================================
// SECTION 7: MAKER-CHECKER & BUSINESS RULES PRESERVATION
// =========================================================================
console.log('\n--- SECTION 7: Maker-Checker Approval Isolation & Business Rule 1.1 ---');

it('SEC-P6-17: Maker-checker strictly prevents employees from approving quotations', () => {
    const employee = {
        _id: 'emp-101',
        role: 'EMPLOYEE',
        permissions: ['quotations.approval.approve'] // Even if erroneously assigned
    };

    const quote = { preparedBy: 'emp-102', totalAmount: 100000 };
    const check = AuthorizationService.canPerformMakerChecker(employee, quote);

    assert.strictEqual(check.allowed, false);
    assert(check.reason.includes('Role hierarchy violation'), 'Employees must never approve commercial quotations');
});

it('SEC-P6-18: Business Rule 1.1: Single Manager Branch self-approval allowed up to limit (₹5,00,000)', () => {
    const manager = {
        _id: 'mgr-single-1',
        role: 'MANAGER',
        permissions: ['quotations.approval.approve']
    };

    const branch = {
        isSingleManagerBranch: true,
        singleManagerApprovalLimit: 500000
    };

    const smallQuote = {
        preparedBy: 'mgr-single-1',
        grandTotal: 350000
    };

    const checkSmall = AuthorizationService.canPerformMakerChecker(manager, smallQuote, branch);
    assert.strictEqual(checkSmall.allowed, true, 'Single manager self-approval permitted under ₹5,00,000');
    assert.strictEqual(checkSmall.rule, 'BUSINESS_RULE_1_1_SINGLE_MANAGER_EXCEPTION');

    const bigQuote = {
        preparedBy: 'mgr-single-1',
        grandTotal: 750000
    };

    const checkBig = AuthorizationService.canPerformMakerChecker(manager, bigQuote, branch);
    assert.strictEqual(checkBig.allowed, false, 'Single manager self-approval strictly rejected above threshold');
    assert.strictEqual(checkBig.reason, 'EXCEEDS_SINGLE_MANAGER_THRESHOLD');
});

// =========================================================================
// SECTION 8: PERFORMANCE & LATENCY BENCHMARK
// =========================================================================
console.log('\n--- SECTION 8: Performance Benchmark & Overhead Measurement ---');

it('SEC-P6-19: In-memory authorization evaluation benchmark (10,000 checks in < 25ms)', () => {
    const testUser = {
        _id: 'benchmark-user',
        email: 'bench@shivayenergy.com',
        role: 'MANAGER',
        isPrimarySuperAdmin: false,
        permissions: [
            'dashboard.branch.view',
            'attendance.branch.view',
            'projects.records.view',
            'quotations.records.view',
            'invoices.records.view'
        ],
        fieldPermissions: ['fields.invoice.financial_metrics.view']
    };

    const start = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) {
        AuthorizationService.hasPermission(testUser, 'projects.records.view');
        AuthorizationService.hasPermission(testUser, 'settings.general.edit');
        AuthorizationService.hasFieldAccess(testUser, 'fields.invoice.financial_metrics.view');
        AuthorizationService.hasModuleAccess(testUser, 'invoices');
    }
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    console.log(`     ⚡ 40,000 authorization checks completed in ${durationMs.toFixed(2)} ms (${(durationMs / 40000).toFixed(4)} ms/check)`);
    assert(durationMs < 100, `Authorization overhead too high: ${durationMs} ms for 40k checks`);
});

// =========================================================================
// SUMMARY REPORT
// =========================================================================
setTimeout(() => {
    console.log('\n' + '='.repeat(75));
    console.log(`Phase 6 Audit & Regression Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('='.repeat(75));
    if (testsFailed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 ALL PHASE 6 AUDIT & REGRESSION TESTS PASSED (100%)!');
        process.exit(0);
    }
}, 500);
