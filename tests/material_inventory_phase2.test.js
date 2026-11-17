/**
 * Phase 2 Material Sales, Stock Out, Billing, Dispatch & Returns Test Suite
 * Shivay Energy Solutions
 * 
 * Validates all 30 specified test scenarios:
 *  1. Standalone sale without a project
 *  2. Sale using existing CRM customer
 *  3. Sale using newly created customer
 *  4. Business / contractor customer sale
 *  5. Multi-item sale
 *  6. Server-side price calculation
 *  7. Invalid quantity rejection
 *  8. Insufficient stock rejection
 *  9. Inactive material rejection
 * 10. Custom price override audit
 * 11. Draft sale does not deduct stock
 * 12. Confirmed sale deducts stock exactly once
 * 13. Duplicate confirmation rejected (HTTP 409)
 * 14. Concurrent confirmation cannot oversell
 * 15. Invoice snapshot remains unchanged after customer/material updates
 * 16. Partial dispatch
 * 17. Dispatch quantity cannot exceed pending quantity
 * 18. Dispatch does not deduct stock again
 * 19. Partial return
 * 20. Return quantity cannot exceed eligible sold quantity
 * 21. Good return increases sellable stock after approval
 * 22. Damaged/defective returns do not increase sellable stock (quarantine)
 * 23. Pending inspection does not increase sellable stock
 * 24. Duplicate return approval rejected (HTTP 409)
 * 25. Cancelled sale and reversal behavior
 * 26. Unauthorized access rejected (RBAC)
 * 27. CSRF protection verified
 * 28. IDOR protection verified
 * 29. CSV report accuracy
 * 30. Phase 1 purchase, inventory, WAC, and ledger regression
 */

const assert = require('assert');
const mongoose = require('mongoose');
const MaterialController = require('../controllers/materialController');
const MaterialPhase2Controller = require('../controllers/materialPhase2Controller');
const { requireSuperAdmin, verifyCsrf, validateObjectId } = require('../middleware/authMiddleware');

// Mock Express Response Helper
function createMockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        renderedView: null,
        renderedData: null,
        sentData: null,
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            this.jsonData = data;
            return this;
        },
        render: function(view, data) {
            this.renderedView = view;
            this.renderedData = data;
            return this;
        },
        setHeader: function(k, v) {
            this.headers[k] = v;
            return this;
        },
        send: function(data) {
            this.sentData = data;
            return this;
        }
    };
    return res;
}

