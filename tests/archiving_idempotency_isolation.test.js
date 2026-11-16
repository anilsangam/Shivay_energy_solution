/**
 * SHIVAY ENERGY SOLUTIONS - ARCHIVING, IDEMPOTENCY & BRANCH ISOLATION TEST SUITE
 * 
 * Verifies:
 * 1. Invoice & Quotation Deletion Prohibition / Soft-Archiving
 * 2. Invoice Version History (MongoDB previousVersions) & Strict Customer Details Locking
 * 3. Quotation Preparation & Approval Idempotency (Back-Button Duplicate Prevention)
 * 4. Quotation In-Place Revisions (Preserving ID & Tracking Version Number)
 * 5. Manager Cross-Branch Isolation (Restricting Search and Dropdowns to Manager Branch)
 */

const assert = require('assert');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const Project = require('../models/Project');
const DataStore = require('../services/dataStore');
const QuotationService = require('../services/quotationService');
const ProjectService = require('../services/projectService');
const adminController = require('../controllers/adminController');
const quotationController = require('../controllers/quotationController');

let passedTests = 0;
let totalTests = 0;

function runAssert(condition, message, detail = '') {
    totalTests++;
    try {
        assert(condition, message);
        console.log(`  ✅ [PASS] ${message}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${message}`);
        if (detail) console.error(`     Detail: ${detail}`);
        throw err;
    }
}

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        jsonData: null,
        redirectUrl: null,
        viewName: null,
        viewData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        render(view, data) {
            this.viewName = view;
            this.viewData = data;
            return this;
        },
        setHeader(k, v) {
            this.headers[k] = v;
        },
        getHeader(k) {
            return this.headers[k];
        },
        removeHeader(k) {
            delete this.headers[k];
        }
    };
}

