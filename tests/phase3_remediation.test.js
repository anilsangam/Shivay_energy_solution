/**
 * PHASE 3 REMEDIATION TEST SUITE
 * 
 * Verifies all critical fixes from PHASE3_PRODUCTION_READINESS_AUDIT.md:
 * 1. Attendance IST Timezone & Midnight Rollover Handling (00:00 - 05:30 IST)
 * 2. Attendance Database-Level Unique Constraint & Confirmed Persistence
 * 3. Quotation Matching Safety: Exact ID Priority, Claimed ID Tracking, Unambiguous Mobile Fallback
 * 4. Admin Dashboard Query Bounds (.limit(5)) & Database Aggregations
 * 5. Branch Aggregation Error Logging & Failure Differentiation
 */

const assert = require('assert');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Utilities, Models & Controllers
const dateUtils = require('../services/dateUtils');
const Attendance = require('../models/Attendance');
const DataStore = require('../services/dataStore');
const employeeController = require('../controllers/employeeController');
const adminController = require('../controllers/adminController');
const quotationController = require('../controllers/quotationController');

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
function hasIndex(schema, fieldsObj, options = {}) {
    const indexes = schema.indexes();
    return indexes.some(([idx, opts]) => {
        const keys = Object.keys(fieldsObj);
        const idxKeys = Object.keys(idx);
        if (keys.length !== idxKeys.length) return false;
        const keysMatch = keys.every(k => idx[k] === fieldsObj[k]);
        if (!keysMatch) return false;
        if (options.unique !== undefined && opts.unique !== options.unique) return false;
        return true;
    });
}

