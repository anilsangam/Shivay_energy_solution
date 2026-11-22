const mongoose = require('mongoose');
const data = require('../config/company');
const Material = require('../models/Material');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const InventoryTransaction = require('../models/InventoryTransaction');
const Counter = require('../models/Counter');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');
const MaterialPhase2Controller = require('./materialPhase2Controller');

// Safe round helper for currency / decimal math (2 decimals)
function round2(val) {
    const num = Number(val);
    if (isNaN(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

// In-memory transaction / mock cache for offline test runs
let memMaterials = [];
let memSuppliers = [];
let memPurchases = [];
let memTransactions = [];

class MaterialController {
    static getMemMaterials() { return memMaterials; }
    static getMemSuppliers() { return memSuppliers; }
    static getMemPurchases() { return memPurchases; }
    static getMemTransactions() { return memTransactions; }
    // =========================================================================
    // 1. MATERIAL MASTER
    // =========================================================================

    static async getMaterialsPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const category = (req.query.category || '').trim();
            const status = (req.query.status || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (category && category !== 'All') {
                query.category = category;
            }
            if (status === 'active') {
                query.isActive = true;
            } else if (status === 'inactive') {
                query.isActive = false;
            }

            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { name: searchRegex },
                    { sku: searchRegex },
                    { brand: searchRegex },
                    { model: searchRegex }
                ];
            }

            let materials = [];
            let total = 0;
            let stats = {
                totalMaterials: 0,
                activeMaterials: 0,
                lowStockMaterials: 0,
                inactiveMaterials: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await Material.countDocuments(query);
                materials = await Material.find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('createdBy', 'name employeeId')
                    .lean();

                const [totalAll, activeAll, inactiveAll, lowStockList] = await Promise.all([
                    Material.countDocuments({}),
                    Material.countDocuments({ isActive: true }),
                    Material.countDocuments({ isActive: false }),
                    Material.find({ $expr: { $lte: ['$currentStock', '$minStockAlert'] } }).countDocuments()
                ]);

                stats = {
                    totalMaterials: totalAll,
                    activeMaterials: activeAll,
                    inactiveMaterials: inactiveAll,
                    lowStockMaterials: lowStockList
                };
            } else {
                let filtered = [...memMaterials];
                if (query.category) filtered = filtered.filter(m => m.category === query.category);
                if (query.isActive !== undefined) filtered = filtered.filter(m => m.isActive === query.isActive);
                if (search) {
                    const s = search.toLowerCase();
                    filtered = filtered.filter(m => 
                        (m.name && m.name.toLowerCase().includes(s)) ||
                        (m.sku && m.sku.toLowerCase().includes(s)) ||
                        (m.brand && m.brand.toLowerCase().includes(s)) ||
                        (m.model && m.model.toLowerCase().includes(s))
                    );
                }
                total = filtered.length;
                materials = filtered.slice(skip, skip + limit);

                stats = {
                    totalMaterials: memMaterials.length,
                    activeMaterials: memMaterials.filter(m => m.isActive).length,
                    inactiveMaterials: memMaterials.filter(m => !m.isActive).length,
                    lowStockMaterials: memMaterials.filter(m => (m.currentStock || 0) <= (m.minStockAlert || 5)).length
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/materials', {
                title: `Material Master | ${data.company.name}`,
                data,
                company: data.company,
                materials,
                categories: Material.CATEGORIES || [],
                units: Material.UNITS || [],
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrev: page > 1,
                    hasNext: page < totalPages
                },
                filters: { search, category, status },
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-list',
                pageTitle: 'Material Master & Specifications',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Material List' }
                ]
            });
        } catch (err) {
            console.error('Error in getMaterialsPage:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load Material Master catalog: ' + (err.message || 'Internal server error.')
            });
        }
    }

    static async createMaterial(req, res) {
        try {
            const name = (req.body.name || req.body.materialName || '').trim();
            const sku = req.body.sku;
            const category = (req.body.category || '').trim();
            const brand = (req.body.brand || '').trim();
            const model = (req.body.model || '').trim();
            const technicalSpecifications = (req.body.technicalSpecifications || '').trim();
            const description = (req.body.description || '').trim();
            const unit = (req.body.unit || req.body.unitOfMeasurement || 'Piece').trim();
            const minStockAlert = req.body.minStockAlert;
            const defaultSellingPrice = req.body.defaultSellingPrice;

            if (!name) {
                return res.status(400).json({ success: false, message: 'Material name is required.' });
            }
            if (!category) {
                return res.status(400).json({ success: false, message: 'Category is required.' });
            }
            if (!unit) {
                return res.status(400).json({ success: false, message: 'Unit of measurement is required.' });
            }

            // Generate or sanitize SKU
            let cleanSku = (sku || '').trim().toUpperCase();
            if (!cleanSku) {
                const seq = await Counter.getNextSequence('material_sku');
                cleanSku = `MAT-${String(seq).padStart(4, '0')}`;
            }

            // Check SKU uniqueness
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const existing = await Material.findOne({ sku: cleanSku });
                if (existing) {
                    return res.status(400).json({
                        success: false,
                        message: `A material with SKU code '${cleanSku}' already exists. Please choose a unique SKU.`
                    });
                }
            } else {
                const exists = memMaterials.some(m => m.sku === cleanSku);
                if (exists) {
                    return res.status(400).json({
                        success: false,
                        message: `A material with SKU code '${cleanSku}' already exists. Please choose a unique SKU.`
                    });
                }
            }

            const cleanMinStock = Math.max(0, parseInt(minStockAlert, 10) || 5);
            const cleanSellingPrice = Math.max(0, parseFloat(defaultSellingPrice) || 0);

            const materialData = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                sku: cleanSku,
                category: category.trim(),
                brand: (brand || '').trim(),
                model: (model || '').trim(),
                technicalSpecifications: (technicalSpecifications || '').trim(),
                description: (description || '').trim(),
                unit: unit.trim(),
                minStockAlert: cleanMinStock,
                defaultSellingPrice: cleanSellingPrice,
                currentStock: 0, // Current stock is NEVER manually edited in Master
                weightedAverageCost: 0,
                isActive: true,
                createdBy: req.session.user ? req.session.user._id : null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            let createdMaterial = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                createdMaterial = await Material.create(materialData);
            } else {
                memMaterials.unshift(materialData);
                createdMaterial = materialData;
            }

            AuditService.log({
                action: 'MATERIAL_CREATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: {
                    materialId: createdMaterial._id,
                    sku: cleanSku,
                    name: materialData.name
                }
            });

            return res.json({
                success: true,
                message: `Material '${materialData.name}' (${cleanSku}) created successfully.`,
                material: createdMaterial
            });
        } catch (err) {
            console.error('Error in createMaterial:', err);
            if (err.code === 11000) {
                return res.status(400).json({ success: false, message: 'Duplicate SKU code detected. Each material must have a unique SKU.' });
            }
            return res.status(500).json({ success: false, message: err.message || 'Error creating material.' });
        }
    }

    static async getMaterialDetails(req, res) {
        try {
            const { id } = req.params;
            let material = null;
            let transactions = [];
            let purchases = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                material = await Material.findById(id)
                    .populate('createdBy', 'name employeeId')
                    .populate('updatedBy', 'name employeeId')
                    .lean();

                if (material) {
                    const [txList, poList] = await Promise.all([
                        InventoryTransaction.find({ material: id })
                            .sort({ transactionDate: -1, _id: -1 })
                            .limit(20)
                            .populate('performedBy', 'name employeeId')
                            .lean(),
                        Purchase.find({ 'items.material': id })
                            .sort({ purchaseDate: -1, _id: -1 })
                            .limit(10)
                            .populate('supplier', 'name contactPerson mobile')
                            .lean()
                    ]);
                    transactions = txList || [];
                    purchases = poList || [];
                }
            } else {
                material = memMaterials.find(m => m._id.toString() === id.toString());
                transactions = memTransactions.filter(t => t.material.toString() === id.toString());
                purchases = memPurchases.filter(p => p.items && p.items.some(i => i.material.toString() === id.toString()));
            }

            if (!material) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) || req.isJson || !res.render) {
                const sessionUser = req.session ? req.session.user : null;
                const filteredMaterial = AuthorizationService.filterSensitiveFields(sessionUser, material);
                let filteredPurchases = purchases;
                if (!AuthorizationService.hasFieldAccess(sessionUser, 'fields.material.purchase_price.view')) {
                    filteredPurchases = purchases.map(p => {
                        const pCopy = JSON.parse(JSON.stringify(p));
                        if (pCopy.items) {
                            pCopy.items.forEach(it => {
                                delete it.unitPrice;
                                delete it.unitCost;
                                delete it.totalPrice;
                                delete it.taxAmount;
                            });
                        }
                        delete pCopy.totalAmount;
                        delete pCopy.subtotal;
                        delete pCopy.taxTotal;
                        return pCopy;
                    });
                }
                return res.json({ success: true, material: filteredMaterial, transactions, purchases: filteredPurchases });
            }

            return res.render('private/admin/material-view', {
                title: `${material.name} | Material Details`,
                data,
                company: data.company,
                material,
                transactions,
                purchases,
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-list',
                pageTitle: `Material Details: ${material.sku}`,
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Material List', url: '/admin/materials' },
                    { label: material.name }
                ]
            });
        } catch (err) {
            console.error('Error in getMaterialDetails:', err);
            return res.status(500).json({ success: false, message: 'Error retrieving material details.' });
        }
    }

    static async updateMaterial(req, res) {
        try {
            const { id } = req.params;
            const {
                name,
                category,
                brand,
                model,
                technicalSpecifications,
                description,
                unit,
                minStockAlert,
                defaultSellingPrice
            } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Material name is required.' });
            }

            const updateFields = {
                name: name.trim(),
                category: category ? category.trim() : 'Other',
                brand: (brand || '').trim(),
                model: (model || '').trim(),
                technicalSpecifications: (technicalSpecifications || '').trim(),
                description: (description || '').trim(),
                unit: unit ? unit.trim() : 'Piece',
                minStockAlert: Math.max(0, parseInt(minStockAlert, 10) || 0),
                defaultSellingPrice: Math.max(0, parseFloat(defaultSellingPrice) || 0),
                updatedBy: req.session.user ? req.session.user._id : null,
                updatedAt: new Date()
            };

            let updated = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                updated = await Material.findByIdAndUpdate(id, { $set: updateFields }, { new: true, runValidators: true });
            } else {
                const idx = memMaterials.findIndex(m => m._id.toString() === id.toString());
                if (idx !== -1) {
                    memMaterials[idx] = { ...memMaterials[idx], ...updateFields };
                    updated = memMaterials[idx];
                }
            }

            if (!updated) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            AuditService.log({
                action: 'MATERIAL_UPDATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: { materialId: id, name: updated.name }
            });

            return res.json({
                success: true,
                message: `Material '${updated.name}' updated successfully.`,
                material: updated
            });
        } catch (err) {
            console.error('Error in updateMaterial:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error updating material.' });
        }
    }

    static async toggleMaterialStatus(req, res) {
        try {
            const { id } = req.params;
            let material = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                material = await Material.findById(id);
                if (material) {
                    material.isActive = !material.isActive;
                    material.updatedBy = req.session.user ? req.session.user._id : null;
                    await material.save();
                }
            } else {
                material = memMaterials.find(m => m._id.toString() === id.toString());
                if (material) {
                    material.isActive = !material.isActive;
                    material.updatedAt = new Date();
                }
            }

            if (!material) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            AuditService.log({
                action: 'MATERIAL_STATUS_CHANGED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: { materialId: id, newStatus: material.isActive ? 'ACTIVE' : 'INACTIVE' }
            });

            return res.json({
                success: true,
                message: `Material status changed to ${material.isActive ? 'Active' : 'Inactive'}.`,
                isActive: material.isActive
            });
        } catch (err) {
            console.error('Error in toggleMaterialStatus:', err);
            return res.status(500).json({ success: false, message: 'Error toggling material status.' });
        }
    }

    // =========================================================================
    // 2. SUPPLIER MANAGEMENT
    // =========================================================================

    static async getSuppliersPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (status === 'ACTIVE' || status === 'INACTIVE') {
                query.status = status;
            }

            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { name: searchRegex },
                    { contactPerson: searchRegex },
                    { mobile: searchRegex },
                    { gstin: searchRegex }
                ];
            }

            let suppliers = [];
            let total = 0;
            let stats = {
                totalSuppliers: 0,
                activeSuppliers: 0,
                inactiveSuppliers: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await Supplier.countDocuments(query);
                suppliers = await Supplier.find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('createdBy', 'name employeeId')
                    .lean();

                const [totalAll, activeAll, inactiveAll] = await Promise.all([
                    Supplier.countDocuments({}),
                    Supplier.countDocuments({ status: 'ACTIVE' }),
                    Supplier.countDocuments({ status: 'INACTIVE' })
                ]);

                stats = {
                    totalSuppliers: totalAll,
                    activeSuppliers: activeAll,
                    inactiveSuppliers: inactiveAll
                };
            } else {
                let filtered = [...memSuppliers];
                if (query.status) filtered = filtered.filter(s => s.status === query.status);
                if (search) {
                    const q = search.toLowerCase();
                    filtered = filtered.filter(s =>
                        (s.name && s.name.toLowerCase().includes(q)) ||
                        (s.supplierName && s.supplierName.toLowerCase().includes(q)) ||
                        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
                        (s.mobile && s.mobile.includes(q))
                    );
                }
                total = filtered.length;
                suppliers = filtered.slice(skip, skip + limit);

                stats = {
                    totalSuppliers: memSuppliers.length,
                    activeSuppliers: memSuppliers.filter(s => s.status === 'ACTIVE').length,
                    inactiveSuppliers: memSuppliers.filter(s => s.status !== 'ACTIVE').length
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/suppliers', {
                title: `Supplier Directory | ${data.company.name}`,
                data,
                company: data.company,
                suppliers,
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrev: page > 1,
                    hasNext: page < totalPages
                },
                filters: { search, status },
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-suppliers',
                pageTitle: 'Vendor & Supplier Directory',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Suppliers' }
                ]
            });
        } catch (err) {
            console.error('Error in getSuppliersPage:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load Supplier directory: ' + (err.message || 'Internal server error.')
            });
        }
    }

    static async createSupplier(req, res) {
        try {
            const name = (req.body.name || req.body.supplierName || '').trim();
            const contactPerson = (req.body.contactPerson || '').trim();
            const mobile = (req.body.mobile || req.body.phone || '').trim();
            const email = (req.body.email || '').trim().toLowerCase();
            const address = (req.body.address || '').trim();
            const gstin = (req.body.gstin || '').trim().toUpperCase();
            const notes = (req.body.notes || '').trim();
            const status = (req.body.status || 'ACTIVE').trim().toUpperCase();

            if (!name) {
                return res.status(400).json({ success: false, message: 'Supplier / Business name is required.' });
            }
            if (!contactPerson) {
                return res.status(400).json({ success: false, message: 'Contact person is required.' });
            }
            if (!mobile) {
                return res.status(400).json({ success: false, message: 'Mobile number is required.' });
            }

            const supplierData = {
                _id: new mongoose.Types.ObjectId(),
                name: name,
                supplierName: name,
                contactPerson: contactPerson,
                mobile: mobile,
                email: email,
                address: address,
                gstin: gstin,
                notes: notes,
                status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                createdBy: req.session.user ? req.session.user._id : null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            let createdSupplier = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                createdSupplier = await Supplier.create(supplierData);
            } else {
                memSuppliers.unshift(supplierData);
                createdSupplier = supplierData;
            }

            AuditService.log({
                action: 'SUPPLIER_CREATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: { supplierId: createdSupplier._id, name: supplierData.name }
            });

            return res.json({
                success: true,
                message: `Supplier '${supplierData.name}' created successfully.`,
                supplier: createdSupplier
            });
        } catch (err) {
            console.error('Error in createSupplier:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error creating supplier.' });
        }
    }

    static async getSupplierDetails(req, res) {
        try {
            const { id } = req.params;
            let supplier = null;
            let purchases = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                supplier = await Supplier.findById(id).lean();
                if (supplier) {
                    purchases = await Purchase.find({ supplier: id })
                        .sort({ purchaseDate: -1 })
                        .limit(20)
                        .lean();
                }
            } else {
                supplier = memSuppliers.find(s => s._id.toString() === id.toString());
                purchases = memPurchases.filter(p => p.supplier && p.supplier.toString() === id.toString());
            }

            if (!supplier) {
                return res.status(404).json({ success: false, message: 'Supplier not found.' });
            }

            return res.json({ success: true, supplier, purchases });
        } catch (err) {
            console.error('Error in getSupplierDetails:', err);
            return res.status(500).json({ success: false, message: 'Error retrieving supplier.' });
        }
    }

    static async updateSupplier(req, res) {
        try {
            const { id } = req.params;
            const { name, contactPerson, mobile, email, address, gstin, notes } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Supplier name is required.' });
            }
            if (!contactPerson || !contactPerson.trim()) {
                return res.status(400).json({ success: false, message: 'Contact person is required.' });
            }
            if (!mobile || !mobile.trim()) {
                return res.status(400).json({ success: false, message: 'Mobile number is required.' });
            }

            const updateFields = {
                name: name.trim(),
                contactPerson: contactPerson.trim(),
                mobile: mobile.trim(),
                email: (email || '').trim().toLowerCase(),
                address: (address || '').trim(),
                gstin: (gstin || '').trim().toUpperCase(),
                notes: (notes || '').trim(),
                updatedBy: req.session.user ? req.session.user._id : null,
                updatedAt: new Date()
            };

            let updated = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                updated = await Supplier.findByIdAndUpdate(id, { $set: updateFields }, { new: true, runValidators: true });
            } else {
                const idx = memSuppliers.findIndex(s => s._id.toString() === id.toString());
                if (idx !== -1) {
                    memSuppliers[idx] = { ...memSuppliers[idx], ...updateFields };
                    updated = memSuppliers[idx];
                }
            }

            if (!updated) {
                return res.status(404).json({ success: false, message: 'Supplier not found.' });
            }

            AuditService.log({
                action: 'SUPPLIER_UPDATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: { supplierId: id, name: updated.name }
            });

            return res.json({
                success: true,
                message: `Supplier '${updated.name}' updated successfully.`,
                supplier: updated
            });
        } catch (err) {
            console.error('Error in updateSupplier:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error updating supplier.' });
        }
    }

    static async toggleSupplierStatus(req, res) {
        try {
            const { id } = req.params;
            let supplier = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                supplier = await Supplier.findById(id);
                if (supplier) {
                    supplier.status = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                    supplier.updatedBy = req.session.user ? req.session.user._id : null;
                    await supplier.save();
                }
            } else {
                supplier = memSuppliers.find(s => s._id.toString() === id.toString());
                if (supplier) {
                    supplier.status = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                }
            }

            if (!supplier) {
                return res.status(404).json({ success: false, message: 'Supplier not found.' });
            }

            return res.json({
                success: true,
                message: `Supplier status changed to ${supplier.status}.`,
                status: supplier.status
            });
        } catch (err) {
            console.error('Error in toggleSupplierStatus:', err);
            return res.status(500).json({ success: false, message: 'Error toggling supplier status.' });
        }
    }

    static async searchSuppliersApi(req, res) {
        try {
            const q = (req.query.q || '').trim();
            let query = { status: 'ACTIVE' };
            if (q) {
                const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [{ name: searchRegex }, { gstin: searchRegex }, { contactPerson: searchRegex }];
            }

            let suppliers = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                suppliers = await Supplier.find(query).limit(20).select('name contactPerson mobile gstin status').lean();
            } else {
                suppliers = memSuppliers.filter(s => s.status === 'ACTIVE');
                if (q) {
                    const sLower = q.toLowerCase();
                    suppliers = suppliers.filter(s => 
                        (s.name && s.name.toLowerCase().includes(sLower)) ||
                        (s.supplierName && s.supplierName.toLowerCase().includes(sLower)) ||
                        (s.contactPerson && s.contactPerson.toLowerCase().includes(sLower)) ||
                        (s.gstin && s.gstin.toLowerCase().includes(sLower))
                    );
                }
                suppliers = suppliers.slice(0, 20);
            }

            const normalized = suppliers.map(s => ({
                _id: s._id,
                name: s.name || s.supplierName,
                supplierName: s.supplierName || s.name,
                contactPerson: s.contactPerson,
                mobile: s.mobile,
                gstin: s.gstin,
                status: s.status
            }));

            return res.json({ success: true, suppliers: normalized });
        } catch (err) {
            console.error('Error in searchSuppliersApi:', err);
            return res.status(500).json({ success: false, message: 'Error searching suppliers.' });
        }
    }

    // =========================================================================
    // 3. PURCHASE / STOCK IN ENTRY & CONFIRMATION
    // =========================================================================

    static async getPurchasesPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const status = (req.query.status || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (status && status !== 'All') {
                query.status = status;
            }

            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { purchaseNumber: searchRegex },
                    { supplierInvoiceNumber: searchRegex }
                ];
            }

            let purchases = [];
            let total = 0;
            let stats = {
                totalPurchases: 0,
                receivedPurchases: 0,
                draftPurchases: 0,
                totalSpent: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await Purchase.countDocuments(query);
                purchases = await Purchase.find(query)
                    .sort({ purchaseDate: -1, createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('supplier', 'name contactPerson mobile')
                    .populate('receivedBy', 'name employeeId')
                    .lean();

                const [totalAll, receivedAll, draftAll, spendAgg] = await Promise.all([
                    Purchase.countDocuments({}),
                    Purchase.countDocuments({ status: 'RECEIVED' }),
                    Purchase.countDocuments({ status: 'DRAFT' }),
                    Purchase.aggregate([
                        { $match: { status: 'RECEIVED' } },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ])
                ]);

                stats = {
                    totalPurchases: totalAll,
                    receivedPurchases: receivedAll,
                    draftPurchases: draftAll,
                    totalSpent: (spendAgg[0] && spendAgg[0].total) || 0
                };
            } else {
                let filtered = [...memPurchases];
                if (query.status) filtered = filtered.filter(p => p.status === query.status);
                if (search) {
                    const s = search.toLowerCase();
                    filtered = filtered.filter(p =>
                        (p.purchaseNumber && p.purchaseNumber.toLowerCase().includes(s)) ||
                        (p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(s))
                    );
                }
                total = filtered.length;
                purchases = filtered.slice(skip, skip + limit);

                stats = {
                    totalPurchases: memPurchases.length,
                    receivedPurchases: memPurchases.filter(p => p.status === 'RECEIVED').length,
                    draftPurchases: memPurchases.filter(p => p.status === 'DRAFT').length,
                    totalSpent: memPurchases.filter(p => p.status === 'RECEIVED').reduce((sum, p) => sum + (p.totalAmount || 0), 0)
                };
            }

            const totalPages = Math.ceil(total / limit) || 1;

            res.render('private/admin/purchases', {
                title: `Purchase Orders & Stock In | ${data.company.name}`,
                data,
                company: data.company,
                purchases,
                stats,
                totalPages,
                currentPage: page,
                totalItems: total,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrev: page > 1,
                    hasNext: page < totalPages
                },
                filters: { search, status },
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-purchases',
                pageTitle: 'Purchase Inward & Stock In',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Purchase / Stock In' }
                ]
            });
        } catch (err) {
            console.error('Error in getPurchasesPage:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load Purchases registry: ' + (err.message || 'Internal server error.')
            });
        }
    }

    static async getNewPurchasePage(req, res) {
        try {
            let suppliers = [];
            let materials = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                suppliers = await Supplier.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean();
                materials = await Material.find({ isActive: true }).sort({ name: 1 }).lean();
            } else {
                suppliers = memSuppliers.filter(s => s.status === 'ACTIVE');
                materials = memMaterials.filter(m => m.isActive === true);
            }

            res.render('private/admin/purchase-new', {
                title: `New Purchase Order | ${data.company.name}`,
                data,
                company: data.company,
                suppliers,
                materials,
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-purchases',
                pageTitle: 'Record Inward Purchase / Stock In',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Purchases', url: '/admin/purchases' },
                    { label: 'New Purchase Entry' }
                ]
            });
        } catch (err) {
            console.error('Error in getNewPurchasePage:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to initialize purchase entry form.'
            });
        }
    }

    static async createPurchase(req, res) {
        try {
            const {
                supplierId,
                purchaseDate,
                supplierInvoiceNumber,
                invoiceAttachment,
                items,
                discount,
                additionalCharges,
                paymentStatus,
                paidAmount,
                notes,
                confirmImmediately
            } = req.body;

            if (!supplierId || !mongoose.isValidObjectId(supplierId)) {
                return res.status(400).json({ success: false, message: 'A valid supplier must be selected.' });
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one material line item is required.' });
            }

            // Verify supplier exists
            let supplier = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                supplier = await Supplier.findById(supplierId);
            } else {
                supplier = memSuppliers.find(s => s._id.toString() === supplierId.toString());
            }
            if (!supplier) {
                return res.status(400).json({ success: false, message: 'Selected supplier does not exist.' });
            }

            // Server-side line-item computation & validation (never trust client math!)
            let computedSubtotal = 0;
            let computedTaxTotal = 0;
            const validatedItems = [];

            for (let idx = 0; idx < items.length; idx++) {
                const row = items[idx];
                const matId = row.materialId || row.material;
                if (!matId || !mongoose.isValidObjectId(matId)) {
                    return res.status(400).json({ success: false, message: `Row ${idx + 1}: Valid material is required.` });
                }

                let matDoc = null;
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    matDoc = await Material.findById(matId);
                } else {
                    matDoc = memMaterials.find(m => m._id.toString() === matId.toString());
                }

                if (!matDoc) {
                    return res.status(400).json({ success: false, message: `Row ${idx + 1}: Material does not exist.` });
                }

                const qty = parseFloat(row.quantity);
                if (isNaN(qty) || qty <= 0) {
                    return res.status(400).json({ success: false, message: `Row ${idx + 1}: Quantity must be greater than zero.` });
                }

                const rawPrice = row.unitPurchasePrice !== undefined ? row.unitPurchasePrice : row.unitPrice;
                const unitPrice = parseFloat(rawPrice);
                if (isNaN(unitPrice) || unitPrice < 0) {
                    return res.status(400).json({ success: false, message: `Row ${idx + 1}: Unit price cannot be negative.` });
                }

                const rawGst = row.gstRate !== undefined ? row.gstRate : (row.taxRate !== undefined ? row.taxRate : 0);
                const gstRate = Math.max(0, parseFloat(rawGst) || 0);
                const baseItemAmount = round2(qty * unitPrice);
                const taxAmount = round2((baseItemAmount * gstRate) / 100);
                const lineTotal = round2(baseItemAmount + taxAmount);

                computedSubtotal = round2(computedSubtotal + baseItemAmount);
                computedTaxTotal = round2(computedTaxTotal + taxAmount);

                validatedItems.push({
                    material: matDoc._id,
                    materialName: matDoc.name,
                    sku: matDoc.sku,
                    unit: matDoc.unit,
                    quantity: qty,
                    unitPurchasePrice: unitPrice,
                    gstRate: gstRate,
                    taxAmount: taxAmount,
                    lineTotal: lineTotal
                });
            }

            const cleanDiscount = Math.max(0, parseFloat(discount) || 0);
            const cleanAdditionalCharges = Math.max(0, parseFloat(additionalCharges) || 0);
            const computedTotalAmount = round2(computedSubtotal + computedTaxTotal - cleanDiscount + cleanAdditionalCharges);
            const cleanPaidAmount = Math.max(0, parseFloat(paidAmount) || 0);

            // Sequential Purchase Number
            const year = new Date().getFullYear();
            const seq = await Counter.getNextSequence(`purchase_${year}`);
            const purchaseNumber = `PUR-${year}-${String(seq).padStart(4, '0')}`;

            const purchaseData = {
                _id: new mongoose.Types.ObjectId(),
                purchaseNumber,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
                supplier: supplier._id,
                supplierInvoiceNumber: (supplierInvoiceNumber || '').trim(),
                invoiceAttachment: (invoiceAttachment || '').trim(),
                items: validatedItems,
                subtotal: computedSubtotal,
                taxTotal: computedTaxTotal,
                discount: cleanDiscount,
                additionalCharges: cleanAdditionalCharges,
                totalAmount: computedTotalAmount,
                paymentStatus: ['UNPAID', 'PARTIALLY_PAID', 'PAID'].includes(paymentStatus) ? paymentStatus : 'UNPAID',
                paidAmount: cleanPaidAmount,
                status: 'DRAFT',
                notes: (notes || '').trim(),
                createdBy: req.session.user ? req.session.user._id : null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            let createdPurchase = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                createdPurchase = await Purchase.create(purchaseData);
            } else {
                memPurchases.unshift(purchaseData);
                createdPurchase = purchaseData;
            }

            AuditService.log({
                action: 'PURCHASE_CREATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: {
                    purchaseNumber: createdPurchase.purchaseNumber,
                    totalAmount: computedTotalAmount,
                    itemCount: validatedItems.length
                }
            });

            // If user selected immediate confirmation (Receive Stock Now)
            if (confirmImmediately === true || confirmImmediately === 'true' || req.body.status === 'RECEIVED') {
                return await MaterialController._executePurchaseConfirmation(createdPurchase, req, res);
            }

            return res.json({
                success: true,
                message: `Purchase order ${createdPurchase.purchaseNumber} recorded as draft.`,
                purchase: createdPurchase
            });
        } catch (err) {
            console.error('Error in createPurchase:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error recording purchase entry.' });
        }
    }

    static async getPurchaseDetails(req, res) {
        try {
            const { id } = req.params;
            let purchase = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                purchase = await Purchase.findById(id)
                    .populate('supplier')
                    .populate('items.material')
                    .populate('receivedBy', 'name employeeId')
                    .populate('createdBy', 'name employeeId')
                    .lean();
            } else {
                purchase = memPurchases.find(p => p._id.toString() === id.toString());
            }

            if (!purchase) {
                return res.status(404).render('public-site/404', {
                    title: 'Purchase Order Not Found',
                    message: 'The requested purchase order record could not be found.',
                    company: data.company
                });
            }

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, purchase });
            }

            res.render('private/admin/purchase-view', {
                title: `${purchase.purchaseNumber} | Purchase Details`,
                data,
                company: data.company,
                purchase,
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-purchases',
                pageTitle: `Purchase Order: ${purchase.purchaseNumber}`,
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Purchases', url: '/admin/purchases' },
                    { label: purchase.purchaseNumber }
                ]
            });
        } catch (err) {
            console.error('Error in getPurchaseDetails:', err);
            return res.status(500).json({ success: false, message: 'Error loading purchase order details.' });
        }
    }

    static async confirmPurchase(req, res) {
        try {
            const { id } = req.params;
            let purchase = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                purchase = await Purchase.findById(id);
            } else {
                purchase = memPurchases.find(p => p._id.toString() === id.toString());
            }

            if (!purchase) {
                return res.status(404).json({ success: false, message: 'Purchase order not found.' });
            }

            return await MaterialController._executePurchaseConfirmation(purchase, req, res);
        } catch (err) {
            console.error('Error in confirmPurchase:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error confirming purchase.' });
        }
    }

    /**
     * Internal Core Engine: Executes Purchase Confirmation & Stock Inward Ledger
     * Idempotent & Atomic:
     * - Rejects if status is already 'RECEIVED'
     * - Prorates additional landed charges across items
     * - Computes Weighted Average Cost (WAC)
     * - Increments stock balance
     * - Writes immutable InventoryTransaction ledger records
     */
    static async _executePurchaseConfirmation(purchase, req, res) {
        const userId = req.session.user ? req.session.user._id : null;

        // Idempotency check: prevent duplicate confirmation & double stock entries
        if (purchase.status === 'RECEIVED') {
            return res.status(409).json({
                success: false,
                message: `Purchase ${purchase.purchaseNumber} has already been confirmed and received into stock.`
            });
        }

        // Setup MongoDB transaction if supported by topology
        let mongoSession = null;
        let isReplicaSet = false;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                // Check if MongoDB topology supports sessions/transactions
                mongoSession = await mongoose.startSession();
                // Test transaction capability
                await mongoSession.startTransaction();
                isReplicaSet = true;
            } catch (topoErr) {
                // Topology is standalone (does not support transactions)
                if (mongoSession) {
                    try { await mongoSession.endSession(); } catch (e) {}
                    mongoSession = null;
                }
                isReplicaSet = false;
            }
        }

        try {
            // 1. Atomic status guard to prevent concurrent double-confirmations
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const lockedPurchase = await Purchase.findOneAndUpdate(
                    { _id: purchase._id, status: { $ne: 'RECEIVED' } },
                    {
                        $set: {
                            status: 'RECEIVED',
                            receivedAt: new Date(),
                            receivedBy: userId,
                            updatedBy: userId
                        }
                    },
                    isReplicaSet ? { session: mongoSession, new: true } : { new: true }
                );

                if (!lockedPurchase) {
                    if (isReplicaSet && mongoSession) {
                        await mongoSession.abortTransaction();
                        await mongoSession.endSession();
                    }
                    return res.status(409).json({
                        success: false,
                        message: `Purchase ${purchase.purchaseNumber} has already been confirmed.`
                    });
                }
            } else {
                if (purchase.status === 'RECEIVED') {
                    return res.status(409).json({
                        success: false,
                        message: `Purchase ${purchase.purchaseNumber} has already been confirmed.`
                    });
                }
                purchase.status = 'RECEIVED';
                purchase.receivedAt = new Date();
                purchase.receivedBy = userId;
            }

            // 2. Iterate each line item, compute landed cost, WAC, and post to ledger
            const subtotal = purchase.subtotal || 0;
            const additionalCharges = purchase.additionalCharges || 0;

            for (const item of purchase.items) {
                let material = null;
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    material = isReplicaSet 
                        ? await Material.findById(item.material).session(mongoSession)
                        : await Material.findById(item.material);
                } else {
                    material = memMaterials.find(m => m._id.toString() === item.material.toString());
                }

                if (!material) continue;

                const q0 = material.currentStock || 0;
                const w0 = material.weightedAverageCost || 0;
                const q1 = item.quantity;

                // Documented treatment for additional charges:
                // Prorate freight/shipping proportional to item's subtotal share
                let proratedChargePerUnit = 0;
                if (subtotal > 0 && additionalCharges > 0) {
                    const itemShare = (item.quantity * item.unitPurchasePrice) / subtotal;
                    const allocatedCharge = itemShare * additionalCharges;
                    proratedChargePerUnit = round2(allocatedCharge / q1);
                }

                // Effective landed unit cost for this stock batch
                const effectiveUnitCost = round2(item.unitPurchasePrice + proratedChargePerUnit);

                // Weighted Average Cost (WAC) formula:
                // New WAC = (Q0 * W0 + Q1 * EffectiveCost) / (Q0 + Q1)
                const newBalance = round2(q0 + q1);
                let newWac = effectiveUnitCost;
                if (newBalance > 0) {
                    newWac = round2(((q0 * w0) + (q1 * effectiveUnitCost)) / newBalance);
                }

                // Generate unique transaction reference
                const year = new Date().getFullYear();
                const txnSeq = await Counter.getNextSequence(`inv_txn_${year}`);
                const txnNumber = `TXN-${year}-${String(txnSeq).padStart(5, '0')}`;

                const txnData = {
                    _id: new mongoose.Types.ObjectId(),
                    transactionNumber: txnNumber,
                    material: material._id,
                    transactionType: 'PURCHASE_RECEIPT',
                    quantityIn: q1,
                    quantityOut: 0,
                    unitCost: effectiveUnitCost,
                    totalCost: round2(q1 * effectiveUnitCost),
                    balanceAfter: newBalance,
                    sourceReferenceType: 'Purchase',
                    sourceReferenceId: purchase._id,
                    sourceReferenceNumber: purchase.purchaseNumber,
                    transactionDate: new Date(),
                    performedBy: userId || material._id,
                    notes: `Received via Purchase ${purchase.purchaseNumber}. Landed cost ₹${effectiveUnitCost}/unit.`
                };

                // Post to Inventory Transaction Ledger
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    if (isReplicaSet) {
                        await InventoryTransaction.create([txnData], { session: mongoSession });
                    } else {
                        await InventoryTransaction.create(txnData);
                    }
                } else {
                    memTransactions.unshift(txnData);
                }

                // Update Material stock balance and WAC
                material.currentStock = newBalance;
                material.weightedAverageCost = newWac;
                material.updatedBy = userId;
                material.updatedAt = new Date();

                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    if (isReplicaSet) {
                        await material.save({ session: mongoSession });
                    } else {
                        await material.save();
                    }
                }
            }

            // Commit MongoDB transaction if replica set
            if (isReplicaSet && mongoSession) {
                await mongoSession.commitTransaction();
                await mongoSession.endSession();
            }

            AuditService.log({
                action: 'PURCHASE_RECEIVED',
                user: userId,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: {
                    purchaseNumber: purchase.purchaseNumber,
                    itemsReceived: purchase.items.length
                }
            });

            return res.json({
                success: true,
                message: `Purchase ${purchase.purchaseNumber} successfully received into stock. Inventory ledger updated.`,
                purchase: { ...purchase, status: 'RECEIVED' }
            });
        } catch (err) {
            console.error('Error executing purchase confirmation:', err);
            if (isReplicaSet && mongoSession) {
                try {
                    await mongoSession.abortTransaction();
                    await mongoSession.endSession();
                } catch (e) {}
            }
            return res.status(500).json({ success: false, message: 'Transaction error during purchase confirmation.' });
        }
    }

    static async cancelPurchase(req, res) {
        try {
            const { id } = req.params;
            let purchase = null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                purchase = await Purchase.findById(id);
            } else {
                purchase = memPurchases.find(p => p._id.toString() === id.toString());
            }

            if (!purchase) {
                return res.status(404).json({ success: false, message: 'Purchase not found.' });
            }

            if (purchase.status === 'RECEIVED') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot cancel a purchase that has already been received into stock. Use a stock adjustment instead.'
                });
            }

            purchase.status = 'CANCELLED';
            purchase.updatedBy = req.session.user ? req.session.user._id : null;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                await purchase.save();
            }

            AuditService.log({
                action: 'PURCHASE_CANCELLED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: { purchaseNumber: purchase.purchaseNumber }
            });

            return res.json({
                success: true,
                message: `Purchase order ${purchase.purchaseNumber} has been cancelled.`
            });
        } catch (err) {
            console.error('Error in cancelPurchase:', err);
            return res.status(500).json({ success: false, message: 'Error cancelling purchase order.' });
        }
    }

    // =========================================================================
    // 4. STOCK INVENTORY MATRIX & CONTROLLED ADJUSTMENTS
    // =========================================================================

    static async getInventoryPage(req, res) {
        try {
            const search = (req.query.search || '').trim();
            const category = (req.query.category || '').trim();
            const lowStockOnly = req.query.lowStock === 'true';
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            let query = {};
            if (category && category !== 'All') {
                query.category = category;
            }

            if (search) {
                const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { name: searchRegex },
                    { sku: searchRegex },
                    { brand: searchRegex },
                    { model: searchRegex }
                ];
            }

            let allMaterials = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                allMaterials = await Material.find(query).sort({ category: 1, name: 1 }).lean();
            } else {
                allMaterials = [...memMaterials];
                if (query.category) allMaterials = allMaterials.filter(m => m.category === query.category);
                if (search) {
                    const s = search.toLowerCase();
                    allMaterials = allMaterials.filter(m =>
                        (m.name && m.name.toLowerCase().includes(s)) ||
                        (m.sku && m.sku.toLowerCase().includes(s))
                    );
                }
            }

            // Compute overall stats across all matched materials
            let totalValuation = 0;
            let totalStockQty = 0;
            let lowStockCount = 0;

            allMaterials.forEach(m => {
                const qty = m.currentStock || 0;
                const wac = m.weightedAverageCost || 0;
                const val = round2(qty * wac);
                m.stockValue = val;
                m.isLowStock = qty <= (m.minStockAlert || 5);

                totalValuation = round2(totalValuation + val);
                totalStockQty += qty;
                if (m.isLowStock) lowStockCount++;
            });

            let filteredList = allMaterials;
            if (lowStockOnly) {
                filteredList = filteredList.filter(m => m.isLowStock);
            }

            const total = filteredList.length;
            const totalPages = Math.ceil(total / limit) || 1;
            const paginatedItems = filteredList.slice(skip, skip + limit);

            res.render('private/admin/inventory', {
                title: `Stock Inventory | ${data.company.name}`,
                data,
                company: data.company,
                materials: paginatedItems,
                inventory: paginatedItems,
                categories: Material.CATEGORIES || [],
                stats: {
                    totalItems: allMaterials.length,
                    totalSkus: allMaterials.length,
                    totalStockUnits: totalStockQty,
                    totalStockQty,
                    totalInventoryValuation: totalValuation,
                    totalValuation: totalValuation.toLocaleString('en-IN'),
                    lowStockCount
                },
                totalPages,
                currentPage: page,
                totalItems: total,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasPrev: page > 1,
                    hasNext: page < totalPages
                },
                filters: { search, category, lowStock: lowStockOnly },
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-inventory',
                pageTitle: 'Stock Inventory & Valuation',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Stock Inventory' }
                ]
            });
        } catch (err) {
            console.error('Error in getInventoryPage:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load Stock Inventory: ' + (err.message || 'Internal server error.')
            });
        }
    }

    static async updateSellingPrice(req, res) {
        try {
            const { id } = req.params;
            const { defaultSellingPrice } = req.body;

            const newPrice = parseFloat(defaultSellingPrice);
            if (isNaN(newPrice) || newPrice < 0) {
                return res.status(400).json({ success: false, message: 'Valid non-negative selling price is required.' });
            }

            let material = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                material = await Material.findById(id);
                if (material) {
                    material.defaultSellingPrice = round2(newPrice);
                    material.updatedBy = req.session.user ? req.session.user._id : null;
                    await material.save();
                }
            } else {
                material = memMaterials.find(m => m._id.toString() === id.toString());
                if (material) {
                    material.defaultSellingPrice = round2(newPrice);
                }
            }

            if (!material) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            AuditService.log({
                action: 'SELLING_PRICE_UPDATED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: {
                    materialId: id,
                    sku: material.sku,
                    newPrice: material.defaultSellingPrice
                }
            });

            return res.json({
                success: true,
                message: `Selling price for '${material.name}' updated to ₹${material.defaultSellingPrice}. Historical purchase records remain unchanged.`,
                defaultSellingPrice: material.defaultSellingPrice
            });
        } catch (err) {
            console.error('Error in updateSellingPrice:', err);
            return res.status(500).json({ success: false, message: 'Error updating default selling price.' });
        }
    }

    static async adjustStock(req, res) {
        try {
            const { id } = req.params;
            const { adjustmentType, quantity, reason, notes } = req.body;

            if (!['ADD', 'REMOVE'].includes(adjustmentType)) {
                return res.status(400).json({ success: false, message: 'Adjustment type must be ADD or REMOVE.' });
            }

            const adjQty = parseFloat(quantity);
            if (isNaN(adjQty) || adjQty <= 0) {
                return res.status(400).json({ success: false, message: 'Adjustment quantity must be greater than zero.' });
            }

            if (!reason || !reason.trim()) {
                return res.status(400).json({ success: false, message: 'Adjustment reason is strictly required for audit compliance.' });
            }

            let material = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                material = await Material.findById(id);
            } else {
                material = memMaterials.find(m => m._id.toString() === id.toString());
            }

            if (!material) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            const currentStock = material.currentStock || 0;
            let newStock = currentStock;

            if (adjustmentType === 'REMOVE') {
                if (currentStock - adjQty < 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot remove ${adjQty} ${material.unit}. Available stock is only ${currentStock} ${material.unit}. Negative inventory is prohibited.`
                    });
                }
                newStock = round2(currentStock - adjQty);
            } else {
                newStock = round2(currentStock + adjQty);
            }

            // Generate adjustment ledger transaction
            const year = new Date().getFullYear();
            const txnSeq = await Counter.getNextSequence(`inv_txn_${year}`);
            const txnNumber = `TXN-${year}-${String(txnSeq).padStart(5, '0')}`;

            const txnData = {
                _id: new mongoose.Types.ObjectId(),
                transactionNumber: txnNumber,
                material: material._id,
                transactionType: 'STOCK_ADJUSTMENT',
                quantityIn: adjustmentType === 'ADD' ? adjQty : 0,
                quantityOut: adjustmentType === 'REMOVE' ? adjQty : 0,
                unitCost: material.weightedAverageCost || 0,
                totalCost: round2(adjQty * (material.weightedAverageCost || 0)),
                balanceAfter: newStock,
                sourceReferenceType: 'StockAdjustment',
                sourceReferenceId: material._id,
                sourceReferenceNumber: txnNumber,
                transactionDate: new Date(),
                performedBy: req.session.user ? req.session.user._id : material._id,
                notes: `[Stock Adjustment: ${adjustmentType}] Reason: ${reason.trim()}. ${notes ? notes.trim() : ''}`
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                await InventoryTransaction.create(txnData);
                material.currentStock = newStock;
                material.updatedBy = req.session.user ? req.session.user._id : null;
                await material.save();
            } else {
                memTransactions.unshift(txnData);
                material.currentStock = newStock;
            }

            AuditService.log({
                action: 'STOCK_ADJUSTED',
                user: req.session.user ? req.session.user._id : null,
                role: req.session.user ? req.session.user.role : 'SUPER_ADMIN',
                ipAddress: req.ip,
                details: {
                    materialId: id,
                    sku: material.sku,
                    type: adjustmentType,
                    quantity: adjQty,
                    newBalance: newStock,
                    reason: reason.trim()
                }
            });

            return res.json({
                success: true,
                message: `Stock successfully adjusted for '${material.name}'. New available balance: ${newStock} ${material.unit}.`,
                currentStock: newStock,
                newStock: newStock
            });
        } catch (err) {
            console.error('Error in adjustStock:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error executing stock adjustment.' });
        }
    }

    static async getMaterialHistoryApi(req, res) {
        try {
            const { id } = req.params;
            let material = null;
            let transactions = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                material = await Material.findById(id).select('name sku unit currentStock weightedAverageCost').lean();
                transactions = await InventoryTransaction.find({ material: id })
                    .sort({ transactionDate: -1, createdAt: -1 })
                    .limit(50)
                    .populate('performedBy', 'name employeeId')
                    .lean();
            } else {
                material = memMaterials.find(m => m._id.toString() === id.toString());
                transactions = memTransactions.filter(t => t.material.toString() === id.toString());
            }

            if (!material) {
                return res.status(404).json({ success: false, message: 'Material not found.' });
            }

            return res.json({ success: true, material, transactions });
        } catch (err) {
            console.error('Error in getMaterialHistoryApi:', err);
            return res.status(500).json({ success: false, message: 'Error retrieving stock history.' });
        }
    }

    // =========================================================================
    // 5. STOCK REPORTS & VALUATION ANALYTICS
    // =========================================================================

    static async getStockReportsPage(req, res) {
        try {
            let materials = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                materials = await Material.find({}).sort({ category: 1, name: 1 }).lean();
            } else {
                materials = [...memMaterials];
            }

            let totalValuation = 0;
            let totalStockUnits = 0;
            const categoryBreakdown = {};

            materials.forEach(m => {
                const qty = m.currentStock || 0;
                const wac = m.weightedAverageCost || 0;
                const val = round2(qty * wac);
                totalValuation = round2(totalValuation + val);
                totalStockUnits += qty;

                const cat = m.category || 'Other';
                if (!categoryBreakdown[cat]) {
                    categoryBreakdown[cat] = {
                        category: cat,
                        itemCount: 0,
                        totalQuantity: 0,
                        totalValuation: 0
                    };
                }
                categoryBreakdown[cat].itemCount++;
                categoryBreakdown[cat].totalQuantity += qty;
                categoryBreakdown[cat].totalValuation = round2(categoryBreakdown[cat].totalValuation + val);
            });

            const lowStockItems = materials.filter(m => (m.currentStock || 0) <= (m.minStockAlert || 5));
            const catStatsArray = Object.values(categoryBreakdown);

            let salesMetrics = {
                totalSalesCount: 0,
                totalSalesRevenue: 0,
                totalUnitsSold: 0,
                totalGrossProfit: 0,
                totalReturnsCount: 0,
                goodRestockedUnits: 0,
                damagedUnits: 0,
                defectiveUnits: 0,
                pendingDispatches: 0,
                deliveredDispatches: 0
            };

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                try {
                    const MaterialSale = require('../models/MaterialSale');
                    const MaterialReturn = require('../models/MaterialReturn');
                    const MaterialDispatch = require('../models/MaterialDispatch');

                    const [confirmedSales, allReturns, allDispatches] = await Promise.all([
                        MaterialSale.find({ status: { $in: ['CONFIRMED', 'PROCESSING'] } }).select('grandTotal subtotal items').lean(),
                        MaterialReturn.find({ status: { $in: ['APPROVED', 'COMPLETED'] } }).select('items').lean(),
                        MaterialDispatch.find({}).select('status').lean()
                    ]);

                    salesMetrics.totalSalesCount = (confirmedSales || []).length;
                    (confirmedSales || []).forEach(s => {
                        salesMetrics.totalSalesRevenue = round2(salesMetrics.totalSalesRevenue + (s.grandTotal || 0));
                        (s.items || []).forEach(it => {
                            const q = it.quantity || 0;
                            salesMetrics.totalUnitsSold += q;
                            const cost = (it.costPriceSnapshot || 0) * q;
                            const revenue = (it.unitPrice || 0) * q;
                            salesMetrics.totalGrossProfit = round2(salesMetrics.totalGrossProfit + Math.max(0, revenue - cost));
                        });
                    });

                    salesMetrics.totalReturnsCount = (allReturns || []).length;
                    (allReturns || []).forEach(r => {
                        (r.items || []).forEach(it => {
                            if (it.condition === 'GOOD') salesMetrics.goodRestockedUnits += (it.returnedQuantity || 0);
                            else if (it.condition === 'DAMAGED') salesMetrics.damagedUnits += (it.returnedQuantity || 0);
                            else if (it.condition === 'DEFECTIVE') salesMetrics.defectiveUnits += (it.returnedQuantity || 0);
                        });
                    });

                    (allDispatches || []).forEach(d => {
                        if (d.status === 'DELIVERED') salesMetrics.deliveredDispatches++;
                        else salesMetrics.pendingDispatches++;
                    });
                } catch (e) {
                    console.error('Error computing phase 2 report stats:', e);
                }
            } else {
                const memSales = MaterialPhase2Controller.getMemSales ? MaterialPhase2Controller.getMemSales() : [];
                const memReturns = MaterialPhase2Controller.getMemReturns ? MaterialPhase2Controller.getMemReturns() : [];
                const memDispatches = MaterialPhase2Controller.getMemDispatches ? MaterialPhase2Controller.getMemDispatches() : [];

                salesMetrics.totalSalesCount = memSales.filter(s => s.status === 'CONFIRMED' || s.status === 'PROCESSING').length;
                memSales.filter(s => s.status === 'CONFIRMED' || s.status === 'PROCESSING').forEach(s => {
                    salesMetrics.totalSalesRevenue = round2(salesMetrics.totalSalesRevenue + (s.grandTotal || 0));
                    (s.items || []).forEach(it => {
                        const q = it.quantity || 0;
                        salesMetrics.totalUnitsSold += q;
                        const cost = (it.costPriceSnapshot || 0) * q;
                        const revenue = (it.unitPrice || 0) * q;
                        salesMetrics.totalGrossProfit = round2(salesMetrics.totalGrossProfit + Math.max(0, revenue - cost));
                    });
                });

                salesMetrics.totalReturnsCount = memReturns.length;
                memReturns.filter(r => r.status === 'APPROVED' || r.status === 'COMPLETED').forEach(r => {
                    (r.items || []).forEach(it => {
                        if (it.condition === 'GOOD') salesMetrics.goodRestockedUnits += (it.returnedQuantity || 0);
                        else if (it.condition === 'DAMAGED') salesMetrics.damagedUnits += (it.returnedQuantity || 0);
                        else if (it.condition === 'DEFECTIVE') salesMetrics.defectiveUnits += (it.returnedQuantity || 0);
                    });
                });

                memDispatches.forEach(d => {
                    if (d.status === 'DELIVERED') salesMetrics.deliveredDispatches++;
                    else salesMetrics.pendingDispatches++;
                });
            }

            const reportSummary = {
                totalValuation: totalValuation,
                totalUnits: totalStockUnits,
                totalItems: materials.length,
                lowStockCount: lowStockItems.length,
                ...salesMetrics
            };

            res.render('private/admin/inventory-reports', {
                title: `Stock Reports & Valuation | ${data.company.name}`,
                data,
                company: data.company,
                summary: reportSummary,
                stats: reportSummary,
                categoryStats: catStatsArray,
                categoryBreakdown: catStatsArray,
                lowStockList: lowStockItems,
                lowStockItems: lowStockItems,
                user: req.session.user,
                currentUser: req.session.user,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'material-reports',
                pageTitle: 'Inventory Valuation & Stock Reports',
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: 'Stock Reports' }
                ]
            });
        } catch (err) {
            console.error('Error in getStockReportsPage:', err);
            res.status(500).render('private/errors/500', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to compile inventory reports: ' + (err.message || 'Internal server error.')
            });
        }
    }

    static async exportStockCsv(req, res) {
        try {
            let materials = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                materials = await Material.find({}).sort({ category: 1, name: 1 }).lean();
            } else {
                materials = [...memMaterials];
            }

            let csv = 'SKU,Material Name,Category,Brand,Model,Unit,Current Stock,Weighted Avg Cost (INR),Stock Valuation (INR),Min Stock Alert,Status\n';
            materials.forEach(m => {
                const name = `"${(m.name || '').replace(/"/g, '""')}"`;
                const brand = `"${(m.brand || '').replace(/"/g, '""')}"`;
                const model = `"${(m.model || '').replace(/"/g, '""')}"`;
                const stock = m.currentStock || 0;
                const wac = m.weightedAverageCost || 0;
                const val = round2(stock * wac);
                const status = (m.currentStock || 0) <= (m.minStockAlert || 5) ? 'LOW STOCK' : 'ADEQUATE';
                csv += `${m.sku},${name},${m.category},${brand},${model},${m.unit},${stock},${wac},${val},${m.minStockAlert || 5},${status}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="inventory_stock_${Date.now()}.csv"`);
            return res.send(csv);
        } catch (err) {
            console.error('Error exporting stock CSV:', err);
            return res.status(500).send('Error generating stock CSV.');
        }
    }

    static async exportLedgerCsv(req, res) {
        try {
            let transactions = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                transactions = await InventoryTransaction.find({})
                    .sort({ transactionDate: -1 })
                    .populate('material', 'name sku unit')
                    .populate('performedBy', 'name employeeId')
                    .lean();
            } else {
                transactions = [...memTransactions];
            }

            let csv = 'Transaction No,Date,SKU,Material Name,Transaction Type,Qty In,Qty Out,Unit Cost (INR),Total Cost (INR),Balance After,Source Ref,Performed By,Notes\n';
            transactions.forEach(t => {
                const sku = (t.material && t.material.sku) || '';
                const name = `"${((t.material && t.material.name) || '').replace(/"/g, '""')}"`;
                const date = t.transactionDate ? new Date(t.transactionDate).toISOString().split('T')[0] : '';
                const user = (t.performedBy && t.performedBy.name) ? `"${t.performedBy.name}"` : 'System';
                const notes = `"${(t.notes || '').replace(/"/g, '""')}"`;
                csv += `${t.transactionNumber},${date},${sku},${name},${t.transactionType},${t.quantityIn || 0},${t.quantityOut || 0},${t.unitCost || 0},${t.totalCost || 0},${t.balanceAfter || 0},${t.sourceReferenceNumber || ''},${user},${notes}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="inventory_ledger_${Date.now()}.csv"`);
            return res.send(csv);
        } catch (err) {
            console.error('Error exporting ledger CSV:', err);
            return res.status(500).send('Error generating ledger CSV.');
        }
    }

    // =========================================================================
    // 6. PHASE 2: SALES & STOCK OUT
    // =========================================================================

    static getSalesPage(req, res) { return MaterialPhase2Controller.getSalesPage(req, res); }
    static getNewSalePage(req, res) { return MaterialPhase2Controller.getNewSalePage(req, res); }
    static getSaleViewPage(req, res) { return MaterialPhase2Controller.getSaleViewPage(req, res); }
    static getSaleInvoicePage(req, res) { return MaterialPhase2Controller.getSaleInvoicePage(req, res); }
    static createSale(req, res) { return MaterialPhase2Controller.createSale(req, res); }
    static confirmSale(req, res) { return MaterialPhase2Controller.confirmSale(req, res); }
    static cancelSale(req, res) { return MaterialPhase2Controller.cancelSale(req, res); }
    static searchCustomersApi(req, res) { return MaterialPhase2Controller.searchCustomersApi(req, res); }
    static quickCreateCustomerApi(req, res) { return MaterialPhase2Controller.quickCreateCustomerApi(req, res); }
    static exportSalesCsv(req, res) { return MaterialPhase2Controller.exportSalesCsv(req, res); }

    // =========================================================================
    // 7. PHASE 2: DISPATCH MANAGEMENT
    // =========================================================================

    static getDispatchListPage(req, res) { return MaterialPhase2Controller.getDispatchListPage(req, res); }
    static getDispatchViewPage(req, res) { return MaterialPhase2Controller.getDispatchViewPage(req, res); }
    static createDispatch(req, res) { return MaterialPhase2Controller.createDispatch(req, res); }
    static updateDispatchStatus(req, res) { return MaterialPhase2Controller.updateDispatchStatus(req, res); }

    // =========================================================================
    // 8. PHASE 2: RETURNS MANAGEMENT
    // =========================================================================

    static getReturnsListPage(req, res) { return MaterialPhase2Controller.getReturnsListPage(req, res); }
    static getReturnViewPage(req, res) { return MaterialPhase2Controller.getReturnViewPage(req, res); }
    static createReturnRequest(req, res) { return MaterialPhase2Controller.createReturnRequest(req, res); }
    static inspectAndApproveReturn(req, res) { return MaterialPhase2Controller.inspectAndApproveReturn(req, res); }
    static rejectReturn(req, res) { return MaterialPhase2Controller.rejectReturn(req, res); }

    // =========================================================================
    // 9. PHASE 2 PLACEHOLDERS (Retained for backwards compatibility)
    // =========================================================================

    static getPlaceholderPage(moduleKey) {
        const placeholders = {
            'sales-out': {
                title: 'Sales / Stock Out',
                pageTitle: 'Commercial Sales & Stock Outward (Phase 2)',
                icon: 'icofont-upload-alt',
                activePage: 'material-sales-out',
                desc: 'Direct retail material sales, B2B commercial dispatches, customer sales invoicing, and automatic inventory stock deduction are scheduled for Phase 2.',
                plannedFeatures: [
                    'Multi-item sales invoice generation with barcode scanner integration',
                    'Direct customer billing with GST tax computation',
                    'Automatic real-time stock deductions in Inventory Ledger',
                    'Customer delivery challans and gate pass generation'
                ]
            },
            'dispatch': {
                title: 'Dispatch Management',
                pageTitle: 'Logistics & Dispatch Management (Phase 2)',
                icon: 'icofont-delivery-truck',
                activePage: 'material-dispatch',
                desc: 'Vehicle tracking, driver allocation, site transport manifests, and project consignment delivery tracking are scheduled for Phase 2.',
                plannedFeatures: [
                    'Transporter and vehicle assignment with e-Way bill generation',
                    'GPS vehicle route and delivery status tracking',
                    'Site engineer receipt acknowledgement and physical inspection checklist',
                    'Partial and staged site material deliveries'
                ]
            },
            'returns': {
                title: 'Returns & RMA',
                pageTitle: 'Material Returns & Warranty RMA (Phase 2)',
                icon: 'icofont-recycle',
                activePage: 'material-returns',
                desc: 'Faulty inverter manufacturer RMAs, damaged panel returns to Tier-1 suppliers, and customer site surplus material inward returns are scheduled for Phase 2.',
                plannedFeatures: [
                    'Supplier warranty RMA tracking with courier docket tracking',
                    'Customer return note and credit memo generation',
                    'Damaged / scrap warehouse quarantine ledger',
                    'Replacement dispatch linking'
                ]
            }
        };

        return (req, res) => {
            const mod = placeholders[moduleKey] || {
                title: 'Module Under Construction',
                pageTitle: 'Phase 2 Architecture',
                icon: 'icofont-tools-alt-2',
                activePage: 'material-list',
                desc: 'This module is scheduled for development in Phase 2.',
                plannedFeatures: []
            };

            res.render('private/admin/inventory-placeholder', {
                title: `${mod.title} | ${data.company.name}`,
                data,
                company: data.company,
                module: mod,
                icon: mod.icon,
                pageHeading: mod.title,
                description: mod.desc,
                plannedFeatures: mod.plannedFeatures,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: mod.activePage,
                pageTitle: mod.pageTitle,
                csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
                breadcrumbs: [
                    { label: 'Material Management', url: '/admin/materials' },
                    { label: mod.title }
                ]
            });
        };
    }
}

module.exports = MaterialController;
