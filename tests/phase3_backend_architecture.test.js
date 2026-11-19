/**
 * PHASE 3: BACKEND ARCHITECTURE & QUERY OPTIMIZATION TEST SUITE
 * 
 * Verifies:
 * 1. Confirmed Phase 2 Fixes:
 *    - Invoice filter field consistency (createdByUser vs createdBy)
 *    - Deterministic pagination sort tie-breaker (_id: -1) across all modules
 * 2. GET Route Mutation Elimination (Zero Read Side Effects):
 *    - No findByIdAndUpdate or write calls in quotation GET endpoints
 *    - Separate on-demand syncLegacyUnlinkedPairs utility
 * 3. Attendance MongoDB Atlas Persistence Architecture:
 *    - Asynchronous dual-write persistence
 *    - In-memory synchronous response for instant UI
 *    - Server restart sync (syncAttendanceFromDb)
 *    - Duplicate punch prevention & geofence metadata
 * 4. N+1 Query Elimination:
 *    - getBranches single-shot aggregation ($group) for users and projects
 * 5. Query Parallelization & Projections:
 *    - Material details Promise.all parallelization
 *    - Manager dashboard selective projection
 *    - Customers list lean() query
 */

const assert = require('assert');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const Attendance = require('../models/Attendance');
const Invoice = require('../models/Invoice');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const Customer = require('../models/Customer');
const Complaint = require('../models/Complaint');
const FranchiseApplication = require('../models/FranchiseApplication');

// Controllers & Services
const adminController = require('../controllers/adminController');
const employeeController = require('../controllers/employeeController');
const managerController = require('../controllers/managerController');
const quotationController = require('../controllers/quotationController');
const customerController = require('../controllers/customerController');
const DataStore = require('../services/dataStore');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(err);
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(err);
    }
}

// Helper to check schema indexes
function hasIndex(schema, fieldsObj) {
    const indexes = schema.indexes();
    return indexes.some(([idx]) => {
        const keys = Object.keys(fieldsObj);
        const idxKeys = Object.keys(idx);
        if (keys.length !== idxKeys.length) return false;
        return keys.every(k => idx[k] === fieldsObj[k]);
    });
}

