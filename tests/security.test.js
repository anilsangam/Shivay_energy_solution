/**
 * SHIVAY ENERGY SOLUTIONS - COMPREHENSIVE SECURITY & RBAC TEST SUITE
 * Phase 2 Acceptance Verification
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditService = require('../services/auditService');
const DataStore = require('../services/dataStore');
const adminController = require('../controllers/adminController');
const employeeController = require('../controllers/employeeController');
const authController = require('../controllers/authController');
const {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireBranchManager,
    requireEmployee,
    requireBranchAccess,
    verifyCsrf
} = require('../middleware/authMiddleware');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${testName}`);
    } else {
        console.error(`  ❌ [FAIL] ${testName} - ${details}`);
    }
}

// Mock Express Response Helper
function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        renderedView: null,
        renderedData: null,
        redirectUrl: null,
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, val) {
            this.headers[name] = val;
            return this;
        },
        redirect(url) {
            this.redirectUrl = url;
            this.statusCode = 302;
            return this;
        },
        render(view, data) {
            this.renderedView = view;
            this.renderedData = data;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        send(msg) {
            this.sentMessage = msg;
            return this;
        }
    };
}

async function runSecuritySuite() {
    console.log('\n============================================================');
    console.log('🛡️ SHIVAY ENERGY SOLUTIONS - SECURITY & RBAC VERIFICATION');
    console.log('============================================================\n');

    // -------------------------------------------------------------
    // 1. ROUTE ACCESS & REDIRECT TESTS
    // -------------------------------------------------------------
    console.log('--- 1. Authentication & Route Boundary Protection ---');

    // Test 1: Guest opens /admin -> Redirect to /admin/login
    {
        const req = { session: {}, originalUrl: '/admin', path: '/admin', xhr: false, headers: {} };
        const res = createMockRes();
        let nextCalled = false;
        requireAuth(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 302 && res.redirectUrl && res.redirectUrl.includes('/admin/login'),
            'Guest opens /admin -> Redirect to /admin/login',
            `Status: ${res.statusCode}, Redirect: ${res.redirectUrl}`);
    }

    // Test 2: Guest opens /employee/attendance -> Redirect to /employee/login
    {
        const req = { session: {}, originalUrl: '/employee/attendance', path: '/employee/attendance', xhr: false, headers: {} };
        const res = createMockRes();
        let nextCalled = false;
        requireAuth(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 302 && res.redirectUrl && res.redirectUrl.includes('/employee/login'),
            'Guest opens /employee/attendance -> Redirect to /employee/login',
            `Status: ${res.statusCode}, Redirect: ${res.redirectUrl}`);
    }

    // Test 3: Unauthenticated API accesses private endpoint -> HTTP 401
    {
        const req = { session: {}, originalUrl: '/api/attendance', path: '/api/attendance', xhr: true, headers: { accept: 'application/json' } };
        const res = createMockRes();
        let nextCalled = false;
        requireAuth(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 401 && res.jsonData && res.jsonData.success === false,
            'Unauthenticated API access -> HTTP 401 Unauthorized',
            `Status: ${res.statusCode}`);
    }

    // -------------------------------------------------------------
    // 2. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
    // -------------------------------------------------------------
    console.log('\n--- 2. Role-Based Access Control (RBAC) Enforcement ---');

    const mockEmployee = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Anil Sharma',
        role: 'EMPLOYEE',
        employeeId: 'SES-EMP-03',
        branchId: '607f1f77bcf86cd799439099',
        status: 'ACTIVE'
    };

    const mockManager = {
        _id: '507f1f77bcf86cd799439012',
        name: 'Rahul Saini',
        role: 'BRANCH_MANAGER',
        employeeId: 'SES-MGR-01',
        branchId: '607f1f77bcf86cd799439099',
        status: 'ACTIVE'
    };

    const mockSuperAdmin = {
        _id: '507f1f77bcf86cd799439013',
        name: 'Deepak Kushwaha',
        role: 'SUPER_ADMIN',
        employeeId: 'SES-ADMIN-01',
        status: 'ACTIVE'
    };

    // Test 4: Employee opens /admin -> HTTP 403 Forbidden
    {
        const req = { session: { user: mockEmployee }, originalUrl: '/admin', path: '/admin', xhr: false, headers: {} };
        const res = createMockRes();
        let nextCalled = false;
        requireSuperAdmin(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 403 && !nextCalled,
            'Employee opens /admin -> HTTP 403 Forbidden',
            `Status: ${res.statusCode}, nextCalled: ${nextCalled}`);
    }

    // Test 5: Manager opens /admin -> HTTP 403 Forbidden
    {
        const req = { session: { user: mockManager }, originalUrl: '/admin', path: '/admin', xhr: false, headers: {} };
        const res = createMockRes();
        let nextCalled = false;
        requireSuperAdmin(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 403 && !nextCalled,
            'Manager opens /admin -> HTTP 403 Forbidden',
            `Status: ${res.statusCode}, nextCalled: ${nextCalled}`);
    }

    // Test 6: Super Admin accesses /admin -> Allowed (next called)
    {
        const req = { session: { user: mockSuperAdmin }, originalUrl: '/admin', path: '/admin', xhr: false, headers: {} };
        const res = createMockRes();
        let nextCalled = false;
        requireSuperAdmin(req, res, () => { nextCalled = true; });

        assert(nextCalled === true,
            'Super Admin accesses /admin -> Allowed',
            `nextCalled: ${nextCalled}`);
    }

    // Test 7: Suspended user attempts access -> Session destroyed and HTTP 403
    {
        let destroyed = false;
        const req = { 
            session: { 
                user: { ...mockEmployee, status: 'SUSPENDED' },
                destroy: (cb) => { destroyed = true; cb(); }
            }, 
            originalUrl: '/employee/dashboard', 
            path: '/employee/dashboard', 
            xhr: true, 
            headers: {} 
        };
        const res = createMockRes();
        requireAuth(req, res, () => {});

        assert(res.statusCode === 403 && destroyed,
            'Suspended user access -> Session Destroyed & HTTP 403',
            `Status: ${res.statusCode}, Session destroyed: ${destroyed}`);
    }

    // -------------------------------------------------------------
    // 3. INVOICE & QUOTATION PRIVILEGE SEPARATION
    // -------------------------------------------------------------
    console.log('\n--- 3. Financial Document Access Control ---');

    // Test 8: Employee attempts to generate Invoice -> HTTP 403 Forbidden
    {
        const req = {
            session: { user: mockEmployee },
            body: { customerName: 'Test Customer', totalAmount: 50000 },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        adminController.saveInvoice(req, res);

        assert(res.statusCode === 403 && res.jsonData && res.jsonData.success === false,
            'Employee generates invoice -> HTTP 403 Forbidden',
            `Status: ${res.statusCode}`);
    }

    // Test 9: Employee generates Quotation -> Allowed
    {
        const req = {
            session: { user: mockEmployee },
            body: { customerName: 'Test Client', plantCapacityKw: 3, grossAmount: 174000 },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        adminController.saveQuotation(req, res);

        assert(res.jsonData && res.jsonData.success === true,
            'Employee generates quotation -> Allowed (HTTP 200 OK)',
            `Success: ${res.jsonData?.success}`);
    }

    // Test 10: Branch Manager generates branch invoice -> Allowed
    {
        const req = {
            session: { user: mockManager },
            body: { customerName: 'Branch Client Ltd.', totalAmount: 240000 },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        adminController.saveInvoice(req, res);

        assert(res.jsonData && res.jsonData.success === true,
            'Branch Manager generates branch invoice -> Allowed',
            `Success: ${res.jsonData?.success}`);
    }

    // -------------------------------------------------------------
    // 4. BRANCH ISOLATION & LEAKAGE PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- 4. Multi-Branch Isolation ---');

    // Test 11: Manager accesses another branch records -> HTTP 403 Forbidden
    {
        const req = {
            session: { user: mockManager }, // Assigned to branch ...9099
            params: { branchId: 'different-branch-id-4455' },
            originalUrl: '/manager/branch/different-branch-id-4455',
            xhr: true,
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        let nextCalled = false;
        requireBranchAccess('branchId')(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 403 && !nextCalled,
            'Manager accesses another branch -> HTTP 403 Forbidden',
            `Status: ${res.statusCode}`);
    }

    // Test 12: Super Admin accesses another branch -> Allowed (Global Access)
    {
        const req = {
            session: { user: mockSuperAdmin },
            params: { branchId: 'different-branch-id-4455' },
            originalUrl: '/admin/branch/different-branch-id-4455',
            xhr: true,
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        let nextCalled = false;
        requireBranchAccess('branchId')(req, res, () => { nextCalled = true; });

        assert(nextCalled === true,
            'Super Admin accesses all branches -> Allowed',
            `nextCalled: ${nextCalled}`);
    }

    // -------------------------------------------------------------
    // 5. ATTENDANCE INTEGRITY & SESSION-DERIVED IDENTITY
    // -------------------------------------------------------------
    console.log('\n--- 5. Field Attendance Security & Identity Spoofing Prevention ---');

    const mockFreshEmployee = {
        _id: '507f1f77bcf86cd799439099',
        name: 'Pooja Patel',
        role: 'EMPLOYEE',
        employeeId: 'SES-EMP-99',
        branchId: '607f1f77bcf86cd799439099',
        status: 'ACTIVE'
    };

    // Test 13: Attendance identity is strictly session-derived (ignores body spoofing)
    {
        const req = {
            session: { user: mockFreshEmployee },
            body: {
                employeeId: 'SPOOFED-EMPLOYEE-ID-999', // Attacker trying to punch for someone else
                employeeName: 'Fake Name',
                type: 'check_in',
                latitude: 23.3315,
                longitude: 77.7807,
                accuracy: 10
            },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        employeeController.submitAttendance(req, res);

        assert(res.jsonData && res.jsonData.success === true && res.jsonData.record.employeeId === mockFreshEmployee.employeeId,
            "Attendance identity strictly session-derived (Spoofed body ID ignored)",
            `Recorded ID: ${res.jsonData?.record?.employeeId}, Expected: ${mockFreshEmployee.employeeId}`);
    }

    // Test 14: Duplicate check-in on the same day -> HTTP 400 Rejected
    {
        const req = {
            session: { user: mockFreshEmployee },
            body: {
                type: 'check_in',
                latitude: 23.3315,
                longitude: 77.7807
            },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        employeeController.submitAttendance(req, res);

        assert(res.statusCode === 400 && res.jsonData && res.jsonData.success === false,
            'Duplicate Check-In on same day -> HTTP 400 Rejected',
            `Status: ${res.statusCode}, Message: ${res.jsonData?.message}`);
    }

    // Test 15: Check-Out with valid session and prior check-in -> Allowed
    {
        const req = {
            session: { user: mockFreshEmployee },
            body: {
                type: 'check_out',
                latitude: 23.3315,
                longitude: 77.7807
            },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        employeeController.submitAttendance(req, res);

        assert(res.jsonData && res.jsonData.success === true && res.jsonData.record.type === 'check_out',
            'Check-Out after Check-In -> Allowed',
            `Type: ${res.jsonData?.record?.type}`);
    }

    // -------------------------------------------------------------
    // 6. CSRF PROTECTION & MUTATION SECURITY
    // -------------------------------------------------------------
    console.log('\n--- 6. CSRF Attack Protection ---');

    // Test 16: CSRF token missing on protected mutation -> HTTP 403 Rejected
    {
        const req = {
            method: 'POST',
            path: '/api/admin/quotations/save',
            headers: {},
            body: { _csrf: '' },
            session: { csrfToken: 'valid-secret-token-123456' }
        };
        const res = createMockRes();
        let nextCalled = false;
        verifyCsrf(req, res, () => { nextCalled = true; });

        assert(res.statusCode === 403 && !nextCalled,
            'CSRF token missing on protected mutation -> HTTP 403 Rejected',
            `Status: ${res.statusCode}`);
    }

    // Test 17: Valid CSRF token provided in headers -> Allowed
    {
        const token = 'valid-secret-token-123456';
        const req = {
            method: 'POST',
            path: '/api/admin/quotations/save',
            headers: { 'x-csrf-token': token },
            body: {},
            session: { csrfToken: token }
        };
        const res = createMockRes();
        let nextCalled = false;
        verifyCsrf(req, res, () => { nextCalled = true; });

        assert(nextCalled === true,
            'Valid CSRF token supplied -> Allowed',
            `nextCalled: ${nextCalled}`);
    }

    // -------------------------------------------------------------
    // 7. PASSWORD CRYPTOGRAPHY & ACCOUNT SECURITY
    // -------------------------------------------------------------
    console.log('\n--- 7. Password Cryptography & Brute-Force Safeguards ---');

    // Test 18: bcrypt password hashing verification
    {
        const plaintext = 'SecurePass@2026';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(plaintext, salt);

        const isMatch = await bcrypt.compare(plaintext, hash);
        const isWrong = await bcrypt.compare('WrongPassword', hash);

        assert(isMatch === true && isWrong === false && !hash.includes(plaintext),
            'bcrypt one-way hashing with salt -> Verified',
            `Hash: ${hash.slice(0, 15)}...`);
    }

    // Test 19: Password hash excluded from User JSON conversion (No credential leak)
    {
        const userObj = new User({
            name: 'Security Test User',
            email: 'test@shivayenergy.com',
            mobile: '9826011111',
            password: 'HashedPassword123!',
            role: 'EMPLOYEE'
        });

        const json = userObj.toJSON();
        assert(json.password === undefined,
            'User JSON serialization excludes password hash -> Verified',
            `Has password in JSON: ${'password' in json}`);
    }

    // Test 20: Account lock calculation after 5 failed attempts
    {
        const testUser = new User({
            name: 'Locked User',
            email: 'lock@shivayenergy.com',
            mobile: '9826022222',
            password: 'SomePassword@2026',
            role: 'EMPLOYEE',
            failedLoginAttempts: 5,
            lockUntil: new Date(Date.now() + 15 * 60 * 1000)
        });

        assert(testUser.isLocked() === true,
            'Account lock trigger (15-minute lock after failed attempts) -> Verified',
            `isLocked: ${testUser.isLocked()}`);
    }

    console.log('\n============================================================');
    console.log(`🎯 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
    console.log('============================================================\n');

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runSecuritySuite().catch(err => {
    console.error('Test suite execution error:', err);
    process.exit(1);
});
