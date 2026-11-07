const User = require('../models/User');
const AuditService = require('../services/auditService');
const companyData = require('../config/company');

class AuthController {
    // -------------------------------------------------------------
    // SUPER ADMIN LOGIN
    // -------------------------------------------------------------
    static getAdminLogin(req, res) {
        if (req.session && req.session.user && req.session.user.role === 'SUPER_ADMIN') {
            return res.redirect('/admin');
        }
        res.render('auth/admin-login', {
            title: `Super Admin Sign In | ${companyData.company.name}`,
            data: companyData,
            error: null,
            returnUrl: req.query.returnUrl || '/admin'
        });
    }

    static async postAdminLogin(req, res) {
        const { identifier, password, returnUrl } = req.body;
        const ip = req.ip;
        const userAgent = req.get('user-agent');

        try {
            if (!identifier || !password) {
                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Please provide both email/username and password.',
                    returnUrl
                });
            }

            const query = identifier.includes('@')
                ? { email: identifier.trim().toLowerCase() }
                : { $or: [{ employeeId: identifier.trim() }, { email: identifier.trim().toLowerCase() }] };

            const user = await User.findOne(query);

            if (!user) {
                AuditService.log({
                    action: 'LOGIN_FAILED',
                    ipAddress: ip,
                    userAgent,
                    details: { attemptedIdentifier: identifier, portal: 'ADMIN' }
                });
                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid email/credentials.',
                    returnUrl
                });
            }

            // Check account lock
            if (user.isLocked()) {
                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.',
                    returnUrl
                });
            }

            // Verify role
            if (user.role !== 'SUPER_ADMIN') {
                AuditService.log({
                    action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                    user: user._id,
                    role: user.role,
                    ipAddress: ip,
                    details: { reason: 'Non-SuperAdmin tried logging into /admin/login' }
                });
                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Access Denied: Only authorized Super Administrators may sign in here.',
                    returnUrl
                });
            }

            // Verify password
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();

                AuditService.log({
                    action: 'LOGIN_FAILED',
                    user: user._id,
                    role: user.role,
                    ipAddress: ip,
                    userAgent,
                    details: { portal: 'ADMIN' }
                });

                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid password. Repeated failed attempts will lock account.',
                    returnUrl
                });
            }

            // Check account active status
            if (user.status !== 'ACTIVE') {
                return res.render('auth/admin-login', {
                    title: `Super Admin Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: `Account is ${user.status}. Please contact system support.`,
                    returnUrl
                });
            }

            // Successful authentication -> Reset attempts, update lastLogin
            user.failedLoginAttempts = 0;
            user.lockUntil = null;
            user.lastLogin = new Date();
            await user.save();

            // Regenerate session to prevent session fixation attacks
            req.session.regenerate((err) => {
                if (err) {
                    return res.status(500).render('auth/admin-login', {
                        title: `Super Admin Sign In | ${companyData.company.name}`,
                        data: companyData,
                        error: 'Session initialization error.',
                        returnUrl
                    });
                }

                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    employeeId: user.employeeId,
                    role: user.role,
                    branchId: user.branchId,
                    status: user.status
                };

                AuditService.log({
                    action: 'LOGIN_SUCCESS',
                    user: user._id,
                    role: user.role,
                    ipAddress: ip,
                    userAgent,
                    details: { portal: 'ADMIN' }
                });

                return res.redirect(returnUrl && returnUrl.startsWith('/admin') ? returnUrl : '/admin');
            });
        } catch (err) {
            console.error('Admin Login Error:', err);
            return res.render('auth/admin-login', {
                title: `Super Admin Sign In | ${companyData.company.name}`,
                data: companyData,
                error: 'An internal error occurred during login. Please try again.',
                returnUrl
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH MANAGER LOGIN
    // -------------------------------------------------------------
    static getManagerLogin(req, res) {
        if (req.session && req.session.user && ['BRANCH_MANAGER', 'SUPER_ADMIN'].includes(req.session.user.role)) {
            return res.redirect('/manager/dashboard');
        }
        res.render('auth/manager-login', {
            title: `Branch Manager Sign In | ${companyData.company.name}`,
            data: companyData,
            error: null,
            returnUrl: req.query.returnUrl || '/manager/dashboard'
        });
    }

    static async postManagerLogin(req, res) {
        const { email, password, returnUrl } = req.body;
        const ip = req.ip;
        const userAgent = req.get('user-agent');

        try {
            if (!email || !password) {
                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Please enter registered email and password.',
                    returnUrl
                });
            }

            const user = await User.findOne({ email: email.trim().toLowerCase() });

            if (!user) {
                AuditService.log({
                    action: 'LOGIN_FAILED',
                    ipAddress: ip,
                    userAgent,
                    details: { email, portal: 'MANAGER' }
                });
                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid credentials.',
                    returnUrl
                });
            }

            if (user.isLocked()) {
                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Account temporarily locked. Please try again in 15 minutes.',
                    returnUrl
                });
            }

            if (!['BRANCH_MANAGER', 'SUPER_ADMIN'].includes(user.role)) {
                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Access restricted to authorized Branch Managers only.',
                    returnUrl
                });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();

                AuditService.log({
                    action: 'LOGIN_FAILED',
                    user: user._id,
                    role: user.role,
                    ipAddress: ip,
                    details: { portal: 'MANAGER' }
                });

                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid credentials.',
                    returnUrl
                });
            }

            if (user.status !== 'ACTIVE') {
                return res.render('auth/manager-login', {
                    title: `Branch Manager Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: `Your account is ${user.status}. Please contact Super Admin.`,
                    returnUrl
                });
            }

            user.failedLoginAttempts = 0;
            user.lockUntil = null;
            user.lastLogin = new Date();
            await user.save();

            req.session.regenerate((err) => {
                if (err) return res.redirect('/manager/login');
                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    employeeId: user.employeeId,
                    role: user.role,
                    branchId: user.branchId,
                    status: user.status
                };

                AuditService.log({
                    action: 'LOGIN_SUCCESS',
                    user: user._id,
                    role: user.role,
                    branchId: user.branchId,
                    ipAddress: ip,
                    details: { portal: 'MANAGER' }
                });

                return res.redirect(returnUrl && returnUrl.startsWith('/manager') ? returnUrl : '/manager/dashboard');
            });
        } catch (err) {
            console.error('Manager Login Error:', err);
            return res.render('auth/manager-login', {
                title: `Branch Manager Sign In | ${companyData.company.name}`,
                data: companyData,
                error: 'An internal error occurred. Please try again.',
                returnUrl
            });
        }
    }

    // -------------------------------------------------------------
    // EMPLOYEE LOGIN
    // -------------------------------------------------------------
    static getEmployeeLogin(req, res) {
        if (req.session && req.session.user) {
            return res.redirect('/employee/attendance');
        }
        res.render('auth/employee-login', {
            title: `Employee Portal Sign In | ${companyData.company.name}`,
            data: companyData,
            error: null,
            returnUrl: req.query.returnUrl || '/employee/attendance'
        });
    }

    static async postEmployeeLogin(req, res) {
        const { identifier, password, returnUrl } = req.body;
        const ip = req.ip;
        const userAgent = req.get('user-agent');

        try {
            if (!identifier || !password) {
                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Please enter Employee ID or registered email, and password.',
                    returnUrl
                });
            }

            const cleanId = identifier.trim();
            const query = cleanId.includes('@')
                ? { email: cleanId.toLowerCase() }
                : { employeeId: cleanId.toUpperCase() };

            const user = await User.findOne(query);

            if (!user) {
                AuditService.log({
                    action: 'LOGIN_FAILED',
                    ipAddress: ip,
                    details: { identifier, portal: 'EMPLOYEE' }
                });
                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid Employee ID/Email or password.',
                    returnUrl
                });
            }

            if (user.isLocked()) {
                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Account temporarily locked due to failed attempts. Try in 15 minutes.',
                    returnUrl
                });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();

                AuditService.log({
                    action: 'LOGIN_FAILED',
                    user: user._id,
                    role: user.role,
                    ipAddress: ip,
                    details: { portal: 'EMPLOYEE' }
                });

                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Invalid Employee ID/Email or password.',
                    returnUrl
                });
            }

            if (user.status === 'PENDING') {
                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Your registration is currently PENDING approval from Super Admin / Branch Manager.',
                    returnUrl
                });
            }

            if (user.status === 'SUSPENDED' || user.status === 'REJECTED') {
                return res.render('auth/employee-login', {
                    title: `Employee Portal Sign In | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Your account has been suspended or rejected. Contact office management.',
                    returnUrl
                });
            }

            user.failedLoginAttempts = 0;
            user.lockUntil = null;
            user.lastLogin = new Date();
            await user.save();

            req.session.regenerate((err) => {
                if (err) return res.redirect('/employee/login');
                req.session.user = {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    employeeId: user.employeeId,
                    role: user.role,
                    branchId: user.branchId,
                    status: user.status
                };

                AuditService.log({
                    action: 'LOGIN_SUCCESS',
                    user: user._id,
                    role: user.role,
                    branchId: user.branchId,
                    ipAddress: ip,
                    details: { portal: 'EMPLOYEE' }
                });

                return res.redirect(returnUrl && returnUrl.startsWith('/employee') ? returnUrl : '/employee/attendance');
            });
        } catch (err) {
            console.error('Employee Login Error:', err);
            return res.render('auth/employee-login', {
                title: `Employee Portal Sign In | ${companyData.company.name}`,
                data: companyData,
                error: 'An internal error occurred. Please try again.',
                returnUrl
            });
        }
    }

    // -------------------------------------------------------------
    // EMPLOYEE REGISTRATION (REQUEST WORKFLOW)
    // -------------------------------------------------------------
    static getEmployeeRegister(req, res) {
        res.render('auth/employee-register', {
            title: `Employee Registration Request | ${companyData.company.name}`,
            data: companyData,
            error: null,
            success: null
        });
    }

    static async postEmployeeRegister(req, res) {
        const { name, email, mobile, password, confirmPassword } = req.body;
        const ip = req.ip;

        try {
            if (!name || !email || !mobile || !password) {
                return res.render('auth/employee-register', {
                    title: `Employee Registration Request | ${companyData.company.name}`,
                    data: companyData,
                    error: 'All fields are required.',
                    success: null
                });
            }

            if (password !== confirmPassword) {
                return res.render('auth/employee-register', {
                    title: `Employee Registration Request | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Passwords do not match.',
                    success: null
                });
            }

            if (password.length < 8) {
                return res.render('auth/employee-register', {
                    title: `Employee Registration Request | ${companyData.company.name}`,
                    data: companyData,
                    error: 'Password must be at least 8 characters long.',
                    success: null
                });
            }

            // Check existing user
            const existing = await User.findOne({ email: email.trim().toLowerCase() });
            if (existing) {
                return res.render('auth/employee-register', {
                    title: `Employee Registration Request | ${companyData.company.name}`,
                    data: companyData,
                    error: 'An account with this email address already exists. Please log in or contact admin.',
                    success: null
                });
            }

            // Generate temporary employee ID request
            const tempEmpId = 'SES-REQ-' + Math.floor(1000 + Math.random() * 9000);

            // Create strictly as EMPLOYEE and PENDING. Public cannot self-assign privileged role or branch!
            const newUser = await User.create({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                mobile: mobile.trim(),
                password: password,
                employeeId: tempEmpId,
                role: 'EMPLOYEE',
                status: 'PENDING',
                branchId: null
            });

            AuditService.log({
                action: 'EMPLOYEE_APPROVED', // Registration submission
                user: newUser._id,
                role: 'EMPLOYEE',
                ipAddress: ip,
                details: { note: 'Registration request submitted', tempId: tempEmpId }
            });

            return res.render('auth/employee-register', {
                title: `Registration Submitted | ${companyData.company.name}`,
                data: companyData,
                error: null,
                success: `Registration submitted successfully with ID: ${tempEmpId}! Your account is now PENDING administrative approval. Once approved by Super Admin Deepak Kushwaha or Rahul Saini, you will be able to log in.`
            });
        } catch (err) {
            console.error('Employee Registration Error:', err);
            return res.render('auth/employee-register', {
                title: `Employee Registration Request | ${companyData.company.name}`,
                data: companyData,
                error: err.message || 'Error processing registration request.',
                success: null
            });
        }
    }

    // -------------------------------------------------------------
    // LOGOUT
    // -------------------------------------------------------------
    static logout(req, res) {
        if (req.session && req.session.user) {
            AuditService.log({
                action: 'LOGOUT',
                user: req.session.user._id,
                role: req.session.user.role,
                ipAddress: req.ip
            });
        }

        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.redirect('/');
        });
    }

    // -------------------------------------------------------------
    // CHANGE PASSWORD (AUTHENTICATED)
    // -------------------------------------------------------------
    static async changePassword(req, res) {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user._id;

        try {
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: 'All password fields are required.' });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: 'New passwords do not match.' });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found.' });
            }

            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Incorrect current password.' });
            }

            user.password = newPassword;
            await user.save();

            AuditService.log({
                action: 'PASSWORD_CHANGE',
                user: user._id,
                role: user.role,
                ipAddress: req.ip
            });

            return res.json({ success: true, message: 'Password updated successfully.' });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Error updating password.' });
        }
    }
}

module.exports = AuthController;
