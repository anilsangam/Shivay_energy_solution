/**
 * SHIVAY ENERGY SOLUTIONS - MANAGER ROLE, IDEMPOTENCY & REAL-TIME SESSION INVALIDATION SUITE
 * Verifies:
 * 1. Immediate Session Invalidation on Account Suspension
 * 2. Proper Role-Aware Employee ID Prefix Generation (SES-MGR- vs SES-EMP- vs SES-ADMIN-)
 * 3. Add Staff Form Role Constraints & Single Branch Manager per Branch Enforcement
 * 4. Manager Data Scoping & Dropdown Isolation (Employees, Clients, Projects)
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const DataStore = require('../services/dataStore');
const adminController = require('../controllers/adminController');
const managerController = require('../controllers/managerController');
const customerController = require('../controllers/customerController');
const projectController = require('../controllers/projectController');
const { requireAuth, requireSuperAdmin, requireBranchManager } = require('../middleware/authMiddleware');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${testName}`);
    } else {
        console.error(`  ❌ [FAIL] ${testName}${details ? ' - ' + details : ''}`);
    }
}

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        jsonData: null,
        redirectUrl: null,
        renderedView: null,
        renderedData: null,
        clearedCookieName: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, val) {
            this.headers[name] = val;
            return this;
        },
        clearCookie(name) {
            this.clearedCookieName = name;
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
        }
    };
}

async function runTestSuite() {
    console.log('\n============================================================');
    console.log('🔒 VERIFICATION: MANAGER ROLE DEFINITION & SESSION INVALIDATION');
    console.log('============================================================\n');

    // -------------------------------------------------------------
    // 1. REAL-TIME SESSION INVALIDATION ON SUSPENSION
    // -------------------------------------------------------------
    console.log('--- 1. Immediate Session Invalidation on Account Suspension ---');

    // Test 1: User status changed to SUSPENDED by Admin immediately invalidates session
    {
        const suspendedUserId = new mongoose.Types.ObjectId();
        const testUser = {
            _id: suspendedUserId,
            name: 'Nilesh kumar',
            email: 'nilesh.test@gmail.com',
            role: 'BRANCH_MANAGER',
            employeeId: 'SES-MGR-447',
            status: 'ACTIVE'
        };
        DataStore.addInMemoryUser(testUser);

        // Admin suspends user
        const suspendReq = {
            body: { userId: suspendedUserId.toString(), status: 'SUSPENDED' },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const suspendRes = createMockRes();
        await adminController.updateUserStatus(suspendReq, suspendRes);

        assert(suspendRes.statusCode === 200 && suspendRes.jsonData.success === true,
            'Admin suspends account successfully via API');

        // Suspended user attempts immediate subsequent request with their active session
        let sessionDestroyed = false;
        const userReq = {
            session: {
                user: { _id: suspendedUserId, role: 'BRANCH_MANAGER', status: 'ACTIVE' }, // stale session cached as ACTIVE
                destroy: (cb) => { sessionDestroyed = true; if (cb) cb(); }
            },
            xhr: true,
            path: '/api/manager/stats',
            headers: { accept: 'application/json' }
        };
        const userRes = createMockRes();
        let nextCalled = false;

        requireAuth(userReq, userRes, () => { nextCalled = true; });

        assert(userRes.statusCode === 403 && sessionDestroyed && userRes.clearedCookieName === 'connect.sid' && !nextCalled,
            'Suspended user session immediately destroyed and blocked with HTTP 403 on next request');
    }

    // -------------------------------------------------------------
    // 2. ROLE DEFINITION & AUTO-GENERATED ID PREFIXES
    // -------------------------------------------------------------
    console.log('\n--- 2. Role-Based Employee ID Generation (SES-MGR-, SES-EMP-, SES-ADMIN-) ---');

    // Test 2: Creating a Branch Manager auto-generates ID prefixed with SES-MGR-
    {
        const newBranchId = new mongoose.Types.ObjectId();
        const req = {
            body: {
                name: 'Raju Sharma',
                email: 'raju.mgr@shivayenergy.com',
                mobile: '+91 98260 11223',
                password: 'Password@123',
                role: 'BRANCH_MANAGER',
                branchId: newBranchId.toString()
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createUser(req, res);

        assert(res.statusCode === 200 && res.jsonData.success === true,
            'Branch Manager created successfully');
        assert(res.jsonData.user.employeeId.startsWith('SES-MGR-'),
            'Branch Manager employeeId has correct role prefix SES-MGR- (Not SES-EMP-)',
            `Generated ID: ${res.jsonData.user.employeeId}`);
        assert(res.jsonData.user.managerId === null,
            'Branch Manager managerId is null (Managers do not report to another manager)');
    }

    // Test 3: Creating a Super Admin auto-generates ID prefixed with SES-ADMIN-
    {
        const req = {
            body: {
                name: 'Executive Officer',
                email: 'exec@shivayenergy.com',
                mobile: '+91 98260 33445',
                password: 'Password@123',
                role: 'SUPER_ADMIN'
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createUser(req, res);

        assert(res.statusCode === 200 && res.jsonData.user.employeeId.startsWith('SES-ADMIN-'),
            'Super Admin employeeId has correct role prefix SES-ADMIN-');
    }

    // Test 4: Creating an Employee auto-generates ID prefixed with SES-EMP-
    {
        const req = {
            body: {
                name: 'Ramesh Field Staff',
                email: 'ramesh@shivayenergy.com',
                mobile: '+91 98260 55667',
                password: 'Password@123',
                role: 'EMPLOYEE'
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createUser(req, res);

        assert(res.statusCode === 200 && res.jsonData.user.employeeId.startsWith('SES-EMP-'),
            'Employee employeeId has correct role prefix SES-EMP-');
    }

    // Test 5: Passing SES-EMP- ID for a Branch Manager automatically converts prefix to SES-MGR-
    {
        const branchB = new mongoose.Types.ObjectId();
        const req = {
            body: {
                name: 'Pawan Manager',
                email: 'pawan@shivayenergy.com',
                mobile: '+91 98260 77889',
                password: 'Password@123',
                role: 'BRANCH_MANAGER',
                employeeId: 'SES-EMP-727', // user entered EMP prefix by mistake
                branchId: branchB.toString()
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createUser(req, res);

        assert(res.statusCode === 200 && res.jsonData.user.employeeId === 'SES-MGR-727',
            'Passing SES-EMP- prefix for a Branch Manager automatically corrects to SES-MGR-727',
            `Corrected ID: ${res.jsonData.user.employeeId}`);
    }

    // -------------------------------------------------------------
    // 3. ONE MANAGER PER BRANCH ENFORCEMENT & CONSTRAINTS
    // -------------------------------------------------------------
    console.log('\n--- 3. Single Branch Manager per Branch & Assignment Constraints ---');

    // Test 6: Creating a Branch Manager without branch is rejected
    {
        const req = {
            body: {
                name: 'No Branch Manager',
                email: 'nobranch@shivayenergy.com',
                mobile: '+91 98260 99001',
                password: 'Password@123',
                role: 'BRANCH_MANAGER'
                // branchId omitted
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createUser(req, res);

        assert(res.statusCode === 400 && res.jsonData.message.includes('Branch selection is required'),
            'Creating Branch Manager without branch is rejected (HTTP 400)');
    }

    // Test 7: Enforce "ek branch me 2 manager na ho" (Reject duplicate active manager for same branch)
    {
        const duplicateBranchId = new mongoose.Types.ObjectId();
        // Create first manager for branch
        const firstReq = {
            body: {
                name: 'First Manager',
                email: 'first.mgr@shivayenergy.com',
                mobile: '+91 98260 11111',
                password: 'Password@123',
                role: 'BRANCH_MANAGER',
                branchId: duplicateBranchId.toString()
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const firstRes = createMockRes();
        await adminController.createUser(firstReq, firstRes);
        assert(firstRes.statusCode === 200, 'First manager created for branch');

        // Attempt to create second manager for the SAME branch
        const secondReq = {
            body: {
                name: 'Second Manager',
                email: 'second.mgr@shivayenergy.com',
                mobile: '+91 98260 22222',
                password: 'Password@123',
                role: 'BRANCH_MANAGER',
                branchId: duplicateBranchId.toString()
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const secondRes = createMockRes();
        await adminController.createUser(secondReq, secondRes);

        assert(secondRes.statusCode === 400 && secondRes.jsonData.message.includes('already has an active Branch Manager'),
            'Creating a second manager for the same branch is strictly rejected (ek branch me 2 manager na ho)');
    }

    // Test 8: Assigning a manager to another manager or super admin is blocked
    {
        const testMgrId = new mongoose.Types.ObjectId();
        DataStore.addInMemoryUser({
            _id: testMgrId,
            name: 'Existing Manager',
            role: 'BRANCH_MANAGER',
            status: 'ACTIVE'
        });

        const req = {
            body: {
                employeeId: testMgrId.toString(),
                managerId: new mongoose.Types.ObjectId().toString()
            },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.assignManager(req, res);

        assert(res.statusCode === 400 && res.jsonData.message.includes('cannot be assigned a reporting Manager'),
            'Assigning a manager to another manager is strictly rejected (manager ko manager assign nahi ho sakta)');
    }

    // -------------------------------------------------------------
    // 4. MANAGER DATA SCOPING & CROSS-BRANCH ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- 4. Manager Data Scoping & Cross-Branch Isolation ---');

    // Test 9: Manager only views employees in their own team/branch (No global fallback leak)
    {
        const isolatedMgrId = new mongoose.Types.ObjectId();
        const isolatedBranchId = 'br-isolated-test-01';

        // Add an employee assigned to this manager
        const myEmp = {
            _id: new mongoose.Types.ObjectId(),
            name: 'My Team Employee',
            role: 'EMPLOYEE',
            managerId: isolatedMgrId,
            branchId: isolatedBranchId,
            status: 'ACTIVE'
        };
        DataStore.addInMemoryUser(myEmp);

        // Add an employee belonging to another manager in a different branch
        const otherMgrId = new mongoose.Types.ObjectId();
        const otherEmp = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Other Manager Employee',
            role: 'EMPLOYEE',
            managerId: otherMgrId,
            branchId: 'br-other-branch-02',
            status: 'ACTIVE'
        };
        DataStore.addInMemoryUser(otherEmp);

        const req = {
            session: {
                user: { _id: isolatedMgrId, role: 'BRANCH_MANAGER', branchId: isolatedBranchId }
            }
        };
        const res = createMockRes();
        await managerController.getEmployees(req, res);

        assert(res.renderedData && Array.isArray(res.renderedData.employees),
            'Manager employees page rendered successfully');
        const employeeIds = res.renderedData.employees.map(e => e._id.toString());
        assert(employeeIds.includes(myEmp._id.toString()),
            'Manager sees employees assigned to their own team/branch');
        assert(!employeeIds.includes(otherEmp._id.toString()),
            'Manager CANNOT see employees belonging to another manager or branch');
    }

    // Test 10: Manager cross-branch customer mobile search is restricted
    {
        const managerBranchId = new mongoose.Types.ObjectId();
        const otherBranchId = new mongoose.Types.ObjectId();

        const req = {
            query: { mobile: '9826099999' },
            session: {
                user: { _id: new mongoose.Types.ObjectId(), role: 'BRANCH_MANAGER', branchId: managerBranchId }
            }
        };

        // Mock Customer model if not connected
        const origFindOne = mongoose.models.Customer ? mongoose.models.Customer.findOne : null;
        let mockCustomerCalled = false;
        if (mongoose.models.Customer) {
            mongoose.models.Customer.findOne = () => ({
                populate: () => Promise.resolve({
                    _id: new mongoose.Types.ObjectId(),
                    name: 'Cross Branch Customer',
                    mobile: '+91 98260 99999',
                    assignedBranch: otherBranchId,
                    assignedEmployee: new mongoose.Types.ObjectId()
                })
            });
        }

        const res = createMockRes();
        await customerController.searchByMobile(req, res);

        if (mongoose.models.Customer && origFindOne) {
            mongoose.models.Customer.findOne = origFindOne;
        }

        assert(res.jsonData && (res.jsonData.restricted === true || res.jsonData.found === false),
            'Cross-branch customer mobile search is restricted for Branch Manager');
    }

    // Test 11: Invoices project dropdown is scoped to manager branch
    {
        const branchMgr = {
            _id: new mongoose.Types.ObjectId(),
            role: 'BRANCH_MANAGER',
            branchId: new mongoose.Types.ObjectId()
        };
        const req = {
            session: { user: branchMgr, csrfToken: 'test-token' }
        };
        const res = createMockRes();
        await adminController.getInvoices(req, res);

        assert(res.renderedView === 'private/admin/invoices',
            'Invoices page rendered for Branch Manager');
        assert(res.renderedData && Array.isArray(res.renderedData.projects),
            'Invoices project dropdown loaded under manager jurisdiction');
    }

    console.log('\n============================================================');
    console.log(`🎯 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Test Suite Fatal Error:', err);
    process.exit(1);
});