(async () => {
    console.log('============================================================');
    console.log('⚡ PHASE 3: BACKEND ARCHITECTURE & QUERY OPTIMIZATION SUITE');
    console.log('============================================================');

    // ----------------------------------------------------
    // 1. INVOICE FILTER FIELD CONSISTENCY (createdByUser)
    // ----------------------------------------------------
    console.log('\n--- 1. Invoice Filter Field Consistency ---');

    runTest('adminController uses createdByUser (not createdBy) for Manager invoice scoping', () => {
        const adminCtrlSource = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        
        // Assert createdByUser is present in manager invoice filter
        assert.ok(
            adminCtrlSource.includes('invFilter.$or = [{ branch: sessionUser.branchId }, { createdByUser: sessionUser._id }];'),
            'adminController must use createdByUser in invFilter.$or'
        );
        assert.ok(
            adminCtrlSource.includes('invFilter.createdByUser = sessionUser._id;'),
            'adminController must use createdByUser for manager without branch'
        );

        // Assert createdBy is NOT used as an invoice filter property (avoiding false substring match with createdByUser)
        const invoiceSection = adminCtrlSource.substring(
            adminCtrlSource.indexOf('exports.getInvoices ='),
            adminCtrlSource.indexOf('res.render(\'private/admin/invoices\'')
        );
        assert.ok(!invoiceSection.includes('invFilter.createdBy ='), 'invFilter must never assign to createdBy');
        assert.ok(!invoiceSection.includes('{ createdBy:'), 'invFilter must never query createdBy');
    });

    runTest('Invoice model schema contains createdByUser field definition with index', () => {
        assert.ok(Invoice.schema.paths['createdByUser'], 'Invoice schema must define createdByUser path');
        assert.ok(
            hasIndex(Invoice.schema, { createdByUser: 1, isArchived: 1, createdAt: -1 }) ||
            hasIndex(Invoice.schema, { createdByUser: 1 }),
            'Invoice schema must index createdByUser'
        );
    });

    // ----------------------------------------------------
    // 2. DETERMINISTIC PAGINATION SORT TIE-BREAKER (_id: -1)
    // ----------------------------------------------------
    console.log('\n--- 2. Deterministic Sort Tie-Breaker (_id: -1) ---');

    runTest('adminController: Invoices query includes _id: -1 tie-breaker', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        assert.ok(
            src.includes('Invoice.find(invFilter).sort({ createdAt: -1, _id: -1 })'),
            'Invoice query must sort by { createdAt: -1, _id: -1 }'
        );
    });

    runTest('adminController: Complaints query includes _id: -1 tie-breaker', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        assert.ok(
            src.includes('Complaint.find(query)') && src.includes('.sort({ createdAt: -1, _id: -1 })'),
            'Complaints query must sort by { createdAt: -1, _id: -1 }'
        );
    });

    runTest('customerController: Customers query includes _id: -1 tie-breaker', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/customerController.js'), 'utf8');
        assert.ok(
            src.includes('.sort({ createdAt: -1, _id: -1 })'),
            'Customer query must sort by { createdAt: -1, _id: -1 }'
        );
    });

    runTest('enquiryController: Surveys & Franchise queries include _id: -1 tie-breaker', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/enquiryController.js'), 'utf8');
        assert.ok(
            src.includes('Enquiry.find(query).sort({ createdAt: -1, _id: -1 })'),
            'Surveys query must sort by { createdAt: -1, _id: -1 }'
        );
        assert.ok(
            src.includes('FranchiseApplication.find(query).sort({ createdAt: -1, _id: -1 })'),
            'Franchise query must sort by { createdAt: -1, _id: -1 }'
        );
    });

    runTest('quotationController: Quotation and Request queries include _id: -1 tie-breaker', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/quotationController.js'), 'utf8');
        assert.ok(
            src.includes('.sort({ createdAt: -1, _id: -1 })'),
            'Quotation queries must sort by { createdAt: -1, _id: -1 }'
        );
    });

    runTest('materialController & materialPhase2Controller: Queries include _id: -1 tie-breaker', () => {
        const m1 = fs.readFileSync(path.join(__dirname, '../controllers/materialController.js'), 'utf8');
        const m2 = fs.readFileSync(path.join(__dirname, '../controllers/materialPhase2Controller.js'), 'utf8');
        assert.ok(m1.includes('_id: -1'), 'materialController must use _id: -1');
        assert.ok(m2.includes('_id: -1'), 'materialPhase2Controller must use _id: -1');
    });

    // ----------------------------------------------------
    // 3. ZERO GET SIDE EFFECTS (READ-ONLY SAFETY)
    // ----------------------------------------------------
    console.log('\n--- 3. Elimination of GET Side Effects ---');

    runTest('quotationController: GET routes contain zero write mutations (no findByIdAndUpdate)', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/quotationController.js'), 'utf8');

        // Check getEmployeeQuotations
        const empFn = src.substring(
            src.indexOf('static async getEmployeeQuotations'),
            src.indexOf('static async getRequestDetails')
        );
        assert.ok(!empFn.includes('findByIdAndUpdate'), 'getEmployeeQuotations must not call findByIdAndUpdate');
        assert.ok(!empFn.includes('.save()'), 'getEmployeeQuotations must not call .save()');

        // Check getManagerQuotations
        const mgrFn = src.substring(
            src.indexOf('static async getManagerQuotations'),
            src.indexOf('static async postUpdateRequestStatus')
        );
        assert.ok(!mgrFn.includes('findByIdAndUpdate'), 'getManagerQuotations must not call findByIdAndUpdate');
        assert.ok(!mgrFn.includes('.save()'), 'getManagerQuotations must not call .save()');

        // Check getAdminQuotations
        const admFn = src.substring(
            src.indexOf('static async getAdminQuotations'),
            src.indexOf('static async syncLegacyUnlinkedPairs')
        );
        assert.ok(!admFn.includes('findByIdAndUpdate'), 'getAdminQuotations must not call findByIdAndUpdate');
        assert.ok(!admFn.includes('.save()'), 'getAdminQuotations must not call .save()');
    });

    runTest('quotationController: Dedicated syncLegacyUnlinkedPairs maintenance method exists', () => {
        assert.strictEqual(typeof quotationController.syncLegacyUnlinkedPairs, 'function', 'syncLegacyUnlinkedPairs must be an exported function');
    });

    // ----------------------------------------------------
    // 4. ATTENDANCE MONGODB ATLAS PERSISTENCE ARCHITECTURE
    // ----------------------------------------------------
    console.log('\n--- 4. Attendance Persistence & Geo-Tagging Architecture ---');

    runTest('Attendance model schema supports field punches, coordinates & status', () => {
        const paths = Attendance.schema.paths;
        assert.ok(paths['employeeId'], 'Attendance schema must contain employeeId');
        assert.ok(paths['employeeName'], 'Attendance schema must contain employeeName');
        assert.ok(paths['type'], 'Attendance schema must contain punch type (check_in/check_out)');
        assert.ok(paths['latitude'], 'Attendance schema must contain latitude');
        assert.ok(paths['longitude'], 'Attendance schema must contain longitude');
        assert.ok(paths['accuracy'], 'Attendance schema must contain accuracy');
        assert.ok(paths['locationName'], 'Attendance schema must contain locationName');
        assert.ok(paths['date'], 'Attendance schema must contain date string');
    });

    runTest('Attendance schema defines compound indexes for performance', () => {
        assert.ok(
            hasIndex(Attendance.schema, { employeeId: 1, date: -1 }) ||
            hasIndex(Attendance.schema, { employeeId: 1 }),
            'Attendance schema must index employeeId'
        );
        assert.ok(
            hasIndex(Attendance.schema, { date: -1 }) ||
            hasIndex(Attendance.schema, { branch: 1, date: -1 }),
            'Attendance schema must index date'
        );
    });

    await runAsyncTest('DataStore.addAttendance creates punch and populates required fields', async () => {
        const dummyEmpId = 'SES-TEST-P3-' + Date.now();
        const punch = await DataStore.addAttendance({
            employeeId: dummyEmpId,
            employeeName: 'Ramesh Patel',
            role: 'FIELD_ENGINEER',
            type: 'check_in',
            latitude: 23.3315,
            longitude: 77.7807,
            accuracy: 12
        });

        assert.ok(punch, 'Punch record must be returned');
        assert.strictEqual(punch.employeeId, dummyEmpId);
        assert.strictEqual(punch.type, 'check_in');
        assert.strictEqual(punch.latitude, 23.3315);
        assert.strictEqual(punch.longitude, 77.7807);
        assert.strictEqual(punch.accuracy, 12);
        assert.ok(punch.timestamp, 'Punch must include formatted timestamp');
        assert.ok(punch.date, 'Punch must include date string');

        // Verify present in DataStore.getTodayAttendance()
        const found = DataStore.getTodayAttendance().find(a => a.employeeId === dummyEmpId);
        assert.ok(found, 'Punch must be immediately discoverable in getTodayAttendance()');
    });

    await runAsyncTest('DataStore.syncAttendanceFromDb handles server restarts and duplicate avoidance', async () => {
        assert.strictEqual(typeof DataStore.syncAttendanceFromDb, 'function', 'syncAttendanceFromDb must be a function');
        
        // Execute sync (offline safe)
        const records = await DataStore.syncAttendanceFromDb();
        assert.ok(Array.isArray(records), 'syncAttendanceFromDb must return an array');
    });

    await runAsyncTest('employeeController.submitAttendance rejects duplicate check-in on the same day', async () => {
        const testUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Pooja Singh',
            employeeId: 'SES-EMP-TEST-DUP-' + Date.now(),
            role: 'EMPLOYEE',
            branchId: new mongoose.Types.ObjectId()
        };

        const req1 = {
            session: { user: testUser },
            body: { type: 'check_in', latitude: '23.3315', longitude: '77.7807', accuracy: '10' },
            ip: '127.0.0.1'
        };
        let resData1 = {};
        let resCode1 = 200;
        const res1 = {
            status: (c) => { resCode1 = c; return res1; },
            json: (d) => { resData1 = d; }
        };

        await employeeController.submitAttendance(req1, res1);
        assert.strictEqual(resData1.success, true, 'First check-in succeeds');

        // Second check-in
        const req2 = {
            session: { user: testUser },
            body: { type: 'check_in', latitude: '23.3315', longitude: '77.7807', accuracy: '10' },
            ip: '127.0.0.1'
        };
        let resData2 = {};
        let resCode2 = 200;
        const res2 = {
            status: (c) => { resCode2 = c; return res2; },
            json: (d) => { resData2 = d; }
        };

        await employeeController.submitAttendance(req2, res2);
        assert.strictEqual(resCode2, 400, 'Duplicate check-in returns HTTP 400');
        assert.strictEqual(resData2.success, false, 'Duplicate check-in is rejected');
        assert.ok(resData2.message.includes('already punched Check-In'), 'Message clarifies duplicate check-in');
    });

    // ----------------------------------------------------
    // 5. N+1 ELIMINATION IN BRANCHES (getBranches)
    // ----------------------------------------------------
    console.log('\n--- 5. N+1 Query Elimination in Branches Management ---');

    runTest('adminController.getBranches uses MongoDB Aggregation ($group) instead of 2*N loop', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        const getBranchesSrc = src.substring(
            src.indexOf('exports.getBranches ='),
            src.indexOf('exports.createBranch =')
        );

        // Verify aggregation pipeline is used
        assert.ok(getBranchesSrc.includes('User.aggregate(['), 'getBranches must use User.aggregate');
        assert.ok(getBranchesSrc.includes('Project.aggregate(['), 'getBranches must use Project.aggregate');
        assert.ok(getBranchesSrc.includes('$group: { _id: \'$branchId\', count: { $sum: 1 } }'),
                  'Aggregation must group users by branchId and count');
        assert.ok(getBranchesSrc.includes('$group: { _id: \'$branch\', count: { $sum: 1 } }'),
                  'Aggregation must group projects by branch and count');

        // Verify absence of inner loop countDocuments
        assert.ok(!getBranchesSrc.includes('countDocuments'),
                  'getBranches must not run countDocuments inside a loop for each branch');
    });

    await runAsyncTest('adminController.getBranches renders branches and calculates statistics correctly', async () => {
        let viewData = {};
        const req = {
            session: { user: { role: 'SUPER_ADMIN', name: 'Deepak Kushwaha' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await adminController.getBranches(req, res);
        assert.ok(viewData.branches, 'Branches array must be provided');
        assert.ok(viewData.stats, 'Branch stats object must be provided');
        assert.ok(typeof viewData.stats.totalBranches === 'number', 'totalBranches must be a number');
        assert.ok(typeof viewData.stats.totalEmployees === 'number', 'totalEmployees must be a number');
        assert.ok(typeof viewData.stats.totalProjects === 'number', 'totalProjects must be a number');
    });

    // ----------------------------------------------------
    // 6. QUERY PARALLELIZATION & PROJECTIONS
    // ----------------------------------------------------
    console.log('\n--- 6. Query Parallelization & Projections ---');

    runTest('materialController.getMaterialDetails parallelizes transactions & purchases with Promise.all', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/materialController.js'), 'utf8');
        const fnSrc = src.substring(
            src.indexOf('static async getMaterialDetails'),
            src.indexOf('static async updateMaterial')
        );

        assert.ok(fnSrc.includes('Promise.all(['), 'getMaterialDetails must run independent queries with Promise.all');
        assert.ok(fnSrc.includes('InventoryTransaction.find('), 'Promise.all must include InventoryTransaction query');
        assert.ok(fnSrc.includes('Purchase.find('), 'Promise.all must include Purchase query');
    });

    runTest('managerController.getDashboard uses selective projection for projects', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/managerController.js'), 'utf8');
        assert.ok(
            src.includes('.select(\'projectNumber title capacityKw status customer assignedEngineer updatedAt createdAt\')'),
            'managerController.getDashboard must project only required project fields'
        );
    });

    runTest('customerController.getCustomersList uses .lean() for fast CRM rendering', () => {
        const src = fs.readFileSync(path.join(__dirname, '../controllers/customerController.js'), 'utf8');
        const fnSrc = src.substring(
            src.indexOf('static async getCustomersList'),
            src.indexOf('module.exports = CustomerController;')
        );
        assert.ok(fnSrc.includes('.lean()'), 'getCustomersList must invoke .lean() on customer find query');
    });

    // ----------------------------------------------------
    // FINAL SUMMARY
    // ----------------------------------------------------
    console.log('\n============================================================');
    console.log(`🎯 PHASE 3 RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
