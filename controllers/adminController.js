const data = require('../config/company');
const DataStore = require('../services/dataStore');
const User = require('../models/User');
const Branch = require('../models/Branch');
const AuditService = require('../services/auditService');

exports.getDashboard = (req, res) => {
    const stats = DataStore.getStats();
    const recentEnquiries = DataStore.getAllEnquiries();
    const todayAttendance = DataStore.getTodayAttendance();

    res.render('admin/dashboard', {
        title: `Admin Management Dashboard | ${data.company.name}`,
        data,
        stats,
        recentEnquiries,
        todayAttendance,
        user: req.session.user,
        activePage: 'admin'
    });
};

exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('admin/quotations', {
        title: `Quotation Management | ${data.company.name}`,
        data,
        quotations,
        user: req.session.user,
        activePage: 'quotations'
    });
};

exports.getInvoices = (req, res) => {
    const invoices = DataStore.getAllInvoices();
    res.render('admin/invoices', {
        title: `Invoice Management | ${data.company.name}`,
        data,
        invoices,
        user: req.session.user,
        activePage: 'invoices'
    });
};

// User & Employee Management (Requirement 14)
exports.getEmployees = async (req, res) => {
    try {
        let users = [];
        let branches = [];
        try {
            users = await User.find({}).sort({ createdAt: -1 }).select('-password');
            branches = await Branch.find({});
        } catch (e) {
            users = [];
        }

        res.render('admin/employees', {
            title: `Staff & User Management | ${data.company.name}`,
            data,
            users,
            branches,
            user: req.session.user,
            activePage: 'admin-employees'
        });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy',
            message: 'Error loading staff database'
        });
    }
};

// API: Create new employee or Branch Manager
exports.createUser = async (req, res) => {
    const { name, email, mobile, password, role, employeeId, branchId } = req.body;
    const adminUser = req.session.user;

    try {
        if (!name || !email || !mobile || !password || !role) {
            return res.status(400).json({ success: false, message: 'Required fields missing' });
        }

        const validRoles = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'EMPLOYEE'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role specified' });
        }

        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists' });
        }

        const newUser = await User.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            mobile: mobile.trim(),
            password,
            role,
            employeeId: employeeId || ('SES-EMP-' + Math.floor(100 + Math.random() * 900)),
            branchId: branchId || null,
            status: 'ACTIVE'
        });

        AuditService.log({
            action: 'ROLE_CHANGE',
            user: adminUser._id,
            targetUser: newUser._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { createdRole: role, email: newUser.email }
        });

        return res.json({
            success: true,
            user: newUser,
            message: `User ${newUser.name} created successfully with role ${newUser.role}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// API: Approve / Suspend / Activate user
exports.updateUserStatus = async (req, res) => {
    const { userId, status } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !status) {
            return res.status(400).json({ success: false, message: 'User ID and status are required' });
        }

        const validStatuses = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Branch Managers can only manage employees within their branch
        if (adminUser.role === 'BRANCH_MANAGER') {
            if (targetUser.role !== 'EMPLOYEE' || targetUser.branchId?.toString() !== adminUser.branchId?.toString()) {
                return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify staff outside your branch.' });
            }
        }

        targetUser.status = status;
        await targetUser.save();

        AuditService.log({
            action: status === 'ACTIVE' ? 'ACCOUNT_ACTIVATED' : (status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'EMPLOYEE_APPROVED'),
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

// API: Secure Password Reset
exports.resetUserPassword = async (req, res) => {
    const { userId, newPassword } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Valid User ID and minimum 8-character password required' });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        targetUser.password = newPassword;
        targetUser.failedLoginAttempts = 0;
        targetUser.lockUntil = null;
        await targetUser.save();

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

// API: Update enquiry status & add note
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

// API: Save new quotation (Allowed for Super Admin, Branch Manager, and Employee)
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

// API: Save new invoice (STRICT: Only Super Admin and Branch Manager! Employees MUST receive HTTP 403)
exports.saveInvoice = (req, res) => {
    const user = req.session ? req.session.user : null;

    // Strict Role Enforcement
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
