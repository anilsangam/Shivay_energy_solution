/**
 * SHIVAY ENERGY SOLUTIONS - COMPLAINT TRACKING & SETTINGS TABS VERIFICATION TEST
 * Validates:
 * 1. Complaint Registration via API produces valid ticket ID
 * 2. Case-insensitive Complaint Tracking works immediately (no 'invalid' error)
 * 3. Mobile matching handles clean 10-digit formats
 * 4. Admin complaints console retrieves and lists registered tickets
 * 5. Admin complaint status & resolution updates work
 * 6. Non-existent ticket returns HTTP 404 (SEC-14 compliance)
 * 7. Settings tab configuration and save functionality
 * 8. Verification that fallback/dummy data arrays are cleared
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const complaintController = require('../controllers/complaintController');
const adminController = require('../controllers/adminController');
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
console.log('🔧 VERIFICATION: COMPLAINT LIFECYCLE, TRACKING & SETTINGS TABS');
console.log('============================================================\n');

(async () => {
    // ----------------------------------------------------
    // 1. Complaint Registration & Tracking Lifecycle
    // ----------------------------------------------------
    console.log('--- 1. Customer Complaint Filing & Immediate Tracking ---');

    let registeredTicketId = null;
    await runAsyncTest('Customer submits complaint ticket successfully', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            body: {
                customerName: 'Vinod Sharma',
                mobile: '+91 98261 44521',
                email: 'vinod@solarclient.in',
                systemCapacity: '5 kW On-Grid',
                category: 'inverter_error',
                description: 'Inverter error code E04 with red flashing light'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.submitComplaint(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.success, true);
        assert.ok(jsonRes.ticketId && jsonRes.ticketId.startsWith('SHIVAY-'));
        registeredTicketId = jsonRes.ticketId;
    });

    await runAsyncTest('Customer tracks ticket with exact Ticket ID and 10-digit mobile', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            query: {
                ticketId: registeredTicketId,
                mobile: '9826144521'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.trackComplaint(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.success, true);
        assert.strictEqual(jsonRes.complaint.ticketId, registeredTicketId);
        assert.strictEqual(jsonRes.complaint.status, 'submitted');
    });

    await runAsyncTest('Customer tracks ticket with LOWERCASE ticket ID (case-insensitive search)', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            query: {
                ticketId: registeredTicketId.toLowerCase(),
                mobile: '+91 98261 44521'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.trackComplaint(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.success, true);
        assert.strictEqual(jsonRes.complaint.ticketId, registeredTicketId);
    });

    await runAsyncTest('Non-existent ticket returns genuine HTTP 404 (SEC-14 compliance)', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            query: {
                ticketId: 'SHIVAY-00000',
                mobile: '9826144521'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.trackComplaint(req, res);
        assert.strictEqual(statusCode, 404);
        assert.strictEqual(jsonRes.success, false);
    });

    // ----------------------------------------------------
    // 2. Admin Complaints Management Console
    // ----------------------------------------------------
    console.log('\n--- 2. Admin Complaints Console & Status Updates ---');

    await runAsyncTest('Admin console (/admin/complaints) retrieves registered ticket', async () => {
        let renderedView = null;
        let renderedData = null;
        const req = {
            query: {},
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = {
            render: (v, d) => { renderedView = v; renderedData = d; },
            status: () => res
        };

        await adminController.getComplaints(req, res);
        assert.strictEqual(renderedView, 'private/admin/complaints');
        assert.ok(renderedData.complaints.length > 0);
        const match = renderedData.complaints.find(c => c.ticketId === registeredTicketId);
        assert.ok(match, 'Registered ticket must appear in admin complaints console');
    });

    await runAsyncTest('Admin updates complaint status to in_progress with notes', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            body: {
                ticketId: registeredTicketId,
                status: 'in_progress',
                resolutionNotes: 'Site technician dispatched to customer location.'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await adminController.updateComplaintStatus(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.success, true);
    });

    await runAsyncTest('Customer re-tracking reflects the updated in_progress status', async () => {
        let jsonRes = null;
        const req = {
            query: {
                ticketId: registeredTicketId,
                mobile: '9826144521'
            }
        };
        const res = {
            status: () => res,
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.trackComplaint(req, res);
        assert.strictEqual(jsonRes.complaint.status, 'in_progress');
        assert.strictEqual(jsonRes.complaint.resolutionNotes, 'Site technician dispatched to customer location.');
    });

    // ----------------------------------------------------
    // 3. Settings Tabs & Configuration Verification
    // ----------------------------------------------------
    console.log('\n--- 3. Settings Tabs & Form Saving ---');

    runTest('settings.ejs contains all 5 tabs and tab panes', () => {
        const settingsContent = fs.readFileSync(path.join(__dirname, '../views/private/admin/settings.ejs'), 'utf8');
        assert.ok(settingsContent.includes('#company-pane'), 'Company Profile pane must exist');
        assert.ok(settingsContent.includes('#pricing-pane'), 'Pricing & Subsidy pane must exist');
        assert.ok(settingsContent.includes('#geofence-pane'), 'GPS Geofencing pane must exist');
        assert.ok(settingsContent.includes('#security-pane'), 'Security & Policies pane must exist');
        assert.ok(settingsContent.includes('#discom-pane'), 'DISCOM Net-Metering pane must exist');
    });

    runTest('admin-footer.ejs supports data-bs-toggle="tab" and "pill" navigation', () => {
        const footerContent = fs.readFileSync(path.join(__dirname, '../views/private/admin/partials/admin-footer.ejs'), 'utf8');
        assert.ok(footerContent.includes('data-bs-toggle="pill"'), 'Footer tab listener must support pill toggle');
        assert.ok(footerContent.includes('data-bs-toggle="tab"'), 'Footer tab listener must support tab toggle');
    });

    await runAsyncTest('saveSettings persists pricing and geofencing fields', async () => {
        let jsonRes = null;
        const req = {
            body: {
                companyName: 'SHIVAY ENERGY SOLUTIONS',
                defaultRatePerKw: 55000,
                subsidy1Kw: 30000,
                subsidy2Kw: 60000,
                subsidy3KwMax: 78000,
                defaultGstPercent: 13.8,
                hqLatitude: 23.3315,
                hqLongitude: 77.7807,
                defaultGeofenceRadiusMeters: 600,
                enforceGeofence: 'true',
                primaryDiscom: 'MPPKVVCL (Madhya Kshetra)',
                discomHelpline: '1912'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } },
            ip: '127.0.0.1'
        };
        const res = {
            status: () => res,
            json: (j) => { jsonRes = j; return res; }
        };

        await adminController.saveSettings(req, res);
        assert.strictEqual(jsonRes.success, true);
        const saved = DataStore.getSettings();
        assert.strictEqual(saved.defaultRatePerKw, 55000);
        assert.strictEqual(saved.defaultGeofenceRadiusMeters, 600);
        assert.strictEqual(saved.primaryDiscom, 'MPPKVVCL (Madhya Kshetra)');
    });

    // ----------------------------------------------------
    // 4. Fallback Data Removal Verification
    // ----------------------------------------------------
    console.log('\n--- 4. Removal of Fake Seed/Fallback Data ---');

    runTest('Dummy quotation seed data is removed from DataStore', () => {
        const quotes = DataStore.getAllQuotations();
        assert.ok(Array.isArray(quotes));
        const fakeSuresh = quotes.find(q => q.customerName === 'Suresh Chouksey');
        assert.strictEqual(fakeSuresh, undefined, 'Suresh Chouksey dummy quotation must not exist');
    });

    runTest('Dummy attendance seed data is removed from DataStore', () => {
        const attendance = DataStore.getTodayAttendance();
        assert.ok(Array.isArray(attendance));
        const fakeAtt = attendance.find(a => a.id === 'ATT-101');
        assert.strictEqual(fakeAtt, undefined, 'ATT-101 dummy punch must not exist');
    });

    runTest('Dummy enquiries seed data is removed from DataStore', () => {
        const enquiries = DataStore.getAllEnquiries();
        assert.ok(Array.isArray(enquiries));
        const fakeEnq = enquiries.find(e => e.id === 'ENQ-94821');
        assert.strictEqual(fakeEnq, undefined, 'ENQ-94821 dummy enquiry must not exist');
    });

    console.log('\n============================================================');
    console.log(`🎯 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
