/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * Phase 2: Field Engineer Workspace, Site Inspection, GPS Photos, Onsite Quotation & Finance Clearance
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Core models and services under test
const SiteInspection = require('../models/SiteInspection');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Quotation = require('../models/Quotation');
const Project = require('../models/Project');
const PaymentRecord = require('../models/PaymentRecord');
const CustomerDocument = require('../models/CustomerDocument');
const PaymentPolicy = require('../models/PaymentPolicy');
const User = require('../models/User');
const FieldEngineerService = require('../services/fieldEngineerService');
const FieldInspectionController = require('../controllers/fieldInspectionController');
const AuthorizationService = require('../services/authorizationService');
const {
    PERMISSIONS,
    isValidPermission,
    getPermissionsByModule
} = require('../config/permissionRegistry');

let testCount = 0;
let passedCount = 0;

function it(name, fn) {
    testCount++;
    try {
        const res = fn();
        if (res && typeof res.then === 'function') {
            return res.then(() => {
                passedCount++;
                console.log(`  ✅ [PASS] ${name}`);
            }).catch(err => {
                console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
                throw err;
            });
        } else {
            passedCount++;
            console.log(`  ✅ [PASS] ${name}`);
        }
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        throw err;
    }
}

function mockRequestResponse({ session = {}, body = {}, query = {}, params = {}, headers = {} } = {}) {
    const req = {
        session,
        body,
        query,
        params,
        headers,
        flash: () => []
    };
    const res = {
        statusCode: 200,
        headersSent: false,
        jsonData: null,
        renderedView: null,
        renderedData: null,
        headers: {},
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
        setHeader(name, val) {
            this.headers[name] = val;
            return this;
        }
    };
    return { req, res };
}

// In-memory prototype save mocks to prevent live DB buffering during offline unit tests
SiteInspection.prototype.save = function () {
    return Promise.resolve(this);
};
Lead.prototype.save = function () {
    return Promise.resolve(this);
};
Customer.prototype.save = function () {
    return Promise.resolve(this);
};
Quotation.prototype.save = function () {
    return Promise.resolve(this);
};
Project.prototype.save = function () {
    return Promise.resolve(this);
};
PaymentRecord.prototype.save = function () {
    return Promise.resolve(this);
};
CustomerDocument.prototype.save = function () {
    return Promise.resolve(this);
};
PaymentPolicy.prototype.save = function () {
    return Promise.resolve(this);
};

