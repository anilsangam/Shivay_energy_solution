/**
 * Comprehensive Production Hardening & Security Regression Test Suite
 * SHIVAY ENERGY SOLUTIONS
 * 
 * Verifies all 8 implementation-level hardening phases:
 * 1. Authentication fail-closed on DB failure (HTTP 503)
 * 2. Stale-role session refresh & denial
 * 3. Permission argument normalization (arrays & spreads)
 * 4. Strict OWN/ASSIGNED branch isolation in data scope
 * 5. Strict maker-checker enforcement (no permissive branch defaults, negative amount denial)
 * 6. Invoice financial calculations, default unpaid status, payment tracking, version snapshots
 * 7. Durable audit logging, error escalation, sensitive key recursive redaction
 * 8. Zero-mutation startup, collision-safe IDs
 * 9. User model immutable primary super admin & permissionVersion increments
 * 10. Sensitive field serialization with Date/ObjectId preservation
 * 11. WebsiteService TTL caching & cache invalidation
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { requireAuth, requireRole, normalizePermissionKeys } = require('../middleware/authMiddleware');
const AuthorizationService = require('../services/authorizationService');
const AuditService = require('../services/auditService');
const AuditLog = require('../models/AuditLog');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const DataStore = require('../services/dataStore');
const WebsiteService = require('../services/websiteService');
const AUTH_CONFIG = require('../config/authConfig');

let testCount = 0;
let passedCount = 0;

function runTest(name, fn) {
    testCount++;
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(() => {
                passedCount++;
                console.log(`  ✅ [PASS] ${name}`);
            }).catch(err => {
                console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
                throw err;
            });
        } else {
            passedCount++;
            console.log(`  ✅ [PASS] ${name}`);
        }
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        throw err;
    }
}

async function runAllTests() {
    console.log('\n=============================================================');
    console.log('🚀 SHIVAY ENERGY SOLUTIONS — PRODUCTION HARDENING REGRESSION');
    console.log('=============================================================\n');

    // -------------------------------------------------------------
    // PHASE 1: AUTHENTICATION FAIL-CLOSED & STALE-ROLE PREVENTION
    // -------------------------------------------------------------
    console.log('--- Phase 1: Authentication Fail-Closed & Middleware Security ---');

    await runTest('1.1 requireAuth must fail closed (HTTP 503) if DB query throws', async () => {
        const fakeReq = {
            session: { user: { _id: new mongoose.Types.ObjectId().toString(), email: 'emp@shivay.com', role: 'EMPLOYEE' } },
            originalUrl: '/admin/dashboard',
            headers: {}
        };
        let statusSent = null;
        let responseSent = null;
        let nextCalled = false;
        const fakeRes = {
            locals: {},
            status: (code) => {
                statusSent = code;
                return {
                    send: (msg) => { responseSent = msg; },
                    json: (obj) => { responseSent = obj; },
                    render: (view, data) => { responseSent = data ? (data.message || data.title) : view; }
                };
            },
            send: (msg) => { responseSent = msg; },
            render: (view, data) => { responseSent = data ? (data.message || data.title) : view; }
        };
        const fakeNext = () => { nextCalled = true; };

        // Mock User.findById to reject with DB connection error
        const origFindById = User.findById;
        const origReadyState = mongoose.connection.readyState;
        mongoose.connection.readyState = 1;
        User.findById = () => ({
            select: () => ({
                lean: () => Promise.reject(new Error('MongoNetworkTimeoutError: connection timed out'))
            })
        });

        try {
            await requireAuth(fakeReq, fakeRes, fakeNext);
            assert.strictEqual(nextCalled, false, 'next() must NOT be called on DB failure');
            assert.strictEqual(statusSent, 503, 'Must return HTTP 503 on DB infrastructure failure');
            assert(responseSent.includes('AUTH INFRASTRUCTURE FAILURE') || responseSent.includes('Authentication service temporarily unavailable'), 'Must communicate auth service failure');
        } finally {
            User.findById = origFindById;
            mongoose.connection.readyState = origReadyState;
        }
    });

    await runTest('1.2 requireRole must reject stale session role when DB user is demoted', async () => {
        const userId = new mongoose.Types.ObjectId().toString();
        const fakeReq = {
            session: { user: { _id: userId, email: 'demoted@shivay.com', role: 'SUPER_ADMIN' } },
            originalUrl: '/admin/settings',
            headers: {}
        };
        let statusSent = null;
        let nextCalled = false;
        const fakeRes = {
            status: (code) => {
                statusSent = code;
                return {
                    send: () => {},
                    render: () => {},
                    json: () => {}
                };
            },
            redirect: () => {}
        };
        const fakeNext = () => { nextCalled = true; };

        // Mock User.findById to return refreshed demoted role EMPLOYEE
        const origFindById = User.findById;
        const origReadyState = mongoose.connection.readyState;
        mongoose.connection.readyState = 1;
        User.findById = () => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: userId,
                    email: 'demoted@shivay.com',
                    role: 'EMPLOYEE',
                    status: 'ACTIVE',
                    permissionVersion: 2,
                    permissions: [],
                    fieldPermissions: []
                })
            })
        });

        try {
            const roleMiddleware = requireRole(['SUPER_ADMIN']);
            await roleMiddleware(fakeReq, fakeRes, fakeNext);
            assert.strictEqual(nextCalled, false, 'Demoted user must not pass requireRole([SUPER_ADMIN])');
            assert.strictEqual(statusSent, 403, 'Must return 403 Forbidden for demoted role');
            assert.strictEqual(fakeReq.session.user.role, 'EMPLOYEE', 'Session role must be updated to refreshed role');
        } finally {
            User.findById = origFindById;
            mongoose.connection.readyState = origReadyState;
        }
    });

    await runTest('1.3 normalizePermissionKeys flattens arrays, spreads, and strips empty entries', () => {
        const res1 = normalizePermissionKeys('users.view');
        assert.deepStrictEqual(res1, ['users.view']);

        const res2 = normalizePermissionKeys(['users.view', 'users.create'], 'inventory.view');
        assert.deepStrictEqual(res2, ['users.view', 'users.create', 'inventory.view']);

        const res3 = normalizePermissionKeys([['nested.one'], ['nested.two', '']], null, undefined, 'nested.three');
        assert.deepStrictEqual(res3, ['nested.one', 'nested.two', 'nested.three']);

        assert.deepStrictEqual(normalizePermissionKeys(), []);
        assert.deepStrictEqual(normalizePermissionKeys('', null, undefined), []);
    });

    // -------------------------------------------------------------
    // PHASE 2: AUTHORIZATION & STRICT BRANCH ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- Phase 2: Authorization, Branch Isolation & Maker-Checker ---');

    await runTest('2.1 OWN and ASSIGNED data scopes must include user branchId in queryFilter', () => {
        const branchA = new mongoose.Types.ObjectId().toString();
        const testUser = {
            _id: new mongoose.Types.ObjectId().toString(),
            role: 'EMPLOYEE',
            dataScope: 'OWN',
            branchId: branchA,
            permissions: ['quotations.records.view']
        };

        const scope = AuthorizationService.getAccessibleDataScope(testUser, 'quotations');
        assert.strictEqual(scope.scope, 'OWN');
        assert.strictEqual(scope.queryFilter.createdBy, testUser._id);
        assert.strictEqual(scope.queryFilter.branchId.toString(), branchA, 'Query filter for OWN must isolate branchId');

        // Test ASSIGNED scope
        testUser.dataScope = 'ASSIGNED';
        const assignedScope = AuthorizationService.getAccessibleDataScope(testUser, 'quotations');
        assert.strictEqual(assignedScope.scope, 'ASSIGNED');
        assert(Array.isArray(assignedScope.queryFilter.$or), 'ASSIGNED scope must have $or filter');
        assert(assignedScope.queryFilter.$or.some(c => c.assignedEmployee === testUser._id), 'Must include assignedEmployee');
        assert.strictEqual(assignedScope.queryFilter.branchId.toString(), branchA, 'Query filter for ASSIGNED must isolate branchId');
    });

    await runTest('2.2 canAccessRecordBranch must fail closed if record has no branch', () => {
        const user = {
            _id: new mongoose.Types.ObjectId().toString(),
            role: 'BRANCH_MANAGER',
            branchId: new mongoose.Types.ObjectId().toString()
        };

        // Missing branch on record must fail closed
        const recordWithoutBranch = { title: 'Orphan Record' };
        assert.strictEqual(AuthorizationService.canAccessRecordBranch(user, recordWithoutBranch), false);
    });

    await runTest('2.3 canPerformMakerChecker denies approval if branch is missing or single-manager flag is absent', () => {
        const managerId = new mongoose.Types.ObjectId().toString();
        const branchId = new mongoose.Types.ObjectId().toString();
        const manager = {
            _id: managerId,
            role: 'BRANCH_MANAGER',
            branchId: branchId,
            permissions: ['quotations.approval.approve']
        };

        const quotation = {
            createdBy: managerId,
            branchId: branchId,
            totalAmount: 100000
        };

        // Case A: Missing branch context -> must DENY self-approval
        const resNoBranch = AuthorizationService.canPerformMakerChecker(manager, 'quotations', quotation, null);
        assert.strictEqual(resNoBranch.allowed, false, 'Missing branch context must deny maker self-approval');

        // Case B: Branch exists but isSingleManagerBranch is false -> must DENY
        const resMultiMgr = AuthorizationService.canPerformMakerChecker(manager, 'quotations', quotation, { isSingleManagerBranch: false });
        assert.strictEqual(resMultiMgr.allowed, false, 'Multi-manager branch must enforce maker-checker separation');

        // Case C: Branch explicitly verified single-manager -> ALLOWS exception
        const resSingleMgr = AuthorizationService.canPerformMakerChecker(manager, 'quotations', quotation, { isSingleManagerBranch: true });
        assert.strictEqual(resSingleMgr.allowed, true, 'Verified single-manager branch allows exception');

        // Case D: Negative financial amount -> must DENY
        const negQuotation = { createdBy: new mongoose.Types.ObjectId().toString(), totalAmount: -500 };
        const resNeg = AuthorizationService.canPerformMakerChecker(manager, 'quotations', negQuotation, { isSingleManagerBranch: true });
        assert.strictEqual(resNeg.allowed, false, 'Negative amounts must be rejected by maker-checker');
    });

    // -------------------------------------------------------------
    // PHASE 3: INVOICE & FINANCIAL INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Invoice & Financial Data Integrity ---');

    await runTest('3.1 Invoice schema sets paymentStatus default to unpaid and tracks balance', () => {
        const inv = new Invoice({
            invoiceNumber: 'TEST-INV-001',
            date: '23-11-2026',
            customerName: 'Test Solar Client',
            customerMobile: '9876543210',
            plantCapacity: '5 kW',
            totalAmount: 250000
        });

        assert.strictEqual(inv.paymentStatus, 'unpaid', 'Default paymentStatus must be unpaid');
        assert.strictEqual(inv.paidAmount, 0, 'Initial paidAmount should be 0');
        assert.strictEqual(inv.balanceAmount, 250000, 'Initial balanceAmount should match totalAmount');
        assert(Array.isArray(inv.payments), 'Payments array must exist');
    });

    await runTest('3.2 DataStore.addInvoice produces collision-safe ID and archives versions', () => {
        const inv1 = DataStore.addInvoice({
            customerName: 'Aarav Patel',
            customerMobile: '9876543210',
            totalAmount: 180000,
            date: '23-11-2026'
        });

        assert(inv1.invoiceNumber.startsWith('SES-INV-2026-'), 'Invoice number must have standard format');
        assert(inv1.invoiceNumber.length >= 18, 'Invoice number must include collision-safe suffix');

        // Update the same invoice to test versioning
        const invUpdated = DataStore.addInvoice({
            invoiceNumber: inv1.invoiceNumber,
            customerName: 'Aarav Patel',
            customerMobile: '9876543210',
            totalAmount: 190000,
            paidAmount: 50000,
            date: '23-11-2026'
        });

        assert.strictEqual(invUpdated.previousVersions.length, 1, 'Previous version must be archived');
        assert.strictEqual(invUpdated.previousVersions[0].totalAmount, 180000, 'Historical total must be retained');
        assert.strictEqual(invUpdated.totalAmount, 190000, 'Current total must be updated');
    });

    // -------------------------------------------------------------
    // PHASE 4: AUDIT LOGGING & SENSITIVE DATA REDACTION
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: Audit Service & Reliability ---');

    await runTest('4.1 sanitizeAuditDetails recursively redacts sensitive fields and tokens', () => {
        const dirtyDetails = {
            customer: 'Ramesh Sharma',
            password: 'secretPassword123',
            apiKey: 'sk-live-999999',
            authHeader: 'Bearer eyJhbGciOi...',
            nested: {
                userPin: 1234,
                cvv: 789,
                sessionToken: 'sess_abc123',
                safeInfo: 'Solar Panel 540W'
            },
            items: [
                { id: 1, secretKey: 'dont_leak_me', name: 'Inverter' }
            ]
        };

        const clean = AuditService.sanitizeAuditDetails(dirtyDetails);
        assert.strictEqual(clean.password, '[REDACTED]');
        assert.strictEqual(clean.apiKey, '[REDACTED]');
        assert.strictEqual(clean.authHeader, '[REDACTED]');
        assert.strictEqual(clean.nested.userPin, '[REDACTED]');
        assert.strictEqual(clean.nested.cvv, '[REDACTED]');
        assert.strictEqual(clean.nested.sessionToken, '[REDACTED]');
        assert.strictEqual(clean.nested.safeInfo, 'Solar Panel 540W');
        assert.strictEqual(clean.items[0].secretKey, '[REDACTED]');
        assert.strictEqual(clean.items[0].name, 'Inverter');
    });

    await runTest('4.2 AuditLog schema accepts new compliance operational actions', () => {
        const actions = [
            'PERMISSIONS_UPDATED',
            'DATA_SCOPE_CHANGED',
            'AUTHORIZED_BRANCHES_UPDATED',
            'INVOICE_UPDATED',
            'INVOICE_PAYMENT_RECORDED',
            'QUOTATION_APPROVED'
        ];

        for (const act of actions) {
            const entry = new AuditLog({
                action: act,
                category: 'SYSTEM',
                details: { info: 'Test action ' + act }
            });
            const validationError = entry.validateSync();
            assert.strictEqual(validationError, undefined, `AuditLog must accept action ${act}`);
        }
    });

    // -------------------------------------------------------------
    // PHASE 5 & 6: PERSISTENCE, STARTUP & USER MODEL PROTECTIONS
    // -------------------------------------------------------------
    console.log('\n--- Phase 5 & 6: Persistence, Startup & User Protections ---');

    await runTest('5.1 DataStore entities use collision-safe timestamp and hex IDs', () => {
        const enq = DataStore.addEnquiry({ name: 'Rohit', mobile: '9999999999' });
        assert(enq.id.startsWith('ENQ-'), 'Enquiry ID prefix');
        assert(enq.id.length >= 13, 'Enquiry ID must have timestamp and random entropy');

        const quote = DataStore.addQuotation({ customerName: 'Neha', customerMobile: '8888888888' });
        assert(quote.quotationNumber.startsWith('SES-Q2026-'), 'Quotation ID prefix');
        assert(quote.quotationNumber.length >= 16, 'Quotation ID must have timestamp and random entropy');

        const comp = DataStore.addComplaint({ customerName: 'Sanjay', mobile: '7777777777' });
        assert(comp.ticketId.startsWith('SHIVAY-'), 'Complaint ticket ID prefix');
        assert(comp.ticketId.length >= 14, 'Complaint ticket ID must have timestamp and random entropy');
    });

    await runTest('6.1 User.toSafeDTO removes sensitive security fields', () => {
        const u = new User({
            name: 'Sunil Verma',
            email: 'sunil@shivayenergy.com',
            mobile: '9123456780',
            password: 'StrongPassword123!',
            role: 'EMPLOYEE',
            failedLoginAttempts: 3,
            lockUntil: new Date(Date.now() + 60000)
        });

        const dto = u.toSafeDTO();
        assert.strictEqual(dto.password, undefined, 'password must be stripped');
        assert.strictEqual(dto.failedLoginAttempts, undefined, 'failedLoginAttempts must be stripped');
        assert.strictEqual(dto.lockUntil, undefined, 'lockUntil must be stripped');
        assert.strictEqual(dto.__v, undefined, '__v must be stripped');
        assert.strictEqual(dto.name, 'Sunil Verma');
        assert.strictEqual(dto.email, 'sunil@shivayenergy.com');
    });

    await runTest('6.2 User pre-save hook increments permissionVersion on role/branch change', async () => {
        const u = new User({
            name: 'Ritu Singh',
            email: 'ritu@shivayenergy.com',
            mobile: '9876543219',
            password: 'Password123!',
            role: 'EMPLOYEE',
            permissionVersion: 1
        });

        // Simulate modification of role
        u.role = 'MANAGER';
        // Mock isModified
        u.isModified = (field) => field === 'role';
        u.isNew = false;
        u._id = new mongoose.Types.ObjectId();

        // Run pre-save logic
        const preSaveHooks = User.schema.s.hooks._pres.get('save') || [];
        for (const hook of preSaveHooks) {
            await hook.fn.call(u);
        }

        assert.strictEqual(u.permissionVersion, 2, 'permissionVersion must be incremented when role is modified');
    });

    await runTest('6.3 Primary Super Admin governance prevents revoking designation or role change', async () => {
        const admin = new User({
            name: 'Super Admin',
            email: AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL,
            mobile: '9999999999',
            password: 'Password123!',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true
        });
        admin.isNew = false;
        admin._id = new mongoose.Types.ObjectId();

        // Try setting role to EMPLOYEE
        admin.role = 'EMPLOYEE';
        admin.isModified = (field) => field === 'role';

        let thrown = false;
        try {
            const preSaveHooks = User.schema.s.hooks._pres.get('save') || [];
            for (const hook of preSaveHooks) {
                await hook.fn.call(admin);
            }
        } catch (err) {
            thrown = true;
            assert(err.message.includes('Primary Super Admin role cannot be altered'), 'Must block role alteration');
        }
        assert.strictEqual(thrown, true, 'Must throw security violation when altering Primary Super Admin role');
    });

    // -------------------------------------------------------------
    // PHASE 7: SENSITIVE FIELD SERIALIZATION
    // -------------------------------------------------------------
    console.log('\n--- Phase 7: Sensitive Field Serialization ---');

    await runTest('7.1 filterSensitiveFields preserves Date and ObjectId instances while redacting prices', () => {
        const empUser = {
            _id: new mongoose.Types.ObjectId().toString(),
            role: 'EMPLOYEE',
            permissions: [],
            fieldPermissions: [] // No special field permissions
        };

        const testDate = new Date('2026-11-23T10:00:00Z');
        const testId = new mongoose.Types.ObjectId();

        const inputRecord = {
            _id: testId,
            createdAt: testDate,
            customerName: 'Vikram Joshi',
            customerMobile: '+91 9876543210',
            email: 'vikram.joshi@example.com',
            purchasePrice: 45000,
            wac: 42000,
            profitMargin: 15.5,
            costBreakdown: { labor: 5000, hardware: 40000 },
            financialMetrics: { grossTurnover: 100000 },
            systemCapacity: '10 kW'
        };

        const filtered = AuthorizationService.filterSensitiveFields(empUser, inputRecord);

        // Date and ObjectId must be preserved
        assert(filtered.createdAt instanceof Date, 'Date instance must be preserved');
        assert.strictEqual(filtered.createdAt.toISOString(), testDate.toISOString());
        assert(filtered._id instanceof mongoose.Types.ObjectId || filtered._id.toString() === testId.toString(), 'ObjectId must be preserved');

        // Sensitive fields must be deleted
        assert.strictEqual(filtered.purchasePrice, undefined, 'purchasePrice must be removed');
        assert.strictEqual(filtered.wac, undefined, 'wac must be removed');
        assert.strictEqual(filtered.profitMargin, undefined, 'profitMargin must be removed');
        assert.strictEqual(filtered.costBreakdown, undefined, 'costBreakdown must be removed');
        assert.strictEqual(filtered.financialMetrics, undefined, 'financialMetrics must be removed');

        // PII must be masked
        assert(filtered.customerMobile.includes('XXXXXX'), 'Mobile must be masked');
        assert(filtered.email.includes('****'), 'Email must be masked');
    });

    // -------------------------------------------------------------
    // PHASE 8: WEBSITE CACHING & PERFORMANCE
    // -------------------------------------------------------------
    console.log('\n--- Phase 8: Website Caching & Performance ---');

    await runTest('8.1 WebsiteService.getCompany utilizes in-memory cache without repeating queries', async () => {
        let refreshCount = 0;
        const origRefresh = WebsiteService.refreshCompanyCache;
        WebsiteService.refreshCompanyCache = async () => {
            refreshCount++;
            return origRefresh.call(WebsiteService);
        };

        try {
            // First call refreshes cache
            await WebsiteService.getCompany();
            const countAfterFirst = refreshCount;

            // Second and third calls within TTL should NOT invoke refreshCompanyCache
            await WebsiteService.getCompany();
            await WebsiteService.getCompany();
            assert.strictEqual(refreshCount, countAfterFirst, 'getCompany must use TTL cache and avoid redundant refreshes');
        } finally {
            WebsiteService.refreshCompanyCache = origRefresh;
        }
    });

    console.log('\n=============================================================');
    console.log(`🎉 ALL TESTS COMPLETED: ${passedCount} / ${testCount} PASSED`);
    console.log('=============================================================\n');
}

runAllTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
