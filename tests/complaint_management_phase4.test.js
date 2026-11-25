/**
 * SHIVAY ENERGY SOLUTIONS - COMPLAINT & SERVICE MANAGEMENT TEST SUITE
 * Phase 4: Basic Customer Complaint & Service Management Verification
 * 
 * Verifies:
 * 1. Public Complaint Form, Validation & 2-Minute Duplicate Prevention
 * 2. Customer Identification & Project Linking (Scenarios A, B, C, D)
 * 3. Automatic Branch Routing (Exact PIN, District/City, Multi-Match, Unassigned) & Branch Transfer
 * 4. Technician Assignment, Eligibility & Cross-Branch Validation
 * 5. Controlled Status Progression & Progress History Tracking
 * 6. Strict Maker-Checker Resolution, Closure Approval & Reopening
 * 7. Multi-Branch Isolation, Public PII Protection, Notifications & Permissions
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Models
const Complaint = require('../models/Complaint');
const Customer = require('../models/Customer');
const Project = require('../models/Project');
const Branch = require('../models/Branch');
const User = require('../models/User');
const SerialNumber = require('../models/SerialNumber');
const InstallationRecord = require('../models/InstallationRecord');
const Notification = require('../models/Notification');

// Services & Controllers
const ComplaintService = require('../services/complaintService');
const complaintController = require('../controllers/complaintController');
const NotificationService = require('../services/notificationService');
const DataStore = require('../services/dataStore');
const { PERMISSIONS, isValidPermission } = require('../config/permissionRegistry');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        throw err;
    }
}

// In-memory prototype mocks to prevent un-mocked DB driver buffering
Complaint.prototype.save = function () { return Promise.resolve(this); };
Customer.prototype.save = function () { return Promise.resolve(this); };
Project.prototype.save = function () { return Promise.resolve(this); };
Branch.prototype.save = function () { return Promise.resolve(this); };
User.prototype.save = function () { return Promise.resolve(this); };
Notification.prototype.save = function () { return Promise.resolve(this); };

// Default static query mocks to prevent buffering timeout during offline unit testing
Customer.find = () => Promise.resolve([]);
Branch.find = () => Promise.resolve([]);
Project.find = () => Promise.resolve([]);
User.find = () => Promise.resolve([]);

console.log('\n================================================================');
console.log('⚡ PHASE 4: CUSTOMER COMPLAINT & SERVICE MANAGEMENT TEST HARNESS');
console.log('================================================================\n');

(async () => {
    // ----------------------------------------------------
    // SECTION 1: Public Form Validation & Duplicate Prevention
    // ----------------------------------------------------
    console.log('--- 1. Public Form, Input Validation & Duplicate Prevention ---');

    await test('Validation fails when mandatory customer fields are missing', async () => {
        const val = ComplaintService.validateComplaintInput({
            customerName: '',
            mobile: '123'
        });
        assert.strictEqual(val.isValid, false);
        assert.ok(val.errors.some(e => e.includes('Customer Name')));
        assert.ok(val.errors.some(e => e.includes('10-digit')));
    });

    await test('Validation cleans 10-digit mobile and 6-digit PIN code', async () => {
        const val = ComplaintService.validateComplaintInput({
            customerName: 'Ramesh Patel',
            mobile: '+91-98260-12345',
            pinCode: '464551',
            serviceAddress: 'Ward 4, Near Bus Stand',
            category: 'inverter_error',
            description: 'Inverter flashing red code E02'
        });
        assert.strictEqual(val.isValid, true);
        assert.strictEqual(val.cleanMobile, '9826012345');
        assert.strictEqual(val.cleanPin, '464551');
    });

    let firstTicketId = null;
    await test('Public submission successfully generates Ticket ID and Complaint ID', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            body: {
                customerName: 'Anil Kumar',
                mobile: '9826199881',
                email: 'anil@test.in',
                serviceAddress: 'Plot 12, Main Market',
                state: 'Madhya Pradesh',
                district: 'Raisen',
                city: 'Bareli',
                pinCode: '464668',
                category: 'inverter_error',
                description: 'Inverter red fault light active'
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
        assert.ok(jsonRes.complaintId && jsonRes.complaintId.startsWith('CMP-'));
        firstTicketId = jsonRes.ticketId;
    });

    await test('2-minute duplicate window prevents accidental double-submission', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            body: {
                customerName: 'Anil Kumar',
                mobile: '9826199881',
                category: 'inverter_error',
                description: 'Second submit attempt within 2 minutes'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.submitComplaint(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.isDuplicate, true);
        assert.strictEqual(jsonRes.ticketId, firstTicketId);
        assert.ok(jsonRes.message.includes('already submitted recently'));
    });

    await test('Public tracking endpoint returns safe fields without exposing sensitive PII', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            query: {
                ticketId: firstTicketId,
                mobile: '9826199881'
            }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            json: (j) => { jsonRes = j; return res; }
        };

        await complaintController.trackComplaint(req, res);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(jsonRes.success, true);
        assert.strictEqual(jsonRes.complaint.ticketId, firstTicketId);
        assert.strictEqual(typeof jsonRes.complaint.status, 'string');
        assert.strictEqual(jsonRes.complaint.originalServiceAddress, undefined, 'PII original address must not be exposed on public tracking');
        assert.strictEqual(jsonRes.complaint.branchTransferHistory, undefined, 'Internal transfer history must not be exposed');
    });

    await test('Tracking non-existent ticket returns genuine HTTP 404', async () => {
        let jsonRes = null;
        let statusCode = 200;
        const req = {
            query: {
                ticketId: 'SHIVAY-99999',
                mobile: '9826199881'
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
    // SECTION 2: Customer Identification & Project Linking
    // ----------------------------------------------------
    console.log('\n--- 2. Customer Identification & Project Linking (Scenarios A, B, C, D) ---');

    await test('Scenario D: Customer does not exist -> Unlinked, no duplicate customer created', async () => {
        const origFind = Customer.find;
        Customer.find = () => Promise.resolve([]);

        const linking = await ComplaintService.identifyCustomerAndProjects('9999900000');
        assert.strictEqual(linking.linkingStatus, 'UNLINKED');
        assert.strictEqual(linking.customer, null);
        assert.strictEqual(linking.project, null);

        Customer.find = origFind;
    });

    await test('Scenario C: Customer exists with 0 projects -> Customer linked, Project null', async () => {
        const dummyCustId = new mongoose.Types.ObjectId();
        const origCustFind = Customer.find;
        const origProjFind = Project.find;

        Customer.find = () => Promise.resolve([{ _id: dummyCustId, name: 'Suresh Kumar', mobile: '9826200001' }]);
        Project.find = () => Promise.resolve([]);

        const linking = await ComplaintService.identifyCustomerAndProjects('9826200001');
        assert.strictEqual(linking.linkingStatus, 'CUSTOMER_LINKED_NO_PROJECT');
        assert.strictEqual(linking.customer._id.toString(), dummyCustId.toString());
        assert.strictEqual(linking.project, null);

        Customer.find = origCustFind;
        Project.find = origProjFind;
    });

    await test('Scenario A: Customer exists with exactly 1 project -> Auto-links Customer & Project', async () => {
        const dummyCustId = new mongoose.Types.ObjectId();
        const dummyProjId = new mongoose.Types.ObjectId();
        const origCustFind = Customer.find;
        const origProjFind = Project.find;

        Customer.find = () => Promise.resolve([{ _id: dummyCustId, name: 'Meena Sharma', mobile: '9826200002' }]);
        Project.find = () => Promise.resolve([{ _id: dummyProjId, projectNumber: 'PRJ-2611-001', capacityKw: 5 }]);

        const linking = await ComplaintService.identifyCustomerAndProjects('9826200002');
        assert.strictEqual(linking.linkingStatus, 'LINKED');
        assert.strictEqual(linking.customer._id.toString(), dummyCustId.toString());
        assert.strictEqual(linking.project._id.toString(), dummyProjId.toString());

        Customer.find = origCustFind;
        Project.find = origProjFind;
    });

    await test('Scenario B: Customer exists with >1 projects -> Customer linked, manual staff selection queue', async () => {
        const dummyCustId = new mongoose.Types.ObjectId();
        const origCustFind = Customer.find;
        const origProjFind = Project.find;

        Customer.find = () => Promise.resolve([{ _id: dummyCustId, name: 'Vikram Singh', mobile: '9826200003' }]);
        Project.find = () => Promise.resolve([
            { _id: new mongoose.Types.ObjectId(), projectNumber: 'PRJ-01', capacityKw: 3 },
            { _id: new mongoose.Types.ObjectId(), projectNumber: 'PRJ-02', capacityKw: 10 }
        ]);

        const linking = await ComplaintService.identifyCustomerAndProjects('9826200003');
        assert.strictEqual(linking.linkingStatus, 'CUSTOMER_LINKED_MULTI_PROJECT');
        assert.strictEqual(linking.customer._id.toString(), dummyCustId.toString());
        assert.strictEqual(linking.project, null);
        assert.strictEqual(linking.candidateProjects.length, 2);

        Customer.find = origCustFind;
        Project.find = origProjFind;
    });

    await test('Manual linking action links Customer and Project to complaint', async () => {
        const dummyComp = new Complaint({
            ticketId: 'SHIVAY-11111',
            customerName: 'Unlinked Client',
            mobile: '9826300001',
            category: 'inverter_error',
            description: 'Test manual linking'
        });

        const targetCustId = new mongoose.Types.ObjectId();
        const targetProjId = new mongoose.Types.ObjectId();

        const origFindById = Complaint.findById;
        const origCustFindById = Customer.findById;
        const origProjFindById = Project.findById;

        Complaint.findById = () => Promise.resolve(dummyComp);
        Customer.findById = () => Promise.resolve({ _id: targetCustId, name: 'Target Customer' });
        Project.findById = () => Promise.resolve({ _id: targetProjId, projectNumber: 'PRJ-TARGET' });

        const updated = await ComplaintService.linkCustomerAndProject(
            dummyComp._id,
            { customerId: targetCustId, projectId: targetProjId },
            { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' }
        );

        assert.strictEqual(updated.customer.toString(), targetCustId.toString());
        assert.strictEqual(updated.project.toString(), targetProjId.toString());

        Complaint.findById = origFindById;
        Customer.findById = origCustFindById;
        Project.findById = origProjFindById;
    });

    // ----------------------------------------------------
    // SECTION 3: Branch Routing & Transfers
    // ----------------------------------------------------
    console.log('\n--- 3. Automatic Branch Routing & Branch Transfers ---');

    await test('Branch routing matches exact PIN code in serviceablePinCodes (AUTO_EXACT_PIN)', async () => {
        const dummyBranchId = new mongoose.Types.ObjectId();
        const origBranchFind = Branch.find;

        Branch.find = (q) => {
            if (q.serviceablePinCodes === '464551') {
                return Promise.resolve([{ _id: dummyBranchId, name: 'Bareli Branch', serviceablePinCodes: ['464551'] }]);
            }
            return Promise.resolve([]);
        };

        const route = await ComplaintService.routeComplaintBranch('464551', 'Raisen', 'Bareli');
        assert.strictEqual(route.branchRoutingMethod, 'AUTO_EXACT_PIN');
        assert.strictEqual(route.branchId.toString(), dummyBranchId.toString());

        Branch.find = origBranchFind;
    });

    await test('Branch routing matches District / City when PIN not in list (AUTO_DISTRICT_CITY)', async () => {
        const dummyBranchId = new mongoose.Types.ObjectId();
        const origBranchFind = Branch.find;

        Branch.find = (q) => {
            if (q.serviceablePinCodes) return Promise.resolve([]);
            if (q.$or) {
                return Promise.resolve([{ _id: dummyBranchId, name: 'Bhopal Central Branch', districts: ['Bhopal'] }]);
            }
            return Promise.resolve([]);
        };

        const route = await ComplaintService.routeComplaintBranch('462001', 'Bhopal', 'Bhopal');
        assert.strictEqual(route.branchRoutingMethod, 'AUTO_DISTRICT_CITY');
        assert.strictEqual(route.branchId.toString(), dummyBranchId.toString());

        Branch.find = origBranchFind;
    });

    await test('Branch routing queues multiple matching branches (MULTIPLE_MATCHES)', async () => {
        const origBranchFind = Branch.find;

        Branch.find = (q) => {
            if (q.serviceablePinCodes === '462023') {
                return Promise.resolve([
                    { _id: new mongoose.Types.ObjectId(), name: 'Branch 1' },
                    { _id: new mongoose.Types.ObjectId(), name: 'Branch 2' }
                ]);
            }
            return Promise.resolve([]);
        };

        const route = await ComplaintService.routeComplaintBranch('462023', 'Bhopal', 'Bhopal');
        assert.strictEqual(route.branchRoutingMethod, 'MULTIPLE_MATCHES');
        assert.strictEqual(route.branchId, null);

        Branch.find = origBranchFind;
    });

    await test('Branch routing marks unassigned when no coverage found (UNASSIGNED)', async () => {
        const origBranchFind = Branch.find;
        Branch.find = () => Promise.resolve([]);

        const route = await ComplaintService.routeComplaintBranch('999999', 'Unknown', 'Unknown');
        assert.strictEqual(route.branchRoutingMethod, 'UNASSIGNED');
        assert.strictEqual(route.branchId, null);

        Branch.find = origBranchFind;
    });

    await test('Branch transfer preserves originalServiceAddress and records transfer history', async () => {
        const oldBranchId = new mongoose.Types.ObjectId();
        const newBranchId = new mongoose.Types.ObjectId();
        const dummyComp = new Complaint({
            ticketId: 'SHIVAY-22222',
            customerName: 'Transfer Client',
            mobile: '9826312345',
            category: 'inverter_error',
            description: 'Transfer test',
            branch: oldBranchId,
            branchId: oldBranchId,
            originalServiceAddress: {
                address: 'Original Village Site, Tehsil Gairatganj',
                state: 'Madhya Pradesh',
                district: 'Raisen',
                city: 'Gairatganj',
                pinCode: '464884'
            }
        });

        const origFindById = Complaint.findById;
        const origBranchFindById = Branch.findById;

        Complaint.findById = () => Promise.resolve(dummyComp);
        Branch.findById = () => Promise.resolve({ _id: newBranchId, name: 'Raisen Headquarters', isActive: true });

        const updated = await ComplaintService.transferBranch(
            dummyComp._id,
            { targetBranchId: newBranchId, reason: 'Territory reallocation for faster technician dispatch' },
            { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN', name: 'Super Admin' }
        );

        assert.strictEqual(updated.branch.toString(), newBranchId.toString());
        assert.strictEqual(updated.branchTransferHistory.length, 1);
        assert.strictEqual(updated.branchTransferHistory[0].fromBranch.toString(), oldBranchId.toString());
        assert.strictEqual(updated.branchTransferHistory[0].toBranch.toString(), newBranchId.toString());
        assert.strictEqual(updated.branchTransferHistory[0].reason, 'Territory reallocation for faster technician dispatch');
        assert.strictEqual(updated.originalServiceAddress.address, 'Original Village Site, Tehsil Gairatganj', 'Original service address must be preserved intact');

        Complaint.findById = origFindById;
        Branch.findById = origBranchFindById;
    });

    await test('Branch transfer without mandatory reason is rejected', async () => {
        try {
            await ComplaintService.transferBranch(
                new mongoose.Types.ObjectId(),
                { targetBranchId: new mongoose.Types.ObjectId(), reason: '   ' },
                { role: 'SUPER_ADMIN' }
            );
            assert.fail('Should have rejected transfer without reason');
        } catch (err) {
            assert.ok(err.message.includes('Mandatory transfer reason'));
        }
    });

    // ----------------------------------------------------
    // SECTION 4: Technician Assignment & Eligibility
    // ----------------------------------------------------
    console.log('\n--- 4. Technician Assignment & Eligibility ---');

    await test('Eligible active technician assigned -> status moves to Assigned with history', async () => {
        const branchId = new mongoose.Types.ObjectId();
        const techId = new mongoose.Types.ObjectId();
        const dummyComp = new Complaint({
            ticketId: 'SHIVAY-33333',
            customerName: 'Assignment Client',
            mobile: '9826412345',
            category: 'inverter_error',
            description: 'Inverter error',
            status: 'Submitted',
            branch: branchId
        });

        const dummyTech = new User({
            _id: techId,
            name: 'Sunil Verma',
            employeeId: 'EMP-001',
            role: 'EMPLOYEE',
            designation: 'SERVICE_TECHNICIAN',
            branchId: branchId,
            status: 'ACTIVE'
        });

        const origCompFind = Complaint.findById;
        const origUserFind = User.findById;

        Complaint.findById = () => Promise.resolve(dummyComp);
        User.findById = () => Promise.resolve(dummyTech);

        const updated = await ComplaintService.assignTechnician(
            dummyComp._id,
            { technicianId: techId, remarks: 'Assigned for site inverter replacement' },
            { _id: new mongoose.Types.ObjectId(), role: 'SUPER_ADMIN' }
        );

        assert.strictEqual(updated.status, 'Assigned');
        assert.strictEqual(updated.assignedTechnician.toString(), techId.toString());
        assert.strictEqual(updated.assignmentHistory.length, 1);
        assert.strictEqual(updated.assignmentHistory[0].remarks, 'Assigned for site inverter replacement');

        Complaint.findById = origCompFind;
        User.findById = origUserFind;
    });

    await test('Inactive technician cannot be assigned to complaint', async () => {
        const branchId = new mongoose.Types.ObjectId();
        const techId = new mongoose.Types.ObjectId();
        const dummyComp = new Complaint({
            ticketId: 'SHIVAY-33334',
            status: 'Submitted',
            branch: branchId
        });

        const dummyInactiveTech = new User({
            _id: techId,
            name: 'Inactive Tech',
            status: 'INACTIVE',
            isActive: false,
            branchId: branchId
        });

        const origCompFind = Complaint.findById;
        const origUserFind = User.findById;

        Complaint.findById = () => Promise.resolve(dummyComp);
        User.findById = () => Promise.resolve(dummyInactiveTech);

        try {
            await ComplaintService.assignTechnician(
                dummyComp._id,
                { technicianId: techId },
                { role: 'SUPER_ADMIN' }
            );
            assert.fail('Should have rejected inactive technician');
        } catch (err) {
            assert.ok(err.message.includes('inactive'));
        }

        Complaint.findById = origCompFind;
        User.findById = origUserFind;
    });

    await test('Branch Manager cannot assign technician from another branch', async () => {
        const compBranchId = new mongoose.Types.ObjectId();
        const otherBranchId = new mongoose.Types.ObjectId();
        const techId = new mongoose.Types.ObjectId();

        const dummyComp = new Complaint({
            ticketId: 'SHIVAY-33335',
            status: 'Submitted',
            branch: compBranchId
        });

        const dummyOtherBranchTech = new User({
            _id: techId,
            name: 'Other Branch Tech',
            branchId: otherBranchId,
            isActive: true
        });

        const origCompFind = Complaint.findById;
        const origUserFind = User.findById;

        Complaint.findById = () => Promise.resolve(dummyComp);
        User.findById = () => Promise.resolve(dummyOtherBranchTech);

        try {
            await ComplaintService.assignTechnician(
                dummyComp._id,
                { technicianId: techId },
                { role: 'BRANCH_MANAGER', branchId: compBranchId }
            );
            assert.fail('Should have rejected cross-branch technician');
        } catch (err) {
            assert.ok(err.message.includes('does not belong to the complaint branch'));
        }

        Complaint.findById = origCompFind;
        User.findById = origUserFind;
    });

    // ----------------------------------------------------
    // SECTION 5: Controlled Status Progression & Progress
    // ----------------------------------------------------
    console.log('\n--- 5. Controlled Status Progression & Progress Updates ---');

    let complaintProgress = new Complaint({
        ticketId: 'SHIVAY-44444',
        status: 'Assigned',
        progressHistory: []
    });

    await test('Technician schedules visit -> Visit Scheduled with scheduledVisitDate', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(complaintProgress);

        const visitTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const updated = await ComplaintService.updateProgress(
            complaintProgress._id,
            { status: 'Visit Scheduled', visitDateTime: visitTime, remarks: 'Customer confirmed tomorrow 11 AM' },
            { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' }
        );

        assert.strictEqual(updated.status, 'Visit Scheduled');
        assert.ok(updated.scheduledVisitDate);
        assert.strictEqual(updated.progressHistory.length, 1);

        Complaint.findById = origCompFind;
    });

    await test('Technician updates status to On The Way and Site Visited', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(complaintProgress);

        await ComplaintService.updateProgress(
            complaintProgress._id,
            { status: 'On The Way', remarks: 'Traveling to site with spare parts' },
            { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' }
        );
        assert.strictEqual(complaintProgress.status, 'On The Way');

        await ComplaintService.updateProgress(
            complaintProgress._id,
            { status: 'Site Visited', remarks: 'Arrived at site, multimeter testing started' },
            { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' }
        );
        assert.strictEqual(complaintProgress.status, 'Site Visited');

        Complaint.findById = origCompFind;
    });

    await test('Technician records Waiting for Material with spare parts and delay reason', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(complaintProgress);

        await ComplaintService.updateProgress(
            complaintProgress._id,
            {
                status: 'Waiting for Material',
                materialRequired: '5kW Hybrid Inverter Motherboard',
                delayReason: 'Inverter internal surge damage, replacement PCB required from warehouse'
            },
            { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' }
        );

        assert.strictEqual(complaintProgress.status, 'Waiting for Material');
        const lastEntry = complaintProgress.progressHistory[complaintProgress.progressHistory.length - 1];
        assert.strictEqual(lastEntry.materialRequired, '5kW Hybrid Inverter Motherboard');
        assert.ok(lastEntry.delayReason.includes('replacement PCB required'));

        Complaint.findById = origCompFind;
    });

    // ----------------------------------------------------
    // SECTION 6: Maker-Checker Resolution, Closure & Reopening
    // ----------------------------------------------------
    console.log('\n--- 6. Strict Maker-Checker Resolution, Closure & Reopening ---');

    const technicianId = new mongoose.Types.ObjectId();
    const managerId = new mongoose.Types.ObjectId();

    let resolvedComplaint = new Complaint({
        ticketId: 'SHIVAY-55555',
        status: 'Work In Progress',
        assignedTechnician: technicianId,
        progressHistory: []
    });

    await test('Technician submits resolution -> status moves to Resolved', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(resolvedComplaint);

        const updated = await ComplaintService.resolveComplaint(
            resolvedComplaint._id,
            {
                rootCause: 'Loose AC connection in distribution box caused voltage fluctuation tripping inverter',
                workPerformed: 'Re-crimped AC wires, replaced 25A MCB, tested grid synchronization, output 4.8 kW verified',
                replacedParts: ['25A Havells MCB', 'MC4 Pair']
            },
            { _id: technicianId, role: 'EMPLOYEE' }
        );

        assert.strictEqual(updated.status, 'Resolved');
        assert.ok(updated.resolutionDetails);
        assert.strictEqual(updated.resolutionDetails.resolvedBy.toString(), technicianId.toString());
        assert.ok(updated.resolutionDetails.workPerformed.includes('Re-crimped AC wires'));

        Complaint.findById = origCompFind;
    });

    await test('STRICT MAKER-CHECKER: Resolving technician attempting self-closure is rejected (403)', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(resolvedComplaint);

        try {
            await ComplaintService.approveClosure(
                resolvedComplaint._id,
                { remarks: 'Technician attempting to self-close' },
                { _id: technicianId, role: 'EMPLOYEE', permissions: [] }
            );
            assert.fail('Should have rejected technician self-closure');
        } catch (err) {
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.includes('Maker-Checker Violation'));
        }

        Complaint.findById = origCompFind;
    });

    await test('Branch Manager / Admin inspects work and approves closure -> status moves to Closed', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(resolvedComplaint);

        const closed = await ComplaintService.approveClosure(
            resolvedComplaint._id,
            { closureRemarks: 'Verified voltage logs, spoke to customer Mr. Anil Kumar who confirmed solar system operating smoothly.' },
            { _id: managerId, role: 'BRANCH_MANAGER', permissions: ['complaints.close'] }
        );

        assert.strictEqual(closed.status, 'Closed');
        assert.ok(closed.closureDetails);
        assert.strictEqual(closed.closureDetails.approvedBy.toString(), managerId.toString());
        assert.ok(closed.closureDetails.closureRemarks.includes('customer Mr. Anil Kumar'));

        Complaint.findById = origCompFind;
    });

    await test('Manager reopens complaint with mandatory reason -> status moves to Reopened', async () => {
        const origCompFind = Complaint.findById;
        Complaint.findById = () => Promise.resolve(resolvedComplaint);

        const reopened = await ComplaintService.reopenComplaint(
            resolvedComplaint._id,
            { reason: 'Customer reported same error code E04 reappeared next morning' },
            { _id: managerId, role: 'BRANCH_MANAGER', permissions: ['complaints.reopen'] }
        );

        assert.strictEqual(reopened.status, 'Reopened');
        assert.ok(reopened.reopeningDetails);
        assert.strictEqual(reopened.reopeningDetails.reason, 'Customer reported same error code E04 reappeared next morning');

        Complaint.findById = origCompFind;
    });

    await test('Reopening without mandatory reason is rejected', async () => {
        try {
            await ComplaintService.reopenComplaint(
                resolvedComplaint._id,
                { reason: '   ' },
                { _id: managerId, role: 'BRANCH_MANAGER' }
            );
            assert.fail('Should have rejected reopening without reason');
        } catch (err) {
            assert.ok(err.message.includes('Mandatory reopening reason required'));
        }
    });

    // ----------------------------------------------------
    // SECTION 7: Multi-Branch Isolation & Security
    // ----------------------------------------------------
    console.log('\n--- 7. Security, Branch Isolation & Permission Registry ---');

    await test('Branch Manager attempting to view complaint of another branch receives 403', async () => {
        const branchA = new mongoose.Types.ObjectId();
        const branchB = new mongoose.Types.ObjectId();

        const dummyComp = new Complaint({
            _id: new mongoose.Types.ObjectId(),
            ticketId: 'SHIVAY-66666',
            branch: branchB
        });

        const origGetDetails = ComplaintService.getComplaintDetails;
        ComplaintService.getComplaintDetails = () => Promise.resolve({ complaint: dummyComp });

        let statusCode = 200;
        let renderedView = null;
        const req = {
            params: { id: dummyComp._id.toString() },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'BRANCH_MANAGER', branchId: branchA } }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            render: (v) => { renderedView = v; }
        };

        await complaintController.getComplaintDetailPage(req, res);
        assert.strictEqual(statusCode, 403);
        assert.strictEqual(renderedView, 'private/errors/403');

        ComplaintService.getComplaintDetails = origGetDetails;
    });

    await test('Field technician attempting to view unassigned complaint receives 403', async () => {
        const dummyComp = new Complaint({
            _id: new mongoose.Types.ObjectId(),
            ticketId: 'SHIVAY-77777',
            assignedTechnician: new mongoose.Types.ObjectId()
        });

        const origGetDetails = ComplaintService.getComplaintDetails;
        ComplaintService.getComplaintDetails = () => Promise.resolve({ complaint: dummyComp });

        let statusCode = 200;
        let renderedView = null;
        const req = {
            params: { id: dummyComp._id.toString() },
            session: { user: { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' } }
        };
        const res = {
            status: (s) => { statusCode = s; return res; },
            render: (v) => { renderedView = v; }
        };

        await complaintController.getComplaintDetailPage(req, res);
        assert.strictEqual(statusCode, 403);
        assert.strictEqual(renderedView, 'private/errors/403');

        ComplaintService.getComplaintDetails = origGetDetails;
    });

    await test('NotificationService creates deduplicated in-app notifications', async () => {
        const recipientId = new mongoose.Types.ObjectId();
        const notif1 = await NotificationService.sendNotification({
            recipient: recipientId,
            title: 'Service Ticket Assigned',
            message: 'You have been assigned to Ticket SHIVAY-12345',
            type: 'COMPLAINT',
            dedupKey: 'NOTIF_COMP_ASSIGN_TEST_123'
        });
        assert.ok(notif1);

        // Attempt duplicate notification with identical dedupKey
        const notif2 = await NotificationService.sendNotification({
            recipient: recipientId,
            title: 'Service Ticket Assigned (Duplicate attempt)',
            message: 'Duplicate send',
            type: 'COMPLAINT',
            dedupKey: 'NOTIF_COMP_ASSIGN_TEST_123'
        });
        assert.strictEqual(notif2.isDuplicate, true);
    });

    await test('Canonical 117 enumerable permission keys preserved with extended Phase 4 validation', async () => {
        const enumerableKeys = Object.keys(PERMISSIONS);
        assert.strictEqual(enumerableKeys.length, 117, 'Canonical enumerable registry length must remain strictly 117');

        // Check Phase 4 extended permissions are valid
        assert.strictEqual(isValidPermission('complaints.records.view'), true);
        assert.strictEqual(isValidPermission('complaints.records.create'), true);
        assert.strictEqual(isValidPermission('complaints.records.edit'), true);
        assert.strictEqual(isValidPermission('complaints.branch_transfer'), true);
        assert.strictEqual(isValidPermission('complaints.technician_assign'), true);
        assert.strictEqual(isValidPermission('complaints.progress.update'), true);
        assert.strictEqual(isValidPermission('complaints.resolve'), true);
        assert.strictEqual(isValidPermission('complaints.close'), true);
        assert.strictEqual(isValidPermission('complaints.reopen'), true);
    });

    console.log('\n================================================================');
    console.log(`🎯 PHASE 4 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
    console.log('================================================================\n');
})();
