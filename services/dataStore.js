/**
 * Central Data Store Service for Shivay Energy Solutions
 * Provides unified in-memory store with Mongoose fallback and persistence.
 */
const Enquiry = require('../models/Enquiry');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Attendance = require('../models/Attendance');
const Complaint = require('../models/Complaint');
const mongoose = require('mongoose');
const crypto = require('crypto');
const dateUtils = require('./dateUtils');
const { PERMISSIONS, SENSITIVE_FIELDS, ROLE_MIGRATION_BASELINES } = require('../config/permissionRegistry');
const AUTH_CONFIG = require('../config/authConfig');
const AuthorizationService = require('./authorizationService');

function enrichUserPermissions(u) {
    if (!u) return u;
    if (u.isPrimarySuperAdmin === undefined) {
        u.isPrimarySuperAdmin = AUTH_CONFIG.isPrimarySuperAdmin(u);
    }
    if (!u.permissions) {
        if (u.isPrimarySuperAdmin) {
            u.permissions = Object.keys(PERMISSIONS);
            u.fieldPermissions = Object.keys(SENSITIVE_FIELDS);
        } else if (ROLE_MIGRATION_BASELINES[u.role]) {
            u.permissions = [...ROLE_MIGRATION_BASELINES[u.role].permissions];
            u.fieldPermissions = [...ROLE_MIGRATION_BASELINES[u.role].fieldPermissions];
        } else {
            u.permissions = [];
            u.fieldPermissions = [];
        }
    }
    if (u.permissionVersion === undefined) {
        u.permissionVersion = 1;
    }
    if (u.dataScope === undefined) {
        u.dataScope = 'BRANCH';
    }
    if (!Array.isArray(u.authorizedBranches)) {
        u.authorizedBranches = [];
    }
    if (!u.hasPermission) {
        u.hasPermission = function(key) {
            return AuthorizationService.hasPermission(this, key);
        };
    }
    if (!u.hasAnyPermission) {
        u.hasAnyPermission = function(keys = []) {
            return AuthorizationService.hasAnyPermission(this, keys);
        };
    }
    if (!u.hasAllPermissions) {
        u.hasAllPermissions = function(keys = []) {
            return AuthorizationService.hasAllPermissions(this, keys);
        };
    }
    if (!u.hasFieldAccess) {
        u.hasFieldAccess = function(key) {
            return AuthorizationService.hasFieldAccess(this, key);
        };
    }
    if (!u.hasModuleAccess) {
        u.hasModuleAccess = function(moduleKey) {
            return AuthorizationService.hasModuleAccess(this, moduleKey);
        };
    }
    if (!u.hasFeatureAccess) {
        u.hasFeatureAccess = function(moduleKey, featureKey) {
            return AuthorizationService.hasFeatureAccess(this, moduleKey, featureKey);
        };
    }
    if (!u.hasActionAccess) {
        u.hasActionAccess = function(moduleKey, featureKey, actionKey) {
            return AuthorizationService.hasActionAccess(this, moduleKey, featureKey, actionKey);
        };
    }
    if (!u.canAccessBranch) {
        u.canAccessBranch = function(targetBranchId) {
            return AuthorizationService.canAccessBranch(this, targetBranchId);
        };
    }
    if (!u.getAccessibleDataScope) {
        u.getAccessibleDataScope = function(moduleKey) {
            return AuthorizationService.getAccessibleDataScope(this, moduleKey);
        };
    }
    return u;
}

// Seed In-Memory User Directory (With real team and manager relationships)
const managerSeedId = new mongoose.Types.ObjectId('655000000000000000000002');
const adminSeedId = new mongoose.Types.ObjectId('655000000000000000000001');

