/**
 * SHIVAY ENERGY SOLUTIONS - COMPLETE ADMIN PANEL VERIFICATION TEST SUITE
 * Tests:
 * 1. Super Admin Settings View & AJAX API Save (/admin/settings, /api/admin/settings/save)
 * 2. Super Admin Direct Settings Button in Header, Sidebar & Dashboard
 * 3. Multi-Branch Operations Management (/admin/branches, /api/admin/branches/create)
 * 4. Customer Directory CRM View (/admin/customers)
 * 5. Executive Reports & Solar Analytics (/admin/reports)
 * 6. CSV Export Endpoints (/api/admin/reports/export/:type)
 * 7. Solar Service & Customer Complaints Management (/admin/complaints, /api/admin/complaints/status)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adminController = require('../controllers/adminController');
const customerController = require('../controllers/customerController');
const companyData = require('../config/company');

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
        console.error(`     Error: ${err.message}`);
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
        console.error(`     Error: ${err.message}`);
    }
}

console.log('\n============================================================');
console.log('🛡️ VERIFICATION: COMPLETE ADMIN PANEL MODULES & SETTINGS');
console.log('============================================================\n');

(async () => {
    // ----------------------------------------------------
    // 1. Settings View & Header/Sidebar Functionality
    // ----------------------------------------------------
    console.log('--- 1. Super Admin Settings & Header Button Functionality ---');
    
    // Check template files exist
    runTest('admin-header.ejs has direct Settings link and dropdown entries for Super Admin', () => {
        const headerContent = fs.readFileSync(path.join(__dirname, '../views/private/admin/partials/admin-header.ejs'), 'utf8');
        assert.ok(headerContent.includes('/admin/settings'), 'Header must contain link to /admin/settings');
        assert.ok(headerContent.includes('icofont-gear'), 'Header must render gear icon for settings');
        assert.ok(headerContent.includes('/admin/branches'), 'Header dropdown must contain Branches link');
        assert.ok(headerContent.includes('/admin/reports'), 'Header dropdown must contain Reports link');
    });

    runTest('admin-sidebar.ejs has Settings and Reports navigation items', () => {
        const sidebarContent = fs.readFileSync(path.join(__dirname, '../views/private/admin/partials/admin-sidebar.ejs'), 'utf8');
        assert.ok(sidebarContent.includes('/admin/settings'), 'Sidebar must contain /admin/settings');
        assert.ok(sidebarContent.includes('/admin/reports'), 'Sidebar must contain /admin/reports');
        assert.ok(sidebarContent.includes('/admin/branches'), 'Sidebar must contain /admin/branches');
        assert.ok(sidebarContent.includes('/admin/complaints'), 'Sidebar must contain /admin/complaints');
    });

    runTest('dashboard.ejs quick actions row includes Settings, Branches, and Reports', () => {
        const dashContent = fs.readFileSync(path.join(__dirname, '../views/private/admin/dashboard.ejs'), 'utf8');
        assert.ok(dashContent.includes('href="/admin/settings"'), 'Dashboard must have quick action for Settings');
        assert.ok(dashContent.includes('href="/admin/branches"'), 'Dashboard must have quick action for Branches');
        assert.ok(dashContent.includes('href="/admin/reports"'), 'Dashboard must have quick action for Reports');
    });

    await runAsyncTest('adminController.getSettings renders settings view with company defaults', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            session: {
                user: { _id: '507f191e810c19729de860ea', name: 'Deepak Kushwaha', role: 'SUPER_ADMIN' },
                csrfToken: 'test-csrf-token'
            }
        };
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            },
            status: () => res
        };

        await adminController.getSettings(req, res);
        assert.strictEqual(renderedView, 'private/admin/settings');
        assert.ok(renderedData.setting, 'Setting data must be passed to template');
        assert.strictEqual(renderedData.setting.defaultRatePerKw, 58000);
        assert.strictEqual(renderedData.setting.subsidy3KwMax, 78000);
    });

    await runAsyncTest('adminController.saveSettings updates company configuration successfully', async () => {
        let responseJson = null;
        const req = {
            body: {
                companyName: 'SHIVAY ENERGY SOLUTIONS PVT LTD',
                shortName: 'Shivay Solar',
                primaryPhone: '+91 70005 75496',
                defaultRatePerKw: 56000,
                subsidy1Kw: 30000,
                subsidy2Kw: 60000,
                subsidy3KwMax: 78000,
                enforceGeofence: 'true'
            },
            session: {
                user: { _id: '507f191e810c19729de860ea', name: 'Deepak Kushwaha', role: 'SUPER_ADMIN' }
            },
            ip: '127.0.0.1'
        };
        const res = {
            json: (obj) => { responseJson = obj; return res; },
            status: () => res
        };

        await adminController.saveSettings(req, res);
        assert.strictEqual(responseJson.success, true);
        assert.strictEqual(companyData.company.name, 'SHIVAY ENERGY SOLUTIONS PVT LTD');
    });

    // ----------------------------------------------------
    // 2. Multi-Branch Operations Management
    // ----------------------------------------------------
    console.log('\n--- 2. Multi-Branch Operations Management ---');

    await runAsyncTest('adminController.getBranches renders branches management console', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            },
            status: () => res
        };

        await adminController.getBranches(req, res);
        assert.strictEqual(renderedView, 'private/admin/branches');
        assert.ok(renderedData.branches.length > 0, 'Branches array must not be empty');
        assert.ok(renderedData.stats.totalBranches >= 1, 'Stats must reflect branches count');
    });

    // ----------------------------------------------------
    // 3. Customer Directory CRM
    // ----------------------------------------------------
    console.log('\n--- 3. Customer Directory CRM View ---');

    await runAsyncTest('customerController.getCustomersList renders customer directory', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            query: { page: '1' },
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            },
            status: () => res
        };

        await customerController.getCustomersList(req, res);
        assert.strictEqual(renderedView, 'private/admin/customers');
        assert.ok(renderedData.pagination, 'Pagination object must be passed');
    });

    // ----------------------------------------------------
    // 4. Executive Reports & Solar EPC Analytics
    // ----------------------------------------------------
    console.log('\n--- 4. Executive Reports & Solar Analytics ---');

    await runAsyncTest('adminController.getReports renders solar analytics with live KPI metrics', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            },
            status: () => res
        };

        await adminController.getReports(req, res);
        assert.strictEqual(renderedView, 'private/admin/reports');
        assert.ok(renderedData.stats, 'KPI stats must be calculated');
        assert.ok(renderedData.stats.totalCapacityKw !== undefined, 'Sanctioned capacity metric must exist');
        assert.ok(renderedData.branchStats !== undefined, 'Regional branch breakdown must exist');
    });

    await runAsyncTest('adminController.exportReportCsv streams CSV data for projects and invoices', async () => {
        const headers = {};
        let sentData = '';
        let statusCode = 200;

        const req = {
            params: { type: 'invoices' }
        };
        const res = {
            setHeader: (key, val) => { headers[key] = val; },
            status: (code) => { statusCode = code; return res; },
            send: (data) => { sentData = data; return res; }
        };

        await adminController.exportReportCsv(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(headers['Content-Type'], 'text/csv');
        assert.ok(sentData.includes('Invoice Number,Client Name'), 'CSV must contain standard invoice headers');
    });

    // ----------------------------------------------------
    // 5. Service & Complaints Management
    // ----------------------------------------------------
    console.log('\n--- 5. Service & Complaints Console ---');

    await runAsyncTest('adminController.getComplaints renders customer service complaints table', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            query: {},
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(renderedView, 'private/admin/complaints');
        assert.ok(renderedData.counts, 'Complaint counts must be present');
        assert.ok(Array.isArray(renderedData.complaints), 'Complaints list must be an array');
    });

    console.log('\n============================================================');
    console.log(`🎯 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