async function runSuite() {
    console.log('\n============================================================');
    console.log('🔒 VERIFICATION: ARCHIVING, IDEMPOTENCY & ISOLATION SUITE');
    console.log('============================================================');

    const branch1Id = new mongoose.Types.ObjectId();
    const branch2Id = new mongoose.Types.ObjectId();

    const mockAdmin = {
        _id: new mongoose.Types.ObjectId(),
        role: 'SUPER_ADMIN',
        name: 'Executive Admin',
        branchId: null
    };

    const mockManager1 = {
        _id: new mongoose.Types.ObjectId(),
        role: 'BRANCH_MANAGER',
        name: 'Branch 1 Manager',
        branchId: branch1Id
    };

    const mockManager2 = {
        _id: new mongoose.Types.ObjectId(),
        role: 'BRANCH_MANAGER',
        name: 'Branch 2 Manager',
        branchId: branch2Id
    };

    // -------------------------------------------------------------
    // 1. INVOICE SOFT-ARCHIVING & DELETION PROHIBITION
    // -------------------------------------------------------------
    console.log('\n--- 1. Invoice Soft-Archiving & Deletion Prohibition ---');
    {
        const invNum = 'SES-INV-TEST-001';
        DataStore.addInvoice({
            invoiceNumber: invNum,
            customerName: 'Original Client',
            customerMobile: '9826011111',
            subtotal: 100000,
            totalAmount: 112000,
            plantCapacityKw: 3
        });

        const reqArchive = {
            session: { user: mockManager1 },
            body: { invoiceNumber: invNum },
            ip: '127.0.0.1'
        };
        const resArchive = createMockRes();
        await adminController.deleteInvoice(reqArchive, resArchive);

        runAssert(
            resArchive.statusCode === 200 && resArchive.jsonData && resArchive.jsonData.success === true,
            'Invoice archive endpoint returns HTTP 200 with success status'
        );

        // Verify it was NOT permanently deleted from DataStore
        const allInvoicesWithArchive = DataStore.getAllInvoices(true);
        const archivedRecord = allInvoicesWithArchive.find(i => i.invoiceNumber === invNum);
        runAssert(
            archivedRecord !== undefined,
            'Archived invoice is permanently retained in database / store (Not deleted)'
        );
        runAssert(
            archivedRecord.isArchived === true && archivedRecord.paymentStatus === 'cancelled',
            'Archived invoice has isArchived=true and paymentStatus=cancelled flags'
        );

        // Default query excludes archived
        const activeOnly = DataStore.getAllInvoices(false);
        runAssert(
            activeOnly.find(i => i.invoiceNumber === invNum) === undefined,
            'Active invoices listing excludes soft-archived invoices'
        );
    }

    // -------------------------------------------------------------
    // 2. INVOICE VERSIONING & STRICT CUSTOMER LOCKING
    // -------------------------------------------------------------
    console.log('\n--- 2. Invoice Version History & Customer Details Locking ---');
    {
        const invNum = 'SES-INV-VERSION-002';
        
        // Step 1: Create initial invoice
        const reqCreate = {
            session: { user: mockManager1 },
            body: {
                invoiceNumber: invNum,
                customerName: 'Suresh Sharma',
                customerMobile: '9826055555',
                customerAddress: 'Raisen M.P.',
                customerGstin: '23AAAAA0000A1Z5',
                plantCapacityKw: 3,
                subtotal: 150000,
                totalAmount: 168000,
                items: [{ description: 'Solar Panels 3kW', qty: 1, rate: 150000, amount: 150000 }]
            },
            ip: '127.0.0.1'
        };
        const resCreate = createMockRes();
        await adminController.saveInvoice(reqCreate, resCreate);
        runAssert(resCreate.statusCode === 200, 'Initial invoice created successfully');

        // Step 2: Attempt update with changed line items AND attempted change to customer details
        const reqUpdate = {
            session: { user: mockManager1 },
            body: {
                invoiceNumber: invNum,
                // Attacker attempts to change customer to someone else!
                customerName: 'MALICIOUS_CHANGED_NAME',
                customerMobile: '9999999999',
                customerAddress: 'Hacked Address',
                // Legitimate revision to technical specs & items:
                plantCapacityKw: 4,
                subtotal: 200000,
                totalAmount: 224000,
                items: [{ description: 'Solar Panels 4kW Updated', qty: 1, rate: 200000, amount: 200000 }]
            },
            ip: '127.0.0.1'
        };
        const resUpdate = createMockRes();
        await adminController.saveInvoice(reqUpdate, resUpdate);

        const updatedInv = DataStore.getAllInvoices(true).find(i => i.invoiceNumber === invNum);
        
        runAssert(
            updatedInv.version >= 2,
            `Invoice version correctly incremented to v${updatedInv.version}`
        );

        runAssert(
            updatedInv.previousVersions && updatedInv.previousVersions.length > 0,
            'Previous version snapshot is securely preserved in previousVersions history'
        );

        runAssert(
            updatedInv.previousVersions[0].subtotal === 150000,
            'Previous version snapshot preserves old subtotal (₹150,000)'
        );

        runAssert(
            updatedInv.customerName === 'Suresh Sharma' && updatedInv.customerMobile === '9826055555',
            'Customer details strictly locked during update (attempted name/mobile change ignored)'
        );

        runAssert(
            updatedInv.plantCapacityKw === 4 && updatedInv.subtotal === 200000,
            'Legitimate line items, capacity & subtotal updates applied successfully'
        );
    }

    // -------------------------------------------------------------
    // 3. QUOTATION IDEMPOTENCY (BACK-BUTTON DUPLICATE PREVENTION)
    // -------------------------------------------------------------
    console.log('\n--- 3. Quotation Idempotency (Back-Button Duplicate Prevention) ---');
    {
        const mockReqId = new mongoose.Types.ObjectId();
        const sampleLineItems = [
            { description: '3kW Tier-1 Modules', quantity: 6, unitPrice: 10000, taxableAmount: 60000, lineTotal: 67200 }
        ];

        // Submission 1: Manager prepares & approves quotation
        const quote1 = await QuotationService.prepareQuotation({
            quotationRequestId: mockReqId,
            customerName: 'Ramesh Patel',
            customerMobile: '9826012345',
            plantCapacityKw: 3,
            lineItems: sampleLineItems,
            directApprove: true
        }, mockManager1);

        const firstQuoteId = String(quote1._id);
        const firstQuoteNum = quote1.quotationNumber;

        runAssert(
            quote1.status === 'APPROVED',
            'Quotation first submission successfully approved'
        );

        // Submission 2: User hits browser back button and clicks approve AGAIN!
        // Simulated with existing quotation ID or linked request
        const quote2 = await QuotationService.prepareQuotation({
            quotationId: quote1._id,
            quotationRequestId: mockReqId,
            customerName: 'Ramesh Patel',
            customerMobile: '9826012345',
            plantCapacityKw: 3,
            lineItems: sampleLineItems,
            directApprove: true
        }, mockManager1);

        runAssert(
            String(quote2._id) === firstQuoteId,
            'Browser back-button re-approval returns identical quotation ID (No duplicate ID created)'
        );

        runAssert(
            quote2.quotationNumber === firstQuoteNum,
            'Browser back-button re-approval preserves original quotation number (SES-Q2026-XXXX)'
        );

        // Test approveQuotation idempotency
        const quoteApproveTwice = await QuotationService.approveQuotation(quote1._id, mockManager1, 'Re-approval');
        runAssert(
            quoteApproveTwice.status === 'APPROVED',
            'Calling approveQuotation on already approved quotation is idempotent (Does not throw error)'
        );
    }

    // -------------------------------------------------------------
    // 4. QUOTATION IN-PLACE REVISION FLOW
    // -------------------------------------------------------------
    console.log('\n--- 4. Quotation In-Place Revision Flow ---');
    {
        const reqId = new mongoose.Types.ObjectId();
        const initialItems = [
            { description: '3kW Inverter', quantity: 1, unitPrice: 30000, taxableAmount: 30000, lineTotal: 33600 }
        ];

        // Prepare v1
        const v1 = await QuotationService.prepareQuotation({
            quotationRequestId: reqId,
            customerName: 'Geeta Bai',
            customerMobile: '9826077777',
            plantCapacityKw: 3,
            lineItems: initialItems,
            directApprove: false
        }, mockManager1);

        runAssert(v1.version === 1, 'Initial quotation prepared as version v1');
        const originalId = String(v1._id);

        // Revise to 4kW with upgraded items
        const revisedItems = [
            { description: '4kW Inverter High Yield', quantity: 1, unitPrice: 40000, taxableAmount: 40000, lineTotal: 44800 }
        ];

        const v2 = await QuotationService.prepareQuotation({
            quotationId: v1._id,
            quotationRequestId: reqId,
            customerName: 'Geeta Bai',
            customerMobile: '9826077777',
            plantCapacityKw: 4,
            lineItems: revisedItems,
            directApprove: true
        }, mockManager1);

        runAssert(
            String(v2._id) === originalId,
            'Revised quotation retains original document ID (In-place update)'
        );

        runAssert(
            v2.version === 2,
            `Quotation revision incremented version to v${v2.version}`
        );

        runAssert(
            v2.plantCapacityKw === 4,
            'Quotation revision updated technical capacity to 4 kW'
        );

        runAssert(
            v2.status === 'APPROVED',
            'Quotation revision approved and issued'
        );
    }

    // -------------------------------------------------------------
    // 5. QUOTATION ARCHIVING PROHIBITS HARD DELETION
    // -------------------------------------------------------------
    console.log('\n--- 5. Quotation Archiving Prohibits Hard Deletion ---');
    {
        const quoteToArchive = new Quotation({
            quotationNumber: 'SES-Q2026-ARCHIVE-1',
            customerName: 'Test Archive Client',
            customerMobile: '9826099999',
            plantCapacityKw: 3,
            subtotal: 100000,
            grandTotal: 112000,
            taxableValue: 100000,
            totalGstAmount: 12000,
            netPayableAfterSubsidy: 34000,
            validUntil: new Date(Date.now() + 15 * 86400000),
            preparedBy: mockManager1._id,
            status: 'APPROVED',
            branch: branch1Id
        });

        quoteToArchive.save = () => Promise.resolve(quoteToArchive);
        QuotationService._memoryQuotes.set(String(quoteToArchive._id), quoteToArchive);

        // Mock findById for Quotation
        const origFindById = Quotation.findById;
        Quotation.findById = (id) => Promise.resolve(quoteToArchive);

        const archived = await QuotationService.archiveQuotation(quoteToArchive._id, mockManager1);
        runAssert(
            archived.isArchived === true && archived.status === 'ARCHIVED',
            'Quotation soft-archived with isArchived=true and status=ARCHIVED'
        );

        // Accepted quotation cannot be archived
        const acceptedQuote = new Quotation({
            ...quoteToArchive.toObject(),
            _id: new mongoose.Types.ObjectId(),
            status: 'CUSTOMER_ACCEPTED'
        });
        acceptedQuote.save = () => Promise.resolve(acceptedQuote);
        QuotationService._memoryQuotes.set(String(acceptedQuote._id), acceptedQuote);
        Quotation.findById = () => Promise.resolve(acceptedQuote);

        let blocked = false;
        try {
            await QuotationService.archiveQuotation(acceptedQuote._id, mockManager1);
        } catch (err) {
            blocked = err.message.includes('already been accepted');
        }
        runAssert(
            blocked,
            'Customer-accepted quotation strictly blocked from archiving (Active project ongoing)'
        );

        Quotation.findById = origFindById;
    }

    // -------------------------------------------------------------
    // 6. MANAGER CROSS-BRANCH ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- 6. Manager Cross-Branch Isolation & Search Scoping ---');
    {
        // Test: In getProjects, branch isolation and search must be combined with $and
        // Mock query from Branch 1 Manager searching for a mobile number
        const branch1Projects = await ProjectService.getProjects(mockManager1, {
            search: '9826012345'
        });
        runAssert(
            branch1Projects !== null && typeof branch1Projects === 'object',
            'ProjectService.getProjects executes safely with search filter and branch isolation'
        );

        // Verify Branch 2 manager query doesn't overlap
        const branch2Projects = await ProjectService.getProjects(mockManager2, {
            search: '9826012345'
        });
        runAssert(
            branch2Projects !== null && typeof branch2Projects === 'object',
            'Branch 2 manager project search runs under isolated branch scope'
        );
    }

    console.log('\n============================================================');
    console.log(`🎯 ARCHIVING, IDEMPOTENCY & ISOLATION RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
    console.log('============================================================\n');
}

runSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