(async () => {
    console.log('============================================================');
    console.log('🔧 PHASE 3 REMEDIATION: CRITICAL RELIABILITY VERIFICATION');
    console.log('============================================================');

    // ----------------------------------------------------
    // 1. ATTENDANCE IST TIMEZONE & MIDNIGHT ROLLOVER
    // ----------------------------------------------------
    console.log('\n--- 1. Attendance IST Timezone & Midnight Rollover ---');

    runTest('dateUtils.getIstDate calculates DD-MM-YYYY strictly in Asia/Kolkata', () => {
        const now = new Date();
        const istDate = dateUtils.getIstDate(now);
        assert.match(istDate, /^\d{2}-\d{2}-\d{4}$/, 'Date format must be DD-MM-YYYY');
    });

    runTest('Midnight Rollover: 01:30 AM IST (previous day 20:00 UTC) correctly evaluates to the Indian calendar date', () => {
        // UTC time: 2026-11-19 20:00:00 (which is 2026-11-20 01:30:00 AM IST)
        const earlyMorningIst = new Date('2026-11-19T20:00:00.000Z');
        const calculatedDate = dateUtils.getIstDate(earlyMorningIst);
        assert.strictEqual(calculatedDate, '20-11-2026', 'Must calculate next day 20-11-2026 in IST, not 19-11-2026 UTC');
    });

    runTest('Early Morning Sunrise: 05:15 AM IST (previous day 23:45 UTC) correctly evaluates to Indian date', () => {
        // UTC time: 2026-11-19 23:45:00 (which is 2026-11-20 05:15:00 AM IST)
        const sunrisePunch = new Date('2026-11-19T23:45:00.000Z');
        const calculatedDate = dateUtils.getIstDate(sunrisePunch);
        assert.strictEqual(calculatedDate, '20-11-2026', 'Early morning field punch must receive 20-11-2026');
    });

    runTest('dataStore.js and employeeController.js import and use shared dateUtils', () => {
        const dsSrc = fs.readFileSync(path.join(__dirname, '../services/dataStore.js'), 'utf8');
        const empSrc = fs.readFileSync(path.join(__dirname, '../controllers/employeeController.js'), 'utf8');

        assert.ok(dsSrc.includes('dateUtils'), 'dataStore.js must reference dateUtils');
        assert.ok(dsSrc.includes('dateUtils.getIstDate()'), 'dataStore.js must use dateUtils.getIstDate()');
        assert.ok(empSrc.includes('dateUtils'), 'employeeController.js must reference dateUtils');
        assert.ok(empSrc.includes('dateUtils.getIstDate()'), 'employeeController.js must use dateUtils.getIstDate()');
    });

    // ----------------------------------------------------
    // 2. ATTENDANCE DATABASE UNIQUE CONSTRAINT & RELIABILITY
    // ----------------------------------------------------
    console.log('\n--- 2. Attendance Unique Constraint & Persistence ---');

    runTest('models/Attendance.js defines unique compound index on { employeeId: 1, date: 1, type: 1 }', () => {
        assert.ok(
            hasIndex(Attendance.schema, { employeeId: 1, date: 1, type: 1 }, { unique: true }),
            'Attendance schema must have unique index on { employeeId: 1, date: 1, type: 1 }'
        );
    });

    await runAsyncTest('DataStore.addAttendance returns a Promise and awaits confirmed persistence', async () => {
        const dummyEmpId = 'SES-P3-REM-' + Date.now();
        const punchPromise = DataStore.addAttendance({
            employeeId: dummyEmpId,
            employeeName: 'Rajesh Sen',
            role: 'FIELD_ENGINEER',
            type: 'check_in',
            latitude: 23.3315,
            longitude: 77.7807,
            accuracy: 8
        });

        assert.ok(punchPromise instanceof Promise, 'DataStore.addAttendance must return a Promise');
        const punch = await punchPromise;
        assert.strictEqual(punch.employeeId, dummyEmpId);
        assert.strictEqual(punch.type, 'check_in');
        assert.strictEqual(punch.date, dateUtils.getIstDate());
    });

    await runAsyncTest('employeeController.submitAttendance returns HTTP 400 on duplicate key error (code 11000)', async () => {
        // Mock session
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Kavita Verma',
            employeeId: 'SES-EMP-TEST-ERR-' + Date.now(),
            role: 'EMPLOYEE',
            branchId: new mongoose.Types.ObjectId()
        };

        const req = {
            session: { user: mockUser },
            body: { type: 'check_in', latitude: '23.3315', longitude: '77.7807', accuracy: '10' },
            ip: '127.0.0.1'
        };

        // Temporarily stub DataStore.addAttendance to simulate MongoDB E11000 duplicate key error
        const origAdd = DataStore.addAttendance;
        DataStore.addAttendance = async () => {
            const err = new Error('E11000 duplicate key error collection: attendances index: employeeId_1_date_1_type_1 dup key');
            err.code = 11000;
            throw err;
        };

        let statusCode = 200;
        let responseJson = {};
        const res = {
            status: (c) => { statusCode = c; return res; },
            json: (d) => { responseJson = d; }
        };

        try {
            await employeeController.submitAttendance(req, res);
            assert.strictEqual(statusCode, 400, 'Duplicate punch DB error must map to HTTP 400');
            assert.strictEqual(responseJson.success, false);
            assert.ok(responseJson.message.includes('already punched Check-In'), 'Friendly message on duplicate error');
        } finally {
            DataStore.addAttendance = origAdd;
        }
    });

    await runAsyncTest('employeeController.submitAttendance returns HTTP 500 when database persistence fails', async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Sunil Mehra',
            employeeId: 'SES-EMP-TEST-FAIL-' + Date.now(),
            role: 'EMPLOYEE',
            branchId: new mongoose.Types.ObjectId()
        };

        const req = {
            session: { user: mockUser },
            body: { type: 'check_in', latitude: '23.3315', longitude: '77.7807', accuracy: '10' },
            ip: '127.0.0.1'
        };

        const origAdd = DataStore.addAttendance;
        DataStore.addAttendance = async () => {
            throw new Error('MongoNetworkTimeoutError: connection timed out');
        };

        let statusCode = 200;
        let responseJson = {};
        const res = {
            status: (c) => { statusCode = c; return res; },
            json: (d) => { responseJson = d; }
        };

        try {
            await employeeController.submitAttendance(req, res);
            assert.strictEqual(statusCode, 500, 'Database failure must return HTTP 500');
            assert.strictEqual(responseJson.success, false);
            assert.ok(responseJson.message.includes('Database persistence failed'), 'Client must be notified of failure');
        } finally {
            DataStore.addAttendance = origAdd;
        }
    });

    await runAsyncTest('employeeController.submitAttendance rejects Check-Out if Check-In has not occurred', async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'New Person',
            employeeId: 'SES-EMP-TEST-NOCHECKIN-' + Date.now(),
            role: 'EMPLOYEE',
            branchId: new mongoose.Types.ObjectId()
        };

        const req = {
            session: { user: mockUser },
            body: { type: 'check_out', latitude: '23.3315', longitude: '77.7807', accuracy: '10' },
            ip: '127.0.0.1'
        };

        let statusCode = 200;
        let responseJson = {};
        const res = {
            status: (c) => { statusCode = c; return res; },
            json: (d) => { responseJson = d; }
        };

        await employeeController.submitAttendance(req, res);
        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseJson.success, false);
        assert.ok(responseJson.message.includes('Check-In record required before Check-Out can be submitted'));
    });

    // ----------------------------------------------------
    // 3. QUOTATION MATCHING SAFETY & COLLISION PREVENTION
    // ----------------------------------------------------
    console.log('\n--- 3. Quotation Matching Safety & Collision Prevention ---');

    runTest('Quotation linking gives strict priority to exact quotationRequestId over mobile fallback', () => {
        const quotationControllerSource = fs.readFileSync(path.join(__dirname, '../controllers/quotationController.js'), 'utf8');

        assert.ok(quotationControllerSource.includes('function safelyLinkRequestsAndQuotations'), 'quotationController must contain safelyLinkRequestsAndQuotations helper');
        assert.ok(quotationControllerSource.includes('Pass 1: Strict quotationRequestId match'), 'Must execute exact quotationRequestId matching first');
        assert.ok(quotationControllerSource.includes('claimedQuoteIds'), 'Must track claimed quotation IDs to prevent 1-to-many associations');
    });

    runTest('Multiple requests sharing the same mobile number do not cross-link to the same quotation', () => {
        const quotationControllerSource = fs.readFileSync(path.join(__dirname, '../controllers/quotationController.js'), 'utf8');

        // Extract safelyLinkRequestsAndQuotations using eval/reflection for direct unit verification
        const fnDef = quotationControllerSource.substring(
            quotationControllerSource.indexOf('function safelyLinkRequestsAndQuotations'),
            quotationControllerSource.indexOf('class QuotationController')
        );
        const safelyLink = new Function(`${fnDef}; return safelyLinkRequestsAndQuotations;`)();

        const sharedMobile = '+91 9826011223';
        const req1Id = new mongoose.Types.ObjectId();
        const req2Id = new mongoose.Types.ObjectId();

        const quote1Id = new mongoose.Types.ObjectId();
        const quote2Id = new mongoose.Types.ObjectId();

        // Quotation 1 is explicitly for Request 1
        const quote1 = { _id: quote1Id, quotationRequestId: req1Id, customerMobile: sharedMobile };
        // Quotation 2 is unlinked, but for same customer
        const quote2 = { _id: quote2Id, quotationRequestId: null, customerMobile: sharedMobile };

        const requests = [
            { _id: req1Id, customerMobile: sharedMobile, linkedQuotation: null },
            { _id: req2Id, customerMobile: sharedMobile, linkedQuotation: null }
        ];
        const quotes = [quote1, quote2];

        safelyLink(requests, quotes);

        // Verification:
        // Request 1 must link to Quote 1 (exact match)
        assert.strictEqual(requests[0].linkedQuotation._id, quote1Id, 'Request 1 must match Quote 1');
        // Request 2 must link to Quote 2 (unambiguous remaining candidate)
        assert.strictEqual(requests[1].linkedQuotation._id, quote2Id, 'Request 2 must match Quote 2');
        // Both requests must NOT share the same quotation
        assert.notStrictEqual(requests[0].linkedQuotation._id, requests[1].linkedQuotation._id, 'Quotation 1 must not be duplicated to Request 2');
    });

    runTest('Ambiguous mobile fallback with multiple unlinked quotes rejects speculative guessing', () => {
        const quotationControllerSource = fs.readFileSync(path.join(__dirname, '../controllers/quotationController.js'), 'utf8');
        const fnDef = quotationControllerSource.substring(
            quotationControllerSource.indexOf('function safelyLinkRequestsAndQuotations'),
            quotationControllerSource.indexOf('class QuotationController')
        );
        const safelyLink = new Function(`${fnDef}; return safelyLinkRequestsAndQuotations;`)();

        const sharedMobile = '+91 9999988888';
        const reqA = { _id: new mongoose.Types.ObjectId(), customerMobile: sharedMobile, linkedQuotation: null };
        const reqB = { _id: new mongoose.Types.ObjectId(), customerMobile: sharedMobile, linkedQuotation: null };

        // 1 single quote exists for this mobile number, but 2 unlinked requests exist
        const singleQuote = { _id: new mongoose.Types.ObjectId(), quotationRequestId: null, customerMobile: sharedMobile };

        const requests = [reqA, reqB];
        const quotes = [singleQuote];

        safelyLink(requests, quotes);

        // Neither request should be matched because it is ambiguous (2 unlinked requests vs 1 quote)
        assert.strictEqual(reqA.linkedQuotation, null, 'Request A must remain unlinked when ambiguous');
        assert.strictEqual(reqB.linkedQuotation, null, 'Request B must remain unlinked when ambiguous');
    });

    // ----------------------------------------------------
    // 4. ADMIN DASHBOARD QUERY OPTIMIZATION
    // ----------------------------------------------------
    console.log('\n--- 4. Admin Dashboard Query Bounds & Aggregation ---');

    runTest('adminController.getDashboard uses .limit(5) on Project.find and Quotation.find', () => {
        const adminCtrlSource = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        const dashboardFn = adminCtrlSource.substring(
            adminCtrlSource.indexOf('exports.getDashboard ='),
            adminCtrlSource.indexOf('exports.getQuotations =')
        );

        assert.ok(dashboardFn.includes('.limit(5)'), 'getDashboard must limit recent projects and quotations');
        assert.ok(dashboardFn.includes('Project.aggregate(['), 'getDashboard must use Project.aggregate for counters');
        assert.ok(dashboardFn.includes('Quotation.aggregate(['), 'getDashboard must use Quotation.aggregate for counters');
        assert.ok(!dashboardFn.includes('allProjs.slice(0, 5)'), 'Must not download full collection to slice top 5');
        assert.ok(!dashboardFn.includes('allQuotes.slice(0, 5)'), 'Must not download full collection to slice top 5');
    });

    // ----------------------------------------------------
    // 5. BRANCH AGGREGATION ERROR LOGGING
    // ----------------------------------------------------
    console.log('\n--- 5. Branch Aggregation Error Logging ---');

    runTest('adminController.getBranches logs aggregation failures with context and handles degradation', () => {
        const adminCtrlSource = fs.readFileSync(path.join(__dirname, '../controllers/adminController.js'), 'utf8');
        const getBranchesSrc = adminCtrlSource.substring(
            adminCtrlSource.indexOf('exports.getBranches ='),
            adminCtrlSource.indexOf('exports.createBranch =')
        );

        assert.ok(getBranchesSrc.includes('console.error(\'[Branch Operations] User count aggregation error:\''), 'Must log User aggregation error');
        assert.ok(getBranchesSrc.includes('console.error(\'[Branch Operations] Project count aggregation error:\''), 'Must log Project aggregation error');
        assert.ok(getBranchesSrc.includes('empAggregationFailed'), 'Must track degradation status rather than silent zeroing');
    });

    // ----------------------------------------------------
    // FINAL SUMMARY
    // ----------------------------------------------------
    console.log('\n============================================================');
    console.log(`🎯 REMEDIATION SUITE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
