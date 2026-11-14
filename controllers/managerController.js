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
const mongoose = require('mongoose');

class ManagerController {
    // -------------------------------------------------------------
    // BRANCH MANAGER DASHBOARD
    // -------------------------------------------------------------
    static async getDashboard(req, res) {
        try {
            const manager = req.session.user;
            const branchId = manager.branchId;

            let branch = null;
            if (branchId && mongoose.isValidObjectId(branchId) && mongoose.connection.readyState === 1) {
                try {
                    branch = await Branch.findById(branchId);
                } catch (e) {}
            }

            // Retrieve actual assigned employees
            let assignedEmployees = await DataStore.getEmployeesByManager(manager._id);
            if (!assignedEmployees || assignedEmployees.length === 0) {
                // If no direct managerId matches, retrieve staff within same branch
                const allUsers = await DataStore.getUsers();
                assignedEmployees = allUsers.filter(u => u.role === 'EMPLOYEE');
            }

            const activeStaffCount = assignedEmployees.filter(e => e.status === 'ACTIVE').length;
            const enquiries = DataStore.getAllEnquiries();
            const attendance = DataStore.getTodayAttendance();

            const stats = {
                branchName: branch ? branch.name : 'Raisen Central Branch',
                branchCode: branch ? branch.code : 'MP-RSN-01',
                activeStaff: activeStaffCount,
                totalAssigned: assignedEmployees.length,
                pendingEnquiries: enquiries.filter(e => e.status === 'new').length,
                todayPunches: attendance.length
            };

            res.render('manager/dashboard', {
                title: `Branch Manager Dashboard | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                stats,
                branch,
                employees: assignedEmployees,
                enquiries,
                attendance,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'manager-dashboard',
                pageTitle: 'Manager Operations Dashboard',
                breadcrumbs: [{ label: 'Manager Panel' }]
            });
        } catch (err) {
            console.error('Manager Dashboard Error:', err);
            res.status(500).render('errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading manager dashboard.'
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEES
    // -------------------------------------------------------------
    static async getEmployees(req, res) {
        try {
            const manager = req.session.user;
            let employees = await DataStore.getEmployeesByManager(manager._id);
            if (!employees || employees.length === 0) {
                const allUsers = await DataStore.getUsers();
                employees = allUsers.filter(u => u.role === 'EMPLOYEE');
            }

            res.render('manager/employees', {
                title: `Branch Staff Management | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                employees,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'manager-employees',
                pageTitle: 'Assigned Branch Employees',
                breadcrumbs: [{ label: 'Manager' }, { label: 'Employees' }]
            });
        } catch (err) {
            console.error('Error fetching manager employees:', err);
            res.status(500).render('errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading assigned employees.'
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH ATTENDANCE
    // -------------------------------------------------------------
    static async getAttendance(req, res) {
        const attendance = DataStore.getTodayAttendance();
        res.render('manager/attendance', {
            title: `Branch Field Attendance Logs | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            attendance,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-attendance',
            pageTitle: 'Branch Attendance & Field GPS Logs',
            breadcrumbs: [{ label: 'Operations' }, { label: 'Attendance' }]
        });
    }

    // -------------------------------------------------------------
    // BRANCH QUOTATIONS (PLACEHOLDER FOR PHASE 2)
    // -------------------------------------------------------------
    static async getQuotations(req, res) {
        const quotations = DataStore.getAllQuotations();
        res.render('admin/quotations', {
            title: `Branch Quotation Requests | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            quotations,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-quotations',
            pageTitle: 'Quotation Requests & Proposals',
            breadcrumbs: [{ label: 'Operations' }, { label: 'Quotations' }]
        });
    }

    // -------------------------------------------------------------
    // BRANCH PROJECTS (PLACEHOLDER FOR PHASE 3)
    // -------------------------------------------------------------
    static async getProjects(req, res) {
        const mod = {
            title: 'Branch Solar Project Management',
            pageTitle: 'Branch Projects & Commissioning',
            desc: 'Turnkey solar rooftop installation milestones, DISCOM net-meter applications, and PM Surya Ghar subsidy tracking for your branch team will be enabled in Phase 3.',
            phase: 'Phase 3 Architecture',
            icon: 'icofont-solar-panel',
            activePage: 'manager-projects',
            plannedFeatures: [
                'Assign solar engineers to local customer sites in Raisen',
                'Upload site survey measurements and shadow analysis',
                'Track MPPKVVCL DISCOM bi-directional net meter installation',
                'Verify subsidy application status for branch clients'
            ]
        };

        res.render('admin/placeholder', {
            title: `${mod.title} | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            module: mod,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-projects',
            pageTitle: mod.pageTitle,
            breadcrumbs: [{ label: 'Operations' }, { label: 'Projects' }]
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
            company: companyData.company,
            invoices,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'invoices',
            pageTitle: 'Branch Tax Invoices & Billing',
            breadcrumbs: [{ label: 'Billing' }, { label: 'Invoices' }]
        });
    }

    // -------------------------------------------------------------
    // MANAGER PROFILE
    // -------------------------------------------------------------
    static async getProfile(req, res) {
        const sessionUser = req.session.user;
        const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;

        res.render('admin/profile', {
            title: `Manager Profile | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            profileUser: freshUser,
            user: sessionUser,
            currentUser: sessionUser,
            activePage: 'manager-profile',
            pageTitle: 'Manager Profile & Security',
            breadcrumbs: [{ label: 'Account' }, { label: 'My Profile' }]
        });
    }
}

module.exports = ManagerController;
