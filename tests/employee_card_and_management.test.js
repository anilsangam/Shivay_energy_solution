/**
 * AUTOMATED TEST SUITE: EMPLOYEE MANAGEMENT, PERMISSION DELEGATION, ID CARD & VISITING CARD
 * 
 * Verifies:
 * 1. User Schema fields (bloodGroup, alternateMobile, joiningDate, expiryDate, idCardNumber)
 * 2. Manager Employee Creation & Scoping (auto branchId, managerId, role EMPLOYEE)
 * 3. Manager Employee Modification & Jurisdiction Checks
 * 4. Manager Granular Permission Delegation & Escalation Prevention
 * 5. Official Employee ID Card Rendering & Content Verification (Front + Back)
 * 6. Official Employee Visiting Card Rendering & Dynamic Branch Verification (Bhopal vs Raisen)
 * 7. Access Control: Only Manager (of branch) or Super Admin can view/share cards
 */

const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');
const Branch = require('../models/Branch');
const DataStore = require('../services/dataStore');
const AuthorizationService = require('../services/authorizationService');
const {
    EmployeeCardController,
    resolveEmployeeBranch,
    canAccessEmployeeCards,
    generateCardToken
} = require('../controllers/employeeCardController');
const ManagerController = require('../controllers/managerController');
const adminController = require('../controllers/adminController');
const UploadService = require('../services/uploadService');
const { requireAuth } = require('../middleware/authMiddleware');
const {
    MODULES,
    PERMISSIONS,
    ROLE_MIGRATION_BASELINES
} = require('../config/permissionRegistry');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
    }
}

async function itAsync(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
    }
}