let inMemoryUsers = [
    {
        _id: adminSeedId,
        name: 'Deepak Kushwaha',
        email: 'admin@shivayenergy.com',
        mobile: '+91 70005 75496',
        employeeId: 'SES-ADMIN-01',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: true,
        permissions: Object.keys(PERMISSIONS),
        fieldPermissions: Object.keys(SENSITIVE_FIELDS),
        permissionVersion: 1,
        status: 'ACTIVE',
        designation: 'Managing Director & Founder',
        department: 'Executive Leadership',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: null,
        lastLogin: new Date(),
        createdAt: new Date('2026-01-01')
    },
    {
        _id: managerSeedId,
        name: 'Rahul Saini',
        email: 'rahul@shivayenergy.com',
        mobile: '+91 93997 61750',
        employeeId: 'SES-MGR-01',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        permissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.BRANCH_MANAGER.fieldPermissions],
        permissionVersion: 1,
        status: 'ACTIVE',
        designation: 'General Operations Manager',
        department: 'Operations & DISCOM Approvals',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: null,
        manager: null,
        lastLogin: new Date(),
        createdAt: new Date('2026-01-10')
    },
    {
        _id: new mongoose.Types.ObjectId('655000000000000000000003'),
        name: 'Anil Sharma',
        email: 'anil@shivayenergy.com',
        mobile: '+91 98261 44521',
        employeeId: 'SES-EMP-03',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.fieldPermissions],
        permissionVersion: 1,
        status: 'ACTIVE',
        designation: 'Senior Solar Installation Technician',
        department: 'EPC Installation & Maintenance',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
        bloodGroup: 'B+',
        alternateMobile: '+91 98260 11223',
        joiningDate: new Date('2026-02-01'),
        expiryDate: new Date('2029-02-01'),
        idCardNumber: 'SES-EMP-03',
        lastLogin: new Date(),
        createdAt: new Date('2026-02-01')
    },
    {
        _id: new mongoose.Types.ObjectId('655000000000000000000004'),
        name: 'Pooja Patel',
        email: 'pooja@shivayenergy.com',
        mobile: '+91 94250 88712',
        employeeId: 'SES-EMP-99',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.fieldPermissions],
        permissionVersion: 1,
        status: 'ACTIVE',
        designation: 'Solar Site Survey Specialist',
        department: 'Field Surveys & Feasibility',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
        bloodGroup: 'O+',
        alternateMobile: '+91 94250 11990',
        joiningDate: new Date('2026-02-15'),
        expiryDate: new Date('2029-02-15'),
        idCardNumber: 'SES-EMP-99',
        lastLogin: new Date(),
        createdAt: new Date('2026-02-15')
    },
    {
        _id: new mongoose.Types.ObjectId('655000000000000000000005'),
        name: 'Vikram Solanki',
        email: 'vikram@shivayenergy.com',
        mobile: '+91 99933 11204',
        employeeId: 'SES-EMP-04',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.permissions],
        fieldPermissions: [...ROLE_MIGRATION_BASELINES.EMPLOYEE.fieldPermissions],
        permissionVersion: 1,
        status: 'ACTIVE',
        designation: 'Electrical & Net-Meter Testing Engineer',
        department: 'Grid Integration & Net-Metering',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
        bloodGroup: 'AB+',
        alternateMobile: '+91 99933 99881',
        joiningDate: new Date('2026-03-01'),
        expiryDate: new Date('2029-03-01'),
        idCardNumber: 'SES-EMP-04',
        lastLogin: new Date(),
        createdAt: new Date('2026-03-01')
    }
];

inMemoryUsers.forEach(enrichUserPermissions);

// Empty storage collections for production data (no seed/dummy fallback records)
let enquiries = [];
let quotations = [];
let invoices = [];
let attendanceRecords = [];
let complaints = [];
let systemSettings = null;

class DataStore {
    // ENQUIRIES
    static getAllEnquiries() {
        return enquiries;
    }

    static addEnquiry(data) {
        const id = 'ENQ-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const newEnquiry = {
            id,
            name: data.name,
            mobile: data.mobile.startsWith('+91') ? data.mobile : `+91 ${data.mobile}`,
            email: data.email || '',
            district: data.district || 'Raisen',
            state: data.state || 'Madhya Pradesh',
            requirement: data.solarRequirement || 'Residential Rooftop (PM Surya Ghar)',
            monthlyBill: parseFloat(data.monthlyBill) || 0,
            message: data.message || '',
            status: 'new',
            date: todayStr,
            createdAt: new Date(),
            notes: []
        };

        enquiries.unshift(newEnquiry);

        // Sync with MongoDB if available
        try {
            Enquiry.create({
                enquiryId: id,
                name: newEnquiry.name,
                mobile: newEnquiry.mobile,
                email: newEnquiry.email,
                district: newEnquiry.district,
                state: newEnquiry.state,
                solarRequirement: newEnquiry.requirement,
                monthlyBill: newEnquiry.monthlyBill,
                message: newEnquiry.message,
                status: 'new'
            }).catch(() => {});
        } catch (e) {}

