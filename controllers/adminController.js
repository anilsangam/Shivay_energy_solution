const data = require('../config/company');
const DataStore = require('../services/dataStore');
const User = require('../models/User');
const Branch = require('../models/Branch');
const AuditService = require('../services/auditService');
const mongoose = require('mongoose');

// 1. SUPER ADMIN DASHBOARD
exports.getDashboard = async (req, res) => {
    try {
        const counts = await DataStore.getRealCounts();
        const users = await DataStore.getUsers();
        const recentEnquiries = DataStore.getAllEnquiries();
        const todayAttendance = DataStore.getTodayAttendance();
        const recentActivities = await AuditService.getRecentLogs(10);

        res.render('admin/dashboard', {
            title: `Admin Management Dashboard | ${data.company.name}`,
            data,
            company: data.company,
            stats: {
                totalEmployees: counts.employeeCount,
                totalManagers: counts.managerCount,
                activeUsers: counts.activeCount,
                inactiveUsers: counts.inactiveCount,
                totalUsers: counts.totalUsers,
                totalEnquiries: recentEnquiries.length,
                todayAttendance: todayAttendance.length
            },
            users,
            recentEnquiries,
            todayAttendance,
            recentActivities,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin',
            pageTitle: 'Dashboard Overview',
            breadcrumbs: [{ label: 'Executive Dashboard' }]
        });
    } catch (err) {
        console.error('Super Admin Dashboard Error:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error rendering Admin Dashboard.'
        });
    }
};

// 2. QUOTATIONS MODULE
exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('admin/quotations', {
        title: `Quotation Management | ${data.company.name}`,
        data,
        company: data.company,
        quotations,
        user: req.session.user,
        currentUser: req.session.user,
        activePage: 'quotations',
        pageTitle: 'Solar Quotation Generator',
        breadcrumbs: [{ label: 'Quotations', url: '/admin/quotations' }]
    });
};

// 3. INVOICES MODULE
exports.getInvoices = (req, res) => {
    const invoices = DataStore.getAllInvoices();
    res.render('admin/invoices', {
        title: `Invoice Management | ${data.company.name}`,
        data,
        company: data.company,
        invoices,
        user: req.session.user,
        currentUser: req.session.user,
        activePage: 'invoices',
        pageTitle: 'Tax Invoices & Billing',
        breadcrumbs: [{ label: 'Invoices', url: '/admin/invoices' }]
    });
};

// 4. USER & EMPLOYEE MANAGEMENT
exports.getEmployees = async (req, res) => {
    try {
        const users = await DataStore.getUsers();
        let branches = [];
        if (mongoose.connection.readyState === 1) {
            try {
                branches = await Branch.find({});
            } catch (e) {}
        }
        if (!branches || branches.length === 0) {
            branches = [{ _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' }];
        }

        const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER');

        res.render('admin/employees', {
            title: `Staff & User Management | ${data.company.name}`,
            data,
            company: data.company,
            users,
            managers,
            branches,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-employees',
            pageTitle: 'Employee & Staff Management',
            breadcrumbs: [{ label: 'Team', url: '/admin/employees' }, { label: 'Employees' }]
        });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading staff database'
        });
    }
};

// 5. MANAGERS MANAGEMENT
exports.getManagers = async (req, res) => {
    try {
        const users = await DataStore.getUsers();
        const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER');
        const employees = users.filter(u => u.role === 'EMPLOYEE');

        // Annotate each manager with their assigned employees
        const annotatedManagers = managers.map(mgr => {
            const mId = mgr._id.toString();
            const assigned = employees.filter(e => {
                const empMgrId = (e.managerId && e.managerId._id) ? e.managerId._id.toString() : (e.managerId ? e.managerId.toString() : null);
                return empMgrId === mId;
            });
            const mgrObj = mgr.toObject ? mgr.toObject() : { ...mgr };
            mgrObj.assignedEmployees = assigned;
            mgrObj.assignedCount = assigned.length;
            return mgrObj;
        });

        res.render('admin/managers', {
            title: `Branch Managers | ${data.company.name}`,
            data,
            company: data.company,
            managers: annotatedManagers,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-managers',
            pageTitle: 'Branch Managers',
            breadcrumbs: [{ label: 'Team', url: '/admin/employees' }, { label: 'Managers' }]
        });
    } catch (err) {
        console.error('Error fetching managers:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading managers list.'
        });
    }
};

