const mongoose = require('mongoose');
const data = require('../config/company');
const Material = require('../models/Material');
const MaterialSale = require('../models/MaterialSale');
const MaterialDispatch = require('../models/MaterialDispatch');
const MaterialReturn = require('../models/MaterialReturn');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const Project = require('../models/Project');
const Counter = require('../models/Counter');
const AuditService = require('../services/auditService');

// Safe round helper for currency / decimal math (2 decimals)
function round2(val) {
    const num = Number(val);
    if (isNaN(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

// In-memory collections for offline/test fallback
let memSales = [];
let memDispatches = [];
let memReturns = [];

class MaterialPhase2Controller {
    // =========================================================================
    // IN-MEMORY TEST HELPERS
    // =========================================================================
    static resetMemStore() {
        memSales = [];
        memDispatches = [];
        memReturns = [];
    }

    static getMemSales() { return memSales; }
    static getMemDispatches() { return memDispatches; }
    static getMemReturns() { return memReturns; }

    // =========================================================================
    // 1. SALES & STOCK OUT
    // =========================================================================

    /**
     * GET /admin/sales-out
     * Material Sales Directory & Metrics Listing
     */
    static async getSalesPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const paymentStatus = (req.query.paymentStatus || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (status) query.status = status;
            if (paymentStatus) query.paymentStatus = paymentStatus;
            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { saleNumber: searchRegex },
                    { customerName: searchRegex },
                    { customerMobile: searchRegex },
                    { 'invoice.invoiceNumber': searchRegex }
                ];
            }

            let sales = [];
            let total = 0;
            let stats = {
                totalSales: 0,
                confirmedSales: 0,
                draftSales: 0,
                totalRevenue: 0,
                totalUnitsSold: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await MaterialSale.countDocuments(query);
                sales = await MaterialSale.find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('customer', 'name mobile city')
                    .populate('project', 'projectNumber title')
                    .populate('createdBy', 'name employeeId')
                    .lean();

                const [allCount, confirmedCount, draftCount, revAgg] = await Promise.all([
                    MaterialSale.countDocuments({}),
                    MaterialSale.countDocuments({ status: { $in: ['CONFIRMED', 'PROCESSING'] } }),
                    MaterialSale.countDocuments({ status: 'DRAFT' }),
                    MaterialSale.aggregate([
                        { $match: { status: { $in: ['CONFIRMED', 'PROCESSING'] } } },
                        {
                            $group: {
                                _id: null,
                                totalRevenue: { $sum: '$grandTotal' },
                                totalUnits: {
                                    $sum: {
                                        $reduce: {
                                            input: '$items',
                                            initialValue: 0,
                                            in: { $add: ['$$value', '$$this.quantity'] }
                                        }
                                    }
                                }
                            }
                        }
                    ])
                ]);

                stats = {
                    totalSales: allCount,
                    confirmedSales: confirmedCount,
                    draftSales: draftCount,
                    totalRevenue: (revAgg && revAgg[0]) ? revAgg[0].totalRevenue : 0,
                    totalUnitsSold: (revAgg && revAgg[0]) ? revAgg[0].totalUnits : 0
                };
            } else {
                let filtered = [...memSales];
                if (query.status) filtered = filtered.filter(s => s.status === query.status);
                if (query.paymentStatus) filtered = filtered.filter(s => s.paymentStatus === query.paymentStatus);
                if (search) {
                    const s = search.toLowerCase();
                    filtered = filtered.filter(item =>
                        (item.saleNumber && item.saleNumber.toLowerCase().includes(s)) ||
                        (item.customerName && item.customerName.toLowerCase().includes(s)) ||
                        (item.customerMobile && item.customerMobile.includes(s))
                    );
                }
                total = filtered.length;
                sales = filtered.slice(skip, skip + limit);

                stats = {
                    totalSales: memSales.length,
                    confirmedSales: memSales.filter(s => s.status === 'CONFIRMED' || s.status === 'PROCESSING').length,
                    draftSales: memSales.filter(s => s.status === 'DRAFT').length,
                    totalRevenue: memSales
                        .filter(s => s.status === 'CONFIRMED' || s.status === 'PROCESSING')
                        .reduce((acc, curr) => acc + (curr.grandTotal || 0), 0),
                    totalUnitsSold: memSales
                        .filter(s => s.status === 'CONFIRMED' || s.status === 'PROCESSING')
                        .reduce((acc, curr) => acc + (curr.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0), 0)
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/sales', {
                title: `Material Sales & Stock Out | ${data.company.name}`,
                data,
                company: data.company,
                sales,
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                filters: { search, status, paymentStatus },
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-sales-out',
                currentActive: 'material-sales-out',
                pageTitle: 'Material Sales & Stock Out',
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Sales / Stock Out' }
                ]
            });
        } catch (err) {
            console.error('Error fetching sales page:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error Loading Sales | Shivay Energy Solutions',
                message: 'Unable to load material sales directory.'
            });
        }
    }

    /**
     * GET /admin/sales-out/new
     * New Sale Form with Material Picker, Customer Selector & Optional Project Link
     */
    static async getNewSalePage(req, res) {
        try {
            let materials = [];
            let customers = [];
            let projects = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const [matList, custList, projList] = await Promise.all([
                    Material.find({ isActive: true }).sort({ name: 1 }).lean(),
                    Customer.find({}).sort({ updatedAt: -1 }).limit(30).select('name mobile city customerType gstin address').lean(),
                    Project.find({ status: { $ne: 'CANCELLED' } }).sort({ createdAt: -1 }).limit(30).select('projectNumber title capacityKw').lean()
                ]);
                materials = matList || [];
                customers = custList || [];
                projects = projList || [];
            }

            res.render('private/admin/sale-new', {
                title: `New Material Sale / Stock Out | ${data.company.name}`,
                data,
                company: data.company,
                materials,
                customers,
                projects,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-sales-out',
                currentActive: 'material-sales-out',
                pageTitle: 'Create New Material Sale',
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Sales / Stock Out', url: '/admin/sales-out' },
                    { label: 'New Sale' }
                ]
            });
        } catch (err) {
            console.error('Error rendering new sale page:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load new sale creation form.'
            });
        }
    }

    /**
     * GET /admin/sales-out/:id
     * Sale Order Detail View with Dispatches, Returns & Audit Timeline
     */
    static async getSaleViewPage(req, res) {
        try {
            const { id } = req.params;
            let sale = null;
            let dispatches = [];
            let returns = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(id)
                    .populate('customer', 'name mobile email address city customerType gstin')
                    .populate('project', 'projectNumber title capacityKw')
                    .populate('confirmedBy', 'name employeeId')
                    .populate('createdBy', 'name employeeId')
                    .lean();

                if (sale) {
                    [dispatches, returns] = await Promise.all([
                        MaterialDispatch.find({ sale: sale._id }).sort({ createdAt: -1 }).lean(),
                        MaterialReturn.find({ sale: sale._id }).sort({ createdAt: -1 }).lean()
                    ]);
                }
            } else {
                sale = memSales.find(s => s._id.toString() === id.toString());
                if (sale) {
                    dispatches = memDispatches.filter(d => d.sale.toString() === id.toString());
                    returns = memReturns.filter(r => r.sale.toString() === id.toString());
                }
            }

            if (!sale) {
                return res.status(404).render('private/errors/404', {
                    title: 'Sale Not Found | Shivay Energy Solutions',
                    message: 'The requested material sale record does not exist.'
                });
            }

            res.render('private/admin/sale-view', {
                title: `${sale.saleNumber} | Material Sale Details`,
                data,
                company: data.company,
                sale,
                dispatches,
                returns,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-sales-out',
                currentActive: 'material-sales-out',
                pageTitle: `Sale Order: ${sale.saleNumber}`,
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Sales / Stock Out', url: '/admin/sales-out' },
                    { label: sale.saleNumber }
                ]
            });
        } catch (err) {
            console.error('Error fetching sale details:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load sale order details.'
            });
        }
    }

    /**
     * GET /admin/sales-out/:id/invoice
     * Professional Printable GST Tax Invoice for Material Sale
     */
    static async getSaleInvoicePage(req, res) {
        try {
            const { id } = req.params;
            let sale = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(id)
                    .populate('customer')
                    .populate('project')
                    .populate('confirmedBy', 'name employeeId')
                    .lean();
            } else {
                sale = memSales.find(s => s._id.toString() === id.toString());
            }

            if (!sale) {
                return res.status(404).render('private/errors/404', {
                    title: 'Sale Invoice Not Found | Shivay Energy Solutions',
                    message: 'The requested material sale invoice does not exist.'
                });
            }

            res.render('private/admin/sale-invoice', {
                title: `Tax Invoice - ${sale.invoice && sale.invoice.invoiceNumber ? sale.invoice.invoiceNumber : sale.saleNumber}`,
                data,
                company: data.company,
                sale,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-sales-out',
                currentActive: 'material-sales-out',
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
            });
        } catch (err) {
            console.error('Error rendering sale invoice:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to render sales tax invoice.'
            });
        }
    }

    /**
     * POST /api/admin/sales
     * Create New Material Sale (DRAFT or CONFIRMED)
     */
    static async createSale(req, res) {
        try {
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            const {
                buyerType = 'EXISTING_CUSTOMER',
                customerId,
                customerName: rawCustomerName,
                customerMobile: rawCustomerMobile,
                customerEmail = '',
                customerAddress = '',
                city = 'Raisen',
                district = 'Raisen',
                state = 'Madhya Pradesh',
                pincode = '',
                companyName = '',
                contactPerson = '',
                customerGstin = '',
                customerType = 'INDIVIDUAL',
                projectId,
                items: rawItems,
                discount: rawDiscount = 0,
                additionalCharges: rawAdditional = 0,
                paymentStatus = 'UNPAID',
                paymentMethod = 'Bank Transfer (NEFT/RTGS/UPI)',
                notes = '',
                status = 'DRAFT'
            } = req.body;

            // 1. Validate Customer Information
            let customerName = (rawCustomerName || '').trim();
            let customerMobile = (rawCustomerMobile || '').trim();

            let linkedCustomerId = null;
            if (customerId && mongoose.isValidObjectId(customerId)) {
                linkedCustomerId = customerId;
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    const existingCust = await Customer.findById(customerId).lean();
                    if (existingCust) {
                        customerName = customerName || existingCust.name;
                        customerMobile = customerMobile || existingCust.mobile;
                    }
                }
            }

            if (!customerName) {
                return res.status(400).json({ success: false, message: 'Customer or business name is required.' });
            }
            if (!customerMobile) {
                return res.status(400).json({ success: false, message: 'Primary contact mobile number is required.' });
            }

            // 2. Validate Items Array
            if (!Array.isArray(rawItems) || rawItems.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one material line item is required.' });
            }

            // Check for duplicate material lines
            const materialIdSet = new Set();
            for (const it of rawItems) {
                const mId = (it.materialId || it.material || '').toString();
                if (!mId) {
                    return res.status(400).json({ success: false, message: 'Invalid material specified in line items.' });
                }
                if (materialIdSet.has(mId)) {
                    return res.status(400).json({ success: false, message: 'Duplicate material detected in cart. Please merge quantities into a single row.' });
                }
                materialIdSet.add(mId);
            }

            // 3. Process & Verify Line Items Server-Side
            let subtotal = 0;
            let taxTotal = 0;
            const processedItems = [];
            const priceOverrideLogs = [];

            for (const it of rawItems) {
                const mId = it.materialId || it.material;
                const qty = Number(it.quantity);
                const unitPrice = Number(it.unitPrice);
                const gstRate = Number(it.gstRate) || 0;
                const overrideReason = (it.overrideReason || req.body.overrideReason || '').trim();

                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({ success: false, message: 'Item quantity must be a positive number greater than 0.' });
                }
                if (isNaN(unitPrice) || unitPrice < 0) {
                    return res.status(400).json({ success: false, message: 'Unit selling price cannot be negative.' });
                }
                if (gstRate < 0 || gstRate > 100) {
                    return res.status(400).json({ success: false, message: 'GST tax rate must be between 0% and 100%.' });
                }

                // Fetch material master
                let material = null;
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    material = await Material.findById(mId);
                } else {
                    const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                    material = allM.find(m => m._id.toString() === mId.toString());
                }

                if (!material) {
                    return res.status(400).json({ success: false, message: `Material with ID ${mId} was not found.` });
                }
                if (material.isActive === false) {
                    return res.status(400).json({ success: false, message: `Material "${material.name}" (${material.sku}) is inactive and cannot be sold.` });
                }

                // Check sellable on-hand stock
                const availableStock = material.currentStock || 0;
                if (qty > availableStock) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient sellable stock for "${material.name}". Available: ${availableStock} ${material.unit}, Requested: ${qty} ${material.unit}.`
                    });
                }

                // Price Override Audit Check
                const defaultPrice = material.defaultSellingPrice || 0;
                const wac = material.weightedAverageCost || 0;
                const isPriceBelowDefault = defaultPrice > 0 && unitPrice < defaultPrice;
                const isPriceBelowCost = wac > 0 && unitPrice < wac;
                const isOverridden = isPriceBelowDefault || isPriceBelowCost;

                if (isOverridden && !overrideReason) {
                    return res.status(400).json({
                        success: false,
                        message: `Price override reason is mandatory when selling price (₹${unitPrice}) is below default price (₹${defaultPrice}) or unit cost (₹${wac}) for material "${material.name}".`
                    });
                }

                if (isOverridden) {
                    priceOverrideLogs.push({
                        materialId: material._id,
                        sku: material.sku,
                        name: material.name,
                        originalPrice: defaultPrice,
                        costPrice: wac,
                        customPrice: unitPrice,
                        reason: overrideReason
                    });
                }

                const lineSubtotal = round2(qty * unitPrice);
                const lineTax = round2(lineSubtotal * (gstRate / 100));
                const lineTotal = round2(lineSubtotal + lineTax);

                subtotal = round2(subtotal + lineSubtotal);
                taxTotal = round2(taxTotal + lineTax);

                processedItems.push({
                    material: material._id,
                    materialName: material.name,
                    sku: material.sku,
                    unit: material.unit || 'Piece',
                    quantity: qty,
                    unitPrice: unitPrice,
                    costPriceSnapshot: wac,
                    gstRate: gstRate,
                    taxAmount: lineTax,
                    lineTotal: lineTotal,
                    dispatchedQuantity: 0,
                    returnedQuantity: 0,
                    priceOverride: {
                        isOverridden,
                        originalPrice: defaultPrice,
                        customPrice: unitPrice,
                        reason: overrideReason,
                        overriddenBy: isOverridden ? userId : null,
                        overriddenAt: isOverridden ? new Date() : null
                    }
                });
            }

            // 4. Financial Calculations
            const discount = round2(Math.max(0, Number(rawDiscount) || 0));
            const additionalCharges = round2(Math.max(0, Number(rawAdditional) || 0));
            const grandTotal = round2(Math.max(0, subtotal + taxTotal + additionalCharges - discount));

            // Optional Project Link
            let validProjectId = null;
            let projectNumberStr = '';
            if (projectId && mongoose.isValidObjectId(projectId)) {
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    const p = await Project.findById(projectId).select('projectNumber').lean();
                    if (p) {
                        validProjectId = p._id;
                        projectNumberStr = p.projectNumber;
                    }
                }
            }

            // 5. Concurrency-Safe Sale Numbering
            const year = new Date().getFullYear();
            const seq = await Counter.getNextSequence(`material_sale_${year}`);
            const saleNumber = `SES-SALE-${year}-${String(seq).padStart(4, '0')}`;

            const saleDocData = {
                _id: new mongoose.Types.ObjectId(),
                saleNumber,
                saleDate: new Date(),
                status: status === 'CONFIRMED' ? 'CONFIRMED' : 'DRAFT',
                buyerType,
                customer: linkedCustomerId,
                customerName,
                customerMobile,
                customerEmail: (customerEmail || '').trim().toLowerCase(),
                customerAddress: (customerAddress || '').trim(),
                city: (city || 'Raisen').trim(),
                district: (district || 'Raisen').trim(),
                state: (state || 'Madhya Pradesh').trim(),
                pincode: (pincode || '').trim(),
                companyName: (companyName || '').trim(),
                contactPerson: (contactPerson || '').trim(),
                customerGstin: (customerGstin || '').trim().toUpperCase(),
                customerType,
                project: validProjectId,
                projectNumber: projectNumberStr,
                items: processedItems,
                subtotal,
                taxTotal,
                discount,
                additionalCharges,
                grandTotal,
                paymentStatus: ['UNPAID', 'PARTIALLY_PAID', 'PAID'].includes(paymentStatus) ? paymentStatus : 'UNPAID',
                paymentMethod,
                dispatchStatus: 'NOT_DISPATCHED',
                notes: (notes || '').trim(),
                createdBy: userId,
                updatedBy: userId
            };

            // 6. If Confirmation Requested, Execute Atomic Stock Deduction & Invoice Snapshot
            if (saleDocData.status === 'CONFIRMED') {
                const invSeq = await Counter.getNextSequence(`mat_sale_inv_${year}`);
                const invoiceNumber = `SES-MINV-${year}-${String(invSeq).padStart(4, '0')}`;
                saleDocData.invoice = {
                    invoiceNumber,
                    invoiceDate: new Date(),
                    generatedAt: new Date(),
                    snapshot: {
                        company: data.company,
                        customerName,
                        customerMobile,
                        customerGstin,
                        customerAddress,
                        subtotal,
                        taxTotal,
                        grandTotal,
                        items: processedItems
                    }
                };
                saleDocData.confirmedAt = new Date();
                saleDocData.confirmedBy = userId;

                // Atomic stock deduction loop
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    for (const item of processedItems) {
                        const updatedMat = await Material.findOneAndUpdate(
                            { _id: item.material, currentStock: { $gte: item.quantity } },
                            { $inc: { currentStock: -item.quantity } },
                            { new: true }
                        );

                        if (!updatedMat) {
                            return res.status(400).json({
                                success: false,
                                message: `Insufficient stock for ${item.materialName}. Stock balance may have changed concurrently.`
                            });
                        }

                        // Write Inventory Transaction Ledger
                        const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                        const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                        await InventoryTransaction.create({
                            transactionNumber: txNumber,
                            material: item.material,
                            transactionType: 'SALES_OUT',
                            quantityIn: 0,
                            quantityOut: item.quantity,
                            unitCost: item.costPriceSnapshot,
                            totalCost: round2(item.quantity * item.costPriceSnapshot),
                            balanceAfter: updatedMat.currentStock,
                            sourceReferenceType: 'MaterialSale',
                            sourceReferenceId: saleDocData._id,
                            sourceReferenceNumber: saleNumber,
                            performedBy: userId || new mongoose.Types.ObjectId(),
                            notes: `Material sale ${saleNumber} to ${customerName}. Unit sell price ₹${item.unitPrice}.`
                        });
                    }
                } else {
                    // In-memory stock deduction fallback
                    const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                    for (const item of processedItems) {
                        const m = allM.find(mat => mat._id.toString() === item.material.toString());
                        if (m) {
                            if ((m.currentStock || 0) < item.quantity) {
                                return res.status(400).json({ success: false, message: `Insufficient stock for ${item.materialName}.` });
                            }
                            m.currentStock -= item.quantity;
                        }
                    }
                }
            }

            // 7. Persist Sale Record
            let savedSale = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                savedSale = await MaterialSale.create(saleDocData);
            } else {
                memSales.unshift(saleDocData);
                savedSale = saleDocData;
            }

            // 8. Log Audits
            AuditService.log({
                action: saleDocData.status === 'CONFIRMED' ? 'MATERIAL_SALE_CONFIRMED' : 'MATERIAL_SALE_CREATED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: {
                    saleId: savedSale._id,
                    saleNumber: savedSale.saleNumber,
                    grandTotal: savedSale.grandTotal,
                    itemCount: processedItems.length,
                    status: savedSale.status
                }
            });

            // Log individual price override events
            for (const ov of priceOverrideLogs) {
                AuditService.log({
                    action: 'PRICE_OVERRIDE',
                    user: userId,
                    role: userRole,
                    ipAddress: req.ip,
                    details: {
                        saleNumber: savedSale.saleNumber,
                        ...ov
                    }
                });
            }

            return res.status(200).json({
                success: true,
                message: saleDocData.status === 'CONFIRMED'
                    ? `Material Sale ${savedSale.saleNumber} confirmed successfully. Inventory stock deducted and invoice generated.`
                    : `Material Sale draft ${savedSale.saleNumber} created successfully. Stock is unchanged.`,
                saleId: savedSale._id,
                saleNumber: savedSale.saleNumber,
                status: savedSale.status,
                sale: savedSale
            });
        } catch (err) {
            console.error('Error creating material sale:', err);
            return res.status(500).json({
                success: false,
                message: err.message || 'Internal server error while processing material sale.'
            });
        }
    }

    /**
     * POST /api/admin/sales/:id/confirm
     * Confirm a DRAFT sale order: Atomically validates stock, decrements inventory, generates invoice
     */
    static async confirmSale(req, res) {
        try {
            const { id } = req.params;
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            let sale = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(id);
            } else {
                sale = memSales.find(s => s._id.toString() === id.toString());
            }

            if (!sale) {
                return res.status(404).json({ success: false, message: 'Sale order not found.' });
            }

            // Idempotency check: Reject duplicate confirmation
            if (sale.status === 'CONFIRMED' || sale.status === 'PROCESSING') {
                return res.status(409).json({
                    success: false,
                    message: `Sale ${sale.saleNumber} has already been confirmed. Duplicate confirmation rejected.`
                });
            }
            if (sale.status === 'CANCELLED') {
                return res.status(400).json({
                    success: false,
                    message: `Sale ${sale.saleNumber} was cancelled and cannot be confirmed.`
                });
            }

            // 1. Verify stock availability for all items before any deduction
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                for (const item of sale.items) {
                    const mat = await Material.findById(item.material);
                    if (!mat || (mat.currentStock || 0) < item.quantity) {
                        return res.status(400).json({
                            success: false,
                            message: `Insufficient stock for ${item.materialName}. Available: ${(mat && mat.currentStock) || 0}, Required: ${item.quantity}.`
                        });
                    }
                }

                // 2. Atomic Status Lock (Idempotency Guard)
                const lockedSale = await MaterialSale.findOneAndUpdate(
                    { _id: sale._id, status: 'DRAFT' },
                    {
                        $set: {
                            status: 'CONFIRMED',
                            confirmedAt: new Date(),
                            confirmedBy: userId,
                            updatedBy: userId
                        }
                    },
                    { new: true }
                );

                if (!lockedSale) {
                    return res.status(409).json({
                        success: false,
                        message: `Sale ${sale.saleNumber} has already been confirmed.`
                    });
                }

                // 3. Atomically decrement stock and post ledger entries
                const year = new Date().getFullYear();
                for (const item of sale.items) {
                    const updatedMat = await Material.findOneAndUpdate(
                        { _id: item.material, currentStock: { $gte: item.quantity } },
                        { $inc: { currentStock: -item.quantity } },
                        { new: true }
                    );

                    if (!updatedMat) {
                        return res.status(400).json({
                            success: false,
                            message: `Insufficient stock for ${item.materialName}. Concurrently modified.`
                        });
                    }

                    const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                    const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                    await InventoryTransaction.create({
                        transactionNumber: txNumber,
                        material: item.material,
                        transactionType: 'SALES_OUT',
                        quantityIn: 0,
                        quantityOut: item.quantity,
                        unitCost: item.costPriceSnapshot,
                        totalCost: round2(item.quantity * item.costPriceSnapshot),
                        balanceAfter: updatedMat.currentStock,
                        sourceReferenceType: 'MaterialSale',
                        sourceReferenceId: sale._id,
                        sourceReferenceNumber: sale.saleNumber,
                        performedBy: userId || new mongoose.Types.ObjectId(),
                        notes: `Confirmed sale ${sale.saleNumber} to ${sale.customerName}.`
                    });
                }

                // 4. Generate Invoice Snapshot
                const invSeq = await Counter.getNextSequence(`mat_sale_inv_${year}`);
                const invoiceNumber = `SES-MINV-${year}-${String(invSeq).padStart(4, '0')}`;
                lockedSale.invoice = {
                    invoiceNumber,
                    invoiceDate: new Date(),
                    generatedAt: new Date(),
                    snapshot: {
                        company: data.company,
                        customerName: sale.customerName,
                        customerMobile: sale.customerMobile,
                        customerGstin: sale.customerGstin,
                        subtotal: sale.subtotal,
                        taxTotal: sale.taxTotal,
                        grandTotal: sale.grandTotal,
                        items: sale.items
                    }
                };
                await lockedSale.save();
            } else {
                const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                for (const item of sale.items) {
                    const m = allM.find(mat => mat._id.toString() === item.material.toString());
                    if (!m || (m.currentStock || 0) < item.quantity) {
                        return res.status(400).json({
                            success: false,
                            message: `Insufficient stock for ${item.materialName}. Available: ${(m && m.currentStock) || 0}, Required: ${item.quantity}.`
                        });
                    }
                }
                sale.status = 'CONFIRMED';
                sale.confirmedAt = new Date();
                sale.confirmedBy = userId;
                const year = new Date().getFullYear();
                sale.invoice = {
                    invoiceNumber: `SES-MINV-${year}-${Math.floor(1000 + Math.random() * 9000)}`,
                    invoiceDate: new Date(),
                    generatedAt: new Date()
                };
                for (const item of sale.items) {
                    const m = allM.find(mat => mat._id.toString() === item.material.toString());
                    if (m) m.currentStock = Math.max(0, (m.currentStock || 0) - item.quantity);
                }
            }

            AuditService.log({
                action: 'MATERIAL_SALE_CONFIRMED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: { saleId: sale._id, saleNumber: sale.saleNumber }
            });

            return res.json({
                success: true,
                message: `Sale ${sale.saleNumber} confirmed successfully. Inventory stock deducted and invoice generated.`
            });
        } catch (err) {
            console.error('Error confirming material sale:', err);
            return res.status(500).json({ success: false, message: 'Server error while confirming sale order.' });
        }
    }

    /**
     * POST /api/admin/sales/:id/cancel
     * Cancel a sale order (Reverses stock if confirmed and not yet dispatched)
     */
    static async cancelSale(req, res) {
        try {
            const { id } = req.params;
            const { reason = '' } = req.body;
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            let sale = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(id);
            } else {
                sale = memSales.find(s => s._id.toString() === id.toString());
            }

            if (!sale) {
                return res.status(404).json({ success: false, message: 'Sale order not found.' });
            }

            if (sale.status === 'CANCELLED') {
                return res.status(400).json({ success: false, message: 'Sale order is already cancelled.' });
            }

            // If confirmed, check if any items were dispatched
            if (sale.status === 'CONFIRMED' || sale.status === 'PROCESSING') {
                const hasDispatches = (sale.items || []).some(i => (i.dispatchedQuantity || 0) > 0);
                if (hasDispatches) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot directly cancel a sale that has already dispatched materials. Please initiate a Return instead.'
                    });
                }

                // Re-credit sellable stock
                const year = new Date().getFullYear();
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    for (const item of sale.items) {
                        const updatedMat = await Material.findByIdAndUpdate(
                            item.material,
                            { $inc: { currentStock: item.quantity } },
                            { new: true }
                        );

                        const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                        const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                        await InventoryTransaction.create({
                            transactionNumber: txNumber,
                            material: item.material,
                            transactionType: 'STOCK_ADJUSTMENT',
                            quantityIn: item.quantity,
                            quantityOut: 0,
                            unitCost: item.costPriceSnapshot,
                            totalCost: round2(item.quantity * item.costPriceSnapshot),
                            balanceAfter: updatedMat ? updatedMat.currentStock : 0,
                            sourceReferenceType: 'MaterialSale',
                            sourceReferenceId: sale._id,
                            sourceReferenceNumber: sale.saleNumber,
                            performedBy: userId || new mongoose.Types.ObjectId(),
                            notes: `Sale ${sale.saleNumber} cancelled by admin. Stock re-credited.`
                        });
                    }
                } else {
                    const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                    for (const item of sale.items) {
                        const m = allM.find(mat => mat._id.toString() === item.material.toString());
                        if (m) m.currentStock = (m.currentStock || 0) + item.quantity;
                    }
                }
            }

            sale.status = 'CANCELLED';
            sale.cancelledAt = new Date();
            sale.cancelledBy = userId;
            sale.cancellationReason = (reason || '').trim();

            if (sale.save) await sale.save();

            AuditService.log({
                action: 'MATERIAL_SALE_CANCELLED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: { saleId: sale._id, saleNumber: sale.saleNumber, reason }
            });

            return res.json({
                success: true,
                message: `Sale ${sale.saleNumber} has been cancelled successfully.`
            });
        } catch (err) {
            console.error('Error cancelling sale:', err);
            return res.status(500).json({ success: false, message: 'Server error while cancelling sale.' });
        }
    }

    /**
     * GET /api/admin/customers/search
     * Safe search autocomplete for existing CRM customers
     */
    static async searchCustomersApi(req, res) {
        try {
            const q = (req.query.q || '').trim();
            if (!q || q.length < 2) {
                return res.json({ success: true, customers: [] });
            }

            const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            let customers = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                customers = await Customer.find({
                    $or: [
                        { name: searchRegex },
                        { mobile: searchRegex },
                        { companyName: searchRegex }
                    ]
                })
                .limit(15)
                .select('name mobile email city state address gstin customerType companyName')
                .lean();
            }

            // Return safe object structure
            const safeList = (customers || []).map(c => ({
                _id: c._id,
                name: c.name,
                mobile: c.mobile,
                email: c.email || '',
                city: c.city || 'Raisen',
                state: c.state || 'Madhya Pradesh',
                address: c.address || '',
                gstin: c.gstin || '',
                customerType: c.customerType || 'INDIVIDUAL',
                companyName: c.companyName || ''
            }));

            return res.json({ success: true, customers: safeList });
        } catch (err) {
            console.error('Error searching customers:', err);
            return res.status(500).json({ success: false, message: 'Error searching customers.' });
        }
    }

    /**
     * POST /api/admin/customers/quick-create
     * Quick Customer Creation directly from Sales Interface
     */
    static async quickCreateCustomerApi(req, res) {
        try {
            const name = (req.body.name || '').trim();
            const mobile = (req.body.mobile || '').trim();
            const email = (req.body.email || '').trim().toLowerCase();
            const address = (req.body.address || '').trim();
            const city = (req.body.city || 'Raisen').trim();
            const state = (req.body.state || 'Madhya Pradesh').trim();
            const pincode = (req.body.pincode || '').trim();
            const gstin = (req.body.gstin || '').trim().toUpperCase();
            const companyName = (req.body.companyName || '').trim();
            const contactPerson = (req.body.contactPerson || '').trim();
            const customerType = req.body.customerType || 'INDIVIDUAL';

            if (!name) return res.status(400).json({ success: false, message: 'Customer name is required.' });
            if (!mobile) return res.status(400).json({ success: false, message: 'Primary mobile number is required.' });

            let newCust = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                newCust = await Customer.create({
                    name,
                    mobile,
                    email,
                    address,
                    city,
                    state,
                    pincode,
                    gstin,
                    companyName,
                    contactPerson,
                    customerType,
                    status: 'ACTIVE',
                    createdBy: req.session.user ? req.session.user._id : null
                });
            } else {
                newCust = {
                    _id: new mongoose.Types.ObjectId(),
                    name,
                    mobile,
                    email,
                    address,
                    city,
                    state,
                    pincode,
                    gstin,
                    companyName,
                    contactPerson,
                    customerType
                };
            }

            return res.json({
                success: true,
                message: `Customer ${name} created successfully.`,
                customer: newCust
            });
        } catch (err) {
            console.error('Error quick creating customer:', err);
            return res.status(500).json({ success: false, message: 'Error creating customer record.' });
        }
    }

    /**
     * GET /api/admin/sales/export
     * Export Sales Records as CSV
     */
    static async exportSalesCsv(req, res) {
        try {
            let sales = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sales = await MaterialSale.find({})
                    .sort({ saleDate: -1 })
                    .populate('customer', 'name mobile')
                    .populate('project', 'projectNumber')
                    .lean();
            } else {
                sales = [...memSales];
            }

            let csv = 'Sale Number,Sale Date,Customer Name,Customer Type,Payment Status,Dispatch Status,Grand Total\n';
            sales.forEach(s => {
                const date = s.saleDate ? new Date(s.saleDate).toISOString().split('T')[0] : '';
                const custName = `"${(s.customerName || '').replace(/"/g, '""')}"`;
                csv += `${s.saleNumber},${date},${custName},${s.customerType || 'INDIVIDUAL'},${s.paymentStatus || 'UNPAID'},${s.dispatchStatus || 'NOT_DISPATCHED'},${s.grandTotal || 0}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="SES-Material-Sales-${Date.now()}.csv"`);
            return res.send(csv);
        } catch (err) {
            console.error('Error exporting sales CSV:', err);
            return res.status(500).send('Error generating sales CSV.');
        }
    }

    // =========================================================================
    // 2. DISPATCH MANAGEMENT
    // =========================================================================

    /**
     * GET /admin/dispatch
     * Dispatch Listing & Logistics Dashboard
     */
    static async getDispatchListPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (status) query.status = status;
            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { dispatchNumber: searchRegex },
                    { saleNumber: searchRegex },
                    { customerName: searchRegex },
                    { trackingNumber: searchRegex },
                    { transporterName: searchRegex }
                ];
            }

            let dispatches = [];
            let total = 0;
            let stats = {
                totalDispatches: 0,
                pendingDispatches: 0,
                shippedDispatches: 0,
                deliveredDispatches: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await MaterialDispatch.countDocuments(query);
                dispatches = await MaterialDispatch.find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('sale', 'saleNumber grandTotal customerName')
                    .populate('createdBy', 'name employeeId')
                    .lean();

                const [allCount, pendingCount, shippedCount, deliveredCount] = await Promise.all([
                    MaterialDispatch.countDocuments({}),
                    MaterialDispatch.countDocuments({ status: { $in: ['NOT_DISPATCHED', 'PACKING', 'READY_FOR_DISPATCH'] } }),
                    MaterialDispatch.countDocuments({ status: { $in: ['SHIPPED', 'PARTIALLY_DELIVERED'] } }),
                    MaterialDispatch.countDocuments({ status: 'DELIVERED' })
                ]);

                stats = {
                    totalDispatches: allCount,
                    pendingDispatches: pendingCount,
                    shippedDispatches: shippedCount,
                    deliveredDispatches: deliveredCount
                };
            } else {
                let filtered = [...memDispatches];
                if (query.status) filtered = filtered.filter(d => d.status === query.status);
                if (search) {
                    const s = search.toLowerCase();
                    filtered = filtered.filter(d =>
                        (d.dispatchNumber && d.dispatchNumber.toLowerCase().includes(s)) ||
                        (d.saleNumber && d.saleNumber.toLowerCase().includes(s)) ||
                        (d.customerName && d.customerName.toLowerCase().includes(s))
                    );
                }
                total = filtered.length;
                dispatches = filtered.slice(skip, skip + limit);
                stats = {
                    totalDispatches: memDispatches.length,
                    pendingDispatches: memDispatches.filter(d => ['NOT_DISPATCHED', 'PACKING', 'READY_FOR_DISPATCH'].includes(d.status)).length,
                    shippedDispatches: memDispatches.filter(d => ['SHIPPED', 'PARTIALLY_DELIVERED'].includes(d.status)).length,
                    deliveredDispatches: memDispatches.filter(d => d.status === 'DELIVERED').length
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/dispatches', {
                title: `Dispatch Management | ${data.company.name}`,
                data,
                company: data.company,
                dispatches,
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                filters: { search, status },
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-dispatch',
                currentActive: 'material-dispatch',
                pageTitle: 'Material Dispatch Management',
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Dispatch Management' }
                ]
            });
        } catch (err) {
            console.error('Error loading dispatch list:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load dispatch records.'
            });
        }
    }

    /**
     * GET /admin/dispatch/:id
     * Dispatch Details & Tracking Form
     */
    static async getDispatchViewPage(req, res) {
        try {
            const { id } = req.params;
            let dispatch = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                dispatch = await MaterialDispatch.findById(id)
                    .populate('sale')
                    .populate('createdBy', 'name employeeId')
                    .populate('statusHistory.changedBy', 'name employeeId')
                    .lean();
            } else {
                dispatch = memDispatches.find(d => d._id.toString() === id.toString());
            }

            if (!dispatch) {
                return res.status(404).render('private/errors/404', {
                    title: 'Dispatch Not Found | Shivay Energy Solutions',
                    message: 'The requested dispatch manifest was not found.'
                });
            }

            res.render('private/admin/dispatch-view', {
                title: `${dispatch.dispatchNumber} | Dispatch Details`,
                data,
                company: data.company,
                dispatch,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-dispatch',
                currentActive: 'material-dispatch',
                pageTitle: `Dispatch: ${dispatch.dispatchNumber}`,
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Dispatch Management', url: '/admin/dispatch' },
                    { label: dispatch.dispatchNumber }
                ]
            });
        } catch (err) {
            console.error('Error rendering dispatch view:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load dispatch details.'
            });
        }
    }

    /**
     * POST /api/admin/dispatch
     * Create Dispatch Against Confirmed Sale Order (Never deducts stock!)
     */
    static async createDispatch(req, res) {
        try {
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            const {
                saleId,
                items: rawItems,
                transporterName = '',
                vehicleNumber = '',
                trackingNumber = '',
                shippingAddress = '',
                contactPerson = '',
                contactPhone = '',
                dispatchNotes = '',
                expectedDeliveryDate
            } = req.body;

            if (!saleId || !mongoose.isValidObjectId(saleId)) {
                return res.status(400).json({ success: false, message: 'Valid confirmed sale order ID is required.' });
            }

            let sale = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(saleId);
            } else {
                sale = memSales.find(s => s._id.toString() === saleId.toString());
            }

            if (!sale) {
                return res.status(404).json({ success: false, message: 'Sale order not found.' });
            }

            if (sale.status !== 'CONFIRMED' && sale.status !== 'PROCESSING') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot dispatch from a sale with status "${sale.status}". Sale must be CONFIRMED.`
                });
            }

            if (!Array.isArray(rawItems) || rawItems.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one item to dispatch must be specified.' });
            }

            const dispatchItems = [];
            for (const it of rawItems) {
                const mId = (it.materialId || it.material || '').toString();
                const dQty = Number(it.dispatchedQuantity);

                if (!mId || isNaN(dQty) || dQty <= 0) continue;

                // Match with sale order items
                const saleItem = (sale.items || []).find(si => si.material.toString() === mId);
                if (!saleItem) {
                    return res.status(400).json({ success: false, message: 'Item does not exist in the confirmed sale order.' });
                }

                const alreadyDispatched = saleItem.dispatchedQuantity || 0;
                const remainingToDispatch = saleItem.quantity - alreadyDispatched;

                if (dQty > remainingToDispatch) {
                    return res.status(400).json({
                        success: false,
                        message: `Dispatched quantity (${dQty}) exceeds remaining pending quantity (${remainingToDispatch}) for ${saleItem.materialName}.`
                    });
                }

                // Increment dispatched counter on sale item
                saleItem.dispatchedQuantity = alreadyDispatched + dQty;

                dispatchItems.push({
                    material: saleItem.material,
                    materialName: saleItem.materialName,
                    sku: saleItem.sku,
                    unit: saleItem.unit,
                    orderedQuantity: saleItem.quantity,
                    dispatchedQuantity: dQty
                });
            }

            if (dispatchItems.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid dispatch quantities were provided.' });
            }

            // Update overall sale dispatchStatus
            const allFulfilled = sale.items.every(si => (si.dispatchedQuantity || 0) >= si.quantity);
            sale.dispatchStatus = allFulfilled ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED';
            sale.status = 'PROCESSING';
            if (sale.save) await sale.save();

            // Generate Dispatch Number
            const year = new Date().getFullYear();
            const seq = await Counter.getNextSequence(`material_dispatch_${year}`);
            const dispatchNumber = `SES-DSP-${year}-${String(seq).padStart(4, '0')}`;

            const dispatchDoc = {
                _id: new mongoose.Types.ObjectId(),
                dispatchNumber,
                sale: sale._id,
                saleNumber: sale.saleNumber,
                customerName: sale.customerName,
                dispatchDate: new Date(),
                expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
                status: 'READY_FOR_DISPATCH',
                items: dispatchItems,
                transporterName: (transporterName || '').trim(),
                vehicleNumber: (vehicleNumber || '').trim().toUpperCase(),
                trackingNumber: (trackingNumber || '').trim(),
                shippingAddress: (shippingAddress || sale.customerAddress || '').trim(),
                contactPerson: (contactPerson || sale.contactPerson || sale.customerName || '').trim(),
                contactPhone: (contactPhone || sale.customerMobile || '').trim(),
                dispatchNotes: (dispatchNotes || '').trim(),
                statusHistory: [{
                    status: 'READY_FOR_DISPATCH',
                    changedBy: userId,
                    changedAt: new Date(),
                    notes: 'Dispatch consignment generated and staged for pickup.'
                }],
                createdBy: userId,
                updatedBy: userId
            };

            let savedDispatch = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                savedDispatch = await MaterialDispatch.create(dispatchDoc);
            } else {
                memDispatches.unshift(dispatchDoc);
                savedDispatch = dispatchDoc;
            }

            AuditService.log({
                action: 'DISPATCH_CREATED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: {
                    dispatchId: savedDispatch._id,
                    dispatchNumber: savedDispatch.dispatchNumber,
                    saleNumber: sale.saleNumber,
                    itemCount: dispatchItems.length
                }
            });

            return res.json({
                success: true,
                message: `Dispatch consignment ${savedDispatch.dispatchNumber} created successfully.`,
                dispatchId: savedDispatch._id,
                dispatchNumber: savedDispatch.dispatchNumber
            });
        } catch (err) {
            console.error('Error creating dispatch:', err);
            return res.status(500).json({ success: false, message: 'Server error while creating dispatch consignment.' });
        }
    }

    /**
     * POST /api/admin/dispatch/:id/status
     * Update Dispatch Logistics Status (Never touches stock!)
     */
    static async updateDispatchStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, notes = '', receivedBy = '', deliveryNotes = '' } = req.body;
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            const validStatuses = ['NOT_DISPATCHED', 'PACKING', 'READY_FOR_DISPATCH', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'DELIVERY_FAILED'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid dispatch status specified.' });
            }

            let dispatch = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                dispatch = await MaterialDispatch.findById(id);
            } else {
                dispatch = memDispatches.find(d => d._id.toString() === id.toString());
            }

            if (!dispatch) {
                return res.status(404).json({ success: false, message: 'Dispatch record not found.' });
            }

            dispatch.status = status;
            dispatch.updatedBy = userId;
            dispatch.statusHistory = dispatch.statusHistory || [];
            dispatch.statusHistory.push({
                status,
                changedBy: userId,
                changedAt: new Date(),
                notes: notes.trim()
            });

            if (status === 'DELIVERED') {
                dispatch.deliveredAt = new Date();
                if (receivedBy) dispatch.receivedBy = receivedBy.trim();
                if (deliveryNotes) dispatch.deliveryNotes = deliveryNotes.trim();

                // If sale exists, check if all dispatches for this sale are delivered
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    const siblingDispatches = await MaterialDispatch.find({ sale: dispatch.sale });
                    const allDelivered = siblingDispatches.every(d => d._id.toString() === dispatch._id.toString() || d.status === 'DELIVERED');
                    if (allDelivered) {
                        await MaterialSale.findByIdAndUpdate(dispatch.sale, { dispatchStatus: 'DELIVERED' });
                    }
                }
            }

            if (dispatch.save) await dispatch.save();

            AuditService.log({
                action: 'DISPATCH_STATUS_UPDATED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: { dispatchId: dispatch._id, dispatchNumber: dispatch.dispatchNumber, newStatus: status }
            });

            return res.json({
                success: true,
                message: `Dispatch ${dispatch.dispatchNumber} status updated to ${status}.`
            });
        } catch (err) {
            console.error('Error updating dispatch status:', err);
            return res.status(500).json({ success: false, message: 'Server error updating dispatch status.' });
        }
    }

    // =========================================================================
    // 3. RETURNS MANAGEMENT
    // =========================================================================

    /**
     * GET /admin/returns
     * Material Returns Listing & Condition Metrics
     */
    static async getReturnsListPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (status) query.status = status;
            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { returnNumber: searchRegex },
                    { saleNumber: searchRegex },
                    { customerName: searchRegex },
                    { returnReason: searchRegex }
                ];
            }

            let returns = [];
            let total = 0;
            let stats = {
                totalReturns: 0,
                pendingInspection: 0,
                approvedReturns: 0,
                goodRestockedUnits: 0,
                damagedUnits: 0,
                defectiveUnits: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await MaterialReturn.countDocuments(query);
                returns = await MaterialReturn.find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('sale', 'saleNumber grandTotal customerName')
                    .populate('inspectingUser', 'name employeeId')
                    .populate('approvedBy', 'name employeeId')
                    .lean();

                const [allCount, pendingCount, approvedCount, allReturns] = await Promise.all([
                    MaterialReturn.countDocuments({}),
                    MaterialReturn.countDocuments({ status: { $in: ['REQUESTED', 'RECEIVED', 'UNDER_INSPECTION'] } }),
                    MaterialReturn.countDocuments({ status: { $in: ['APPROVED', 'COMPLETED'] } }),
                    MaterialReturn.find({ status: { $in: ['APPROVED', 'COMPLETED'] } }).select('items').lean()
                ]);

                let goodU = 0;
                let damU = 0;
                let defU = 0;
                (allReturns || []).forEach(r => {
                    (r.items || []).forEach(it => {
                        if (it.condition === 'GOOD') goodU += (it.returnedQuantity || 0);
                        else if (it.condition === 'DAMAGED') damU += (it.returnedQuantity || 0);
                        else if (it.condition === 'DEFECTIVE') defU += (it.returnedQuantity || 0);
                    });
                });

                stats = {
                    totalReturns: allCount,
                    pendingInspection: pendingCount,
                    approvedReturns: approvedCount,
                    goodRestockedUnits: goodU,
                    damagedUnits: damU,
                    defectiveUnits: defU
                };
            } else {
                let filtered = [...memReturns];
                if (query.status) filtered = filtered.filter(r => r.status === query.status);
                if (search) {
                    const s = search.toLowerCase();
                    filtered = filtered.filter(r =>
                        (r.returnNumber && r.returnNumber.toLowerCase().includes(s)) ||
                        (r.saleNumber && r.saleNumber.toLowerCase().includes(s)) ||
                        (r.customerName && r.customerName.toLowerCase().includes(s))
                    );
                }
                total = filtered.length;
                returns = filtered.slice(skip, skip + limit);

                let goodU = 0;
                let damU = 0;
                let defU = 0;
                memReturns.filter(r => r.status === 'APPROVED' || r.status === 'COMPLETED').forEach(r => {
                    (r.items || []).forEach(it => {
                        if (it.condition === 'GOOD') goodU += (it.returnedQuantity || 0);
                        else if (it.condition === 'DAMAGED') damU += (it.returnedQuantity || 0);
                        else if (it.condition === 'DEFECTIVE') defU += (it.returnedQuantity || 0);
                    });
                });

                stats = {
                    totalReturns: memReturns.length,
                    pendingInspection: memReturns.filter(r => ['REQUESTED', 'RECEIVED', 'UNDER_INSPECTION'].includes(r.status)).length,
                    approvedReturns: memReturns.filter(r => ['APPROVED', 'COMPLETED'].includes(r.status)).length,
                    goodRestockedUnits: goodU,
                    damagedUnits: damU,
                    defectiveUnits: defU
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/returns', {
                title: `Returns Management | ${data.company.name}`,
                data,
                company: data.company,
                returns,
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                filters: { search, status },
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-returns',
                currentActive: 'material-returns',
                pageTitle: 'Material Returns & RMA',
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Returns' }
                ]
            });
        } catch (err) {
            console.error('Error loading returns list:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load return records.'
            });
        }
    }

    /**
     * GET /admin/returns/:id
     * Return Inspection & Disposition View
     */
    static async getReturnViewPage(req, res) {
        try {
            const { id } = req.params;
            let returnDoc = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                returnDoc = await MaterialReturn.findById(id)
                    .populate('sale')
                    .populate('inspectingUser', 'name employeeId')
                    .populate('approvedBy', 'name employeeId')
                    .populate('rejectedBy', 'name employeeId')
                    .lean();
            } else {
                returnDoc = memReturns.find(r => r._id.toString() === id.toString());
            }

            if (!returnDoc) {
                return res.status(404).render('private/errors/404', {
                    title: 'Return Not Found | Shivay Energy Solutions',
                    message: 'The requested material return record was not found.'
                });
            }

            res.render('private/admin/return-view', {
                title: `${returnDoc.returnNumber} | Return Inspection Details`,
                data,
                company: data.company,
                returnDoc,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'material-returns',
                currentActive: 'material-returns',
                pageTitle: `Return: ${returnDoc.returnNumber}`,
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Returns', url: '/admin/returns' },
                    { label: returnDoc.returnNumber }
                ]
            });
        } catch (err) {
            console.error('Error viewing return:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load return inspection details.'
            });
        }
    }

    /**
     * POST /api/admin/returns
     * Initiate Material Return Request against Confirmed Sale
     */
    static async createReturnRequest(req, res) {
        try {
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            const {
                saleId,
                items: rawItems,
                returnReason,
                refundStatus = 'NOT_APPLICABLE',
                refundAmount = 0,
                notes = ''
            } = req.body;

            if (!saleId || !mongoose.isValidObjectId(saleId)) {
                return res.status(400).json({ success: false, message: 'Valid confirmed sale order ID is required.' });
            }
            if (!returnReason || !returnReason.trim()) {
                return res.status(400).json({ success: false, message: 'Return reason is required.' });
            }
            if (!Array.isArray(rawItems) || rawItems.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one return item is required.' });
            }

            let sale = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                sale = await MaterialSale.findById(saleId);
            } else {
                sale = memSales.find(s => s._id.toString() === saleId.toString());
            }

            if (!sale) {
                return res.status(404).json({ success: false, message: 'Sale order not found.' });
            }

            if (sale.status !== 'CONFIRMED' && sale.status !== 'PROCESSING') {
                return res.status(400).json({
                    success: false,
                    message: `Returns can only be initiated against CONFIRMED or PROCESSING sales (current status: "${sale.status}").`
                });
            }

            const returnItems = [];
            for (const it of rawItems) {
                const mId = (it.materialId || it.material || '').toString();
                const rQty = Number(it.returnedQuantity);
                const condition = ['GOOD', 'DAMAGED', 'DEFECTIVE', 'PENDING_INSPECTION'].includes(it.condition) ? it.condition : 'PENDING_INSPECTION';

                if (!mId || isNaN(rQty) || rQty <= 0) continue;

                // Validate against sale items
                const saleItem = (sale.items || []).find(si => si.material.toString() === mId);
                if (!saleItem) {
                    return res.status(400).json({ success: false, message: 'Returned item does not belong to the original sale order.' });
                }

                const previousReturns = saleItem.returnedQuantity || 0;
                const maxReturnable = saleItem.quantity - previousReturns;

                if (rQty > maxReturnable) {
                    return res.status(400).json({
                        success: false,
                        message: `Return quantity (${rQty}) exceeds remaining returnable quantity (${maxReturnable}) for ${saleItem.materialName}.`
                    });
                }

                saleItem.returnedQuantity = previousReturns + rQty;

                returnItems.push({
                    material: saleItem.material,
                    materialName: saleItem.materialName,
                    sku: saleItem.sku,
                    unit: saleItem.unit,
                    soldQuantity: saleItem.quantity,
                    returnedQuantity: rQty,
                    condition,
                    inspectionNotes: (it.inspectionNotes || '').trim(),
                    restocked: false,
                    restockedQuantity: 0,
                    nonSellableRecorded: false
                });
            }

            if (returnItems.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid items specified for return.' });
            }

            if (sale.save) await sale.save();

            // Generate Return Number
            const year = new Date().getFullYear();
            const seq = await Counter.getNextSequence(`material_return_${year}`);
            const returnNumber = `SES-RET-${year}-${String(seq).padStart(4, '0')}`;

            const returnDoc = {
                _id: new mongoose.Types.ObjectId(),
                returnNumber,
                sale: sale._id,
                saleNumber: sale.saleNumber,
                customer: sale.customer,
                customerName: sale.customerName,
                status: 'REQUESTED',
                items: returnItems,
                returnReason: returnReason.trim(),
                receivedDate: new Date(),
                refundStatus,
                refundAmount: Math.max(0, Number(refundAmount) || 0),
                notes: notes.trim(),
                createdBy: userId,
                updatedBy: userId
            };

            let savedReturn = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                savedReturn = await MaterialReturn.create(returnDoc);
            } else {
                memReturns.unshift(returnDoc);
                savedReturn = returnDoc;
            }

            AuditService.log({
                action: 'RETURN_REQUESTED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: {
                    returnId: savedReturn._id,
                    returnNumber: savedReturn.returnNumber,
                    saleNumber: sale.saleNumber,
                    itemCount: returnItems.length
                }
            });

            return res.json({
                success: true,
                message: `Material return request ${savedReturn.returnNumber} created successfully. Awaiting inspection & approval.`,
                returnId: savedReturn._id,
                returnNumber: savedReturn.returnNumber
            });
        } catch (err) {
            console.error('Error creating return request:', err);
            return res.status(500).json({ success: false, message: 'Server error while initiating return request.' });
        }
    }

    /**
     * POST /api/admin/returns/:id/approve
     * Inspect & Approve Return: Segregates stock by condition (GOOD -> Sellable, DAMAGED/DEFECTIVE -> Non-sellable quarantine)
     */
    static async inspectAndApproveReturn(req, res) {
        try {
            const { id } = req.params;
            const { items: conditionUpdates = [], refundStatus, refundAmount, notes = '' } = req.body;
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            let returnDoc = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                returnDoc = await MaterialReturn.findById(id);
            } else {
                returnDoc = memReturns.find(r => r._id.toString() === id.toString());
            }

            if (!returnDoc) {
                return res.status(404).json({ success: false, message: 'Return record not found.' });
            }

            // Idempotency check: Cannot re-approve an already approved return
            if (returnDoc.status === 'APPROVED' || returnDoc.status === 'COMPLETED') {
                return res.status(409).json({
                    success: false,
                    message: `Return ${returnDoc.returnNumber} has already been approved and stock was previously credited.`
                });
            }
            if (returnDoc.status === 'REJECTED') {
                return res.status(400).json({
                    success: false,
                    message: `Return ${returnDoc.returnNumber} was rejected and cannot be approved.`
                });
            }

            // Update conditions from request if provided
            if (Array.isArray(conditionUpdates)) {
                for (const cu of conditionUpdates) {
                    const mId = (cu.materialId || cu.material || '').toString();
                    const item = returnDoc.items.find(it => it.material.toString() === mId);
                    if (item && ['GOOD', 'DAMAGED', 'DEFECTIVE'].includes(cu.condition)) {
                        item.condition = cu.condition;
                        if (cu.inspectionNotes) item.inspectionNotes = cu.inspectionNotes.trim();
                    }
                }
            }

            const year = new Date().getFullYear();

            // Process Stock by Condition
            for (const item of returnDoc.items) {
                if (item.restocked || item.nonSellableRecorded) continue;

                if (item.condition === 'GOOD') {
                    // Restock into Sellable Inventory
                    let balanceAfter = 0;
                    if (mongoose.connection && mongoose.connection.readyState === 1) {
                        const mat = await Material.findByIdAndUpdate(
                            item.material,
                            { $inc: { currentStock: item.returnedQuantity } },
                            { new: true }
                        );
                        balanceAfter = mat ? mat.currentStock : 0;

                        const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                        const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                        await InventoryTransaction.create({
                            transactionNumber: txNumber,
                            material: item.material,
                            transactionType: 'SALES_RETURN_GOOD',
                            quantityIn: item.returnedQuantity,
                            quantityOut: 0,
                            balanceAfter,
                            sourceReferenceType: 'MaterialReturn',
                            sourceReferenceId: returnDoc._id,
                            sourceReferenceNumber: returnDoc.returnNumber,
                            performedBy: userId || new mongoose.Types.ObjectId(),
                            notes: `Good condition return for sale ${returnDoc.saleNumber}. Restocked to active inventory.`
                        });
                    } else {
                        const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                        const m = allM.find(mat => mat._id.toString() === item.material.toString());
                        if (m) m.currentStock = (m.currentStock || 0) + item.returnedQuantity;
                    }

                    item.restocked = true;
                    item.restockedQuantity = item.returnedQuantity;
                } else if (item.condition === 'DAMAGED') {
                    // Record in Damaged non-sellable quarantine (Sellable stock does NOT increase)
                    if (mongoose.connection && mongoose.connection.readyState === 1) {
                        const mat = await Material.findByIdAndUpdate(
                            item.material,
                            { $inc: { damagedStock: item.returnedQuantity } },
                            { new: true }
                        );

                        const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                        const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                        await InventoryTransaction.create({
                            transactionNumber: txNumber,
                            material: item.material,
                            transactionType: 'SALES_RETURN_DAMAGED',
                            quantityIn: item.returnedQuantity,
                            quantityOut: 0,
                            balanceAfter: mat ? mat.currentStock : 0, // Sellable stock remains untouched
                            sourceReferenceType: 'MaterialReturn',
                            sourceReferenceId: returnDoc._id,
                            sourceReferenceNumber: returnDoc.returnNumber,
                            performedBy: userId || new mongoose.Types.ObjectId(),
                            notes: `Damaged return for sale ${returnDoc.saleNumber}. Quarantined to non-sellable damaged inventory.`
                        });
                    } else {
                        const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                        const m = allM.find(mat => mat._id.toString() === item.material.toString());
                        if (m) m.damagedStock = (m.damagedStock || 0) + item.returnedQuantity;
                    }
                    item.nonSellableRecorded = true;
                } else if (item.condition === 'DEFECTIVE') {
                    // Record in Defective non-sellable quarantine (Sellable stock does NOT increase)
                    if (mongoose.connection && mongoose.connection.readyState === 1) {
                        const mat = await Material.findByIdAndUpdate(
                            item.material,
                            { $inc: { defectiveStock: item.returnedQuantity } },
                            { new: true }
                        );

                        const txSeq = await Counter.getNextSequence(`inv_tx_${year}`);
                        const txNumber = `TX-${year}-${String(txSeq).padStart(5, '0')}`;
                        await InventoryTransaction.create({
                            transactionNumber: txNumber,
                            material: item.material,
                            transactionType: 'SALES_RETURN_DEFECTIVE',
                            quantityIn: item.returnedQuantity,
                            quantityOut: 0,
                            balanceAfter: mat ? mat.currentStock : 0, // Sellable stock remains untouched
                            sourceReferenceType: 'MaterialReturn',
                            sourceReferenceId: returnDoc._id,
                            sourceReferenceNumber: returnDoc.returnNumber,
                            performedBy: userId || new mongoose.Types.ObjectId(),
                            notes: `Defective return for sale ${returnDoc.saleNumber}. Quarantined to non-sellable defective inventory.`
                        });
                    } else {
                        const allM = require('./materialController').getMemMaterials ? require('./materialController').getMemMaterials() : [];
                        const m = allM.find(mat => mat._id.toString() === item.material.toString());
                        if (m) m.defectiveStock = (m.defectiveStock || 0) + item.returnedQuantity;
                    }
                    item.nonSellableRecorded = true;
                }
            }

            returnDoc.status = 'APPROVED';
            returnDoc.inspectingUser = userId;
            returnDoc.inspectedAt = new Date();
            returnDoc.approvedBy = userId;
            returnDoc.approvedAt = new Date();
            if (refundStatus) returnDoc.refundStatus = refundStatus;
            if (refundAmount !== undefined) returnDoc.refundAmount = Number(refundAmount) || 0;
            if (notes) returnDoc.notes = (returnDoc.notes ? returnDoc.notes + ' | ' : '') + notes.trim();

            if (returnDoc.save) await returnDoc.save();

            AuditService.log({
                action: 'RETURN_APPROVED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: { returnId: returnDoc._id, returnNumber: returnDoc.returnNumber }
            });

            return res.json({
                success: true,
                message: `Return ${returnDoc.returnNumber} inspected and approved successfully. Stock balances and ledger updated accordingly.`
            });
        } catch (err) {
            console.error('Error approving return:', err);
            return res.status(500).json({ success: false, message: 'Server error while approving return.' });
        }
    }

    /**
     * POST /api/admin/returns/:id/reject
     * Reject Return Request (Does not touch stock; resets return counter on sale)
     */
    static async rejectReturn(req, res) {
        try {
            const { id } = req.params;
            const { rejectionReason = '' } = req.body;
            const userId = req.session.user ? req.session.user._id : null;
            const userRole = req.session.user ? req.session.user.role : 'SUPER_ADMIN';

            let returnDoc = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                returnDoc = await MaterialReturn.findById(id);
            } else {
                returnDoc = memReturns.find(r => r._id.toString() === id.toString());
            }

            if (!returnDoc) {
                return res.status(404).json({ success: false, message: 'Return record not found.' });
            }

            if (returnDoc.status === 'APPROVED' || returnDoc.status === 'COMPLETED') {
                return res.status(400).json({ success: false, message: 'Cannot reject an already approved return.' });
            }

            returnDoc.status = 'REJECTED';
            returnDoc.rejectedBy = userId;
            returnDoc.rejectedAt = new Date();
            returnDoc.rejectionReason = (rejectionReason || '').trim();

            // Revert returnedQuantity on sale line items so customer can re-request if eligible
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const sale = await MaterialSale.findById(returnDoc.sale);
                if (sale) {
                    for (const rItem of returnDoc.items) {
                        const sItem = (sale.items || []).find(si => si.material.toString() === rItem.material.toString());
                        if (sItem) {
                            sItem.returnedQuantity = Math.max(0, (sItem.returnedQuantity || 0) - rItem.returnedQuantity);
                        }
                    }
                    await sale.save();
                }
                await returnDoc.save();
            } else {
                const sale = memSales.find(s => s._id.toString() === returnDoc.sale.toString());
                if (sale) {
                    for (const rItem of returnDoc.items) {
                        const sItem = (sale.items || []).find(si => si.material.toString() === rItem.material.toString());
                        if (sItem) {
                            sItem.returnedQuantity = Math.max(0, (sItem.returnedQuantity || 0) - rItem.returnedQuantity);
                        }
                    }
                }
            }

            AuditService.log({
                action: 'RETURN_REJECTED',
                user: userId,
                role: userRole,
                ipAddress: req.ip,
                details: { returnId: returnDoc._id, returnNumber: returnDoc.returnNumber, reason: rejectionReason }
            });

            return res.json({
                success: true,
                message: `Return ${returnDoc.returnNumber} has been rejected.`
            });
        } catch (err) {
            console.error('Error rejecting return:', err);
            return res.status(500).json({ success: false, message: 'Server error while rejecting return.' });
        }
    }
}

module.exports = MaterialPhase2Controller;

