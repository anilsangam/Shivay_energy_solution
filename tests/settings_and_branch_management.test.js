/**
 * SHIVAY ENERGY SOLUTIONS - SETTINGS & BRANCH MANAGEMENT TEST SUITE
 * Verifies:
 * 1. Functional Super Admin Settings Page & API Configuration
 * 2. Multi-Branch Operations Management (Create, Update, Status Toggle)
 * 3. Customer Directory (CRM) Activation
 */
const mongoose = require('mongoose');
const adminController = require('../controllers/adminController');
const customerController = require('../controllers/customerController');
const Branch = require('../models/Branch');
const Setting = require('../models/Setting');
const companyData = require('../config/company');

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
        }
    };
}

async function runSettingsAndBranchSuite() {
    console.log('\n============================================================');
    console.log('⚙️ VERIFICATION: SYSTEM SETTINGS & BRANCH MANAGEMENT SUITE');
    console.log('============================================================\n');

    const superAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Deepak Kushwaha',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
    };

    // -------------------------------------------------------------
    // 1. FUNCTIONAL SUPER ADMIN SETTINGS
    // -------------------------------------------------------------
    console.log('--- 1. Super Admin Settings View & Persistence ---');

    // Test 1: GET /admin/settings renders functional settings page
    {
        const req = { session: { user: superAdmin, csrfToken: 'test-csrf' } };
        const res = createMockRes();
        await adminController.getSettings(req, res);

        assert(res.renderedView === 'private/admin/settings',
            'GET /admin/settings renders functional settings page (No placeholder)');
        assert(res.renderedData && res.renderedData.setting,
            'Settings data object populated with company defaults');
        assert(res.renderedData.setting.companyName === 'SHIVAY ENERGY SOLUTIONS',
            'Company legal entity name loaded correctly');
        assert(res.renderedData.setting.subsidy3KwMax === 78000,
            'PM Surya Ghar 3kW max subsidy loaded correctly (₹78,000)');
    }

    // Test 2: POST /api/admin/settings/save updates settings and synchronizes configuration
    {
        const updatePayload = {
            companyName: 'SHIVAY ENERGY SOLUTIONS PVT LTD',
            shortName: 'Shivay Solar',
            gstin: '23AXXXX9999Z1Z5',
            officialEmail: 'contact@shivayenergy.com',
            primaryPhone: '+91 70005 75496',
            defaultRatePerKw: 59000,
            subsidy1Kw: 30000,
            subsidy2Kw: 60000,
            subsidy3KwMax: 78000,
            defaultGeofenceRadiusMeters: 600,
            enforceGeofence: 'true'
        };

        const req = {
            body: updatePayload,
            session: { user: superAdmin },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.saveSettings(req, res);

        assert(res.statusCode === 200 && res.jsonData.success === true,
            'POST /api/admin/settings/save succeeds with HTTP 200');
        assert(companyData.company.name === 'SHIVAY ENERGY SOLUTIONS PVT LTD',
            'In-memory company name synchronized with saved settings');
        assert(companyData.company.gstin === '23AXXXX9999Z1Z5',
            'In-memory GSTIN synchronized with saved settings');
    }

    // -------------------------------------------------------------
    // 2. MULTI-BRANCH OPERATIONS MANAGEMENT
    // -------------------------------------------------------------
    console.log('\n--- 2. Multi-Branch Operations & Regional Offices ---');

    // Test 3: GET /admin/branches renders branch management dashboard
    {
        const req = { session: { user: superAdmin, csrfToken: 'test-csrf' } };
        const res = createMockRes();
        await adminController.getBranches(req, res);

        assert(res.renderedView === 'private/admin/branches',
            'GET /admin/branches renders dedicated branches dashboard');
        assert(res.renderedData && Array.isArray(res.renderedData.branches),
            'Branches list populated');
        assert(res.renderedData.stats && res.renderedData.stats.totalBranches >= 1,
            'Branch statistics (total, active, employees, projects) computed');
    }

    // Test 4: POST /api/admin/branches/create creates new regional office
    let createdBranchId = null;
    {
        const req = {
            body: {
                name: 'Bhopal Regional Hub',
                code: 'MP-BPL-99',
                contactNumber: '+91 755 2400000',
                email: 'bhopal@shivayenergy.com',
                address: 'Plot 45, MP Nagar Zone-II',
                city: 'Bhopal',
                district: 'Bhopal',
                state: 'Madhya Pradesh',
                latitude: 23.2325,
                longitude: 77.4312,
                geofenceRadiusMeters: 600
            },
            session: { user: superAdmin },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createBranch(req, res);

        assert(res.statusCode === 200 && res.jsonData.success === true,
            'POST /api/admin/branches/create successfully adds new branch');
        assert(res.jsonData.branch && res.jsonData.branch.code === 'MP-BPL-99',
            'Branch code correctly registered');
        createdBranchId = res.jsonData.branch._id;
    }

    // Test 5: Creating branch with missing required fields is rejected
    {
        const req = {
            body: { name: '', contactNumber: '' },
            session: { user: superAdmin },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.createBranch(req, res);

        assert(res.statusCode === 400 && res.jsonData.success === false,
            'Branch creation without name/contact rejected (HTTP 400)');
    }

    // Test 6: POST /api/admin/branches/update updates branch details
    {
        const updateBranchId = createdBranchId || new mongoose.Types.ObjectId();
        const req = {
            body: {
                branchId: updateBranchId.toString(),
                name: 'Bhopal Central Operations Hub',
                contactNumber: '+91 755 2499999',
                address: 'Plot 50, Commercial Complex, MP Nagar'
            },
            session: { user: superAdmin },
            ip: '127.0.0.1'
        };
        const res = createMockRes();
        await adminController.updateBranch(req, res);

        assert(res.statusCode === 200 && res.jsonData.success === true,
            'POST /api/admin/branches/update updates branch record');
    }

    // -------------------------------------------------------------
    // 3. CUSTOMER MANAGEMENT (CRM) ROUTE ACTIVATION
    // -------------------------------------------------------------
    console.log('\n--- 3. Customer Directory (CRM) Route Activation ---');

    // Test 7: GET /admin/customers loads customer directory
    {
        const req = {
            query: { search: '' },
            session: { user: superAdmin, csrfToken: 'test-csrf' }
        };
        const res = createMockRes();
        await customerController.getCustomersList(req, res);

        assert(res.renderedView === 'private/admin/customers',
            'GET /admin/customers renders active customer directory');
        assert(res.renderedData && Array.isArray(res.renderedData.customers),
            'Customers directory list loaded');
    }

    console.log('\n============================================================');
    console.log(`🎯 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runSettingsAndBranchSuite().catch(err => {
    console.error('Test Suite Fatal Error:', err);
    process.exit(1);
});
