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
        status: 'ACTIVE',
        designation: 'Senior Solar Installation Technician',
        department: 'EPC Installation & Maintenance',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
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
        status: 'ACTIVE',
        designation: 'Solar Site Survey Specialist',
        department: 'Field Surveys & Feasibility',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
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
        status: 'ACTIVE',
        designation: 'Electrical & Net-Meter Testing Engineer',
        department: 'Grid Integration & Net-Metering',
        branchId: { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' },
        managerId: managerSeedId,
        manager: { _id: managerSeedId, name: 'Rahul Saini', email: 'rahul@shivayenergy.com', mobile: '+91 93997 61750' },
        lastLogin: new Date(),
        createdAt: new Date('2026-03-01')
    }
];

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
        const id = 'ENQ-' + Math.floor(100000 + Math.random() * 900000);
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
        const num = data.quotationNumber || ('SES-Q2026-' + Math.floor(400 + Math.random() * 600));
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
        const num = data.invoiceNumber || ('SES-INV-2026-' + Math.floor(120 + Math.random() * 800));
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
            existing.totalAmount = parseFloat(data.totalAmount) || existing.totalAmount;
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
            totalAmount: parseFloat(data.totalAmount) || 112000,
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

    static addAttendance(data) {
        const id = 'ATT-' + (attendanceRecords.length + 101);
        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const rec = {
            id,
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            role: data.role || 'Field Engineer',
            type: data.type || 'check_in',
            latitude: parseFloat(data.latitude) || 23.3315,
            longitude: parseFloat(data.longitude) || 77.7807,
            accuracy: parseFloat(data.accuracy) || 10,
            locationName: `Lat: ${(parseFloat(data.latitude) || 23.3315).toFixed(4)}, Lng: ${(parseFloat(data.longitude) || 77.7807).toFixed(4)}`,
            timestamp: timeStr,
            date: todayStr,
            isWithinGeofence: true
        };

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
            ticketId: complaintData.ticketId || ('SHIVAY-' + Math.floor(10000 + Math.random() * 90000)),
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
                    .select('-password');
                if (found) return found;
            } catch (err) {}
        }
        const mem = inMemoryUsers.find(u => u._id && u._id.toString() === idStr);
        return mem || null;
    }

    static getUserByIdSync(id) {
        if (!id) return null;
        const idStr = id.toString();
        const mem = inMemoryUsers.find(u => u._id && u._id.toString() === idStr);
        return mem || null;
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

    static async getRealCounts() {
        const users = await this.getUsers();
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
        inMemoryUsers.unshift(userObj);
        return userObj;
    }
}

module.exports = DataStore;