// 6. SYSTEM ACTIVITY & AUDIT LOGS
exports.getActivityLogs = async (req, res) => {
    try {
        const logs = await AuditService.getRecentLogs(50);
        res.render('admin/activity-logs', {
            title: `System Activity Logs | ${data.company.name}`,
            data,
            company: data.company,
            logs,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-logs',
            pageTitle: 'System Audit & Activity Logs',
            breadcrumbs: [{ label: 'Security' }, { label: 'Activity Logs' }]
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading audit logs.'
        });
    }
};

// 7. USER PROFILE
exports.getProfile = async (req, res) => {
    try {
        const sessionUser = req.session.user;
        const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;

        res.render('admin/profile', {
            title: `My Profile | ${data.company.name}`,
            data,
            company: data.company,
            profileUser: freshUser,
            user: sessionUser,
            currentUser: sessionUser,
            activePage: sessionUser.role === 'SUPER_ADMIN' ? 'admin-profile' : (sessionUser.role === 'EMPLOYEE' ? 'employee-profile' : 'manager-profile'),
            pageTitle: 'User Profile & Account Security',
            breadcrumbs: [{ label: 'Account' }, { label: 'My Profile' }]
        });
    } catch (err) {
        console.error('Error loading profile:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading user profile.'
        });
    }
};

// 8. FUTURE MODULE PLACEHOLDER (CUSTOMERS, PROJECTS, REPORTS, SETTINGS)
exports.getModulePlaceholder = (moduleKey) => {
    const modules = {
        customers: {
            title: 'Customer Relationship Management (CRM)',
            pageTitle: 'Customers & Prospective Clients',
            desc: 'The centralized customer database, residential rooftop client records, DISCOM electricity connection consumer numbers, and solar survey history are part of Phase 2.',
            phase: 'Phase 2 Architecture',
            icon: 'icofont-address-book',
            activePage: 'admin-customers',
            plannedFeatures: [
                'Full Customer 360° profile with DISCOM Consumer No. & ALMM requirements',
                'Automatic quotation request linking',
                'Residential, Commercial & Agricultural customer categorization',
                'Survey history and roof feasibility attachments'
            ]
        },
        projects: {
            title: 'Solar Turnkey EPC & Project Tracking',
            pageTitle: 'Solar Projects & Commissioning',
            desc: 'Full solar plant lifecycle tracking from site survey, DISCOM net-meter sanctioning, structure mounting, Tier-1 Mono PERC panel wiring, to PM Surya Ghar DBT subsidy disbursal is scheduled for Phase 3.',
            phase: 'Phase 3 Architecture',
            icon: 'icofont-solar-panel',
            activePage: 'admin-projects',
            plannedFeatures: [
                'Milestone-by-milestone installation tracking',
                'DISCOM MPPKVVCL net-meter inspection and bi-directional meter commissioning',
                'Direct DBT subsidy tracking up to ₹78,000 under PM Surya Ghar Muft Bijli Yojana',
                'Field engineer GPS geo-tagged site check-ins and inspection notes'
            ]
        },
        reports: {
            title: 'Business Intelligence & Reports',
            pageTitle: 'Performance & Growth Reports',
            desc: 'Monthly solar installation capacity analytics, Raisen & MP district installation distribution, financial receipts, and subsidy statistics will be enabled in future phases.',
            phase: 'Future Roadmap',
            icon: 'icofont-chart-growth',
            activePage: 'admin-reports',
            plannedFeatures: [
                'Kilowatt (kW) capacity sanctioned & commissioned monthly',
                'Branch-by-branch revenue and performance leaderboards',
                'Subsidy release cycle time and customer satisfaction indices',
                'Export to Excel, CSV and signed PDF audit reports'
            ]
        },
        settings: {
            title: 'System & Security Settings',
            pageTitle: 'System Settings',
            desc: 'System parameters, branch GPS geofence radiuses, DISCOM tariff tables, PM Surya Ghar subsidy slabs, and security policies.',
            phase: 'System Configuration',
            icon: 'icofont-gear',
            activePage: 'admin-settings',
            plannedFeatures: [
                'PM Surya Ghar subsidy slab configurations (1kW to 10kW+)',
                'Branch geofence location and radius parameters',
                'Role permission matrix editor for Super Admin',
                'DISCOM net-metering portal API integration keys'
            ]
        }
    };

    return (req, res) => {
        const mod = modules[moduleKey] || {
            title: 'Module Under Construction',
            pageTitle: 'Module Placeholder',
            desc: 'This module is scheduled for development in future phases.',
            phase: 'Roadmap',
            icon: 'icofont-tools-alt-2',
            activePage: 'admin',
            plannedFeatures: []
        };

        res.render('admin/placeholder', {
            title: `${mod.title} | ${data.company.name}`,
            data,
            company: data.company,
            module: mod,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: mod.activePage,
            pageTitle: mod.pageTitle,
            breadcrumbs: [{ label: 'Modules' }, { label: mod.pageTitle }]
        });
    };
};

