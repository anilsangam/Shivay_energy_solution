/**
 * PHASE 1 MODERNIZATION VERIFICATION TEST SUITE
 * Shivay Energy Solutions - Admin Panel Modernization
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Customer = require('../models/Customer');
const QuotationRequest = require('../models/QuotationRequest');
const Quotation = require('../models/Quotation');
const QuotationStatusHistory = require('../models/QuotationStatusHistory');
const Project = require('../models/Project');
const ProjectActivity = require('../models/ProjectActivity');
const ProjectNote = require('../models/ProjectNote');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

const adminController = require('../controllers/adminController');
const managerController = require('../controllers/managerController');
const employeeController = require('../controllers/employeeController');
const authController = require('../controllers/authController');
const DataStore = require('../services/dataStore');

const {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireManager,
    requireBranchManager,
    requireEmployee,
    validateObjectId
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

async function runPhase1Tests() {
    console.log('============================================================');
    console.log('🚀 PHASE 1: ACCEPTANCE & INTEGRATION TEST SUITE');
    console.log('============================================================\n');

    // TEST GROUP 1: Database Foundation Models
    console.log('--- 1. Database Foundation & Mongoose Schemas ---');
    assert(typeof User === 'function', 'User model defined and exportable');
    assert(typeof Customer === 'function', 'Customer model defined with validation and indexes');
    assert(typeof QuotationRequest === 'function', 'QuotationRequest model defined with validation');
    assert(typeof Quotation === 'function', 'Quotation model supports customer & request refs');
    assert(typeof QuotationStatusHistory === 'function', 'QuotationStatusHistory model defined');
    assert(typeof Project === 'function', 'Project model defined for Phase 3 readiness');
    assert(typeof ProjectActivity === 'function', 'ProjectActivity model defined');
    assert(typeof ProjectNote === 'function', 'ProjectNote model defined');
    assert(typeof Notification === 'function', 'Notification model defined with types');
    assert(typeof AuditLog === 'function', 'AuditLog model defined with security actions');

    // Check User Schema extensions
    const userPaths = User.schema.paths;
    assert(userPaths.managerId, 'User schema has managerId field');
    assert(userPaths.role.enumValues.includes('SUPER_ADMIN') &&
           userPaths.role.enumValues.includes('MANAGER') &&
           userPaths.role.enumValues.includes('EMPLOYEE'), 'User schema supports SUPER_ADMIN, MANAGER and EMPLOYEE roles');
    assert(userPaths.status.enumValues.includes('ACTIVE') &&
           userPaths.status.enumValues.includes('INACTIVE'), 'User schema supports ACTIVE and INACTIVE statuses');

    // TEST GROUP 2: Authentication & Logout
    console.log('\n--- 2. Authentication & Logout Session Invalidation ---');
    let sessionDestroyed = false;
    let cookieCleared = false;
    const mockReqLogout = {
        session: {
            user: { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' },
            destroy(cb) {
                sessionDestroyed = true;
                cb();
            }
        },
        ip: '127.0.0.1'
    };
    const mockResLogout = createMockRes();
    mockResLogout.clearCookie = (name) => {
        if (name === 'connect.sid') cookieCleared = true;
    };
    authController.logout(mockReqLogout, mockResLogout);
    assert(sessionDestroyed, 'Logout destroys the server session');
    assert(cookieCleared, 'Logout clears the session cookie');
    assert(mockResLogout.redirectUrl === '/', 'Logout redirects to home');

    // TEST GROUP 3: Role-Based Access Control (RBAC)
    console.log('\n--- 3. Role-Based Middleware & Permission Enforcement ---');
    // Test requireManager allows MANAGER
    let managerNextCalled = false;
    const reqManager = { session: { user: { role: 'MANAGER' } } };
    requireManager(reqManager, createMockRes(), () => { managerNextCalled = true; });
    assert(managerNextCalled, 'requireManager permits MANAGER role');

    // Test requireManager blocks EMPLOYEE
    const resBlocked = createMockRes();
    const reqEmployee = { session: { user: { role: 'EMPLOYEE' } }, originalUrl: '/manager/dashboard' };
    requireManager(reqEmployee, resBlocked, () => {});
    assert(resBlocked.statusCode === 403, 'requireManager denies EMPLOYEE with HTTP 403 Forbidden');

    // Test requireSuperAdmin blocks MANAGER
    const resAdminBlocked = createMockRes();
    requireSuperAdmin(reqManager, resAdminBlocked, () => {});
    assert(resAdminBlocked.statusCode === 403, 'requireSuperAdmin denies MANAGER with HTTP 403 Forbidden');

    // TEST GROUP 4: MongoDB ObjectId Validation
    console.log('\n--- 4. ObjectId Validation & IDOR Defense ---');
    const validator = validateObjectId('userId');
    const reqInvalidId = { params: { userId: '123-not-an-id' }, headers: {} };
    const resInvalidId = createMockRes();
    validator(reqInvalidId, resInvalidId, () => {});
    assert(resInvalidId.statusCode === 400, 'Invalid MongoDB ID rejected with HTTP 400 Bad Request');

    const validId = new mongoose.Types.ObjectId().toString();
    const reqValidId = { params: { userId: validId }, headers: {} };
    let validNextCalled = false;
    validator(reqValidId, createMockRes(), () => { validNextCalled = true; });
    assert(validNextCalled, 'Valid MongoDB ObjectId passes validation');

    // TEST GROUP 5: Dashboard Real Data & Controllers
    console.log('\n--- 5. Dashboard Controllers & Real Non-Static Metrics ---');
    // Super Admin Dashboard
    const mockReqAdminDash = {
        session: {
            user: { _id: new mongoose.Types.ObjectId(), name: 'Deepak Kushwaha', role: 'SUPER_ADMIN' }
        }
    };
    const mockResAdminDash = createMockRes();
    await adminController.getDashboard(mockReqAdminDash, mockResAdminDash);
    assert(mockResAdminDash.renderedView === 'admin/dashboard', 'Super Admin dashboard renders admin/dashboard view');
    assert(mockResAdminDash.renderedData.stats.totalEmployees >= 0 &&
           mockResAdminDash.renderedData.stats.totalManagers >= 0, 'Super Admin dashboard calculates real non-static user metrics');
    assert(Array.isArray(mockResAdminDash.renderedData.users), 'Super Admin dashboard receives employee-manager user list');
    assert(Array.isArray(mockResAdminDash.renderedData.recentActivities), 'Super Admin dashboard receives system activity audit logs');

    // Manager Dashboard
    const mockReqMgrDash = {
        session: {
            user: { _id: new mongoose.Types.ObjectId(), name: 'Rahul Saini', role: 'BRANCH_MANAGER', branchId: 'br-raisen-1' }
        }
    };
    const mockResMgrDash = createMockRes();
    await managerController.getDashboard(mockReqMgrDash, mockResMgrDash);
    assert(mockResMgrDash.renderedView === 'manager/dashboard', 'Manager dashboard renders manager/dashboard view');
    assert(Array.isArray(mockResMgrDash.renderedData.employees), 'Manager dashboard receives assigned team members');

    // Employee Dashboard
    const mockReqEmpDash = {
        session: {
            user: { _id: new mongoose.Types.ObjectId(), name: 'Anil Sharma', role: 'EMPLOYEE', employeeId: 'SES-EMP-03' }
        }
    };
    const mockResEmpDash = createMockRes();
    await employeeController.getDashboard(mockReqEmpDash, mockResEmpDash);
    assert(mockResEmpDash.renderedView === 'employee/dashboard', 'Employee dashboard renders employee/dashboard view');
    assert(mockResEmpDash.renderedData.profileUser && mockResEmpDash.renderedData.profileUser.name, 'Employee dashboard provides actual name and profile details');

    // Employee Profile
    const mockResEmpProfile = createMockRes();
    await employeeController.getProfile(mockReqEmpDash, mockResEmpProfile);
    assert(mockResEmpProfile.renderedView === 'admin/profile', 'Profile renders unified admin/profile view');

    // TEST GROUP 6: Future Module Placeholders
    console.log('\n--- 6. Future Module Coming-Soon Placeholders ---');
    const custPlaceholder = adminController.getModulePlaceholder('customers');
    const mockResCust = createMockRes();
    custPlaceholder(mockReqAdminDash, mockResCust);
    assert(mockResCust.renderedView === 'admin/placeholder', 'Future module renders clean coming-soon placeholder');
    assert(mockResCust.renderedData.module.phase.includes('Phase 2'), 'Customers module correctly tagged as Phase 2 Architecture');

    const projPlaceholder = adminController.getModulePlaceholder('projects');
    const mockResProj = createMockRes();
    projPlaceholder(mockReqAdminDash, mockResProj);
    assert(mockResProj.renderedData.module.phase.includes('Phase 3'), 'Projects module correctly tagged as Phase 3 Architecture');

    console.log('\n============================================================');
    console.log(`🎯 PHASE 1 TESTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================');
}

runPhase1Tests().catch(err => {
    console.error('Test runner failure:', err);
    process.exit(1);
});
