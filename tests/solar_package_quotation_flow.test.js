const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const mongoose = require('mongoose');

const {
    QUOTATION_PRICING_POLICY,
    SOLAR_PACKAGES,
    EXTRA_MATERIAL_PRESETS,
    getPackageById,
    evaluatePackagePricing
} = require('../config/solarPackages');
const QuotationService = require('../services/quotationService');
const QuotationController = require('../controllers/quotationController');
const Quotation = require('../models/Quotation');

async function runTests() {
    let passed = 0;
    console.log('\n======================================================================');
    console.log('☀️ SOLAR GRID PACKAGE CATALOG & EMPLOYEE QUOTATION GOVERNANCE TESTS');
    console.log('======================================================================');

    // 1. Catalog verification
    const waaree3kw = getPackageById('dcr-3kw-waaree');
    assert(waaree3kw && waaree3kw.standardRate === 180000 && waaree3kw.subsidyAmount === 78000);
    assert.strictEqual(waaree3kw.unitPerDay, '12-15 Units/Day');
    const oswalNdcr3 = getPackageById('ndcr-3kw-oswal');
    assert(oswalNdcr3 && oswalNdcr3.standardRate === 152000 && oswalNdcr3.subsidyAmount === 0);
    const tata52 = getPackageById('dcr-5_2kw-tata');
    assert(tata52 && tata52.standardRate === 310000 && tata52.capacityKw === 5.2);
    assert(SOLAR_PACKAGES.length >= 34, 'Expected full September 2026 package catalog');
    console.log('  ✅ [PASS] 1. September 2026 Solar Package Catalog loaded with normalized fields');
    passed++;

    // 2. Tax-inclusive calculation
    const taxIncFin = QuotationService.calculateFinancials({
        lineItems: [{ description: '3kW Waaree DCR', quantity: 1, unit: 'Package', unitPrice: 180000, discount: 0, gstRate: 12 }],
        plantCapacityKw: 3,
        customerType: 'RESIDENTIAL',
        customerState: 'Madhya Pradesh',
        pricingMode: 'TAX_INCLUSIVE',
        subsidyOverride: 78000
    });
    assert.strictEqual(taxIncFin.grandTotal, 180000, 'Tax-inclusive package must NOT add GST on top');
    assert.strictEqual(Number((taxIncFin.taxableValue + taxIncFin.totalGstAmount).toFixed(2)), 180000, 'Taxable + GST must equal grandTotal');
    assert.strictEqual(Number((taxIncFin.cgstAmount + taxIncFin.sgstAmount).toFixed(2)), taxIncFin.totalGstAmount);
    assert.strictEqual(taxIncFin.netPayableAfterSubsidy, 102000);
    console.log('  ✅ [PASS] 2. Tax-Inclusive package math extracts GST cleanly inside package price');
    passed++;

    const mockEmp = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Vikram Solanki',
        role: 'EMPLOYEE',
        branchId: new mongoose.Types.ObjectId()
    };

    // 3. Employee self-service auto-approval (2% discount <= 3% & <= ₹10,000 & above min threshold)
    const autoRes = await QuotationService.createEmployeePackageQuotation({
        customerName: 'Ramesh Sharma',
        customerMobile: '9826012345',
        customerAddress: 'Indrapuri Bhopal',
        packageId: 'dcr-3kw-waaree',
        discountPercent: 2
    }, mockEmp);
    assert.strictEqual(autoRes.autoApproved, true, '2% discount must auto-approve');
    assert.strictEqual(autoRes.quotation.status, 'APPROVED');
    assert.strictEqual(autoRes.quotation.approvalMode, 'AUTO_THRESHOLD');
    assert.strictEqual(autoRes.quotation.grandTotal, 176400);
    assert.strictEqual(autoRes.quotation.pricingMode, 'TAX_INCLUSIVE');
    assert.strictEqual(autoRes.quotation.netPayableAfterSubsidy, 98400);
    console.log('  ✅ [PASS] 3. Employee 2% discount above minimum threshold auto-approves for instant sharing');
    passed++;

    // 3b. Employee quotation with extra materials (auto-approved within 3% & <= ₹10,000)
    const extraRes = await QuotationService.createEmployeePackageQuotation({
        customerName: 'Suresh Tiwari',
        customerMobile: '9826055555',
        customerAddress: 'Arera Colony Bhopal',
        packageId: 'dcr-3kw-waaree',
        extraMaterials: [
            { description: 'Elevated GI Structure Upgrade', quantity: 1, unit: 'Set', unitPrice: 12000 },
            { description: 'Extra DC Wire 4 sq.mm', quantity: 20, unit: 'Mtr', unitPrice: 100 }
        ],
        discountPercent: 2
    }, mockEmp);
    assert.strictEqual(extraRes.quotation.lineItems.length, 3, 'Package + 2 extra material line items expected');
    assert.strictEqual(extraRes.quotation.grossTotal, 194000, 'Gross total should equal 180000 + 14000');
    assert.strictEqual(extraRes.quotation.grandTotal, 190120, '2% discount on 194000 = 190120');
    assert.strictEqual(extraRes.autoApproved, true, '2% discount (₹3,880) with extra materials should auto-approve');
    console.log('  ✅ [PASS] 3b. Extra materials + 2% discount calculate GST-inclusively and auto-approve');
    passed++;

    // 4. Higher discount (> 3% / > ₹10,000) routes to Manager Approval
    const mgrReqRes = await QuotationService.createEmployeePackageQuotation({
        customerName: 'Mahesh Patidar',
        customerMobile: '9826099999',
        customerAddress: 'Raisen M.P.',
        packageId: 'dcr-5_2kw-tata',
        discountAmount: 12000 // > ₹10,000 cap (even though ~3.87% > 3% as well)
    }, mockEmp);
    assert.strictEqual(mgrReqRes.autoApproved, false, 'Discount > ₹10,000 / 3% must require manager approval');
    assert.strictEqual(mgrReqRes.quotation.status, 'PENDING_APPROVAL');
    assert.strictEqual(mgrReqRes.quotation.requiresManagerApproval, true);
    assert.strictEqual(mgrReqRes.quotation.approvalMode, 'MANAGER_REQUIRED');
    console.log('  ✅ [PASS] 4. Discount exceeding fixed threshold requires Manager approval & locks sharing');
    passed++;

    // 5. Hard minimum project floor rejection
    let rejectedBelowFloor = false;
    try {
        await QuotationService.createEmployeePackageQuotation({
            customerName: 'Lowball Test',
            customerMobile: '9826011111',
            customerAddress: 'Bhopal',
            packageId: 'dcr-3kw-waaree',
            discountAmount: 35000 // 145000 < 153000 hard floor
        }, mockEmp);
    } catch (err) {
        rejectedBelowFloor = /Minimum Project Threshold Violation/i.test(err.message);
    }
    assert.strictEqual(rejectedBelowFloor, true, 'Quote below project floor must be rejected');
    console.log('  ✅ [PASS] 5. Quotes below hard minimum project price floor are rejected');
    passed++;

    // 6. Verify public acceptance route blocks PENDING_APPROVAL quotes
    const origFindOne = Quotation.findOne;
    Quotation.findOne = async () => mgrReqRes.quotation;
    try {
        let capturedStatus = null;
        let capturedBody = null;
        await QuotationController.postPublicAcceptance({
            params: { token: mgrReqRes.quotation.customerResponse.acceptanceToken },
            body: { response: 'ACCEPTED' }
        }, {
            status(code) { capturedStatus = code; return this; },
            json(payload) { capturedBody = payload; return this; }
        });
        assert.strictEqual(capturedStatus, 403, 'Public acceptance of unapproved quote must return 403');
        assert(capturedBody && capturedBody.success === false);
        console.log('  ✅ [PASS] 6. Public client acceptance rejects PENDING_APPROVAL quotations');
        passed++;
    } finally {
        Quotation.findOne = origFindOne;
    }

    // 7. EJS compile & render verification for all updated views
    const genPath = path.resolve('views/private/employee/quotation-generate.ejs');
    const empListPath = path.resolve('views/private/employee/quotations.ejs');
    const docPath = path.resolve('views/private/admin/quotation-document.ejs');

    const mockUser = { _id: mockEmp._id, name: 'Vikram', role: 'EMPLOYEE', permissions: ['*'] };
    const genHtml = ejs.render(fs.readFileSync(genPath, 'utf8'), {
        title: 'Generate Quotation',
        company: { name: 'Shivay Energy Solutions', address: {}, contact: {} },
        data: { company: {} },
        user: mockUser,
        currentUser: mockUser,
        packages: SOLAR_PACKAGES,
        extraPresets: EXTRA_MATERIAL_PRESETS,
        pricingPolicy: QUOTATION_PRICING_POLICY,
        parentUrl: '/employee/quotations',
        csrfToken: 'test-csrf',
        activePage: 'employee-quotations-generate',
        currentActive: 'employee-quotations-generate',
        pendingEmployeesCount: 0,
        unreadNotificationsCount: 0
    }, { filename: genPath });
    assert(genHtml.includes('Generate Quotation') && genHtml.includes('dcr-3kw-waaree'));
    assert(genHtml.includes('col-6 col-md-4'), 'Mobile 2-per-row package grid class col-6 col-md-4 missing');
    assert(genHtml.includes('Extra Materials') && genHtml.includes('Elevated GI Mounting Structure'), 'Extra materials UI missing');

    const docHtml = ejs.render(fs.readFileSync(docPath, 'utf8'), {
        title: 'Doc',
        company: { name: 'Shivay Energy Solutions' },
        quotation: extraRes.quotation,
        isUnapprovedPreview: false,
        autoPrint: false
    }, { filename: docPath });
    assert(docHtml.includes('1,90,120') && docHtml.includes('Elevated GI Structure Upgrade'), 'Tax-inclusive PDF must display package total + extra material items');

    const unapprovedDocHtml = ejs.render(fs.readFileSync(docPath, 'utf8'), {
        title: 'Doc Draft',
        company: { name: 'Shivay Energy Solutions' },
        quotation: mgrReqRes.quotation,
        isUnapprovedPreview: true,
        autoPrint: false
    }, { filename: docPath });
    assert(unapprovedDocHtml.includes('AWAITING MANAGER APPROVAL'), 'Unapproved preview must warn not valid for client issuance');

    const empListHtml = ejs.render(fs.readFileSync(empListPath, 'utf8'), {
        title: 'My Quotations',
        company: { name: 'Shivay Energy Solutions' },
        user: mockUser,
        currentUser: mockUser,
        requests: [],
        quotations: [autoRes.quotation, mgrReqRes.quotation],
        stats: { totalRequests: 0, pendingRequests: 0, revisionRequested: 0, approvedQuotations: 1, acceptedQuotations: 0, rejectedQuotations: 0 },
        statusFilter: 'ALL',
        csrfToken: 'test-csrf',
        activePage: 'employee-quotations',
        currentActive: 'employee-quotations',
        pendingEmployeesCount: 0,
        unreadNotificationsCount: 0
    }, { filename: empListPath });
    assert(empListHtml.includes('/employee/quotations/generate') && empListHtml.includes('AUTO-APPROVED') && empListHtml.includes('MGR APPROVAL'));

    console.log('  ✅ [PASS] 7. EJS views (generator, list, tax-inclusive document) render cleanly');
    passed++;

    console.log(`\n🎯 SOLAR PACKAGE QUOTATION TEST SUITE: ${passed} / 7 TESTS PASSED (100%)\n`);
}

runTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