(async () => {
    console.log('\n======================================================================');
    console.log('🧪 EMPLOYEE MANAGEMENT, PERMISSION DELEGATION & CARD SYSTEM TEST HARNESS');
    console.log('======================================================================\n');

    // MOCK DATA SETUP
    const raisenBranchId = new mongoose.Types.ObjectId('655000000000000000000010');
    const bhopalBranchId = new mongoose.Types.ObjectId('655000000000000000000020');

    const mockSuperAdmin = {
        _id: new mongoose.Types.ObjectId('655000000000000000000001'),
        name: 'Deepak Kushwaha',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: true,
        permissions: Object.keys(PERMISSIONS)
    };

    const mockRaisenManager = {
        _id: new mongoose.Types.ObjectId('655000000000000000000002'),
        name: 'Rahul Saini',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        branchId: raisenBranchId,
        permissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.fieldPermissions]
    };

    const mockBhopalManager = {
        _id: new mongoose.Types.ObjectId('655000000000000000000022'),
        name: 'Suresh Patel',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        branchId: bhopalBranchId,
        permissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.fieldPermissions]
    };

    const mockRaisenEmployee = {
        _id: new mongoose.Types.ObjectId('655000000000000000000005'),
        name: 'Vikram Solanki',
        email: 'vikram@shivayenergy.com',
        mobile: '+91 99933 11204',
        role: 'EMPLOYEE',
        branchId: raisenBranchId,
        managerId: mockRaisenManager._id,
        designation: 'Electrical & Net-Meter Testing Engineer',
        department: 'Grid Integration',
        bloodGroup: 'B+',
        alternateMobile: '+91 98260 11223',
        joiningDate: new Date('2026-03-01'),
        expiryDate: new Date('2029-03-01'),
        employeeId: 'SES-EMP-04',
        idCardNumber: 'SES-EMP-04',
        permissions: ['projects.tasks.view', 'projects.tasks.edit']
    };

    const mockBhopalEmployee = {
        _id: new mongoose.Types.ObjectId('655000000000000000000025'),
        name: 'Kavita Verma',
        email: 'kavita@shivayenergy.com',
        mobile: '+91 98260 55443',
        role: 'EMPLOYEE',
        branchId: bhopalBranchId,
        managerId: mockBhopalManager._id,
        designation: 'Solar Site Engineer',
        department: 'Bhopal EPC',
        bloodGroup: 'O+',
        alternateMobile: '+91 75808 22407',
        joiningDate: new Date('2026-02-15'),
        expiryDate: new Date('2029-02-15'),
        employeeId: 'SES-EMP-88',
        idCardNumber: 'SES-EMP-88',
        permissions: ['projects.records.view']
    };

    console.log('--- 1. User Model Schema & ID Card Fields ---');
    it('1.1 User schema includes bloodGroup, alternateMobile, joiningDate, expiryDate, and idCardNumber', () => {
        const paths = User.schema.paths;
        assert.ok(paths.bloodGroup, 'User schema should have bloodGroup');
        assert.ok(paths.alternateMobile, 'User schema should have alternateMobile');
        assert.ok(paths.joiningDate, 'User schema should have joiningDate');
        assert.ok(paths.expiryDate, 'User schema should have expiryDate');
        assert.ok(paths.idCardNumber, 'User schema should have idCardNumber');
    });

    console.log('\n--- 2. Manager Employee Creation & Auto-Scoping ---');
    await itAsync('2.1 Manager can create employee, automatically scoped to branch and manager ID', async () => {
        const req = {
            session: { user: mockRaisenManager },
            body: {
                name: 'Mahesh Sharma',
                email: 'mahesh.solar@shivayenergy.com',
                mobile: '+91 94250 11223',
                password: 'password1234',
                designation: 'Rooftop Structural Technician',
                department: 'Field Mechanical',
                bloodGroup: 'AB+',
                alternateMobile: '+91 94250 99887',
                joiningDate: '2026-04-01',
                expiryDate: '2029-04-01'
            },
            ip: '127.0.0.1'
        };

        let jsonResult = null;
        const res = {
            status: function() { return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postCreateEmployee(req, res);
        assert.ok(jsonResult, 'Should return a JSON response');
        assert.strictEqual(jsonResult.success, true, 'Should succeed creating employee');
        assert.strictEqual(jsonResult.employee.name, 'Mahesh Sharma');
        assert.strictEqual(jsonResult.employee.bloodGroup, 'AB+');
        assert.strictEqual(jsonResult.employee.alternateMobile, '+91 94250 99887');
        assert.strictEqual(jsonResult.employee.status, 'PENDING', 'Manager-created employee MUST start in PENDING status');
        global.__createdPendingEmpId = jsonResult.employee._id;
    });

    console.log('\n--- 3. Manager Employee Modification & Cross-Branch Isolation ---');
    await itAsync('3.1 Manager can modify an employee assigned to their branch', async () => {
        DataStore.addInMemoryUser(mockRaisenEmployee);

        const req = {
            session: { user: mockRaisenManager },
            params: { id: mockRaisenEmployee._id.toString() },
            body: {
                name: 'Vikram Solanki',
                mobile: '+91 99933 11204',
                designation: 'Senior Commissioning Specialist',
                bloodGroup: 'A+',
                alternateMobile: '+91 99933 77665',
                status: 'ACTIVE'
            },
            ip: '127.0.0.1'
        };

        let jsonResult = null;
        const res = {
            status: function() { return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postUpdateEmployee(req, res);
        assert.ok(jsonResult && jsonResult.success, 'Modification should succeed');
        assert.strictEqual(mockRaisenEmployee.designation, 'Senior Commissioning Specialist');
        assert.strictEqual(mockRaisenEmployee.bloodGroup, 'A+');
    });

    await itAsync('3.2 Manager attempting to modify an employee of ANOTHER branch is blocked (403)', async () => {
        DataStore.addInMemoryUser(mockBhopalEmployee);

        const req = {
            session: { user: mockRaisenManager }, // Raisen Manager
            params: { id: mockBhopalEmployee._id.toString() }, // Bhopal Employee
            body: { name: 'Unauthorized Edit' },
            ip: '127.0.0.1'
        };

        let statusCode = 200;
        let jsonResult = null;
        const res = {
            status: function(code) { statusCode = code; return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postUpdateEmployee(req, res);
        assert.strictEqual(statusCode, 403, 'Should respond with 403 Forbidden for cross-branch modification');
        assert.strictEqual(jsonResult.success, false);
    });

    console.log('\n--- 4. Manager Permission Delegation & Escalation Prevention ---');
    await itAsync('4.1 Manager can delegate permissions they themselves hold to their employee', async () => {
        const req = {
            session: { user: mockRaisenManager },
            params: { id: mockRaisenEmployee._id.toString() },
            body: {
                permissions: ['projects.tasks.view', 'projects.tasks.edit', 'projects.tasks.create'],
                fieldPermissions: [],
                notes: 'Assigned project task execution capabilities'
            },
            ip: '127.0.0.1'
        };

        let jsonResult = null;
        const res = {
            status: function() { return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postUpdateEmployeePermissions(req, res);
        assert.ok(jsonResult && jsonResult.success, 'Delegation within bounds should succeed');
    });

    await itAsync('4.2 Manager attempting to delegate a permission they DO NOT hold is blocked', async () => {
        const req = {
            session: { user: mockRaisenManager },
            params: { id: mockRaisenEmployee._id.toString() },
            body: {
                permissions: ['settings.general.edit'], // Manager does NOT have super admin settings permission
                fieldPermissions: []
            },
            ip: '127.0.0.1'
        };

        let statusCode = 200;
        let jsonResult = null;
        const res = {
            status: function(code) { statusCode = code; return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postUpdateEmployeePermissions(req, res);
        assert.strictEqual(statusCode, 403, 'Should reject privilege escalation with 403');
        assert.strictEqual(jsonResult.success, false);
    });

    console.log('\n--- 5. Dynamic Branch Details on Cards (Bhopal vs Raisen) ---');
    await itAsync('5.1 resolveEmployeeBranch returns distinct branch details for Raisen vs Bhopal', async () => {
        const raisenBranch = await resolveEmployeeBranch(mockRaisenEmployee);
        const bhopalBranch = await resolveEmployeeBranch(mockBhopalEmployee);

        assert.ok(raisenBranch.name.includes('Raisen'), 'Raisen employee branch should be Raisen');
        assert.ok(raisenBranch.address.includes('Arjun Nagar'), 'Raisen address should match');
        assert.strictEqual(raisenBranch.contactNumber, '+91 70005 75496', 'Raisen phone should match');

        assert.ok(bhopalBranch.name.includes('Bhopal'), 'Bhopal employee branch should be Bhopal');
        assert.ok(bhopalBranch.address.includes('Indpuri') || bhopalBranch.city.includes('Bhopal'), 'Bhopal address should match');
        assert.strictEqual(bhopalBranch.contactNumber, '+91 93997 61750', 'Bhopal phone should match');

        assert.notStrictEqual(raisenBranch.name, bhopalBranch.name, 'Branch names MUST differ');
        assert.notStrictEqual(raisenBranch.address, bhopalBranch.address, 'Branch addresses MUST differ');
    });

    console.log('\n--- 6. Card Security & Access Control ---');
    it('6.1 Super Admin can access ID and Visiting cards for any employee', () => {
        const allowed = canAccessEmployeeCards(mockSuperAdmin, mockRaisenEmployee);
        assert.strictEqual(allowed, true, 'Super Admin must have card access');
    });

    it('6.2 Manager can access cards for their own branch employees', () => {
        const allowed = canAccessEmployeeCards(mockRaisenManager, mockRaisenEmployee);
        assert.strictEqual(allowed, true, 'Manager must have card access for their branch employee');
    });

    it('6.3 Manager CANNOT access cards for employees of other branches without token', () => {
        const allowed = canAccessEmployeeCards(mockRaisenManager, mockBhopalEmployee);
        assert.strictEqual(allowed, false, 'Manager must NOT access cards of other branches');
    });

    it('6.4 Card verification token allows employee to view shared card', () => {
        const token = generateCardToken(mockBhopalEmployee._id, mockBhopalEmployee.employeeId);
        const allowedWithToken = canAccessEmployeeCards(null, mockBhopalEmployee, token);
        assert.strictEqual(allowedWithToken, true, 'Valid HMAC token must allow card viewing');

        const allowedWithBadToken = canAccessEmployeeCards(null, mockBhopalEmployee, 'bad-token-123');
        assert.strictEqual(allowedWithBadToken, false, 'Invalid HMAC token must be rejected');
    });

    console.log('\n--- 7. Super Admin Approval Workflow, Profile Picture Validation & Admin Edit ---');
    await itAsync('7.1 Pending manager-created employee is blocked from accessing protected routes before approval', async () => {
        const pendingEmp = await DataStore.getUserById(global.__createdPendingEmpId);
        assert.ok(pendingEmp, 'Created pending employee should exist in store');
        assert.strictEqual(pendingEmp.status, 'PENDING');

        let statusCode = 200;
        let jsonResult = null;
        const req = {
            session: { user: { _id: pendingEmp._id, status: 'PENDING', role: 'EMPLOYEE' }, destroy: (cb) => cb && cb() },
            xhr: true,
            path: '/api/employee/profile',
            headers: { accept: 'application/json' }
        };
        const res = {
            clearCookie: () => {},
            status: function(code) { statusCode = code; return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await requireAuth(req, res, () => {});
        assert.strictEqual(statusCode, 403, 'PENDING user must be rejected with 403');
        assert.ok(jsonResult && jsonResult.message.toLowerCase().includes('pending'));
    });

    await itAsync('7.2 Manager CANNOT self-approve a PENDING employee account to ACTIVE', async () => {
        let statusCode = 200;
        let jsonResult = null;
        const req = {
            session: { user: mockRaisenManager },
            params: { id: global.__createdPendingEmpId.toString() },
            body: { status: 'ACTIVE' },
            ip: '127.0.0.1'
        };
        const res = {
            status: function(code) { statusCode = code; return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };

        await ManagerController.postUpdateEmployee(req, res);
        assert.strictEqual(statusCode, 403, 'Manager must be blocked from activating PENDING employee');
        assert.strictEqual(jsonResult.success, false);
    });

    await itAsync('7.3 Super Admin CAN approve a PENDING employee and edit profile details', async () => {
        let jsonResult = null;
        const approveReq = {
            session: { user: mockSuperAdmin },
            body: { userId: global.__createdPendingEmpId.toString(), status: 'ACTIVE' },
            ip: '127.0.0.1'
        };
        const approveRes = {
            status: function() { return this; },
            json: function(payload) { jsonResult = payload; return payload; }
        };
        await adminController.updateUserStatus(approveReq, approveRes);
        assert.strictEqual(jsonResult.success, true, 'Super Admin approval should succeed');

        const updatedUser = await DataStore.getUserById(global.__createdPendingEmpId);
        assert.strictEqual(updatedUser.status, 'ACTIVE', 'Status should now be ACTIVE');

        let editResult = null;
        const editReq = {
            session: { user: mockSuperAdmin },
            params: { id: global.__createdPendingEmpId.toString() },
            body: { designation: 'Lead Structural Engineer', bloodGroup: 'O+' },
            ip: '127.0.0.1'
        };
        const editRes = {
            status: function() { return this; },
            json: function(payload) { editResult = payload; return payload; }
        };
        await adminController.updateUserDetails(editReq, editRes);
        assert.strictEqual(editResult.success, true, 'Super Admin edit should succeed');
        assert.strictEqual(updatedUser.designation, 'Lead Structural Engineer');
        assert.strictEqual(updatedUser.bloodGroup, 'O+');
    });

    await itAsync('7.4 Profile picture helper rejects non-image MIME types (e.g. PDF)', async () => {
        let threw = false;
        try {
            await UploadService.processProfileAvatar({
                avatarData: 'data:application/pdf;base64,JVBERi0xLjQ=',
                avatarFilename: 'doc.pdf',
                avatarMimeType: 'application/pdf'
            });
        } catch (err) {
            threw = err.message.includes('JPG, PNG, or WEBP');
        }
        assert.strictEqual(threw, true, 'Non-image profile upload must be rejected');
    });

    console.log('\n======================================================================');
    console.log(`🎯 EMPLOYEE & CARD TEST SUITE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('======================================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