// 9. API: CREATE USER (SUPER ADMIN ONLY)
exports.createUser = async (req, res) => {
    const { name, email, mobile, password, role, employeeId, branchId, managerId, designation, department } = req.body;
    const adminUser = req.session.user;

    try {
        if (!name || !email || !mobile || !password || !role) {
            return res.status(400).json({ success: false, message: 'Required fields missing: name, email, mobile, password, role.' });
        }

        const validRoles = ['SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER', 'EMPLOYEE'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role specified.' });
        }

        // Check existing user
        if (mongoose.connection.readyState === 1) {
            const existing = await User.findOne({ email: email.trim().toLowerCase() });
            if (existing) {
                return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
            }
        }

        const cleanEmpId = employeeId ? employeeId.trim() : ('SES-EMP-' + Math.floor(100 + Math.random() * 900));

        let createdUserObj = null;
        if (mongoose.connection.readyState === 1) {
            createdUserObj = await User.create({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                mobile: mobile.trim(),
                password,
                role,
                employeeId: cleanEmpId,
                branchId: (branchId && mongoose.isValidObjectId(branchId)) ? branchId : null,
                managerId: (managerId && mongoose.isValidObjectId(managerId)) ? managerId : null,
                designation: designation ? designation.trim() : '',
                department: department ? department.trim() : '',
                status: 'ACTIVE'
            });
        } else {
            createdUserObj = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                email: email.trim().toLowerCase(),
                mobile: mobile.trim(),
                role,
                employeeId: cleanEmpId,
                branchId: branchId || 'br-raisen-1',
                managerId: managerId || null,
                designation: designation || 'Staff',
                department: department || 'General',
                status: 'ACTIVE',
                createdAt: new Date()
            };
            DataStore.addInMemoryUser(createdUserObj);
        }

        AuditService.log({
            action: 'ROLE_CHANGE',
            user: adminUser._id,
            targetUser: createdUserObj._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { createdRole: role, email: createdUserObj.email, employeeId: cleanEmpId }
        });

        return res.json({
            success: true,
            user: createdUserObj,
            message: `User ${createdUserObj.name} created successfully with role ${createdUserObj.role}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 10. API: UPDATE USER STATUS
exports.updateUserStatus = async (req, res) => {
    const { userId, status } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !status) {
            return res.status(400).json({ success: false, message: 'User ID and status are required.' });
        }

        const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status specified.' });
        }

        let targetUser = null;
        if (mongoose.connection.readyState === 1) {
            targetUser = await User.findById(userId);
        } else {
            targetUser = await DataStore.getUserById(userId);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Branch Managers can only manage employees within their branch or team
        if (['MANAGER', 'BRANCH_MANAGER'].includes(adminUser.role)) {
            const sameBranch = targetUser.branchId && adminUser.branchId && targetUser.branchId.toString() === adminUser.branchId.toString();
            const sameManager = targetUser.managerId && targetUser.managerId.toString() === adminUser._id.toString();
            if (targetUser.role !== 'EMPLOYEE' || (!sameBranch && !sameManager)) {
                return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify staff outside your branch or team.' });
            }
        }

        targetUser.status = status;
        if (targetUser.save) {
            await targetUser.save();
        }

        AuditService.log({
            action: status === 'ACTIVE' ? 'ACCOUNT_ACTIVATED' : (status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'STATUS_CHANGE'),
            user: adminUser._id,
            targetUser: targetUser._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { newStatus: status }
        });

        return res.json({
            success: true,
            message: `User status changed to ${status} for ${targetUser.name}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 11. API: RESET USER PASSWORD
exports.resetUserPassword = async (req, res) => {
    const { userId, newPassword } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Valid User ID and minimum 8-character password required.' });
        }

        let targetUser = null;
        if (mongoose.connection.readyState === 1) {
            targetUser = await User.findById(userId);
        } else {
            targetUser = await DataStore.getUserById(userId);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (targetUser.save) {
            targetUser.password = newPassword;
            targetUser.failedLoginAttempts = 0;
            targetUser.lockUntil = null;
            await targetUser.save();
        }

        AuditService.log({
            action: 'PASSWORD_CHANGE',
            user: adminUser._id,
            targetUser: targetUser._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { note: 'Password reset by admin' }
        });

        return res.json({ success: true, message: `Password reset successfully for ${targetUser.name}.` });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12. API: ASSIGN MANAGER TO EMPLOYEE
exports.assignManager = async (req, res) => {
    const { employeeId, managerId } = req.body;
    const adminUser = req.session.user;

    try {
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }

        let emp = null;
        if (mongoose.connection.readyState === 1) {
            emp = await User.findById(employeeId);
        } else {
            emp = await DataStore.getUserById(employeeId);
        }

        if (!emp) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        emp.managerId = (managerId && mongoose.isValidObjectId(managerId)) ? managerId : null;
        if (emp.save) {
            await emp.save();
        }

        AuditService.log({
            action: 'MANAGER_ASSIGNED',
            user: adminUser._id,
            targetUser: emp._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { assignedManagerId: managerId }
        });

        return res.json({
            success: true,
            message: `Assigned manager updated for ${emp.name}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 13. API: UPDATE ENQUIRY STATUS
exports.updateEnquiryStatus = (req, res) => {
    const { id, status, note } = req.body;
    if (!id || !status) {
        return res.status(400).json({ success: false, message: 'Enquiry ID and status are required' });
    }

    const updated = DataStore.updateEnquiryStatus(id, status, note);
    if (updated) {
        return res.json({ success: true, message: `Status updated to ${status} for ${id}` });
    }
    return res.status(404).json({ success: false, message: 'Enquiry not found' });
};

// 14. API: SAVE QUOTATION
exports.saveQuotation = (req, res) => {
    const quoteData = req.body;
    if (!quoteData.customerName || !quoteData.plantCapacityKw) {
        return res.status(400).json({ success: false, message: 'Customer name and plant capacity are required' });
    }

    const user = req.session ? req.session.user : null;
    quoteData.preparedBy = user ? user._id : null;
    quoteData.branch = user ? user.branchId : null;

    const saved = DataStore.addQuotation(quoteData);

    AuditService.log({
        action: 'QUOTATION_GENERATED',
        user: user ? user._id : null,
        role: user ? user.role : 'GUEST',
        ipAddress: req.ip,
        details: { quotationNumber: saved.quotationNumber, kw: saved.plantCapacityKw }
    });

    return res.json({ success: true, quotation: saved, message: `Quotation ${saved.quotationNumber} saved successfully` });
};

// 15. API: SAVE INVOICE (SUPER ADMIN & MANAGERS ONLY)
exports.saveInvoice = (req, res) => {
    const user = req.session ? req.session.user : null;

    if (!user || user.role === 'EMPLOYEE') {
        AuditService.log({
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            user: user ? user._id : null,
            role: user ? user.role : 'GUEST',
            ipAddress: req.ip,
            details: { reason: 'Employee or unauthenticated user attempted invoice creation' }
        });
        return res.status(403).json({
            success: false,
            message: 'HTTP 403 Forbidden: Employees are not authorized to generate or modify invoices. Contact Branch Manager.'
        });
    }

    const invData = req.body;
    if (!invData.customerName || !invData.totalAmount) {
        return res.status(400).json({ success: false, message: 'Customer name and amount are required' });
    }

    invData.createdByUser = user._id;
    invData.branch = user.branchId;

    const saved = DataStore.addInvoice(invData);

    AuditService.log({
        action: 'INVOICE_GENERATED',
        user: user._id,
        role: user.role,
        branchId: user.branchId,
        ipAddress: req.ip,
        details: { invoiceNumber: saved.invoiceNumber, amount: saved.totalAmount }
    });

    return res.json({ success: true, invoice: saved, message: `Invoice ${saved.invoiceNumber} recorded successfully` });
};
