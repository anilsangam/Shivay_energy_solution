/**
 * Phase 1 Material Management & Inventory Foundation Test Suite
 * Validates:
 * 1. Material Master (CRUD, SKU uniqueness, auto-SKU, default selling price)
 * 2. Supplier Management (CRUD, search, toggle status)
 * 3. Purchase / Stock In (Multi-item entry, server-side math, Draft vs Received)
 * 4. Weighted Average Cost (WAC) & Landed Cost Proration
 * 5. Idempotent Purchase Confirmation (Double-confirm prevention)
 * 6. Controlled Stock Adjustment & Negative Stock Prohibition
 * 7. Stock Reports & CSV Export Serialization
 * 8. Strict RBAC (Super Admin only, 403 for other roles)
 * 9. Phase 2 Placeholders
 */

const assert = require('assert');
const mongoose = require('mongoose');
const Material = require('../models/Material');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const InventoryTransaction = require('../models/InventoryTransaction');
const MaterialController = require('../controllers/materialController');

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

async function runTestSuite() {
    console.log('================================================================');
    console.log('RUNNING PHASE 1 MATERIAL MANAGEMENT & INVENTORY TEST SUITE');
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

    // -------------------------------------------------------------
    // 1. MATERIAL MASTER & SKU VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- 1. Material Master & SKU Validation ---');

    await testAsync('Create material with auto-generated SKU when blank', async () => {
        const req = {
            body: {
                name: 'Solar Inverter 5kW Grid-Tie',
                sku: '',
                category: 'INVERTER',
                unitOfMeasurement: 'NOS',
                brand: 'Growatt',
                model: 'MIN 5000TL-X',
                defaultSellingPrice: 48000,
                minStockAlert: 3,
                description: 'Single phase dual MPPT'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();

        await MaterialController.createMaterial(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.ok(res.jsonData.material.sku.startsWith('MAT-'), `Expected SKU to start with MAT-, got ${res.jsonData.material.sku}`);
        assert.strictEqual(res.jsonData.material.currentStock, 0, 'Initial currentStock must be 0');
    });

    await testAsync('Prevent duplicate SKU insertion', async () => {
        const uniqueSku = 'PANEL-MONO-550';
        const req1 = {
            body: {
                name: '550W Mono Panel Batch 1',
                sku: uniqueSku,
                category: 'SOLAR_PANEL',
                unitOfMeasurement: 'NOS',
                defaultSellingPrice: 16500
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res1 = createMockRes();
        await MaterialController.createMaterial(req1, res1);
        assert.strictEqual(res1.jsonData.success, true);

        // Attempt second material with exact same SKU
        const req2 = {
            body: {
                name: '550W Mono Panel Batch 2 Duplicate',
                sku: uniqueSku,
                category: 'SOLAR_PANEL',
                unitOfMeasurement: 'NOS'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res2 = createMockRes();
        await MaterialController.createMaterial(req2, res2);
        assert.strictEqual(res2.statusCode, 400);
        assert.strictEqual(res2.jsonData.success, false);
        assert.ok(res2.jsonData.message.includes('already exists'), 'Expected duplicate SKU error message');
    });

    // -------------------------------------------------------------
    // 2. SUPPLIER MANAGEMENT
    // -------------------------------------------------------------
    console.log('\n--- 2. Supplier Management ---');

    let createdSupplierId = null;
    await testAsync('Create supplier and verify searchable', async () => {
        const req = {
            body: {
                supplierName: 'Tata Power Solar Distribution Hub',
                contactPerson: 'Vikas Sharma',
                mobile: '9826112233',
                email: 'vikas@tatapower.com',
                gstin: '23AAACT1234F1Z9',
                address: 'Industrial Area, Mandideep, MP',
                status: 'ACTIVE'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.createSupplier(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.ok(res.jsonData.supplier._id);
        createdSupplierId = res.jsonData.supplier._id;

        // Verify search API finds supplier
        const searchReq = { query: { q: 'Tata Power' }, session: { user: { role: 'SUPER_ADMIN' } } };
        const searchRes = createMockRes();
        await MaterialController.searchSuppliersApi(searchReq, searchRes);
        assert.strictEqual(searchRes.jsonData.success, true);
        assert.ok(searchRes.jsonData.suppliers.some(s => s.supplierName.includes('Tata Power')));
    });

    await testAsync('Toggle supplier active/inactive status', async () => {
        const req = {
            params: { id: createdSupplierId },
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.toggleSupplierStatus(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.strictEqual(res.jsonData.status, 'INACTIVE');

        // Toggle back to ACTIVE
        const res2 = createMockRes();
        await MaterialController.toggleSupplierStatus(req, res2);
        assert.strictEqual(res2.jsonData.status, 'ACTIVE');
    });

    // -------------------------------------------------------------
    // 3. PURCHASE / STOCK IN & SERVER-SIDE MATH VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- 3. Purchase Entry & Server-Side Math Validation ---');

    // Create a fresh test material
    let testMaterialId = null;
    await testAsync('Setup material for purchase test', async () => {
        const req = {
            body: {
                name: 'Solar DC Cable 4sqmm (100m roll)',
                sku: 'CBL-DC-4MM-RED',
                category: 'SOLAR_CABLE',
                unitOfMeasurement: 'ROLLS',
                defaultSellingPrice: 4200,
                minStockAlert: 5
            },
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.createMaterial(req, res);
        testMaterialId = res.jsonData.material._id;
        assert.ok(testMaterialId);
    });

    let draftPurchaseId = null;
    await testAsync('Create DRAFT purchase: Server calculates tax & landed totals, stock is UNCHANGED', async () => {
        // Line Item: 10 rolls @ 3000 = 30000 base. Tax 18% = 5400.
        // Freight charges: 1200. Discount: 600.
        // Grand Total = 30000 + 5400 + 1200 - 600 = 36000.
        const req = {
            body: {
                supplierId: createdSupplierId,
                supplierInvoiceNumber: 'INV-TATA-2026-001',
                supplierInvoiceDate: '2026-11-16',
                paymentStatus: 'PAID',
                status: 'DRAFT',
                additionalCharges: 1200,
                discount: 600,
                items: [
                    {
                        material: testMaterialId,
                        quantity: 10,
                        unitPurchasePrice: 3000,
                        taxRate: 18
                    }
                ]
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.createPurchase(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.strictEqual(res.jsonData.purchase.status, 'DRAFT');
        assert.strictEqual(res.jsonData.purchase.subtotal, 30000);
        assert.strictEqual(res.jsonData.purchase.taxTotal, 5400);
        assert.strictEqual(res.jsonData.purchase.totalAmount, 36000);
        draftPurchaseId = res.jsonData.purchase._id;

        // Verify material stock is STILL 0 because purchase is only DRAFT
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 0, 'DRAFT purchase must not increment stock');
    });

    // -------------------------------------------------------------
    // 4. CONFIRM PURCHASE & WEIGHTED AVERAGE COST (WAC) COMPUTATION
    // -------------------------------------------------------------
    console.log('\n--- 4. Purchase Confirmation & Weighted Average Cost (WAC) ---');

    await testAsync('Confirm purchase: increments stock, allocates landed charges, computes WAC', async () => {
        // Initial: Q0 = 0, W0 = 0.
        // Inward: Q1 = 10, Purchase Price = 3000.
        // Landed freight charges = 1200 allocated to 10 units = 120/unit.
        // Effective unit cost = 3000 + 120 = 3120.
        // New WAC = (0 + 10 * 3120) / 10 = 3120.
        const req = {
            params: { id: draftPurchaseId },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.confirmPurchase(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.strictEqual(res.jsonData.purchase.status, 'RECEIVED');

        // Verify Material stock and WAC
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 10, 'Expected stock to be 10');
        assert.strictEqual(matRes.jsonData.material.weightedAverageCost, 3120, 'Expected WAC to be 3120');

        // Verify ledger record
        const histReq = { params: { id: testMaterialId }, session: { user: { role: 'SUPER_ADMIN' } } };
        const histRes = createMockRes();
        await MaterialController.getMaterialHistoryApi(histReq, histRes);
        assert.strictEqual(histRes.jsonData.success, true);
        assert.strictEqual(histRes.jsonData.transactions.length, 1);
        const txn = histRes.jsonData.transactions[0];
        assert.strictEqual(txn.transactionType, 'PURCHASE_RECEIPT');
        assert.strictEqual(txn.quantityIn, 10);
        assert.strictEqual(txn.balanceAfter, 10);
        assert.strictEqual(txn.unitCost, 3120);
    });

    // -------------------------------------------------------------
    // 5. IDEMPOTENCY GUARD: DOUBLE CONFIRMATION PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- 5. Idempotency Guard (Double-Confirmation Prevention) ---');

    await testAsync('Re-confirming an already RECEIVED purchase must be rejected with 400 or 409', async () => {
        const req = {
            params: { id: draftPurchaseId },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.confirmPurchase(req, res);
        assert.ok([400, 409].includes(res.statusCode), `Expected 400 or 409, got ${res.statusCode}`);
        assert.strictEqual(res.jsonData.success, false);
        assert.ok(res.jsonData.message.includes('already confirmed') || res.jsonData.message.includes('already been confirmed'));

        // Stock must remain strictly 10 (not 20!)
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 10, 'Stock must not be double-incremented');
    });

    // -------------------------------------------------------------
    // 6. MULTI-PURCHASE WAC BLENDING
    // -------------------------------------------------------------
    console.log('\n--- 6. Multi-Purchase WAC Blending ---');

    await testAsync('Second purchase with different price blends WAC correctly', async () => {
        // Current state: Q0 = 10, W0 = 3120 (Total value = 31,200).
        // New purchase: Q1 = 20 rolls @ 3600, 0 additional charges.
        // Effective unit cost = 3600.
        // Total new cost = 20 * 3600 = 72,000.
        // New WAC = (31,200 + 72,000) / (10 + 20) = 103,200 / 30 = 3440.00.
        const req = {
            body: {
                supplierId: createdSupplierId,
                supplierInvoiceNumber: 'INV-TATA-2026-002',
                status: 'RECEIVED', // direct confirm
                additionalCharges: 0,
                discount: 0,
                items: [
                    {
                        material: testMaterialId,
                        quantity: 20,
                        unitPurchasePrice: 3600,
                        taxRate: 18
                    }
                ]
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.createPurchase(req, res);
        assert.strictEqual(res.jsonData.success, true);

        // Verify stock and blended WAC
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 30, 'Expected stock to be 30 (10 + 20)');
        assert.strictEqual(matRes.jsonData.material.weightedAverageCost, 3440, 'Expected blended WAC to be exactly 3440.00');
    });

    // -------------------------------------------------------------
    // 7. CONTROLLED STOCK ADJUSTMENT & NEGATIVE STOCK PROHIBITION
    // -------------------------------------------------------------
    console.log('\n--- 7. Controlled Stock Adjustment & Negative Stock Guard ---');

    await testAsync('Controlled stock reduction (REMOVE) decrements stock and writes ledger', async () => {
        // Remove 5 units due to damage (Current stock 30 -> 25)
        const req = {
            params: { id: testMaterialId },
            body: {
                adjustmentType: 'REMOVE',
                quantity: 5,
                reason: 'Damaged during storage/handling',
                remarks: 'Water damage in warehouse sector B'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.adjustStock(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.strictEqual(res.jsonData.newStock, 25);

        // Verify material state
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 25);
    });

    await testAsync('Negative stock is STRICTLY prohibited when removing more than on-hand', async () => {
        // Current stock is 25. Attempting to remove 26 units!
        const req = {
            params: { id: testMaterialId },
            body: {
                adjustmentType: 'REMOVE',
                quantity: 26,
                reason: 'Scrap write-off',
                remarks: 'Excessive remove attempt'
            },
            session: { user: { _id: '507f191e810c19729de860ea', name: 'Super Admin', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.adjustStock(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.jsonData.success, false);
        assert.ok(res.jsonData.message.includes('Cannot remove') || res.jsonData.message.includes('Negative inventory'));

        // Stock must remain unchanged at 25
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.currentStock, 25);
    });

    // -------------------------------------------------------------
    // 8. DEFAULT SELLING PRICE INDEPENDENCE
    // -------------------------------------------------------------
    console.log('\n--- 8. Default Selling Price Independence ---');

    await testAsync('Updating default selling price updates catalog without changing WAC or past records', async () => {
        const req = {
            params: { id: testMaterialId },
            body: { defaultSellingPrice: 4950 },
            session: { user: { _id: '507f191e810c19729de860ea', role: 'SUPER_ADMIN' } }
        };
        const res = createMockRes();
        await MaterialController.updateSellingPrice(req, res);
        assert.strictEqual(res.jsonData.success, true);
        assert.strictEqual(res.jsonData.defaultSellingPrice, 4950);

        // Verify WAC is unchanged
        const matReq = { params: { id: testMaterialId }, isJson: true, session: { user: { role: 'SUPER_ADMIN' } } };
        const matRes = createMockRes();
        await MaterialController.getMaterialDetails(matReq, matRes);
        assert.strictEqual(matRes.jsonData.material.defaultSellingPrice, 4950);
        assert.strictEqual(matRes.jsonData.material.weightedAverageCost, 3440, 'WAC must remain intact');
    });

    // -------------------------------------------------------------
    // 9. CSV EXPORTS & REPORT ANALYTICS
    // -------------------------------------------------------------
    console.log('\n--- 9. CSV Exports & Stock Reports ---');

    await testAsync('Export current stock CSV generates valid CSV formatted rows', async () => {
        const req = { session: { user: { role: 'SUPER_ADMIN' } } };
        const res = createMockRes();
        await MaterialController.exportStockCsv(req, res);
        assert.ok(res.headers['Content-Type'].includes('text/csv'));
        assert.ok(res.sentData.includes('SKU,Material Name,Category,Brand'));
        assert.ok(res.sentData.includes('CBL-DC-4MM-RED'));
    });

    await testAsync('Export movement ledger CSV generates valid transaction log', async () => {
        const req = { session: { user: { role: 'SUPER_ADMIN' } } };
        const res = createMockRes();
        await MaterialController.exportLedgerCsv(req, res);
        assert.ok(res.headers['Content-Type'].includes('text/csv'));
        assert.ok(res.sentData.includes('Transaction No,Date,SKU,Material Name,Transaction Type'));
        assert.ok(res.sentData.includes('PURCHASE_RECEIPT'));
    });

    // -------------------------------------------------------------
    // 10. PHASE 2 PLACEHOLDERS
    // -------------------------------------------------------------
    console.log('\n--- 10. Phase 2 Placeholder Endpoints ---');

    test('Sales Out, Dispatch, and Returns handlers render placeholder view with Phase 2 metadata', () => {
        const salesOutHandler = MaterialController.getPlaceholderPage('sales-out');
        const req = { 
            session: { user: { role: 'SUPER_ADMIN' }, csrfToken: 'test-token' },
            csrfToken: () => 'test-token'
        };
        const res = createMockRes();
        salesOutHandler(req, res);
        assert.strictEqual(res.renderedView, 'private/admin/inventory-placeholder');
        assert.strictEqual(res.renderedData.activePage, 'material-sales-out');
        assert.ok(res.renderedData.plannedFeatures.length > 0);
    });

    // -------------------------------------------------------------
    // 11. RBAC SECURITY VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- 11. RBAC Security Validation ---');

    test('Non-SuperAdmin roles are blocked by requireSuperAdmin middleware with 403', () => {
        const { requireSuperAdmin } = require('../middleware/authMiddleware');
        
        // Test EMPLOYEE role
        const empReq = { session: { user: { role: 'EMPLOYEE' } }, headers: { accept: 'application/json' } };
        const empRes = createMockRes();
        let empNextCalled = false;
        requireSuperAdmin(empReq, empRes, () => { empNextCalled = true; });
        assert.strictEqual(empNextCalled, false, 'Employee must not pass requireSuperAdmin');
        assert.strictEqual(empRes.statusCode, 403, 'Employee must receive 403 Forbidden');

        // Test BRANCH_MANAGER role
        const mgrReq = { session: { user: { role: 'BRANCH_MANAGER' } }, headers: { accept: 'application/json' } };
        const mgrRes = createMockRes();
        let mgrNextCalled = false;
        requireSuperAdmin(mgrReq, mgrRes, () => { mgrNextCalled = true; });
        assert.strictEqual(mgrNextCalled, false, 'Branch Manager must not pass requireSuperAdmin');
        assert.strictEqual(mgrRes.statusCode, 403, 'Branch Manager must receive 403 Forbidden');

        // Test SUPER_ADMIN role
        const adminReq = { session: { user: { role: 'SUPER_ADMIN' } } };
        const adminRes = createMockRes();
        let adminNextCalled = false;
        requireSuperAdmin(adminReq, adminRes, () => { adminNextCalled = true; });
        assert.strictEqual(adminNextCalled, true, 'Super Admin must pass requireSuperAdmin');
    });

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`TEST EXECUTION COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
