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

            // Retrieve actual assigned employees strictly for this manager and their branch
            const assignedEmployees = await DataStore.getEmployeesByManager(manager._id, manager.branchId);

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

            // Real-time Phase 3 Branch Project Metrics & Recent Projects
            let branchProjectStats = { total: 0, active: 0, completed: 0, onHold: 0, totalKw: 0 };
            let branchProjects = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                try {
                    const Project = require('../models/Project');
                    const bFilter = branchId ? { $or: [{ branch: branchId }, { assignedManager: manager._id }] } : { assignedManager: manager._id };
                    const projs = await Project.find(bFilter)
                        .select('projectNumber title capacityKw status customer assignedEngineer updatedAt createdAt')
                        .populate('customer', 'name mobile city')
                        .populate('assignedEngineer', 'name employeeId')
                        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
                        .lean();

                    branchProjectStats.total = projs.length;
                    projs.forEach(p => {
                        if (p.status !== 'CANCELLED') branchProjectStats.totalKw += (p.capacityKw || 0);
                        if (p.status === 'COMPLETED') branchProjectStats.completed++;
                        else if (p.status === 'ON_HOLD') branchProjectStats.onHold++;
                        else if (p.status !== 'CANCELLED') branchProjectStats.active++;
                    });
                    branchProjectStats.totalKw = Math.round(branchProjectStats.totalKw * 10) / 10;
                    branchProjects = projs.slice(0, 5);
                } catch (pe) {}
            }
            stats.projects = branchProjectStats;

            res.render('private/manager/dashboard', {
                title: `Branch Manager Dashboard | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                stats,
                branch,
                employees: assignedEmployees,
                recentProjects: branchProjects,
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
            res.status(500).render('private/errors/403', {
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
            const employees = await DataStore.getEmployeesByManager(manager._id, manager.branchId);

            res.render('private/manager/employees', {
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
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading assigned employees.'
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH ATTENDANCE
    // -------------------------------------------------------------
    static async getAttendance(req, res) {
        try {
            await DataStore.syncAttendanceFromDb();
        } catch (_) {}
        const attendance = DataStore.getTodayAttendance();
        res.render('private/manager/attendance', {
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
        res.render('private/admin/quotations', {
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

        res.render('private/admin/placeholder', {
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
        let invoices = [];
        let projects = [];
        let quotations = [];
        const sessionUser = req.session.user;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const Invoice = require('../models/Invoice');
                const Project = require('../models/Project');
                const Quotation = require('../models/Quotation');
                
                // Strict Branch Isolation: Managers only view records within their branch jurisdiction
                const branchQuery = sessionUser.branchId ? { branch: sessionUser.branchId } : { createdByUser: sessionUser._id };
                invoices = await Invoice.find({ isArchived: { $ne: true }, ...branchQuery }).sort({ createdAt: -1 }).lean();
                
                const projectFilter = { status: { $ne: 'CANCELLED' } };
                if (sessionUser.branchId) {
                    projectFilter.$or = [{ branch: sessionUser.branchId }, { assignedManager: sessionUser._id }];
                } else {
                    projectFilter.assignedManager = sessionUser._id;
                }
                projects = await Project.find(projectFilter).populate('customer').lean();
                
                quotations = await Quotation.find({ 
                    isArchived: { $ne: true }, 
                    status: { $in: ['CUSTOMER_ACCEPTED', 'APPROVED'] },
                    ...branchQuery 
                }).populate('customerId').lean();
            } catch (e) {}
        }
        res.render('private/admin/invoices', {
            title: `Branch Invoices | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            invoices,
            projects,
            quotations,
            csrfToken: req.session ? req.session.csrfToken : '',
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

        res.render('private/admin/profile', {
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
