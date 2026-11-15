const assert = require('assert');
const mongoose = require('mongoose');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const Project = require('../models/Project');
const ProjectActivity = require('../models/ProjectActivity');
const ProjectService = require('../services/projectService');
const QuotationService = require('../services/quotationService');
const UploadService = require('../services/uploadService');
const projectController = require('../controllers/projectController');

function createMockRes() {
    return {
        statusCode: 200,
        jsonData: null,
        renderedView: null,
        renderedData: null,
        redirectUrl: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        render(view, data) {
            this.renderedView = view;
            this.renderedData = data;
            return this;
        },
        redirect(url) {
            this.redirectUrl = url;
            return this;
        }
    };
}

async function runPhase3Tests() {
    console.log('============================================================');
    console.log('⚡ PHASE 3: PROJECT EXECUTION & SITE INSTALLATION TEST SUITE');
    console.log('============================================================\n');

    // MOCK USERS & ROLES
    const branch1Id = new mongoose.Types.ObjectId();
    const branch2Id = new mongoose.Types.ObjectId();

    const superAdmin = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Deepak Kushwaha',
        role: 'SUPER_ADMIN',
        email: 'admin@shivayenergy.com'
    };

    const managerBranch1 = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Rahul Saini',
        role: 'BRANCH_MANAGER',
        branchId: branch1Id,
        email: 'manager.raisen@shivayenergy.com'
    };

    const managerBranch2 = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Bhopal Manager',
        role: 'BRANCH_MANAGER',
        branchId: branch2Id,
        email: 'manager.bhopal@shivayenergy.com'
    };

    const engineer1 = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Anil Sharma',
        role: 'EMPLOYEE',
        employeeId: 'SES-EMP-01',
        branchId: branch1Id,
        email: 'anil@shivayenergy.com'
    };

    const engineer2 = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Pooja Patel',
        role: 'EMPLOYEE',
        employeeId: 'SES-EMP-02',
        branchId: branch1Id,
        email: 'pooja@shivayenergy.com'
    };

    // -------------------------------------------------------------
    // TEST GROUP 1: Project Creation Workflow & Gatekeeping
    // -------------------------------------------------------------
    console.log('--- 1. Project Creation Gatekeeping & Idempotency ---');

    const draftQuotation = {
        _id: new mongoose.Types.ObjectId(),
        quotationNumber: 'SES-Q2026-9001',
        status: 'PENDING_APPROVAL',
        customerName: 'Test Client Draft',
        plantCapacityKw: 3
    };

    // Rule: Project must NOT be created before customer acceptance
    let failedBeforeAcceptance = false;
    try {
        await ProjectService.createProjectFromQuotation(draftQuotation, managerBranch1);
    } catch (err) {
        failedBeforeAcceptance = true;
        assert(err.message.includes('CUSTOMER_ACCEPTED'), 'Rejected project creation for unaccepted quotation');
    }
    assert(failedBeforeAcceptance, 'Project creation blocked when quotation is not customer-accepted');
    console.log('  ✅ [PASS] Project creation strictly blocked before verified customer acceptance');

    // Create an Accepted Quotation
    const acceptedQuotation = {
        _id: new mongoose.Types.ObjectId(),
        quotationNumber: 'SES-Q2026-9002',
        status: 'CUSTOMER_ACCEPTED',
        customerName: 'Sangam Solar Client',
        customerMobile: '9826011223',
        customerEmail: 'sangam@example.com',
        customerAddress: 'Ward 12, Vidisha Road, Raisen (M.P.)',
        city: 'Raisen',
        plantCapacityKw: 5,
        systemType: 'ON_GRID',
        panelSpecs: '540W Mono PERC Half-Cut',
        panelQty: 10,
        inverterSpecs: '5kW On-Grid Dual MPPT Inverter',
        inverterQty: 1,
        structureSpecs: 'Hot-Dip Galvanized Elevated Structure',
        grandTotal: 185000,
        estimatedSubsidy: 78000,
        netPayableAfterSubsidy: 107000,
        advanceAmount: 37000,
        balanceAmount: 148000,
        assignedEmployee: engineer1._id,
        approvedBy: managerBranch1._id,
        branch: branch1Id,
        lineItems: [
            { description: 'Mono PERC Solar Panels 540W', quantity: 10, unit: 'Nos', sku: 'MP-540' },
            { description: '5kW Dual MPPT Solar Inverter', quantity: 1, unit: 'Set', sku: 'INV-5KW' }
        ]
    };

    // Project is created after verified customer acceptance
    const { project: createdProject, alreadyExists: initialExists } = await ProjectService.createProjectFromQuotation(acceptedQuotation, managerBranch1);
    assert.strictEqual(initialExists, false, 'Initial project creation marked alreadyExists as false');
    assert(createdProject.projectNumber.startsWith('SES-PRJ-'), 'Project number starts with SES-PRJ-');
    assert.strictEqual(createdProject.status, 'NOT_STARTED', 'Initial project status is NOT_STARTED');
    assert.strictEqual(createdProject.progressPercentage, 0, 'Initial progress percentage is 0%');
    assert.strictEqual(createdProject.capacityKw, 5, 'Capacity is 5 kW');
    assert.strictEqual(createdProject.customerContact.name, 'Sangam Solar Client', 'Customer name snapshot matched');
    assert.strictEqual(createdProject.materials.length, 2, 'Initial bill of materials populated from line items');
    assert.strictEqual(createdProject.tasks.length, 3, 'Initial milestone tasks populated');
    console.log('  ✅ [PASS] Project created successfully after verified customer acceptance with technical & material snapshots');

    // Prevent duplicate project creation for the same quotation
    const { project: dupProject, alreadyExists: secondExists } = await ProjectService.createProjectFromQuotation(acceptedQuotation, managerBranch1);
    assert.strictEqual(dupProject.projectNumber, createdProject.projectNumber, 'Same project returned for duplicate attempt');
    console.log('  ✅ [PASS] Duplicate project creation strictly prevented (idempotent)');

    // -------------------------------------------------------------
    // TEST GROUP 2: Strict RBAC & Multi-Branch Isolation
    // -------------------------------------------------------------
    console.log('\n--- 2. RBAC & Multi-Branch Isolation ---');

    // Employee 1 (Assigned) can access project
    const emp1Access = await ProjectService.getProjectById(createdProject._id, engineer1);
    assert.strictEqual(emp1Access.projectNumber, createdProject.projectNumber, 'Assigned employee accesses project');
    console.log('  ✅ [PASS] Assigned employee permitted to access project');

    // Employee 2 (Not assigned) is blocked with HTTP 403
    let emp2Blocked = false;
    try {
        await ProjectService.getProjectById(createdProject._id, engineer2);
    } catch (err) {
        emp2Blocked = true;
        assert.strictEqual(err.status, 403, 'Employee 2 access denied with HTTP 403 Forbidden');
    }
    assert(emp2Blocked, 'Unassigned employee strictly blocked from viewing project');
    console.log('  ✅ [PASS] Unassigned employee blocked from viewing project (HTTP 403)');

    // Manager of Branch 1 can access project
    const mgr1Access = await ProjectService.getProjectById(createdProject._id, managerBranch1);
    assert(mgr1Access, 'Manager of Branch 1 accesses project');

    // Manager of Branch 2 is blocked with HTTP 403 (Multi-Branch Isolation)
    let mgr2Blocked = false;
    try {
        await ProjectService.getProjectById(createdProject._id, managerBranch2);
    } catch (err) {
        mgr2Blocked = true;
        assert.strictEqual(err.status, 403, 'Manager from different branch denied with HTTP 403');
    }
    assert(mgr2Blocked, 'Different branch manager blocked from project');
    console.log('  ✅ [PASS] Multi-branch isolation enforced: Branch 2 manager denied access (HTTP 403)');

    // Super Admin can access all projects
    const adminAccess = await ProjectService.getProjectById(createdProject._id, superAdmin);
    assert(adminAccess, 'Super Admin accesses project');
    console.log('  ✅ [PASS] Super Admin authorized across all branch projects');

    // -------------------------------------------------------------
    // TEST GROUP 3: Controlled Status Progression & Mandatory Reasons
    // -------------------------------------------------------------
    console.log('\n--- 3. Controlled Status Progression & Mandatory Reason Safeguards ---');

    // Employee attempting to mark project COMPLETED is strictly rejected with HTTP 403 (Super Admin & Managers only)
    let empStatusBlocked = false;
    try {
        await ProjectService.updateProjectStatus(createdProject._id, 'COMPLETED', '', engineer1);
    } catch (err) {
        empStatusBlocked = true;
        assert.strictEqual(err.status, 403, 'Employee project completion blocked with HTTP 403');
    }
    assert(empStatusBlocked, 'Field employee strictly blocked from marking final project completion');
    console.log('  ✅ [PASS] Field employee denied permission to alter high-level project completion (HTTP 403)');

    // Placing ON_HOLD without a reason is strictly rejected
    let holdWithoutReasonBlocked = false;
    try {
        await ProjectService.updateProjectStatus(createdProject._id, 'ON_HOLD', '', managerBranch1);
    } catch (err) {
        holdWithoutReasonBlocked = true;
        assert(err.message.includes('reason is required'), 'Reason required for ON_HOLD');
    }
    assert(holdWithoutReasonBlocked, 'ON_HOLD without reason rejected');

    // Placing ON_HOLD with a documented reason succeeds
    const onHoldProj = await ProjectService.updateProjectStatus(createdProject._id, 'ON_HOLD', 'Customer civil masonry work pending on terrace', managerBranch1);
    assert.strictEqual(onHoldProj.status, 'ON_HOLD', 'Status updated to ON_HOLD');
    assert.strictEqual(onHoldProj.statusReason, 'Customer civil masonry work pending on terrace', 'Reason saved');
    console.log('  ✅ [PASS] ON_HOLD strictly requires documented reason');

    // Resuming back to MATERIAL_READY
    const readyProj = await ProjectService.updateProjectStatus(createdProject._id, 'MATERIAL_READY', 'Terrace parapet reinforced', managerBranch1);
    assert.strictEqual(readyProj.status, 'MATERIAL_READY', 'Status progressed to MATERIAL_READY');
    assert.strictEqual(readyProj.progressPercentage, 55, 'Progress percentage mapped to 55%');
    console.log('  ✅ [PASS] Progress percentage strictly mapped to status lifecycle (55%)');

    // -------------------------------------------------------------
    // TEST GROUP 4: Technical Site Survey Workflow & Manager Review
    // -------------------------------------------------------------
    console.log('\n--- 4. Site Survey Submission & Manager Clearance ---');

    // Site visit submission by assigned engineer
    const surveyData = {
        visitDate: '2026-11-15',
        roofSuitability: 'EXCELLENT',
        roofType: 'RCC Flat Roof',
        availableAreaSqFt: 450,
        shadowObservations: 'Clear south horizon. No tall trees or obstructions.',
        electricalConnectionDetails: 'Three-Phase 415V, 50Hz',
        sanctionedLoadKw: 5,
        inspectionRemarks: 'Roof slab structurally sound. Verified staircase access and inverter mounting space inside electrical shaft.'
    };

    const surveyedProj = await ProjectService.submitSiteVisit(createdProject._id, surveyData, engineer1);
    assert.strictEqual(surveyedProj.siteVisit.status, 'SUBMITTED', 'Site visit status is SUBMITTED');
    assert.strictEqual(surveyedProj.siteVisit.roofSuitability, 'EXCELLENT', 'Roof suitability saved');
    console.log('  ✅ [PASS] Site survey submitted with technical electrical & shadow observations');

    // Manager reviews and approves site survey
    const approvedSurveyProj = await ProjectService.reviewSiteVisit(createdProject._id, 'APPROVE', 'Survey verified. Cleared for structure erection.', managerBranch1);
    assert.strictEqual(approvedSurveyProj.siteVisit.status, 'APPROVED', 'Site visit marked APPROVED');
    assert.strictEqual(approvedSurveyProj.status, 'SITE_VISIT_COMPLETED', 'Project status advanced to SITE_VISIT_COMPLETED');
    assert.strictEqual(approvedSurveyProj.progressPercentage, 25, 'Progress advanced to 25%');
    console.log('  ✅ [PASS] Manager survey approval advances project to SITE_VISIT_COMPLETED (25%)');

    // -------------------------------------------------------------
    // TEST GROUP 5: Installation Task Assignment & Employee Scoping
    // -------------------------------------------------------------
    console.log('\n--- 5. Task Assignment & Employee Permissions ---');

    // Manager creates a new task assigned to engineer 1
    const newTaskData = {
        title: 'Hot-Dip Galvanized Structure Anchoring',
        description: 'Fasten elevated legs using M12 chemical anchors on RCC roof slab.',
        assignedTo: engineer1._id,
        priority: 'HIGH'
    };
    const taskProj = await ProjectService.createTask(createdProject._id, newTaskData, managerBranch1);
    const addedTask = taskProj.tasks[taskProj.tasks.length - 1];
    assert.strictEqual(addedTask.title, 'Hot-Dip Galvanized Structure Anchoring');
    console.log('  ✅ [PASS] Manager assigned new installation task');

    // Engineer 2 (not assigned to this task) cannot modify Engineer 1's task
    let emp2TaskBlocked = false;
    try {
        await ProjectService.updateTaskStatus(createdProject._id, addedTask.taskId, 'COMPLETED', 'Done', engineer2);
    } catch (err) {
        emp2TaskBlocked = true;
        assert.strictEqual(err.status, 403, 'Employee 2 task update blocked with HTTP 403');
    }
    assert(emp2TaskBlocked, 'Employee cannot modify tasks assigned to another colleague');
    console.log('  ✅ [PASS] Employee cannot modify tasks assigned to another staff member (HTTP 403)');

    // Engineer 1 (assigned) updates their task to COMPLETED
    const updatedTaskProj = await ProjectService.updateTaskStatus(createdProject._id, addedTask.taskId, 'COMPLETED', 'Anchored with Hilti chemical studs.', engineer1);
    const updatedTask = updatedTaskProj.tasks.find(t => t.taskId === addedTask.taskId);
    assert.strictEqual(updatedTask.status, 'COMPLETED', 'Task status is COMPLETED');
    assert(updatedTask.completionDate, 'Task completion date recorded');
    console.log('  ✅ [PASS] Assigned engineer updated task status with remarks & completion timestamp');

    // -------------------------------------------------------------
    // TEST GROUP 6: Material Allocation & Staging Clearance
    // -------------------------------------------------------------
    console.log('\n--- 6. Material Staging & Delivery Tracking ---');

    // Allocate & deliver materials
    const matProj = await ProjectService.updateMaterialItem(createdProject._id, 0, {
        allocatedQty: 10,
        deliveredQty: 10,
        status: 'DELIVERED',
        remarks: 'Batch #540-OCT-26 dispatched via company truck'
    }, managerBranch1);

    const firstMat = matProj.materials[0];
    assert.strictEqual(firstMat.allocatedQty, 10, 'Allocated 10 panels');
    assert.strictEqual(firstMat.deliveredQty, 10, 'Delivered 10 panels');
    assert.strictEqual(firstMat.pendingQty, 0, 'Pending quantity is 0');
    assert.strictEqual(firstMat.status, 'DELIVERED', 'Status marked DELIVERED');
    console.log('  ✅ [PASS] Bill of materials staged and delivered with pending quantity auto-reconciliation');

    // -------------------------------------------------------------
    // TEST GROUP 7: Secure Document Management & Private Downloads
    // -------------------------------------------------------------
    console.log('\n--- 7. Secure Project Attachments & Magic-Byte Validation ---');

    // Magic bytes verification
    const fakeExeHeader = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable
    const isValidFake = UploadService.validateMagicBytes(fakeExeHeader, 'image/jpeg');
    assert.strictEqual(isValidFake, false, 'Disguised executable with image/jpeg strictly rejected');

    const genuinePdf = Buffer.from('%PDF-1.4 genuine content here');
    const isValidPdf = UploadService.validateMagicBytes(genuinePdf, 'application/pdf');
    assert.strictEqual(isValidPdf, true, 'Genuine PDF magic bytes accepted');
    console.log('  ✅ [PASS] Magic-byte validation verifies genuine file signatures & blocks disguised executables');

    // -------------------------------------------------------------
    // TEST GROUP 8: Final Project Completion Rules
    // -------------------------------------------------------------
    console.log('\n--- 8. Project Completion Clearance Rules ---');

    // Mark remaining tasks complete to allow completion
    for (const t of createdProject.tasks) {
        t.status = 'COMPLETED';
    }

    // Attempting completion without Net Meter Number is rejected
    let compWithoutMeterBlocked = false;
    try {
        await ProjectService.completeProject(createdProject._id, { commissioningRemarks: 'Good', meterNumber: '' }, managerBranch1);
    } catch (err) {
        compWithoutMeterBlocked = true;
        assert(err.message.includes('Net-Meter number is required'), 'Net-Meter number required');
    }
    assert(compWithoutMeterBlocked, 'Completion without meter number blocked');
    console.log('  ✅ [PASS] Project completion strictly requires bidirectional net-meter number');

    // Complete project with full commissioning details
    const completedProj = await ProjectService.completeProject(createdProject._id, {
        meterNumber: 'MPPKVVCL-RSN-998822',
        commissioningRemarks: 'Solar plant synchronized with MPPKVVCL 11kV grid feeder. Export verified at 4.9 kW. PM Surya Ghar portal report generated.',
        synchronizationDate: '2026-11-15'
    }, managerBranch1);

    assert.strictEqual(completedProj.status, 'COMPLETED', 'Project status marked COMPLETED');
    assert.strictEqual(completedProj.progressPercentage, 100, 'Progress percentage is 100%');
    assert.strictEqual(completedProj.completionDetails.meterNumber, 'MPPKVVCL-RSN-998822', 'Meter number recorded');
    assert(completedProj.actualCompletionDate, 'Actual completion date recorded');
    console.log('  ✅ [PASS] Project certified 100% completed & grid-commissioned by branch manager');

    // -------------------------------------------------------------
    // TEST GROUP 9: Append-Only Activity Timeline Verification
    // -------------------------------------------------------------
    console.log('\n--- 9. Append-Only Activity Timeline Audit ---');

    const activityTimeline = await ProjectService.getProjectActivities(createdProject._id);
    assert(activityTimeline.length >= 4, `At least 4 activity milestones recorded (found ${activityTimeline.length})`);
    const actionTypes = activityTimeline.map(a => a.activityType);
    assert(actionTypes.includes('PROJECT_CREATED'), 'Timeline includes PROJECT_CREATED');
    assert(actionTypes.includes('SITE_VISIT_SUBMITTED'), 'Timeline includes SITE_VISIT_SUBMITTED');
    assert(actionTypes.includes('PROJECT_COMPLETED'), 'Timeline includes PROJECT_COMPLETED');
    console.log('  ✅ [PASS] Append-only activity timeline captures complete installation lifecycle');

    console.log('\n============================================================');
    console.log('🎯 PHASE 3 TESTS: ALL 20 SCENARIOS PASSED (100%)');
    console.log('============================================================\n');
}

runPhase3Tests().catch(err => {
    console.error('❌ PHASE 3 TEST SUITE FAILED:', err);
    process.exit(1);
});