        return newEnquiry;
    }

    static updateEnquiryStatus(id, newStatus, note = '') {
        const item = enquiries.find(e => e.id === id);
        if (item) {
            item.status = newStatus;
            if (note) {
                item.notes.push(note);
            }
            try {
                Enquiry.findOneAndUpdate({ enquiryId: id }, { status: newStatus }).catch(() => {});
            } catch (e) {}
            return true;
        }
        return false;
    }

    // QUOTATIONS
    static getAllQuotations() {
        return quotations;
    }

    static addQuotation(data) {
        const num = data.quotationNumber || ('SES-Q2026-' + Date.now().toString().slice(-4) + crypto.randomBytes(2).toString('hex').toUpperCase());
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const q = {
            quotationNumber: num,
            customerName: data.customerName,
            customerMobile: data.customerMobile,
            customerAddress: data.customerAddress || 'Raisen (M.P.)',
            plantCapacityKw: parseFloat(data.plantCapacityKw) || 3,
            ratePerKw: parseFloat(data.ratePerKw) || 58000,
            grossAmount: parseFloat(data.grossAmount) || 174000,
            subsidy: parseFloat(data.subsidy) || 78000,
            netAmount: parseFloat(data.netAmount) || 96000,
            panelSpecs: data.panelSpecs || `${Math.ceil((parseFloat(data.plantCapacityKw) || 3) * 1000 / 540)} x 540W Mono PERC Half-Cut`,
            inverterSpecs: data.inverterSpecs || `${data.plantCapacityKw || 3} kW On-Grid Dual MPPT Inverter`,
            date: todayStr,
            status: 'sent'
        };

        quotations.unshift(q);

        try {
            Quotation.create({
                quotationNumber: num,
                customerName: q.customerName,
                customerMobile: q.customerMobile,
                customerAddress: q.customerAddress,
                plantCapacityKw: q.plantCapacityKw,
                grossAmount: q.grossAmount,
                estimatedSubsidy: q.subsidy,
                netAmount: q.netAmount,
                panelSpecs: q.panelSpecs,
                inverterSpecs: q.inverterSpecs,
                status: 'sent'
            }).catch(() => {});
        } catch (e) {}

        return q;
    }

    // INVOICES
    static getAllInvoices(includeArchived = false) {
        return includeArchived ? invoices : invoices.filter(i => !i.isArchived);
    }

    static addInvoice(data) {
        const crypto = require('crypto');
        const num = data.invoiceNumber || ('SES-INV-2026-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase());
        const todayStr = data.date || new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const existingIdx = invoices.findIndex(i => i.invoiceNumber === num);
        
        // If invoiceNumber already exists in memory, archive old state to previousVersions and update with customer fields strictly locked
        if (existingIdx !== -1) {
            const existing = invoices[existingIdx];
            const oldSnapshot = {
                version: existing.version || 1,
                items: existing.items || [],
                subtotal: existing.subtotal,
                cgst: existing.cgst,
                sgst: existing.sgst,
                totalAmount: existing.totalAmount,
                paymentStatus: existing.paymentStatus,
                paymentMethod: existing.paymentMethod,
                plantCapacityKw: existing.plantCapacityKw,
                date: existing.date,
                updatedAt: new Date()
            };
            existing.previousVersions = existing.previousVersions || [];
            existing.previousVersions.push(oldSnapshot);
            existing.version = (existing.version || 1) + 1;

            // Retain locked customer info
            existing.plantCapacityKw = parseFloat(data.plantCapacityKw) || existing.plantCapacityKw;
            existing.subtotal = parseFloat(data.subtotal) || existing.subtotal;
            existing.cgst = parseFloat(data.cgst) || Math.round((parseFloat(data.subtotal) || 100000) * 0.06 * 100) / 100;
            existing.sgst = parseFloat(data.sgst) || Math.round((parseFloat(data.subtotal) || 100000) * 0.06 * 100) / 100;
            existing.roundOff = data.roundOff !== undefined ? parseFloat(data.roundOff) : (existing.roundOff || 0);
            existing.totalTaxAmount = data.totalTaxAmount !== undefined ? parseFloat(data.totalTaxAmount) : ((existing.cgst || 0) + (existing.sgst || 0));
            existing.totalAmount = parseFloat(data.totalAmount) || existing.totalAmount;
            existing.paymentReceivedPercent = data.paymentReceivedPercent || existing.paymentReceivedPercent || '100%';
            existing.paymentReceivedAmount = data.paymentReceivedAmount !== undefined ? parseFloat(data.paymentReceivedAmount) : (parseFloat(data.totalAmount) || existing.totalAmount);
            existing.mprgNo = data.mprgNo || existing.mprgNo || 'CZS2026042411080336';
            existing.companyGstin = data.companyGstin || existing.companyGstin || '23AFRFS0964B1Z0';
            existing.invoiceTitle = data.invoiceTitle || existing.invoiceTitle || 'TAX INVOICE ORIGINAL FOR RECIPIENT';
            existing.paymentStatus = data.paymentStatus || existing.paymentStatus;
            existing.paymentMethod = data.paymentMethod || existing.paymentMethod;
            existing.date = todayStr;
            existing.items = data.items || existing.items;
            return existing;
        }

        const inv = {
            _id: data.invoiceId || data._id || undefined,
            invoiceNumber: num,
            version: 1,
            previousVersions: [],
            isArchived: false,
            customerName: data.customerName,
            customerMobile: data.customerMobile || '',
            customerAddress: data.customerAddress || '',
            customerGstin: data.customerGstin || '',
            plantCapacityKw: parseFloat(data.plantCapacityKw) || 3,
            subtotal: parseFloat(data.subtotal) || 100000,
            cgst: parseFloat(data.cgst) || Math.round((parseFloat(data.subtotal) || 100000) * 0.06 * 100) / 100,
            sgst: parseFloat(data.sgst) || Math.round((parseFloat(data.subtotal) || 100000) * 0.06 * 100) / 100,
            roundOff: data.roundOff !== undefined ? parseFloat(data.roundOff) : 0,
            totalTaxAmount: data.totalTaxAmount !== undefined ? parseFloat(data.totalTaxAmount) : (parseFloat(data.cgst || 0) + parseFloat(data.sgst || 0)),
            totalAmount: parseFloat(data.totalAmount) || 112000,
            paymentReceivedPercent: data.paymentReceivedPercent || '100%',
            paymentReceivedAmount: data.paymentReceivedAmount !== undefined ? parseFloat(data.paymentReceivedAmount) : (parseFloat(data.totalAmount) || 112000),
            mprgNo: data.mprgNo || 'CZS2026042411080336',
            companyGstin: data.companyGstin || '23AFRFS0964B1Z0',
            invoiceTitle: data.invoiceTitle || 'TAX INVOICE ORIGINAL FOR RECIPIENT',
            paymentStatus: data.paymentStatus || 'paid',
            paymentMethod: data.paymentMethod || 'NEFT / RTGS (SBI Raisen)',
            date: todayStr,
            items: data.items || [],
            discomConsumerNo: data.discomConsumerNo || '',
            projectId: data.projectId || '',
            quotationId: data.quotationId || ''
        };

        invoices.unshift(inv);
        return inv;
    }

    static archiveInvoice(invoiceNumber) {
        const idx = invoices.findIndex(i => i.invoiceNumber === invoiceNumber);
        if (idx !== -1) {
            invoices[idx].isArchived = true;
            invoices[idx].archivedAt = new Date();
            invoices[idx].paymentStatus = 'cancelled';
            return true;
        }
        return false;
    }

    static deleteInvoice(invoiceNumber) {
        // Soft-archive instead of hard-deleting to preserve immutable audit trail
        return this.archiveInvoice(invoiceNumber);
    }

    // ATTENDANCE
    static getTodayAttendance() {
        return attendanceRecords;
    }

    static async syncAttendanceFromDb(targetDate) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return attendanceRecords;
        try {
            const Attendance = require('../models/Attendance');
            const todayStr = targetDate || dateUtils.getIstDate();

            const dbRecords = await Attendance.find({ date: todayStr }).sort({ createdAt: -1 }).lean();
            if (dbRecords && dbRecords.length > 0) {
                const existingKeys = new Set(attendanceRecords.map(a => `${a.employeeId}_${a.type}_${a.date}`));
                for (const doc of dbRecords) {
                    const key = `${doc.employeeId}_${doc.type}_${doc.date}`;
                    if (!existingKeys.has(key)) {
                        attendanceRecords.push({
                            id: doc._id ? doc._id.toString() : ('ATT-' + (attendanceRecords.length + 101)),
                            _id: doc._id,
                            branch: doc.branch ? doc.branch.toString() : null,
                            branchName: doc.branchName || '',
                            employeeId: doc.employeeId,
                            employeeName: doc.employeeName,
                            role: doc.role || 'Field Engineer',
                            type: doc.type || 'check_in',
                            latitude: doc.latitude !== undefined ? doc.latitude : 23.3315,
                            longitude: doc.longitude !== undefined ? doc.longitude : 77.7807,
                            accuracy: doc.accuracy || 10,
                            distanceMeters: Number.isFinite(Number(doc.distanceMeters)) ? Number(doc.distanceMeters) : null,
                            allowedRadiusMeters: Number.isFinite(Number(doc.allowedRadiusMeters)) ? Number(doc.allowedRadiusMeters) : null,
                            locationName: doc.locationName || `Lat: ${(doc.latitude !== undefined ? doc.latitude : 23.3315).toFixed(4)}, Lng: ${(doc.longitude !== undefined ? doc.longitude : 77.7807).toFixed(4)}`,
                            timestamp: doc.timestamp || (doc.createdAt ? dateUtils.getIstTime(doc.createdAt) : ''),
                            date: doc.date || todayStr,
                            isWithinGeofence: doc.isWithinGeofence !== false,
                            photoUrl: doc.photoUrl
                        });
                        existingKeys.add(key);
                    }
                }
            }
        } catch (e) {
            console.error('[Attendance Sync Error]:', e);
        }
        return attendanceRecords;
    }

    static async addAttendance(data) {
        const id = 'ATT-' + (attendanceRecords.length + 101);
        const timeStr = dateUtils.getIstTime();
        const todayStr = dateUtils.getIstDate();

        const parsedLat = Number.isFinite(Number(data.latitude)) ? parseFloat(data.latitude) : 23.3315;
        const parsedLng = Number.isFinite(Number(data.longitude)) ? parseFloat(data.longitude) : 77.7807;
        const parsedWithinGeofence = data.isWithinGeofence !== undefined ? Boolean(data.isWithinGeofence) : true;
        const parsedDistance = Number.isFinite(Number(data.distanceMeters)) ? Math.round(Number(data.distanceMeters)) : null;
        const parsedAllowedRadius = Number.isFinite(Number(data.allowedRadiusMeters)) ? Math.round(Number(data.allowedRadiusMeters)) : null;

        const rec = {
            id,
            branch: data.branchId ? String(data.branchId) : null,
            branchName: data.branchName || '',
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            role: data.role || 'Field Engineer',
            type: data.type || 'check_in',
            latitude: parsedLat,
            longitude: parsedLng,
            accuracy: parseFloat(data.accuracy) || 10,
            distanceMeters: parsedDistance,
            allowedRadiusMeters: parsedAllowedRadius,
            locationName: `Lat: ${parsedLat.toFixed(4)}, Lng: ${parsedLng.toFixed(4)}`,
            timestamp: timeStr,
            date: todayStr,
            isWithinGeofence: parsedWithinGeofence,
            photoUrl: data.photoUrl || null
        };

        // Confirmed persistence to MongoDB Atlas if connected
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const Attendance = require('../models/Attendance');
                const doc = await Attendance.create({
                    employee: (data.employee && mongoose.isValidObjectId(data.employee)) ? data.employee : undefined,
                    branch: (data.branchId && mongoose.isValidObjectId(data.branchId)) ? data.branchId : undefined,
                    branchName: rec.branchName || undefined,
                    employeeId: rec.employeeId,
                    employeeName: rec.employeeName,
                    role: rec.role,
                    type: rec.type,
                    latitude: rec.latitude,
                    longitude: rec.longitude,
                    accuracy: rec.accuracy,
                    distanceMeters: rec.distanceMeters !== null ? rec.distanceMeters : undefined,
                    allowedRadiusMeters: rec.allowedRadiusMeters !== null ? rec.allowedRadiusMeters : undefined,
                    locationName: rec.locationName,
                    timestamp: rec.timestamp,
                    date: rec.date,
                    isWithinGeofence: rec.isWithinGeofence,
                    photoUrl: rec.photoUrl,
                    checkInTime: rec.type === 'check_in' ? new Date() : undefined,
                    checkOutTime: rec.type === 'check_out' ? new Date() : undefined,
                    checkInLocation: rec.type === 'check_in' ? { latitude: rec.latitude, longitude: rec.longitude, accuracy: rec.accuracy, isWithinGeofence: rec.isWithinGeofence } : undefined,
                    checkOutLocation: rec.type === 'check_out' ? { latitude: rec.latitude, longitude: rec.longitude, accuracy: rec.accuracy, isWithinGeofence: rec.isWithinGeofence } : undefined,
                    status: 'present'
                });
                rec._id = doc._id;
                rec.id = doc._id.toString();
            } catch (dbErr) {
                console.error('[Attendance DB write error]:', dbErr);
                throw dbErr; // Propagate failure to controller so failure is never hidden
            }
        }

        attendanceRecords.unshift(rec);
        return rec;
    }

    // STATS
    static getStats() {
        const totalEnquiries = enquiries.length;
        const newEnquiries = enquiries.filter(e => e.status === 'new').length;
        const convertedEnquiries = enquiries.filter(e => e.status === 'converted').length;
        const todayAttendance = attendanceRecords.filter(a => a.type === 'check_in').length;

        return {
            totalEnquiries,
            newEnquiries,
            convertedEnquiries,
            todayAttendance,
            totalEmployees: inMemoryUsers.filter(u => u.role === 'EMPLOYEE').length,
            totalQuotations: quotations.length,
            totalInvoices: invoices.length,
            monthlyRevenueInr: '₹0'
        };
    }

    // COMPLAINTS
    static getAllComplaints() {
        return complaints;
    }

    static addComplaint(complaintData) {
        const complaint = {
            _id: complaintData._id || new mongoose.Types.ObjectId(),
            ticketId: complaintData.ticketId || ('SHIVAY-' + Date.now().toString().slice(-4) + crypto.randomBytes(2).toString('hex').toUpperCase()),
            customerName: complaintData.customerName,
            mobile: complaintData.mobile,
            email: complaintData.email || '',
            systemCapacity: complaintData.systemCapacity || '',
            category: complaintData.category || 'inverter_error',
            description: complaintData.description || '',
            status: complaintData.status || 'submitted',
            assignedEngineer: complaintData.assignedEngineer || null,
            resolutionNotes: complaintData.resolutionNotes || '',
            createdAt: complaintData.createdAt || new Date(),
            updatedAt: new Date()
        };
        complaints.unshift(complaint);
        return complaint;
    }

    static getComplaint(ticketId, mobile) {
        if (!ticketId) return null;
        const cleanTicket = ticketId.trim().toUpperCase();
        const cleanMobile = mobile ? mobile.replace(/\D/g, '').slice(-10) : '';
        return complaints.find(c => {
            const matchTicket = c.ticketId && c.ticketId.toUpperCase() === cleanTicket;
            if (!cleanMobile) return matchTicket;
            const cMobile = (c.mobile || '').replace(/\D/g, '').slice(-10);
            return matchTicket && cMobile === cleanMobile;
        }) || null;
    }

    static updateComplaintStatus(ticketId, status, resolutionNotes, assignedEngineer) {
        if (!ticketId) return null;
        const cleanTicket = ticketId.trim().toUpperCase();
        const comp = complaints.find(c => c.ticketId && c.ticketId.toUpperCase() === cleanTicket);
        if (comp) {
            comp.status = status;
            if (resolutionNotes) comp.resolutionNotes = resolutionNotes;
            if (assignedEngineer) comp.assignedEngineer = assignedEngineer;
            if (status === 'resolved' || status === 'closed') comp.resolvedAt = new Date();
            comp.updatedAt = new Date();
            return comp;
        }
        return null;
    }

    // SYSTEM SETTINGS
    static getSettings() {
        return systemSettings;
    }

    static saveSettings(settingsObj) {
        systemSettings = { ...systemSettings, ...settingsObj };
        return systemSettings;
    }

    // USER & TEAM MANAGEMENT HELPERS (With DB & In-Memory fallback)
    static async getUsers() {
        const User = require('../models/User');
        if (mongoose.connection.readyState === 1) {
            try {
                const list = await User.find({})
                    .sort({ createdAt: -1 })
                    .populate('managerId', 'name email mobile role employeeId')
                    .populate('branchId', 'name code')
                    .select('-password');
                if (list) return list;
            } catch (err) {}
        }
        return inMemoryUsers;
    }

    static async getUserById(id) {
        if (!id) return null;
        const idStr = id.toString();
        const User = require('../models/User');
        if (mongoose.connection.readyState === 1) {
            try {
                const found = await User.findById(id)
                    .populate('managerId', 'name email mobile role employeeId')
                    .populate('branchId', 'name code')
                    .select('-password')
                    .lean();
                if (found) return found;
            } catch (err) {}
        }
        const mem = inMemoryUsers.find(u => u._id && u._id.toString() === idStr);
        return mem ? enrichUserPermissions(mem) : null;
    }

    static getUserByIdSync(id) {
        if (!id) return null;
        const idStr = id.toString();
        const mem = inMemoryUsers.find(u => u._id && u._id.toString() === idStr);
        return mem ? enrichUserPermissions(mem) : null;
    }

    static async getEmployeesByManager(managerId, branchId) {
        if (!managerId && !branchId) return [];
        const mStr = managerId ? managerId.toString() : '';
        const bStr = branchId ? (branchId._id || branchId).toString() : '';
        const User = require('../models/User');

        if (mongoose.connection.readyState === 1) {
            try {
                const orConditions = [];
                if (managerId && mongoose.isValidObjectId(managerId)) {
                    orConditions.push({ managerId: managerId }, { manager: managerId });
                }
                if (branchId && mongoose.isValidObjectId(branchId)) {
                    orConditions.push({ branchId: branchId });
                }
                if (orConditions.length === 0) return [];

                const found = await User.find({
                    role: 'EMPLOYEE',
                    $or: orConditions
                }).populate('branchId', 'name code').select('-password');
                return found || [];
            } catch (err) {}
        }

        return inMemoryUsers.filter(u => {
            if (u.role !== 'EMPLOYEE') return false;
            const matchesMgr = mStr && ((u.managerId && u.managerId.toString() === mStr) || (u.manager && u.manager.toString() === mStr));
            const uBranch = u.branchId ? (u.branchId._id || u.branchId).toString() : '';
            const matchesBranch = bStr && uBranch === bStr;
            return matchesMgr || matchesBranch;
        });
    }

    static async getRealCounts(providedUsers) {
        const users = (providedUsers && Array.isArray(providedUsers)) ? providedUsers : (await this.getUsers());
        const employeeCount = users.filter(u => u.role === 'EMPLOYEE').length;
        const managerCount = users.filter(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER').length;
        const activeCount = users.filter(u => u.status === 'ACTIVE').length;
        const inactiveCount = users.filter(u => u.status !== 'ACTIVE').length;

        return {
            totalUsers: users.length,
            employeeCount,
            managerCount,
            activeCount,
            inactiveCount
        };
    }

    static addInMemoryUser(userObj) {
        enrichUserPermissions(userObj);
        inMemoryUsers.unshift(userObj);
        return userObj;
    }

    static deleteEnquiry(id) {
        const idx = enquiries.findIndex(e => e.id === id || e.enquiryId === id);
        if (idx !== -1) {
            enquiries.splice(idx, 1);
            return true;
        }
        return false;
    }

    static getAllFranchiseApplications() {
        const franchiseController = require('../controllers/franchiseController');
        return franchiseController.getMemFranchise ? franchiseController.getMemFranchise() : [];
    }

    static updateFranchiseStatus(id, newStatus, note = '') {
        const apps = this.getAllFranchiseApplications();
        const item = apps.find(a => (a.applicationId === id || (a._id && a._id.toString() === id.toString())));
        if (item) {
            item.status = newStatus;
            if (note) {
                if (!item.notes) item.notes = [];
                item.notes.push({ author: 'Admin', note, date: new Date() });
            }
            return true;
        }
        return false;
    }

    static deleteFranchiseApplication(id) {
        const apps = this.getAllFranchiseApplications();
        const idx = apps.findIndex(a => (a.applicationId === id || (a._id && a._id.toString() === id.toString())));
        if (idx !== -1) {
            apps.splice(idx, 1);
            return true;
        }
        return false;
    }
}

module.exports = DataStore;
