const User = require('../models/User');
const AuditService = require('../services/auditService');
const companyData = require('../config/company');

class AuthController {
    // -------------------------------------------------------------
    // UNIFIED ENTERPRISE LOGIN (SUPER ADMIN, MANAGER & EMPLOYEE)
    // -------------------------------------------------------------
    static getAdminLogin(req, res) {
        if (req.session && req.session.user) {
            const role = req.session.user.role;
            if (role === 'SUPER_ADMIN') {
                return res.redirect('/admin');
            } else if (role === 'MANAGER' || role === 'BRANCH_MANAGER') {
                return res.redirect('/manager/dashboard');
            } else {
                return res.redirect('/employee/attendance');
            }
        }
        res.render('private/auth/admin-login', {
            title: `Enterprise Portal Sign In | ${companyData.company.name}`,
            company: companyData.company,
            data: companyData,
            error: null,
            returnUrl: req.query.returnUrl || ''
        });
    }

    static async postAdminLogin(req, res) {
        const { identifier, email, password, returnUrl } = req.body;
        const inputIdentifier = (identifier || email || '').trim();
        const ip = req.ip;
        const userAgent = req.get('user-agent');

        try {
            if (!inputIdentifier || !password) {
                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: 'Please enter registered Email or Employee ID, and password.',
                    returnUrl
                });
            }

            const cleanId = inputIdentifier;
            const query = cleanId.includes('@')
                ? { email: cleanId.toLowerCase() }
                : { $or: [
                    { employeeId: cleanId.toUpperCase() },
                    { employeeId: cleanId },
                    { email: cleanId.toLowerCase() },
                    { mobile: cleanId }
                ] };

            const user = await User.findOne(query);

            if (!user) {
                AuditService.log({
                    action: 'LOGIN_FAILED',
                    ipAddress: ip,
                    userAgent,
                    details: { attemptedIdentifier: inputIdentifier, portal: 'UNIFIED_PORTAL' }
                });
                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: 'Invalid email, employee ID or password.',
                    returnUrl
                });
            }

            // Check account lock
            if (user.isLocked()) {
                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.',
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
                    details: { portal: 'UNIFIED_PORTAL' }
                });

                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: 'Invalid password. Repeated failed attempts will lock account.',
                    returnUrl
                });
            }

            // Check account status
            if (user.status === 'PENDING') {
                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: 'Your account is currently PENDING approval from the Super Admin. You can sign in once approved.',
                    returnUrl
                });
            }

            if (user.status === 'SUSPENDED' || user.status === 'REJECTED' || user.status === 'INACTIVE') {
                return res.render('private/auth/admin-login', {
                    title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                    company: companyData.company,
                    data: companyData,
                    error: `Your account is ${user.status}. Please contact system administrator.`,
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
                    return res.status(500).render('private/auth/admin-login', {
                        title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                        company: companyData.company,
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
                    isPrimarySuperAdmin: user.isPrimarySuperAdmin === true,
                    permissions: user.permissions || [],
                    fieldPermissions: user.fieldPermissions || [],
                    permissionVersion: user.permissionVersion || 1,
                    branchId: user.branchId,
                    status: user.status
                };

                AuditService.log({
                    action: 'LOGIN_SUCCESS',
                    user: user._id,
                    role: user.role,
                    branchId: user.branchId,
                    ipAddress: ip,
                    userAgent,
                    details: { portal: 'UNIFIED_PORTAL' }
                });

                // Smart role-based redirection
                if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.includes('/login') && !returnUrl.includes('/logout') && returnUrl !== '/employee/dashboard' && returnUrl !== '/employee') {
                    return res.redirect(returnUrl);
                }

                if (user.role === 'SUPER_ADMIN') {
                    return res.redirect('/admin');
                } else if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER') {
                    return res.redirect('/manager/dashboard');
                } else {
                    return res.redirect('/employee/attendance');
                }
            });
        } catch (err) {
            console.error('Unified Login Error:', err);
            return res.render('private/auth/admin-login', {
                title: `Enterprise Portal Sign In | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                error: 'An internal error occurred during login. Please try again.',
                returnUrl
            });
        }
    }

    // -------------------------------------------------------------
    // ALIAS HANDLERS FOR MANAGER & EMPLOYEE LOGIN
    // -------------------------------------------------------------
    static getManagerLogin(req, res) {
        return AuthController.getAdminLogin(req, res);
    }

    static postManagerLogin(req, res) {
        return AuthController.postAdminLogin(req, res);
    }

    static getEmployeeLogin(req, res) {
        return AuthController.getAdminLogin(req, res);
    }

    static postEmployeeLogin(req, res) {
        return AuthController.postAdminLogin(req, res);
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
