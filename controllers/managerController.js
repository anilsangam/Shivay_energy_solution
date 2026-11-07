const User = require('../models/User');
const Branch = require('../models/Branch');
const Attendance = require('../models/Attendance');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Enquiry = require('../models/Enquiry');
const Complaint = require('../models/Complaint');
const companyData = require('../config/company');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');

class ManagerController {
    // -------------------------------------------------------------
    // BRANCH MANAGER DASHBOARD
    // -------------------------------------------------------------
    static async getDashboard(req, res) {
        const branchId = req.session.user.branchId;
        const branchFilter = branchId ? { branch: branchId } : {};

        let branch = null;
        if (branchId) {
            try {
                branch = await Branch.findById(branchId);
            } catch (e) {}
        }

        const stats = {
            branchName: branch ? branch.name : 'Raisen Central Branch',
            branchCode: branch ? branch.code : 'MP-RSN-01',
            activeStaff: 5,
            pendingEnquiries: 3,
            branchRevenue: '₹6,40,000'
        };

        const enquiries = DataStore.getAllEnquiries();
        const attendance = DataStore.getTodayAttendance();

        res.render('manager/dashboard', {
            title: `Branch Manager Dashboard | ${companyData.company.name}`,
            data: companyData,
            stats,
            branch,
            enquiries,
            attendance,
            activePage: 'manager-dashboard'
        });
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEES
    // -------------------------------------------------------------
    static async getEmployees(req, res) {
        const branchId = req.session.user.branchId;
        let employees = [];
        try {
            const query = { role: 'EMPLOYEE' };
            if (branchId) query.branchId = branchId;
            employees = await User.find(query).select('-password');
        } catch (e) {
            employees = [];
        }

        res.render('manager/employees', {
            title: `Branch Staff Management | ${companyData.company.name}`,
            data: companyData,
            employees,
            activePage: 'manager-employees'
        });
    }

    // -------------------------------------------------------------
    // BRANCH ATTENDANCE
    // -------------------------------------------------------------
    static async getAttendance(req, res) {
        const attendance = DataStore.getTodayAttendance();
        res.render('manager/attendance', {
            title: `Branch Field Attendance Logs | ${companyData.company.name}`,
            data: companyData,
            attendance,
            activePage: 'manager-attendance'
        });
    }

    // -------------------------------------------------------------
    // BRANCH QUOTATIONS
    // -------------------------------------------------------------
    static async getQuotations(req, res) {
        const quotations = DataStore.getAllQuotations();
        res.render('admin/quotations', {
            title: `Branch Quotations | ${companyData.company.name}`,
            data: companyData,
            quotations,
            activePage: 'manager-quotations'
        });
    }

    // -------------------------------------------------------------
    // BRANCH INVOICES
    // -------------------------------------------------------------
    static async getInvoices(req, res) {
        const invoices = DataStore.getAllInvoices();
        res.render('admin/invoices', {
            title: `Branch Invoices | ${companyData.company.name}`,
            data: companyData,
            invoices,
            activePage: 'manager-invoices'
        });
    }
}

module.exports = ManagerController;
