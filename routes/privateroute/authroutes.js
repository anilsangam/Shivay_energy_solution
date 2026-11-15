const express = require('express');
const router = express.Router();

const authController = require('../../controllers/authController');

const {
    requireAuth,
    verifyCsrf
} = require('../../middleware/authMiddleware');

const { loginLimiter } = require('../../middleware/rateLimiters');

// ==========================================
// UNIFIED AUTHENTICATION & LOGIN (SINGLE SIGN-ON PORTAL)
// ==========================================
// Unified Single Sign-On Portal (Super Admin, Manager & Employee)
router.get(['/login', '/admin/login'], authController.getAdminLogin);
router.post(['/login', '/admin/login'], loginLimiter, authController.postAdminLogin);

// Legacy routes redirecting/mapping to Unified Login
router.get('/manager/login', authController.getManagerLogin);
router.post('/manager/login', loginLimiter, authController.postManagerLogin);
router.get('/employee/login', authController.getEmployeeLogin);
router.post('/employee/login', loginLimiter, authController.postEmployeeLogin);

// No Public Signup: Only Super Admin can onboard staff via /admin/employees
router.get(['/employee/register', '/register', '/signup'], (req, res) => res.redirect('/login'));
router.get(['/logout', '/auth/logout', '/admin/logout', '/manager/logout', '/employee/logout'], authController.logout);
router.post(['/logout', '/auth/logout', '/admin/logout', '/manager/logout', '/employee/logout'], authController.logout);

// Password Change for Authenticated User
router.post('/api/auth/change-password', requireAuth, verifyCsrf, authController.changePassword);

module.exports = router;