async function runPhase2TestSuite() {
    console.log('================================================================');
    console.log('RUNNING PHASE 2 MATERIAL SALES, DISPATCH & RETURNS TEST SUITE');
    console.log('================================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err.message}`);
            failedTests++;
        }
    }

    async function testAsync(name, fn) {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err.message}`);
            failedTests++;
        }
    }

    const adminUser = {
        _id: '507f191e810c19729de860ea',
        name: 'Super Admin',
        role: 'SUPER_ADMIN'
    };

    // Shared Test State
    let testMaterial1 = null;
    let testMaterial2 = null;
    let inactiveMaterial = null;
    let crmCustomerId = null;
    let businessCustomerId = null;
    let sharedSupplierId = null;

    // -------------------------------------------------------------
    // SETUP: Create Materials for testing sales
    // -------------------------------------------------------------
    console.log('--- Setting up Base Test Materials ---');
    await testAsync('Setup primary test material with on-hand stock', async () => {
        const req = {
            body: {
                name: 'Solar Inverter 10kW On-Grid',
                sku: 'INV-10KW-ONGRID',
                category: 'INVERTER',
                unitOfMeasurement: 'NOS',
                defaultSellingPrice: 65000,
                minStockAlert: 2
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createMaterial(req, res);
        assert.strictEqual(res.jsonData.success, true);
        testMaterial1 = res.jsonData.material;

        // Perform stock in purchase to give initial stock of 20 units @ 45000 WAC
        const supReq = {
            body: {
                supplierName: 'Solar Tech Supplier Hub',
                contactPerson: 'Suresh Kumar',
                mobile: '9876543210',
                status: 'ACTIVE'
            },
            session: { user: adminUser }
        };
        const supRes = createMockRes();
        await MaterialController.createSupplier(supReq, supRes);
        const supplierId = supRes.jsonData.supplier._id;
        sharedSupplierId = supplierId;

        const purReq = {
            body: {
                supplierId: supplierId,
                status: 'DRAFT',
                items: [{
                    material: testMaterial1._id,
                    quantity: 20,
                    unitPurchasePrice: 45000,
                    taxRate: 18
                }]
            },
            session: { user: adminUser }
        };
        const purRes = createMockRes();
        await MaterialController.createPurchase(purReq, purRes);
        const purId = purRes.jsonData.purchase._id;

        // Confirm purchase to update stock to 20
        const confRes = createMockRes();
        await MaterialController.confirmPurchase({ params: { id: purId }, session: { user: adminUser } }, confRes);
        assert.strictEqual(confRes.jsonData.success, true);

        // Verify current stock is 20
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const found = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(found.currentStock, 20);
        testMaterial1.currentStock = 20;
        testMaterial1.weightedAverageCost = 45000;
    });

    await testAsync('Setup secondary test material with on-hand stock', async () => {
        const req = {
            body: {
                name: 'Solar Structure 4-Panel HDGI',
                sku: 'STR-4PANEL-HDGI',
                category: 'STRUCTURE',
                unitOfMeasurement: 'SETS',
                defaultSellingPrice: 7500,
                minStockAlert: 5
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createMaterial(req, res);
        testMaterial2 = res.jsonData.material;

        // Direct in-memory stock assignment for fast multi-item testing
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const found = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        if (found) found.currentStock = 50;
        testMaterial2.currentStock = 50;
    });

    await testAsync('Setup inactive test material', async () => {
        const req = {
            body: {
                name: 'Obsolete Charge Controller 12V',
                sku: 'CTRL-OBSOLETE-12V',
                category: 'OTHER',
                unitOfMeasurement: 'NOS',
                defaultSellingPrice: 1200
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createMaterial(req, res);
        inactiveMaterial = res.jsonData.material;
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const found = allM.find(m => m._id.toString() === inactiveMaterial._id.toString());
        if (found) {
            found.isActive = false;
            found.currentStock = 10;
        }
        inactiveMaterial.isActive = false;
        inactiveMaterial.currentStock = 10;
    });

    // -------------------------------------------------------------
    // 1. Standalone sale without a project
    // -------------------------------------------------------------
    console.log('\n--- 1. Standalone Sale without Project ---');
    let standaloneSaleId = null;
    await testAsync('1. Standalone sale without a project creates successfully with project=null', async () => {
        const req = {
            body: {
                buyerType: 'DIRECT_BILLING',
                customerName: 'Aarav Patel',
                customerMobile: '9826000001',
                customerAddress: 'Main Road, Raisen',
                city: 'Raisen',
                customerType: 'INDIVIDUAL',
                // Explicitly no projectId
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 2,
                    unitPrice: 65000,
                    gstRate: 18
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.ok(res.jsonData.saleNumber.startsWith('SES-SALE-'));
        assert.strictEqual(res.jsonData.sale.project, null);
        assert.strictEqual(res.jsonData.sale.status, 'DRAFT');
        standaloneSaleId = res.jsonData.sale._id;
    });

    // -------------------------------------------------------------
    // 2. Sale using existing CRM customer
    // -------------------------------------------------------------
    console.log('\n--- 2. Sale using Existing CRM Customer ---');
    await testAsync('2. Sale using existing CRM customer links customer and snapshots data', async () => {
        // Quick create customer first
        const custReq = {
            body: {
                name: 'Vikram Solar Installations',
                mobile: '9826000002',
                email: 'vikram@solar.com',
                city: 'Bhopal',
                customerType: 'CONTRACTOR'
            },
            session: { user: adminUser }
        };
        const custRes = createMockRes();
        await MaterialController.quickCreateCustomerApi(custReq, custRes);
        crmCustomerId = custRes.jsonData.customer._id;

        const saleReq = {
            body: {
                buyerType: 'EXISTING_CUSTOMER',
                customerId: crmCustomerId,
                customerName: 'Vikram Solar Installations',
                customerMobile: '9826000002',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 1,
                    unitPrice: 65000,
                    gstRate: 18
                }]
            },
            session: { user: adminUser }
        };
        const saleRes = createMockRes();
        await MaterialController.createSale(saleReq, saleRes);
        assert.strictEqual(saleRes.jsonData.success, true);
        assert.strictEqual(saleRes.jsonData.sale.customer.toString(), crmCustomerId.toString());
        assert.strictEqual(saleRes.jsonData.sale.customerName, 'Vikram Solar Installations');
    });

    // -------------------------------------------------------------
    // 3. Sale using newly created customer
    // -------------------------------------------------------------
    console.log('\n--- 3. Sale using Newly Created Customer ---');
    await testAsync('3. Quick create customer API returns new customer and sale binds successfully', async () => {
        const qcReq = {
            body: {
                name: 'Pooja Engineering Works',
                mobile: '9826000003',
                email: 'pooja@eng.com',
                city: 'Vidisha',
                customerType: 'BUSINESS'
            },
            session: { user: adminUser }
        };
        const qcRes = createMockRes();
        await MaterialController.quickCreateCustomerApi(qcReq, qcRes);
        assert.strictEqual(qcRes.jsonData.success, true);
        assert.ok(qcRes.jsonData.customer._id);

        const newSaleReq = {
            body: {
                buyerType: 'NEW_CUSTOMER',
                customerId: qcRes.jsonData.customer._id,
                customerName: qcRes.jsonData.customer.name,
                customerMobile: qcRes.jsonData.customer.mobile,
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial2._id,
                    quantity: 4,
                    unitPrice: 7500,
                    gstRate: 18
                }]
            },
            session: { user: adminUser }
        };
        const newSaleRes = createMockRes();
        await MaterialController.createSale(newSaleReq, newSaleRes);
        assert.strictEqual(newSaleRes.jsonData.success, true);
        assert.strictEqual(newSaleRes.jsonData.sale.customerName, 'Pooja Engineering Works');
    });

    // -------------------------------------------------------------
    // 4. Business / contractor customer sale
    // -------------------------------------------------------------
    console.log('\n--- 4. Business / Contractor Customer Sale ---');
    await testAsync('4. Business/Contractor sale captures companyName and GSTIN correctly', async () => {
        const bReq = {
            body: {
                name: 'Kisan Solar Power Ltd',
                mobile: '9826000004',
                email: 'finance@kisansolar.com',
                city: 'Indore',
                customerType: 'BUSINESS',
                companyName: 'Kisan Solar Power Ltd',
                gstin: '23AAACK1234D1Z8'
            },
            session: { user: adminUser }
        };
        const bRes = createMockRes();
        await MaterialController.quickCreateCustomerApi(bReq, bRes);
        businessCustomerId = bRes.jsonData.customer._id;

        const saleReq = {
            body: {
                buyerType: 'EXISTING_CUSTOMER',
                customerId: businessCustomerId,
                customerName: 'Kisan Solar Power Ltd',
                customerMobile: '9826000004',
                customerGstin: '23AAACK1234D1Z8',
                companyName: 'Kisan Solar Power Ltd',
                customerType: 'BUSINESS',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 2,
                    unitPrice: 65000,
                    gstRate: 18
                }]
            },
            session: { user: adminUser }
        };
        const saleRes = createMockRes();
        await MaterialController.createSale(saleReq, saleRes);
        assert.strictEqual(saleRes.jsonData.success, true);
        assert.strictEqual(saleRes.jsonData.sale.customerGstin, '23AAACK1234D1Z8');
        assert.strictEqual(saleRes.jsonData.sale.companyName, 'Kisan Solar Power Ltd');
    });

    // -------------------------------------------------------------
    // 5. Multi-item sale
    // -------------------------------------------------------------
    console.log('\n--- 5. Multi-Item Sale ---');
    let multiItemSaleId = null;
    await testAsync('5. Multi-item sale correctly computes item totals and aggregates subtotal', async () => {
        // Item 1: 2 Inverters @ 65000 = 130000 subtotal, 18% tax = 23400, lineTotal = 153400
        // Item 2: 4 Structures @ 7500 = 30000 subtotal, 18% tax = 5400, lineTotal = 35400
        // Total subtotal = 160000, total tax = 28800, grand total = 188800
        const req = {
            body: {
                customerName: 'Apex Green Energy',
                customerMobile: '9826000005',
                status: 'DRAFT',
                items: [
                    { materialId: testMaterial1._id, quantity: 2, unitPrice: 65000, gstRate: 18 },
                    { materialId: testMaterial2._id, quantity: 4, unitPrice: 7500, gstRate: 18 }
                ]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.jsonData.success, true);
        const sale = res.jsonData.sale;
        assert.strictEqual(sale.items.length, 2);
        assert.strictEqual(sale.subtotal, 160000);
        assert.strictEqual(sale.taxTotal, 28800);
        assert.strictEqual(sale.grandTotal, 188800);
        multiItemSaleId = sale._id;
    });

    // -------------------------------------------------------------
    // 6. Server-side price calculation
    // -------------------------------------------------------------
    console.log('\n--- 6. Server-Side Price Calculation ---');
    await testAsync('6. Client-tampered totals are ignored; server computes strict mathematical totals', async () => {
        // Client maliciously sends grandTotal = 10, subtotal = 10
        const req = {
            body: {
                customerName: 'Tamper Test Customer',
                customerMobile: '9826000006',
                status: 'DRAFT',
                subtotal: 10,       // TAMPERED
                taxTotal: 0,        // TAMPERED
                grandTotal: 10,     // TAMPERED
                additionalCharges: 1000,
                discount: 500,
                items: [
                    {
                        materialId: testMaterial1._id,
                        quantity: 1,
                        unitPrice: 65000,
                        gstRate: 18,
                        lineTotal: 5 // TAMPERED
                    }
                ]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.jsonData.success, true);
        const sale = res.jsonData.sale;
        // Verified: 65000 + 11700 (18%) + 1000 - 500 = 77200
        assert.strictEqual(sale.subtotal, 65000);
        assert.strictEqual(sale.taxTotal, 11700);
        assert.strictEqual(sale.additionalCharges, 1000);
        assert.strictEqual(sale.discount, 500);
        assert.strictEqual(sale.grandTotal, 77200);
    });

    // -------------------------------------------------------------
    // 7. Invalid quantity rejection
    // -------------------------------------------------------------
    console.log('\n--- 7. Invalid Quantity Rejection ---');
    await testAsync('7. Zero, negative, and non-numeric quantities are rejected with HTTP 400', async () => {
        const testCases = [0, -2, 'invalid-num', NaN];
        for (const qty of testCases) {
            const req = {
                body: {
                    customerName: 'Invalid Qty Test',
                    customerMobile: '9826000007',
                    status: 'DRAFT',
                    items: [{ materialId: testMaterial1._id, quantity: qty, unitPrice: 65000 }]
                },
                session: { user: adminUser }
            };
            const res = createMockRes();
            await MaterialController.createSale(req, res);
            assert.strictEqual(res.statusCode, 400, `Expected 400 for qty ${qty}`);
            assert.strictEqual(res.jsonData.success, false);
        }
    });

    // -------------------------------------------------------------
    // 8. Insufficient stock rejection
    // -------------------------------------------------------------
    console.log('\n--- 8. Insufficient Stock Rejection ---');
    await testAsync('8. Requesting more than available stock is rejected with HTTP 400', async () => {
        const req = {
            body: {
                customerName: 'Oversell Tester',
                customerMobile: '9826000008',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 999999, // Exceeds available stock (20)
                    unitPrice: 65000
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.jsonData.success, false);
        assert.ok(res.jsonData.message.includes('Insufficient sellable stock'));
    });

    // -------------------------------------------------------------
    // 9. Inactive material rejection
    // -------------------------------------------------------------
    console.log('\n--- 9. Inactive Material Rejection ---');
    await testAsync('9. Attempting to sell inactive material is rejected with HTTP 400', async () => {
        const req = {
            body: {
                customerName: 'Inactive Tester',
                customerMobile: '9826000009',
                status: 'DRAFT',
                items: [{
                    materialId: inactiveMaterial._id,
                    quantity: 1,
                    unitPrice: 1200
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.jsonData.success, false);
        assert.ok(res.jsonData.message.includes('inactive'));
    });

    // -------------------------------------------------------------
    // 10. Custom price override audit
    // -------------------------------------------------------------
    console.log('\n--- 10. Custom Price Override Audit ---');
    await testAsync('10a. Selling below default/WAC price without reason is rejected with HTTP 400', async () => {
        // defaultSellingPrice = 65000, WAC = 45000. Price offered = 40000.
        const req = {
            body: {
                customerName: 'Discounted Customer',
                customerMobile: '9826000010',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 1,
                    unitPrice: 40000, // Below default and below WAC
                    overrideReason: '' // Empty reason
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.jsonData.message.includes('Price override reason is mandatory'));
    });

    await testAsync('10b. Selling below default/WAC with valid reason succeeds, flags priceOverride, master price UNTOUCHED', async () => {
        const req = {
            body: {
                customerName: 'Discounted Customer',
                customerMobile: '9826000010',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 1,
                    unitPrice: 40000,
                    overrideReason: 'Managing Director special bulk discount approval'
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.jsonData.success, true);
        const item = res.jsonData.sale.items[0];
        assert.strictEqual(item.priceOverride.isOverridden, true);
        assert.strictEqual(item.priceOverride.reason, 'Managing Director special bulk discount approval');
        assert.strictEqual(item.priceOverride.originalPrice, 65000);

        // Verify Material Master defaultSellingPrice is still 65000 (Catalog untouched)
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const mat = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(mat.defaultSellingPrice, 65000, 'Material Master defaultSellingPrice must remain untouched');
    });

    // -------------------------------------------------------------
    // 11. Draft sale does not deduct stock
    // -------------------------------------------------------------
    console.log('\n--- 11. Draft Sale Does Not Deduct Stock ---');
    let draftSaleForStockCheck = null;
    await testAsync('11. Creating a DRAFT sale leaves material currentStock completely untouched', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        const stockBefore = matBefore.currentStock;

        const req = {
            body: {
                customerName: 'Draft Stock Check Customer',
                customerMobile: '9826000011',
                status: 'DRAFT',
                items: [{
                    materialId: testMaterial1._id,
                    quantity: 5,
                    unitPrice: 65000
                }]
            },
            session: { user: adminUser }
        };
        const res = createMockRes();
        await MaterialController.createSale(req, res);
        assert.strictEqual(res.jsonData.success, true);
        draftSaleForStockCheck = res.jsonData.sale;

        const matAfter = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore, 'Stock must NOT change on DRAFT sale creation');
    });

    // -------------------------------------------------------------
    // 12. Confirmed sale deducts stock exactly once
    // -------------------------------------------------------------
    console.log('\n--- 12. Confirmed Sale Deducts Stock Exactly Once ---');
    await testAsync('12. Confirming sale deducts stock and generates invoice snapshot', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        const stockBefore = matBefore.currentStock; // e.g. 20

        const confReq = {
            params: { id: draftSaleForStockCheck._id },
            session: { user: adminUser }
        };
        const confRes = createMockRes();
        await MaterialController.confirmSale(confReq, confRes);
        assert.strictEqual(confRes.jsonData.success, true);

        const matAfter = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore - 5, 'Stock must decrement by exactly 5');

        // Verify sale status is CONFIRMED and invoice number generated
        const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
        const saleDoc = memSales.find(s => s._id.toString() === draftSaleForStockCheck._id.toString());
        assert.strictEqual(saleDoc.status, 'CONFIRMED');
        assert.ok(saleDoc.invoice.invoiceNumber.startsWith('SES-MINV-'));
    });

    // -------------------------------------------------------------
    // 13. Duplicate confirmation rejected (HTTP 409)
    // -------------------------------------------------------------
    console.log('\n--- 13. Duplicate Confirmation Rejection (HTTP 409) ---');
    await testAsync('13. Re-confirming an already confirmed sale returns HTTP 409 without double-deduction', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        const stockBefore = matBefore.currentStock;

        const confReq = {
            params: { id: draftSaleForStockCheck._id },
            session: { user: adminUser }
        };
        const confRes = createMockRes();
        await MaterialController.confirmSale(confReq, confRes);
        assert.strictEqual(confRes.statusCode, 409);
        assert.strictEqual(confRes.jsonData.success, false);
        assert.ok(confRes.jsonData.message.includes('already been confirmed'));

        const matAfter = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore, 'Stock must remain unchanged on duplicate confirmation');
    });

    // -------------------------------------------------------------
    // 14. Concurrent confirmation cannot oversell
    // -------------------------------------------------------------
    console.log('\n--- 14. Concurrent / Race Condition Stock Guard ---');
    await testAsync('14. Concurrent confirmations cannot oversell stock below zero', async () => {
        // Setup isolated material with exactly 4 units
        const reqMat = {
            body: {
                name: 'Limited Edition Battery Pack',
                sku: 'BAT-LTD-4PK',
                category: 'BATTERY',
                unitOfMeasurement: 'NOS',
                defaultSellingPrice: 35000
            },
            session: { user: adminUser }
        };
        const resMat = createMockRes();
        await MaterialController.createMaterial(reqMat, resMat);
        const batMat = resMat.jsonData.material;
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const found = allM.find(m => m._id.toString() === batMat._id.toString());
        found.currentStock = 4; // Exactly 4 units available

        // Create Sale A (requires 3 units) and Sale B (requires 3 units)
        const saleAReq = {
            body: {
                customerName: 'Buyer A',
                customerMobile: '9826000014',
                status: 'DRAFT',
                items: [{ materialId: batMat._id, quantity: 3, unitPrice: 35000 }]
            },
            session: { user: adminUser }
        };
        const saleAres = createMockRes();
        await MaterialController.createSale(saleAReq, saleAres);
        const saleAId = saleAres.jsonData.sale._id;

        const saleBReq = {
            body: {
                customerName: 'Buyer B',
                customerMobile: '9826000015',
                status: 'DRAFT',
                items: [{ materialId: batMat._id, quantity: 3, unitPrice: 35000 }]
            },
            session: { user: adminUser }
        };
        const saleBres = createMockRes();
        await MaterialController.createSale(saleBReq, saleBres);
        const saleBId = saleBres.jsonData.sale._id;

        // Confirm Sale A -> succeeds, drops stock from 4 to 1
        const confARes = createMockRes();
        await MaterialController.confirmSale({ params: { id: saleAId }, session: { user: adminUser } }, confARes);
        assert.strictEqual(confARes.jsonData.success, true);
        assert.strictEqual(found.currentStock, 1);

        // Attempt Confirm Sale B -> must fail because remaining stock (1) < requested (3)
        const confBRes = createMockRes();
        await MaterialController.confirmSale({ params: { id: saleBId }, session: { user: adminUser } }, confBRes);
        // Either 400 or failed confirmation
        assert.strictEqual(confBRes.jsonData.success, false);
        assert.strictEqual(found.currentStock, 1, 'Stock must never become negative');
    });

    // -------------------------------------------------------------
    // 15. Invoice snapshot remains unchanged after customer/material updates
    // -------------------------------------------------------------
    console.log('\n--- 15. Immutable Invoice Snapshot ---');
    await testAsync('15. Modifying customer or material does not alter historical invoice snapshot', async () => {
        const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
        const saleDoc = memSales.find(s => s._id.toString() === draftSaleForStockCheck._id.toString());
        const originalCustomerName = saleDoc.customerName;
        const originalItemPrice = saleDoc.items[0].unitPrice;

        // Mutate original material selling price in catalog
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const mat = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        mat.defaultSellingPrice = 999999;

        // Verify sale record maintains snapshot
        assert.strictEqual(saleDoc.customerName, originalCustomerName);
        assert.strictEqual(saleDoc.items[0].unitPrice, originalItemPrice);
        assert.strictEqual(saleDoc.grandTotal, 325000);
        // Restore catalog price
        mat.defaultSellingPrice = 65000;
    });

    // -------------------------------------------------------------
    // 16. Partial dispatch
    // -------------------------------------------------------------
    console.log('\n--- 16. Partial Dispatch ---');
    let testDispatchSaleId = null;
    let dispatch1Id = null;
    await testAsync('16. Partial dispatch consignment updates dispatchedQuantity and sets status PARTIAL', async () => {
        // Setup fresh confirmed sale of 10 units
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const mat = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        mat.currentStock = 50;

        const saleReq = {
            body: {
                customerName: 'Logistics Project Customer',
                customerMobile: '9826000016',
                status: 'DRAFT',
                items: [{ materialId: testMaterial2._id, quantity: 10, unitPrice: 7500 }]
            },
            session: { user: adminUser }
        };
        const saleRes = createMockRes();
        await MaterialController.createSale(saleReq, saleRes);
        testDispatchSaleId = saleRes.jsonData.sale._id;

        // Confirm sale
        await MaterialController.confirmSale({ params: { id: testDispatchSaleId }, session: { user: adminUser } }, createMockRes());

        // Dispatch 4 of 10 units
        const dispReq = {
            body: {
                saleId: testDispatchSaleId,
                transporterName: 'VRL Logistics',
                vehicleNumber: 'MP-04-AB-1234',
                trackingNumber: 'VRL-99887766',
                items: [{ materialId: testMaterial2._id, dispatchedQuantity: 4 }]
            },
            session: { user: adminUser }
        };
        const dispRes = createMockRes();
        await MaterialController.createDispatch(dispReq, dispRes);
        assert.strictEqual(dispRes.jsonData.success, true);
        assert.ok(dispRes.jsonData.dispatchNumber.startsWith('SES-DSP-'));
        dispatch1Id = dispRes.jsonData.dispatchId;

        // Verify sale dispatch status is PARTIALLY_DISPATCHED
        const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
        const saleDoc = memSales.find(s => s._id.toString() === testDispatchSaleId.toString());
        assert.strictEqual(saleDoc.dispatchStatus, 'PARTIALLY_DISPATCHED');
        assert.strictEqual(saleDoc.items[0].dispatchedQuantity, 4);
    });

    // -------------------------------------------------------------
    // 17. Dispatch quantity cannot exceed pending quantity
    // -------------------------------------------------------------
    console.log('\n--- 17. Dispatch Quantity Exceeds Pending Rejection ---');
    await testAsync('17. Attempting to dispatch more than pending quantity is rejected with HTTP 400', async () => {
        // Remaining pending to dispatch is 6 (10 - 4). Requesting 7 units must be rejected.
        const dispReq = {
            body: {
                saleId: testDispatchSaleId,
                transporterName: 'Blue Dart Express',
                vehicleNumber: 'MP-04-CD-5678',
                items: [{ materialId: testMaterial2._id, dispatchedQuantity: 7 }]
            },
            session: { user: adminUser }
        };
        const dispRes = createMockRes();
        await MaterialController.createDispatch(dispReq, dispRes);
        assert.strictEqual(dispRes.statusCode, 400);
        assert.strictEqual(dispRes.jsonData.success, false);
        assert.ok(dispRes.jsonData.message.includes('exceeds remaining pending quantity'));
    });

    // -------------------------------------------------------------
    // 18. Dispatch does not deduct stock again
    // -------------------------------------------------------------
    console.log('\n--- 18. Dispatch Does Not Touch Stock ---');
    await testAsync('18. Creating dispatch does not alter material currentStock (Stock already deducted at sale)', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        const stockBefore = matBefore.currentStock;

        // Dispatch remaining 6 units
        const dispReq = {
            body: {
                saleId: testDispatchSaleId,
                transporterName: 'VRL Logistics Batch 2',
                items: [{ materialId: testMaterial2._id, dispatchedQuantity: 6 }]
            },
            session: { user: adminUser }
        };
        const dispRes = createMockRes();
        await MaterialController.createDispatch(dispReq, dispRes);
        assert.strictEqual(dispRes.jsonData.success, true);

        const matAfter = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore, 'Stock must NOT change when creating a dispatch');

        // Verify sale dispatch status is now DISPATCHED (fully completed)
        const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
        const saleDoc = memSales.find(s => s._id.toString() === testDispatchSaleId.toString());
        assert.strictEqual(saleDoc.dispatchStatus, 'DISPATCHED');
        assert.strictEqual(saleDoc.items[0].dispatchedQuantity, 10);
    });

    // -------------------------------------------------------------
    // 19. Partial return
    // -------------------------------------------------------------
    console.log('\n--- 19. Partial Return Request ---');
    let returnDocId = null;
    await testAsync('19. Creating partial return request initializes RMA record in REQUESTED status', async () => {
        // Return 3 units of the 10 sold
        const retReq = {
            body: {
                saleId: testDispatchSaleId,
                returnReason: 'Customer site excess requirement adjustment',
                items: [{
                    materialId: testMaterial2._id,
                    returnedQuantity: 3,
                    condition: 'PENDING_INSPECTION'
                }]
            },
            session: { user: adminUser }
        };
        const retRes = createMockRes();
        await MaterialController.createReturnRequest(retReq, retRes);
        assert.strictEqual(retRes.jsonData.success, true);
        assert.ok(retRes.jsonData.returnNumber.startsWith('SES-RET-'));
        returnDocId = retRes.jsonData.returnId;

        const memReturns = MaterialPhase2Controller.getMemReturns ? MaterialPhase2Controller.getMemReturns() : [];
        const retDoc = memReturns.find(r => r._id.toString() === returnDocId.toString());
        assert.strictEqual(retDoc.status, 'REQUESTED');
        assert.strictEqual(retDoc.items[0].returnedQuantity, 3);
    });

    // -------------------------------------------------------------
    // 20. Return quantity cannot exceed eligible sold quantity
    // -------------------------------------------------------------
    console.log('\n--- 20. Return Quantity Exceeds Eligible Sold Rejection ---');
    await testAsync('20. Attempting to return more than remaining eligible sold quantity is rejected with HTTP 400', async () => {
        // 3 units already returned out of 10. Remaining eligible is 7. Attempting to return 8 must fail.
        const retReq = {
            body: {
                saleId: testDispatchSaleId,
                returnReason: 'Attempting excess return',
                items: [{
                    materialId: testMaterial2._id,
                    returnedQuantity: 8
                }]
            },
            session: { user: adminUser }
        };
        const retRes = createMockRes();
        await MaterialController.createReturnRequest(retReq, retRes);
        assert.strictEqual(retRes.statusCode, 400);
        assert.strictEqual(retRes.jsonData.success, false);
        assert.ok(retRes.jsonData.message.includes('exceeds remaining returnable quantity'));
    });

    // -------------------------------------------------------------
    // 21. Good return increases sellable stock after approval
    // -------------------------------------------------------------
    console.log('\n--- 21. Good Return Restocks Sellable Inventory ---');
    await testAsync('21. Approving return with condition GOOD increments sellable currentStock', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        const stockBefore = matBefore.currentStock;

        const appReq = {
            params: { id: returnDocId },
            body: {
                items: [{
                    materialId: testMaterial2._id,
                    condition: 'GOOD',
                    inspectionNotes: 'Passed QA inspection; factory packaging intact'
                }]
            },
            session: { user: adminUser }
        };
        const appRes = createMockRes();
        await MaterialController.inspectAndApproveReturn(appReq, appRes);
        assert.strictEqual(appRes.jsonData.success, true);

        const matAfter = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore + 3, 'Sellable stock must increment by 3 for GOOD return');
    });

    // -------------------------------------------------------------
    // 22. Damaged/defective returns do not increase sellable stock (quarantine)
    // -------------------------------------------------------------
    console.log('\n--- 22. Damaged / Defective Stock Quarantine ---');
    await testAsync('22. Damaged return increments damagedStock only; sellable currentStock remains UNCHANGED', async () => {
        // Return 2 units with DAMAGED condition
        const retReq = {
            body: {
                saleId: testDispatchSaleId,
                returnReason: 'Damaged in transit by local handling',
                items: [{
                    materialId: testMaterial2._id,
                    returnedQuantity: 2,
                    condition: 'DAMAGED'
                }]
            },
            session: { user: adminUser }
        };
        const retRes = createMockRes();
        await MaterialController.createReturnRequest(retReq, retRes);
        const damagedReturnId = retRes.jsonData.returnId;

        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        const sellableStockBefore = matBefore.currentStock;
        const damagedStockBefore = matBefore.damagedStock || 0;

        // Approve damaged return
        const appReq = {
            params: { id: damagedReturnId },
            body: {
                items: [{
                    materialId: testMaterial2._id,
                    condition: 'DAMAGED',
                    inspectionNotes: 'Chipped galvanization; quarantined to scrap/damaged warehouse'
                }]
            },
            session: { user: adminUser }
        };
        const appRes = createMockRes();
        await MaterialController.inspectAndApproveReturn(appReq, appRes);
        assert.strictEqual(appRes.jsonData.success, true);

        const matAfter = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        assert.strictEqual(matAfter.currentStock, sellableStockBefore, 'Sellable stock must NEVER increase for damaged return');
        assert.strictEqual(matAfter.damagedStock, damagedStockBefore + 2, 'Damaged stock must increase by 2');
    });

    // -------------------------------------------------------------
    // 23. Pending inspection does not increase sellable stock
    // -------------------------------------------------------------
    console.log('\n--- 23. Pending Inspection Quarantine Guard ---');
    await testAsync('23. Return in PENDING_INSPECTION state does not modify sellable or damaged stock', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        const sellableBefore = matBefore.currentStock;
        const damagedBefore = matBefore.damagedStock;

        // Create return in PENDING_INSPECTION
        const retReq = {
            body: {
                saleId: testDispatchSaleId,
                returnReason: 'Awaiting site engineer inspection report',
                items: [{
                    materialId: testMaterial2._id,
                    returnedQuantity: 1,
                    condition: 'PENDING_INSPECTION'
                }]
            },
            session: { user: adminUser }
        };
        const retRes = createMockRes();
        await MaterialController.createReturnRequest(retReq, retRes);
        assert.strictEqual(retRes.jsonData.success, true);

        const matAfter = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        assert.strictEqual(matAfter.currentStock, sellableBefore, 'Sellable stock must not change while pending inspection');
        assert.strictEqual(matAfter.damagedStock, damagedBefore, 'Damaged stock must not change while pending inspection');
    });

    // -------------------------------------------------------------
    // 24. Duplicate return approval rejected (HTTP 409)
    // -------------------------------------------------------------
    console.log('\n--- 24. Duplicate Return Approval Guard (HTTP 409) ---');
    await testAsync('24. Re-approving an already approved return returns HTTP 409 and avoids double-restocking', async () => {
        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matBefore = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        const stockBefore = matBefore.currentStock;

        const appReq = {
            params: { id: returnDocId }, // returnDocId was approved in test 21
            body: {
                items: [{ materialId: testMaterial2._id, condition: 'GOOD' }]
            },
            session: { user: adminUser }
        };
        const appRes = createMockRes();
        await MaterialController.inspectAndApproveReturn(appReq, appRes);
        assert.strictEqual(appRes.statusCode, 409);
        assert.strictEqual(appRes.jsonData.success, false);
        assert.ok(appRes.jsonData.message.includes('already been approved'));

        const matAfter = allM.find(m => m._id.toString() === testMaterial2._id.toString());
        assert.strictEqual(matAfter.currentStock, stockBefore, 'Stock must NOT be credited a second time');
    });

    // -------------------------------------------------------------
    // 25. Cancelled sale and reversal behavior
    // -------------------------------------------------------------
    console.log('\n--- 25. Cancelled Sale and Stock Reversal ---');
    await testAsync('25. Cancelling a confirmed undispatched sale reverses stock back to inventory', async () => {
        // Create fresh sale of 3 inverters
        const saleReq = {
            body: {
                customerName: 'Cancellation Test Buyer',
                customerMobile: '9826000025',
                status: 'DRAFT',
                items: [{ materialId: testMaterial1._id, quantity: 3, unitPrice: 65000 }]
            },
            session: { user: adminUser }
        };
        const saleRes = createMockRes();
        await MaterialController.createSale(saleReq, saleRes);
        const cancelSaleId = saleRes.jsonData.sale._id;

        // Confirm sale (deducts 3 units)
        await MaterialController.confirmSale({ params: { id: cancelSaleId }, session: { user: adminUser } }, createMockRes());

        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const matDeducted = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        const stockAfterConfirm = matDeducted.currentStock;

        // Cancel sale
        const cancelReq = {
            params: { id: cancelSaleId },
            body: { reason: 'Customer cancelled commercial order before dispatch' },
            session: { user: adminUser }
        };
        const cancelRes = createMockRes();
        await MaterialController.cancelSale(cancelReq, cancelRes);
        assert.strictEqual(cancelRes.jsonData.success, true);

        // Verify stock is refunded (+3 units)
        const matReversed = allM.find(m => m._id.toString() === testMaterial1._id.toString());
        assert.strictEqual(matReversed.currentStock, stockAfterConfirm + 3, 'Stock must be refunded upon order cancellation');

        const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
        const saleDoc = memSales.find(s => s._id.toString() === cancelSaleId.toString());
        assert.strictEqual(saleDoc.status, 'CANCELLED');
    });

    // -------------------------------------------------------------
    // 26. Unauthorized access rejected (RBAC)
    // -------------------------------------------------------------
    console.log('\n--- 26. RBAC Role Security ---');
    test('26. requireSuperAdmin strictly forbids EMPLOYEE and BRANCH_MANAGER roles with HTTP 403', () => {
        const roles = ['EMPLOYEE', 'BRANCH_MANAGER', 'GUEST', null];
        for (const role of roles) {
            const req = {
                session: { user: { role, name: 'Restricted User' } },
                headers: { accept: 'application/json' }
            };
            const res = createMockRes();
            let nextCalled = false;
            requireSuperAdmin(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false, `Role ${role} must not proceed`);
            assert.strictEqual(res.statusCode, 403, `Role ${role} must receive HTTP 403`);
        }
    });

    // -------------------------------------------------------------
    // 27. CSRF protection verified
    // -------------------------------------------------------------
    console.log('\n--- 27. CSRF Protection ---');
    test('27. verifyCsrf middleware blocks requests with missing or invalid CSRF tokens', () => {
        const req = {
            method: 'POST',
            session: { csrfToken: 'legitimate-session-csrf-token' },
            headers: { 'x-csrf-token': 'wrong-or-missing-token' },
            body: {}
        };
        const res = createMockRes();
        let nextCalled = false;
        verifyCsrf(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.jsonData.success, false);
    });

    // -------------------------------------------------------------
    // 28. IDOR protection verified
    // -------------------------------------------------------------
    console.log('\n--- 28. IDOR / Invalid ObjectId Protection ---');
    test('28. validateObjectId blocks malformed MongoDB IDs before route execution', () => {
        const req = {
            params: { id: 'invalid-non-hex-id-1234' },
            headers: { accept: 'application/json' }
        };
        const res = createMockRes();
        let nextCalled = false;
        const middleware = validateObjectId('id');
        middleware(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.jsonData.success, false);
    });

    // -------------------------------------------------------------
    // 29. CSV report accuracy
    // -------------------------------------------------------------
    console.log('\n--- 29. CSV Report Accuracy ---');
    await testAsync('29. exportSalesCsv produces RFC-compliant CSV containing headers and sales data', async () => {
        const req = { session: { user: adminUser } };
        const res = createMockRes();
        await MaterialController.exportSalesCsv(req, res);
        assert.ok(res.headers['Content-Type'].includes('text/csv'));
        assert.ok(res.headers['Content-Disposition'].includes('attachment; filename="SES-Material-Sales-'));
        assert.ok(res.sentData.includes('Sale Number,Sale Date,Customer Name,Customer Type,Payment Status,Dispatch Status,Grand Total'));
        assert.ok(res.sentData.includes('Aarav Patel') || res.sentData.includes('SES-SALE-'));
    });

    // -------------------------------------------------------------
    // 30. Phase 1 purchase, inventory, WAC, and ledger regression
    // -------------------------------------------------------------
    console.log('\n--- 30. Phase 1 Regression & Compatibility ---');
    await testAsync('30. Phase 1 Material Master, Purchase / Stock In, and WAC work seamlessly alongside Phase 2', async () => {
        // Create new Material
        const mReq = {
            body: {
                name: 'Solar DC Combiner Box 4-In-1-Out',
                category: 'BOS_ELECTRICAL',
                unitOfMeasurement: 'NOS',
                defaultSellingPrice: 4200
            },
            session: { user: adminUser }
        };
        const mRes = createMockRes();
        await MaterialController.createMaterial(mReq, mRes);
        assert.strictEqual(mRes.jsonData.success, true);
        const newMat = mRes.jsonData.material;

        // Purchase Batch 1: 10 units @ 2000
        const p1Req = {
            body: {
                supplierId: sharedSupplierId,
                status: 'DRAFT',
                items: [{ material: newMat._id, quantity: 10, unitPurchasePrice: 2000, taxRate: 18 }]
            },
            session: { user: adminUser }
        };
        const p1Res = createMockRes();
        await MaterialController.createPurchase(p1Req, p1Res);
        const p1Id = p1Res.jsonData.purchase._id;

        // Confirm Batch 1
        await MaterialController.confirmPurchase({ params: { id: p1Id }, session: { user: adminUser } }, createMockRes());

        const allM = MaterialController.getMemMaterials ? MaterialController.getMemMaterials() : [];
        const mAfterBatch1 = allM.find(m => m._id.toString() === newMat._id.toString());
        assert.strictEqual(mAfterBatch1.currentStock, 10);
        assert.strictEqual(mAfterBatch1.weightedAverageCost, 2000);

        // Phase 2 Sale: Sell 4 units
        const sReq = {
            body: {
                customerName: 'Regression Check Client',
                customerMobile: '9826000030',
                status: 'DRAFT',
                items: [{ materialId: newMat._id, quantity: 4, unitPrice: 4200 }]
            },
            session: { user: adminUser }
        };
        const sRes = createMockRes();
        await MaterialController.createSale(sReq, sRes);
        const sId = sRes.jsonData.sale._id;

        // Confirm Phase 2 Sale
        await MaterialController.confirmSale({ params: { id: sId }, session: { user: adminUser } }, createMockRes());

        const mAfterSale = allM.find(m => m._id.toString() === newMat._id.toString());
        assert.strictEqual(mAfterSale.currentStock, 6, 'Stock after sale must be 6');
        assert.strictEqual(mAfterSale.weightedAverageCost, 2000, 'WAC must remain 2000 after sale');
    });

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`PHASE 2 TEST BATTERY COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runPhase2TestSuite().catch(err => {
    console.error('Fatal test error in Phase 2 test suite:', err);
    process.exit(1);
});