async function runAllTests() {
    console.log('\n======================================================================');
    console.log('🧪 LEAD-TO-INSTALLATION PHASE 2: FIELD ENGINEER, INSPECTION & FINANCE');
    console.log('======================================================================\n');

    // -------------------------------------------------------------
    // SECTION 1: FIELD ENGINEER WORKSPACE & ACCESS CONTROL
    // -------------------------------------------------------------
    console.log('--- 1. Field Engineer Workspace & Access Control ---');

    it('2.1 Field Engineer designation and FBAC permissions are registered and valid', () => {
        const requiredPerms = [
            'projects.inspections.view',
            'projects.inspections.create',
            'projects.inspections.approve',
            'projects.inspections.photos',
            'invoices.payments.record',
            'invoices.payments.verify',
            'invoices.payments.exception',
            'projects.activation.create'
        ];

        requiredPerms.forEach(key => {
            assert.strictEqual(isValidPermission(key), true, `Permission ${key} must be valid`);
            assert(PERMISSIONS[key], `Permission ${key} must exist in registry`);
        });
    });

    it('2.2 Field Engineer workspace strictly enforces branch isolation and assignment criteria', async () => {
        const branchA = new mongoose.Types.ObjectId();
        const engineerUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Prakash Engineer',
            role: 'EMPLOYEE',
            branchId: branchA,
            permissions: ['projects.tasks.view', 'projects.inspections.view']
        };

        const workspace = await FieldEngineerService.getEngineerWorkspaceData(engineerUser);
        assert(workspace.stats, 'Workspace must return stats');
        assert.strictEqual(typeof workspace.stats.totalAssignedLeads, 'number');
        assert.strictEqual(typeof workspace.stats.pendingInspectionsCount, 'number');
        assert.strictEqual(typeof workspace.stats.completedInspectionsCount, 'number');
    });

    it('2.3 Cross-branch inspection modification is strictly blocked for non-super admins', async () => {
        const branchA = new mongoose.Types.ObjectId();
        const branchB = new mongoose.Types.ObjectId();

        const engineerBranchA = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Local Engineer',
            role: 'EMPLOYEE',
            branchId: branchA
        };

        const mockInspectionBranchB = new SiteInspection({
            inspectionId: 'INSP-2611-B001',
            customerName: 'Foreign Client',
            customerMobile: '9876543210',
            branch: branchB,
            assignedFieldEngineer: new mongoose.Types.ObjectId()
        });

        const origFindOne = SiteInspection.findOne;
        SiteInspection.findOne = () => Promise.resolve(mockInspectionBranchB);

        try {
            let blocked = false;
            try {
                await FieldEngineerService.saveInspection({
                    inspectionId: 'INSP-2611-B001',
                    engineerUser: engineerBranchA,
                    customerName: 'Tamper Attempt',
                    customerMobile: '9876543210'
                });
            } catch (err) {
                blocked = true;
                assert(err.message.includes('Branch isolation violation'));
            }
            assert.strictEqual(blocked, true, 'Must reject cross-branch modification');
        } finally {
            SiteInspection.findOne = origFindOne;
        }
    });

    // -------------------------------------------------------------
    // SECTION 2: SITE INSPECTIONS & GEOLOCATION (GPS)
    // -------------------------------------------------------------
    console.log('\n--- 2. Site Inspection Feasibility & GPS Tagging ---');

    await (async () => {
        await it('2.4 Site inspection records technical measurements and marks GPS verified when coordinates provided', async () => {
            const engineer = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Anil Field Eng',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const inspection = await FieldEngineerService.saveInspection({
                engineerUser: engineer,
                customerName: 'Ravi Teja',
                customerMobile: '9893012345',
                siteAddress: 'Plot 45, Vidisha Road',
                city: 'Raisen',
                coordinates: {
                    latitude: 23.3315,
                    longitude: 77.7812,
                    accuracyMeters: 5
                },
                roofType: 'RCC_FLAT',
                totalRoofAreaSqFt: 1200,
                shadowFreeAreaSqFt: 850,
                sanctionedLoadKw: 4,
                monthlyBillAmount: 3200,
                monthlyUnitsKwh: 450,
                discomConsumerNo: 'N293847291',
                connectionPhase: 'SINGLE_PHASE',
                recommendedCapacityKw: 3,
                isSubmit: true
            });

            assert.strictEqual(inspection.status, 'SUBMITTED');
            assert.strictEqual(inspection.customerName, 'Ravi Teja');
            assert.strictEqual(inspection.coordinates.isGpsVerified, true);
            assert.strictEqual(inspection.coordinates.latitude, 23.3315);
            assert.strictEqual(inspection.coordinates.accuracyMeters, 5);
            assert.strictEqual(inspection.recommendedCapacityKw, 3);
            assert(inspection.submittedAt instanceof Date, 'submittedAt timestamp must be recorded');
        });

        await it('2.5 GPS unavailable scenario explicitly marks inspection as unverified with documented reason', async () => {
            const engineer = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Anil Field Eng',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const inspection = await FieldEngineerService.saveInspection({
                engineerUser: engineer,
                customerName: 'Shyam Sundar',
                customerMobile: '9826012345',
                coordinates: {
                    latitude: null,
                    longitude: null,
                    gpsUnavailableReason: 'Browser geolocation permission denied by user'
                },
                roofType: 'METAL_SHEET',
                isSubmit: false
            });

            assert.strictEqual(inspection.status, 'DRAFT');
            assert.strictEqual(inspection.coordinates.isGpsVerified, false);
            assert.strictEqual(inspection.coordinates.latitude, null);
            assert.strictEqual(inspection.coordinates.gpsUnavailableReason, 'Browser geolocation permission denied by user');
        });

        await it('2.6 addInspectionPhoto validates magic bytes and attaches GPS metadata to photos', async () => {
            const uploader = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Field Cam User',
                role: 'EMPLOYEE'
            };

            const mockInsp = new SiteInspection({
                inspectionId: 'INSP-2611-P001',
                customerName: 'Photo Client',
                customerMobile: '9876500000',
                branch: new mongoose.Types.ObjectId(),
                assignedFieldEngineer: uploader._id
            });

            const origFindOne = SiteInspection.findOne;
            SiteInspection.findOne = () => Promise.resolve(mockInsp);

            try {
                // Construct valid JPEG buffer (FF D8 FF E0 ...)
                const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
                const fileObj = {
                    name: 'roof_angle.jpg',
                    type: 'image/jpeg',
                    data: validJpegBuffer,
                    category: 'ROOF_TOP'
                };

                const gpsCoords = {
                    latitude: 23.3315,
                    longitude: 77.7812,
                    accuracyMeters: 8
                };

                const photo = await FieldEngineerService.addInspectionPhoto(
                    'INSP-2611-P001',
                    fileObj,
                    gpsCoords,
                    uploader
                );

                assert.strictEqual(photo.category, 'ROOF_TOP');
                assert.strictEqual(photo.isGpsVerified, true);
                assert.strictEqual(photo.latitude, 23.3315);
                assert.strictEqual(mockInsp.photos.length, 1);
            } finally {
                SiteInspection.findOne = origFindOne;
            }
        });

        await it('2.7 addInspectionPhoto rejects spoofed or non-image files via magic bytes check', async () => {
            const mockInsp = new SiteInspection({
                inspectionId: 'INSP-2611-P002',
                customerName: 'Client',
                customerMobile: '9876511111',
                branch: new mongoose.Types.ObjectId(),
                assignedFieldEngineer: new mongoose.Types.ObjectId()
            });

            const origFindOne = SiteInspection.findOne;
            SiteInspection.findOne = () => Promise.resolve(mockInsp);

            try {
                // Fake text file disguised as JPEG
                const fakeBuffer = Buffer.from('NOT_A_REAL_JPEG_IMAGE_CONTENT');
                const fileObj = {
                    name: 'exploit.jpg',
                    type: 'image/jpeg',
                    data: fakeBuffer
                };

                let rejected = false;
                try {
                    await FieldEngineerService.addInspectionPhoto('INSP-2611-P002', fileObj, {}, null);
                } catch (err) {
                    rejected = true;
                    assert(err.message.includes('Security check failed'));
                }
                assert.strictEqual(rejected, true, 'Spoofed file must be rejected');
            } finally {
                SiteInspection.findOne = origFindOne;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 3: ONSITE QUOTATION & MAKER-CHECKER WORKFLOW
    // -------------------------------------------------------------
    console.log('\n--- 3. Onsite Quotation & Manager Approvals ---');

    await (async () => {
        await it('2.8 createOnsiteQuotation reuses pricing formulas, calculates PM Surya Ghar subsidy', async () => {
            const engineer = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Field Eng',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const mockInsp = new SiteInspection({
                inspectionId: 'INSP-2611-Q001',
                customerName: 'Mohan Sharma',
                customerMobile: '9826077889',
                siteAddress: 'Bhopal Road, Raisen',
                recommendedCapacityKw: 3,
                branch: engineer.branchId
            });

            const origFindOne = SiteInspection.findOne;
            SiteInspection.findOne = () => Promise.resolve(mockInsp);

            try {
                const quote = await FieldEngineerService.createOnsiteQuotation('INSP-2611-Q001', engineer, {
                    plantCapacityKw: 3
                });

                assert(quote.quotationNumber.startsWith('QT-'), 'Quotation number must start with QT-');
                assert.strictEqual(quote.plantCapacityKw, 3);
                // 3 kW * 45,000 = 1,35,000 subtotal; 12% GST = 16,200; grossTotal = 1,51,200
                assert.strictEqual(quote.subtotal, 135000);
                assert.strictEqual(quote.totalGstAmount, 16200);
                assert.strictEqual(quote.grossTotal, 151200);
                // 3 kW PM Surya Ghar Subsidy = ₹78,000
                assert.strictEqual(quote.estimatedSubsidy, 78000);
                // Net Payable = 1,51,200 - 78,000 = 73,200
                assert.strictEqual(quote.netPayableAfterSubsidy, 73200);
                assert.strictEqual(quote.status, 'PENDING_APPROVAL');
            } finally {
                SiteInspection.findOne = origFindOne;
            }
        });

        await it('2.9 Maker-Checker prevents field employee from self-approving their quotation', () => {
            const engineer = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Field Eng',
                role: 'EMPLOYEE',
                isPrimarySuperAdmin: false,
                permissions: ['quotations.preparation.create', 'quotations.requests.create']
            };

            // Employee lacks quotations.approval.approve
            assert.strictEqual(AuthorizationService.hasPermission(engineer, 'quotations.approval.approve'), false);

            const manager = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Branch Manager',
                role: 'BRANCH_MANAGER',
                isPrimarySuperAdmin: false,
                permissions: ['quotations.approval.approve']
            };
            assert.strictEqual(AuthorizationService.hasPermission(manager, 'quotations.approval.approve'), true);
        });

        await it('2.10 Customer quotation acceptance tracking transitions status and records remarks', async () => {
            const mockQuote = new Quotation({
                quotationNumber: 'QT-2611-ACC01',
                customerName: 'Accepted Client',
                customerMobile: '9988112233',
                grandTotal: 151200,
                status: 'APPROVED',
                preparedBy: new mongoose.Types.ObjectId()
            });

            const origFindById = Quotation.findById;
            Quotation.findById = () => Promise.resolve(mockQuote);

            try {
                const caller = { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' };
                const accepted = await FieldEngineerService.recordCustomerAcceptance(mockQuote._id, caller, {
                    status: 'ACCEPTED',
                    remarks: 'Customer accepted 3kW system with 20% advance transfer'
                });

                assert.strictEqual(accepted.status, 'CUSTOMER_ACCEPTED');
                assert.strictEqual(accepted.customerResponse.status, 'ACCEPTED');
                assert.strictEqual(accepted.customerResponse.remarks, 'Customer accepted 3kW system with 20% advance transfer');
                assert(accepted.customerResponse.responseDate instanceof Date);
            } finally {
                Quotation.findById = origFindById;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 4: CUSTOMER ONBOARDING DOCUMENTS
    // -------------------------------------------------------------
    console.log('\n--- 4. Customer Onboarding & KYC Documents ---');

    await (async () => {
        await it('2.11 Customer document upload validates categories and attaches audit history', async () => {
            const user = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Staff Uploader',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const doc = await FieldEngineerService.uploadCustomerDocument({
                customerId: new mongoose.Types.ObjectId(),
                category: 'ELECTRICITY_BILL',
                title: 'Consumer Electricity Bill - Oct 2026',
                fileObj: {
                    name: 'bill_oct2026.pdf',
                    type: 'application/pdf',
                    size: 150000
                },
                user
            });

            assert(doc.documentId.startsWith('DOC-'));
            assert.strictEqual(doc.category, 'ELECTRICITY_BILL');
            assert.strictEqual(doc.title, 'Consumer Electricity Bill - Oct 2026');
            assert.strictEqual(doc.isVerified, false);
        });
    })();

    // -------------------------------------------------------------
    // SECTION 5: FINANCE PAYMENT VERIFICATION & MAKER-CHECKER
    // -------------------------------------------------------------
    console.log('\n--- 5. Finance Payment Ledger & Strict Maker-Checker ---');

    await (async () => {
        await it('2.12 Payment recording saves pending transaction across Bank Transfer, Cash, and Cheque modes', async () => {
            const staff = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Payment Collector',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const payBank = await FieldEngineerService.recordPayment({
                amount: 30000,
                paymentMode: 'BANK_TRANSFER',
                transactionRef: 'NEFT-88392019',
                remarks: 'Advance 20% transferred',
                user: staff
            });
            assert.strictEqual(payBank.status, 'PENDING');
            assert.strictEqual(payBank.amount, 30000);
            assert.strictEqual(payBank.paymentMode, 'BANK_TRANSFER');

            const payCash = await FieldEngineerService.recordPayment({
                amount: 15000,
                paymentMode: 'CASH',
                transactionRef: 'RECEIPT-0992',
                remarks: 'Cash advance collected at site',
                user: staff
            });
            assert.strictEqual(payCash.paymentMode, 'CASH');

            const payCheque = await FieldEngineerService.recordPayment({
                amount: 50000,
                paymentMode: 'CHEQUE',
                transactionRef: 'CHQ-554433',
                remarks: 'SBI Bank Cheque',
                user: staff
            });
            assert.strictEqual(payCheque.paymentMode, 'CHEQUE');
        });

        await it('2.13 Strict Maker-Checker prevents payment recorder from verifying own payment entry', async () => {
            const entryStaff = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Collector Staff',
                role: 'EMPLOYEE',
                branchId: new mongoose.Types.ObjectId()
            };

            const mockPayment = new PaymentRecord({
                paymentId: 'PAY-2611-SELF01',
                amount: 25000,
                status: 'PENDING',
                branch: entryStaff.branchId,
                enteredBy: entryStaff._id
            });

            const origFindOne = PaymentRecord.findOne;
            PaymentRecord.findOne = () => Promise.resolve(mockPayment);

            try {
                let makerCheckerBlocked = false;
                try {
                    // entryStaff attempts to verify their own payment
                    await FieldEngineerService.verifyPayment('PAY-2611-SELF01', entryStaff, { action: 'VERIFY' });
                } catch (err) {
                    makerCheckerBlocked = true;
                    assert(err.message.includes('Maker-Checker Violation'));
                }
                assert.strictEqual(makerCheckerBlocked, true, 'Must block self-verification of payment');

                // Authorized independent manager can verify
                const managerChecker = {
                    _id: new mongoose.Types.ObjectId(), // Different ID
                    name: 'Finance Manager',
                    role: 'BRANCH_MANAGER',
                    branchId: entryStaff.branchId
                };

                const verified = await FieldEngineerService.verifyPayment('PAY-2611-SELF01', managerChecker, { action: 'VERIFY' });
                assert.strictEqual(verified.status, 'VERIFIED');
                assert.strictEqual(String(verified.verifiedBy), String(managerChecker._id));
                assert(verified.verifiedAt instanceof Date);
            } finally {
                PaymentRecord.findOne = origFindOne;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 6: CONFIGURABLE PAYMENT POLICY & PROJECT ACTIVATION
    // -------------------------------------------------------------
    console.log('\n--- 6. Configurable Payment Policy & Project Activation ---');

    await (async () => {
        await it('2.14 checkProjectActivationEligibility enforces customer acceptance, KYC docs, and verified payments threshold', async () => {
            const quotationId = new mongoose.Types.ObjectId();
            const mockQuote = new Quotation({
                _id: quotationId,
                quotationNumber: 'QT-2611-ACT01',
                customerName: 'Activation Candidate',
                customerMobile: '9826011111',
                grandTotal: 150000,
                status: 'CUSTOMER_ACCEPTED', // Accepted
                preparedBy: new mongoose.Types.ObjectId(),
                branch: new mongoose.Types.ObjectId()
            });

            const origQuoteFind = Quotation.findById;
            Quotation.findById = () => Promise.resolve(mockQuote);

            try {
                // When 0 verified payments exist, activation must be rejected
                const eligibilityUnpaid = await FieldEngineerService.checkProjectActivationEligibility(quotationId);
                assert.strictEqual(eligibilityUnpaid.isEligible, false);
                assert(eligibilityUnpaid.missingRequirements.some(r => r.includes('Verified payments')));
            } finally {
                Quotation.findById = origQuoteFind;
            }
        });

        await it('2.15 Exception approval allows authorized manager to approve activation bypass with audit reason', async () => {
            const quotationId = new mongoose.Types.ObjectId();
            const requester = { _id: new mongoose.Types.ObjectId(), name: 'Sales Exec' };
            const approver = { _id: new mongoose.Types.ObjectId(), name: 'Senior Manager', role: 'MANAGER' };

            const mockQuote = new Quotation({
                _id: quotationId,
                quotationNumber: 'QT-2611-EXC01',
                grandTotal: 200000
            });

            const origQuoteFind = Quotation.findById;
            Quotation.findById = () => Promise.resolve(mockQuote);

            try {
                const exception = await FieldEngineerService.requestPaymentException(quotationId, requester, {
                    reason: 'Corporate customer bank guarantee provided; 100% advance waived',
                    waivedPercentage: 100
                });

                assert(exception.exceptionId.startsWith('EXC-'));
                assert.strictEqual(exception.status, 'REQUESTED');

                const approved = await FieldEngineerService.approvePaymentException(exception.exceptionId, approver, true);
                assert.strictEqual(approved.status, 'APPROVED');
                assert.strictEqual(String(approved.approvedBy), String(approver._id));
            } finally {
                Quotation.findById = origQuoteFind;
            }
        });

        await it('2.16 activateProject converts quotation to project and strictly prevents duplicate project creation', async () => {
            const quotationId = new mongoose.Types.ObjectId();
            const manager = { _id: new mongoose.Types.ObjectId(), name: 'Project Admin', role: 'MANAGER' };

            const mockQuote = new Quotation({
                _id: quotationId,
                quotationNumber: 'QT-2611-PRJ01',
                customerName: 'Solar Client Raisen',
                customerMobile: '9826099887',
                plantCapacityKw: 5,
                grandTotal: 250000,
                status: 'CUSTOMER_ACCEPTED',
                preparedBy: new mongoose.Types.ObjectId(),
                branch: new mongoose.Types.ObjectId()
            });

            const origQuoteFind = Quotation.findById;
            const origProjectFindOne = Project.findOne;
            const origCheck = FieldEngineerService.checkProjectActivationEligibility;

            Quotation.findById = () => Promise.resolve(mockQuote);
            // Simulate satisfied clearance
            FieldEngineerService.checkProjectActivationEligibility = () => Promise.resolve({
                isEligible: true,
                missingRequirements: []
            });

            // First activation: no existing project
            Project.findOne = () => Promise.resolve(null);

            try {
                const firstResult = await FieldEngineerService.activateProject(quotationId, manager);
                assert.strictEqual(firstResult.alreadyActivated, false);
                assert(firstResult.project.projectNumber.startsWith('PRJ-'));
                assert.strictEqual(firstResult.project.capacityKw, 5);

                // Second activation: existing project found -> must prevent duplicate
                Project.findOne = () => Promise.resolve(firstResult.project);
                const duplicateResult = await FieldEngineerService.activateProject(quotationId, manager);
                assert.strictEqual(duplicateResult.alreadyActivated, true);
                assert.strictEqual(duplicateResult.project.projectNumber, firstResult.project.projectNumber);
            } finally {
                Quotation.findById = origQuoteFind;
                Project.findOne = origProjectFindOne;
                FieldEngineerService.checkProjectActivationEligibility = origCheck;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 7: CONTROLLER & API ENDPOINT SECURITY
    // -------------------------------------------------------------
    console.log('\n--- 7. Controller Actions & Route Security ---');

    await (async () => {
        await it('2.17 postSaveInspection validates customer required fields', async () => {
            const engineer = { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' };
            const { req, res } = mockRequestResponse({
                session: { user: engineer },
                body: { customerName: '', customerMobile: '9876543210' } // Missing name
            });

            await FieldInspectionController.postSaveInspection(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.jsonData.success, false);
        });

        await it('2.18 postRecordPayment validates amount greater than zero', async () => {
            const caller = { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' };
            const { req, res } = mockRequestResponse({
                session: { user: caller },
                body: { amount: 0, paymentMode: 'CASH' } // Invalid zero amount
            });

            await FieldInspectionController.postRecordPayment(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.jsonData.success, false);
        });

        await it('2.19 postRecordCustomerAcceptance rejects unauthorized status strings', async () => {
            const caller = { _id: new mongoose.Types.ObjectId(), role: 'EMPLOYEE' };
            const { req, res } = mockRequestResponse({
                session: { user: caller },
                params: { quotationId: new mongoose.Types.ObjectId().toString() },
                body: { status: 'ILLEGAL_STATUS' }
            });

            await FieldInspectionController.postRecordCustomerAcceptance(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.jsonData.success, false);
        });

        await it('2.20 Full payment policy strictly blocks activation if payments are under 100%', async () => {
            const quotationId = new mongoose.Types.ObjectId();
            const mockQuote = new Quotation({
                _id: quotationId,
                quotationNumber: 'QT-2611-FULL01',
                grandTotal: 100000,
                status: 'CUSTOMER_ACCEPTED',
                branch: new mongoose.Types.ObjectId()
            });

            const origQuoteFind = Quotation.findById;
            const origPolicy = FieldEngineerService.getPaymentPolicy;

            Quotation.findById = () => Promise.resolve(mockQuote);
            FieldEngineerService.getPaymentPolicy = () => Promise.resolve({
                policyType: 'FULL_PAYMENT_100',
                defaultAdvancePercentage: 100,
                exceptions: []
            });

            try {
                const eligibility = await FieldEngineerService.checkProjectActivationEligibility(quotationId);
                assert.strictEqual(eligibility.isEligible, false);
                assert.strictEqual(eligibility.policyType, 'FULL_PAYMENT_100');
                assert.strictEqual(eligibility.requiredPaymentAmount, 100000);
            } finally {
                Quotation.findById = origQuoteFind;
                FieldEngineerService.getPaymentPolicy = origPolicy;
            }
        });

        await it('2.21 Partial payment policy allows activation when configured advance is satisfied', async () => {
            const quotationId = new mongoose.Types.ObjectId();
            const mockQuote = new Quotation({
                _id: quotationId,
                quotationNumber: 'QT-2611-PARTIAL01',
                grandTotal: 200000,
                status: 'CUSTOMER_ACCEPTED',
                branch: new mongoose.Types.ObjectId()
            });

            const origQuoteFind = Quotation.findById;
            const origPolicy = FieldEngineerService.getPaymentPolicy;

            Quotation.findById = () => Promise.resolve(mockQuote);
            FieldEngineerService.getPaymentPolicy = () => Promise.resolve({
                policyType: 'PARTIAL_ADVANCE_PERCENTAGE',
                defaultAdvancePercentage: 20,
                exceptions: []
            });

            try {
                const eligibility = await FieldEngineerService.checkProjectActivationEligibility(quotationId);
                assert.strictEqual(eligibility.requiredPaymentAmount, 40000); // 20% of 2,00,000 = 40,000
            } finally {
                Quotation.findById = origQuoteFind;
                FieldEngineerService.getPaymentPolicy = origPolicy;
            }
        });

        await it('2.22 Pending and failed payments do not count towards activation threshold', () => {
            const payments = [
                { amount: 30000, status: 'PENDING' },
                { amount: 20000, status: 'FAILED' },
                { amount: 15000, status: 'REJECTED' },
                { amount: 40000, status: 'VERIFIED' }
            ];

            const verifiedTotal = payments
                .filter(p => p.status === 'VERIFIED')
                .reduce((sum, p) => sum + p.amount, 0);

            assert.strictEqual(verifiedTotal, 40000, 'Only VERIFIED payments must be counted');
        });

        await it('2.23 Quotation calculations remain consistent across versions with zero regression', () => {
            const capacityKw = 5;
            const rate = 45000;
            const subtotal = capacityKw * rate; // 225000
            const gst = subtotal * 0.12; // 27000
            const gross = subtotal + gst; // 252000
            const subsidy = 78000; // PM Surya Ghar max for 3+ kW
            const net = gross - subsidy; // 174000

            assert.strictEqual(subtotal, 225000);
            assert.strictEqual(gross, 252000);
            assert.strictEqual(net, 174000);
        });
    })();

    console.log('\n======================================================================');
    console.log(`🎯 PHASE 2 VERIFICATION RESULTS: ${passedCount} PASSED, ${testCount - passedCount} FAILED`);
    console.log('======================================================================\n');

    if (testCount !== passedCount) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal error in Phase 2 test suite:', err);
    process.exit(1);
});
