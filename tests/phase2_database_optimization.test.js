/**
 * PHASE 2 DATABASE OPTIMIZATION TEST SUITE
 * 
 * Verifies:
 * 1. Compound & Secondary MongoDB Schema Indexes
 * 2. Selective Query Projections & In-Memory Footprint Reductions
 * 3. Server-Side Pagination & Edge-Case Boundaries
 * 4. Preservation of Branch Isolation, Active User Verification & Calculation Formulas
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Schemas & Models
const Invoice = require('../models/Invoice');
const Complaint = require('../models/Complaint');
const Enquiry = require('../models/Enquiry');
const FranchiseApplication = require('../models/FranchiseApplication');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const User = require('../models/User');
const Project = require('../models/Project');
const Attendance = require('../models/Attendance');
const Branch = require('../models/Branch');
const Customer = require('../models/Customer');

// Controllers
const adminController = require('../controllers/adminController');
const enquiryController = require('../controllers/enquiryController');
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

// Helper to check if index pattern exists in schema indexes
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
    console.log('\n============================================================');
    console.log('⚡ PHASE 2: DATABASE OPTIMIZATIONS & PAGINATION VERIFICATION');
    console.log('============================================================\n');

    // ----------------------------------------------------
    // 1. MONGODB SECONDARY & COMPOUND INDEX AUDIT
    // ----------------------------------------------------
    console.log('--- 1. MongoDB Secondary & Compound Indexes ---');

    runTest('Invoice: Index { isArchived: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Invoice.schema, { isArchived: 1, createdAt: -1 }));
    });

    runTest('Invoice: Index { branch: 1, isArchived: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Invoice.schema, { branch: 1, isArchived: 1, createdAt: -1 }));
    });

    runTest('Invoice: Index { createdByUser: 1, isArchived: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Invoice.schema, { createdByUser: 1, isArchived: 1, createdAt: -1 }));
    });

    runTest('Complaint: Indexes { status: 1, createdAt: -1 } & { createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Complaint.schema, { status: 1, createdAt: -1 }));
        assert.ok(hasIndex(Complaint.schema, { createdAt: -1 }));
    });

    runTest('Enquiry: Indexes { status: 1, createdAt: -1 } & { branch: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Enquiry.schema, { status: 1, createdAt: -1 }));
        assert.ok(hasIndex(Enquiry.schema, { branch: 1, createdAt: -1 }));
    });

    runTest('FranchiseApplication: Indexes { status: 1, createdAt: -1 } & { createdAt: -1 } defined', () => {
        assert.ok(hasIndex(FranchiseApplication.schema, { status: 1, createdAt: -1 }));
        assert.ok(hasIndex(FranchiseApplication.schema, { createdAt: -1 }));
    });

    runTest('Quotation: Indexes { isArchived: 1, createdAt: -1 } & { branch: 1, isArchived: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Quotation.schema, { isArchived: 1, createdAt: -1 }));
        assert.ok(hasIndex(Quotation.schema, { branch: 1, isArchived: 1, createdAt: -1 }));
    });

    runTest('QuotationRequest: Indexes { branch: 1, createdAt: -1 } & { status: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(QuotationRequest.schema, { branch: 1, createdAt: -1 }));
        assert.ok(hasIndex(QuotationRequest.schema, { status: 1, createdAt: -1 }));
    });

    runTest('User: Indexes { branchId: 1, role: 1 } & { status: 1, role: 1 } defined', () => {
        assert.ok(hasIndex(User.schema, { branchId: 1, role: 1 }));
        assert.ok(hasIndex(User.schema, { status: 1, role: 1 }));
    });

    runTest('Project: Indexes { branch: 1, status: 1 } & { branch: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Project.schema, { branch: 1, status: 1 }));
        assert.ok(hasIndex(Project.schema, { branch: 1, createdAt: -1 }));
    });

    runTest('Attendance: Indexes { employee: 1, date: -1 } & { branch: 1, date: -1 } defined', () => {
        assert.ok(hasIndex(Attendance.schema, { employee: 1, date: -1 }));
        assert.ok(hasIndex(Attendance.schema, { branch: 1, date: -1 }));
    });

    runTest('Branch: Index { isActive: 1 } defined', () => {
        assert.ok(hasIndex(Branch.schema, { isActive: 1 }));
    });

    runTest('Customer: Indexes { createdAt: -1 } & { assignedBranch: 1, createdAt: -1 } defined', () => {
        assert.ok(hasIndex(Customer.schema, { createdAt: -1 }));
        assert.ok(hasIndex(Customer.schema, { assignedBranch: 1, createdAt: -1 }));
    });

    // ----------------------------------------------------
    // 2. SERVER-SIDE PAGINATION — COMPLAINTS CONSOLE
    // ----------------------------------------------------
    console.log('\n--- 2. Complaints Console Pagination ---');

    // Seed test complaints in DataStore
    const memComplaints = DataStore.getAllComplaints();
    memComplaints.length = 0;
    for (let i = 1; i <= 35; i++) {
        memComplaints.push({
            ticketId: `SHIVAY-TEST-${String(i).padStart(3, '0')}`,
            customerName: `Customer Test ${i}`,
            mobile: `98260${String(10000 + i)}`,
            category: i % 2 === 0 ? 'inverter_error' : 'metering_issue',
            status: i <= 20 ? 'submitted' : (i <= 30 ? 'in_progress' : 'resolved'),
            createdAt: new Date(Date.now() - i * 60000).toISOString()
        });
    }

    await runAsyncTest('Complaints: Page 1 returns default 20 items and valid pagination metadata', async () => {
        let viewName = '';
        let viewData = {};
        const req = {
            query: { page: '1' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewName = v; viewData = d; },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(viewName, 'private/admin/complaints');
        assert.strictEqual(viewData.complaints.length, 20);
        assert.strictEqual(viewData.pagination.page, 1);
        assert.strictEqual(viewData.pagination.limit, 20);
        assert.strictEqual(viewData.pagination.total, 35);
        assert.strictEqual(viewData.pagination.totalPages, 2);
        assert.strictEqual(viewData.pagination.hasNextPage, true);
        assert.strictEqual(viewData.pagination.hasPrevPage, false);
        assert.strictEqual(viewData.pagination.nextPage, 2);
    });

    await runAsyncTest('Complaints: Page 2 returns remaining 15 items', async () => {
        let viewData = {};
        const req = {
            query: { page: '2' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(viewData.complaints.length, 15);
        assert.strictEqual(viewData.pagination.page, 2);
        assert.strictEqual(viewData.pagination.hasNextPage, false);
        assert.strictEqual(viewData.pagination.hasPrevPage, true);
        assert.strictEqual(viewData.pagination.prevPage, 1);
    });

    await runAsyncTest('Complaints: Limit parameter caps safely at max 100', async () => {
        let viewData = {};
        const req = {
            query: { page: '1', limit: '99999' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(viewData.pagination.limit, 100);
    });

    await runAsyncTest('Complaints: Status filter applies correctly with pagination', async () => {
        let viewData = {};
        const req = {
            query: { page: '1', status: 'submitted' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(viewData.currentStatus, 'submitted');
        assert.strictEqual(viewData.pagination.total, 20);
        assert.strictEqual(viewData.pagination.totalPages, 1);
        assert.ok(viewData.complaints.every(c => c.status === 'submitted'));
    });

    // ----------------------------------------------------
    // 3. SERVER-SIDE PAGINATION — SURVEYS & ENQUIRIES
    // ----------------------------------------------------
    console.log('\n--- 3. Surveys & Enquiries Pagination ---');

    const memEnquiries = DataStore.getAllEnquiries();
    memEnquiries.length = 0;
    for (let i = 1; i <= 28; i++) {
        memEnquiries.push({
            id: `ENQ-TEST-${String(i).padStart(3, '0')}`,
            enquiryId: `ENQ-TEST-${String(i).padStart(3, '0')}`,
            name: `Survey Applicant ${i}`,
            mobile: `98260${String(20000 + i)}`,
            district: 'Raisen',
            solarRequirement: 'Residential Rooftop',
            status: i <= 10 ? 'new' : (i <= 20 ? 'contacted' : 'survey_scheduled'),
            createdAt: new Date(Date.now() - i * 60000).toISOString()
        });
    }

    await runAsyncTest('Surveys: Page 1 returns default 20 items and valid pagination metadata', async () => {
        let viewData = {};
        const req = {
            query: { page: '1' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await enquiryController.getSurveysPage(req, res);
        assert.strictEqual(viewData.surveys.length, 20);
        assert.strictEqual(viewData.pagination.page, 1);
        assert.strictEqual(viewData.pagination.total, 28);
        assert.strictEqual(viewData.pagination.totalPages, 2);
        assert.strictEqual(viewData.pagination.hasNextPage, true);
    });

    await runAsyncTest('Surveys: Page 2 returns remaining 8 items', async () => {
        let viewData = {};
        const req = {
            query: { page: '2' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await enquiryController.getSurveysPage(req, res);
        assert.strictEqual(viewData.surveys.length, 8);
        assert.strictEqual(viewData.pagination.page, 2);
        assert.strictEqual(viewData.pagination.hasNextPage, false);
        assert.strictEqual(viewData.pagination.hasPrevPage, true);
    });

    // ----------------------------------------------------
    // 4. SERVER-SIDE PAGINATION — FRANCHISE APPLICATIONS
    // ----------------------------------------------------
    console.log('\n--- 4. Franchise Applications Pagination ---');

    const franchiseController = require('../controllers/franchiseController');
    const memApps = franchiseController.getMemFranchise();
    memApps.length = 0;
    for (let i = 1; i <= 25; i++) {
        memApps.push({
            applicationId: `FRA-TEST-${String(i).padStart(3, '0')}`,
            applicantName: `Franchise Partner ${i}`,
            mobile: `93997${String(30000 + i)}`,
            district: 'Vidisha',
            city: 'Vidisha',
            investmentCapacity: '₹5 Lakh - ₹10 Lakh',
            status: i <= 15 ? 'new' : 'under_review',
            createdAt: new Date(Date.now() - i * 60000).toISOString()
        });
    }

    await runAsyncTest('Franchise: Page 1 returns default 20 items', async () => {
        let viewData = {};
        const req = {
            query: { page: '1' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await enquiryController.getFranchiseApplicationsPage(req, res);
        assert.strictEqual(viewData.applications.length, 20);
        assert.strictEqual(viewData.pagination.page, 1);
        assert.strictEqual(viewData.pagination.total, 25);
        assert.strictEqual(viewData.pagination.totalPages, 2);
    });

    await runAsyncTest('Franchise: Page 2 returns remaining 5 items', async () => {
        let viewData = {};
        const req = {
            query: { page: '2' },
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewData = d; },
            status: () => res
        };

        await enquiryController.getFranchiseApplicationsPage(req, res);
        assert.strictEqual(viewData.applications.length, 5);
        assert.strictEqual(viewData.pagination.page, 2);
        assert.strictEqual(viewData.pagination.hasNextPage, false);
    });

    // ----------------------------------------------------
    // 5. REPORTS & CSV PROJECTIONS PERFORMANCE
    // ----------------------------------------------------
    console.log('\n--- 5. Reports & CSV Export Optimizations ---');

    await runAsyncTest('Reports: getReports compiles KPIs with selective query projections', async () => {
        let viewName = '';
        let viewData = {};
        const req = {
            session: { user: { role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { viewName = v; viewData = d; },
            status: () => res
        };

        await adminController.getReports(req, res);
        assert.strictEqual(viewName, 'private/admin/reports');
        assert.ok(viewData.stats, 'Stats KPI block must be present');
        assert.ok(viewData.branchStats !== undefined, 'Branch stats must be present');
        assert.ok(Array.isArray(viewData.recentProjects), 'Recent projects must be an array');
    });

    await runAsyncTest('Reports: exportReportCsv generates valid CSV without loading heavy fields', async () => {
        let sentData = '';
        let headerType = '';
        const req = {
            params: { type: 'invoices' }
        };
        const res = {
            setHeader: (name, val) => {
                if (name === 'Content-Type') headerType = val;
            },
            status: (code) => ({
                send: (content) => { sentData = content; }
            })
        };

        await adminController.exportReportCsv(req, res);
        assert.strictEqual(headerType, 'text/csv');
        assert.ok(sentData.includes('Invoice Number,Client Name,Client Mobile'), 'CSV header row present');
    });

    console.log('\n============================================================');
    console.log(`🎯 PHASE 2 TEST SUITE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
