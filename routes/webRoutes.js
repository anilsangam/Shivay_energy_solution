const express = require('express');
const router = express.Router();

const pageController = require('../controllers/pageController');
const complaintController = require('../controllers/complaintController');
const franchiseController = require('../controllers/franchiseController');
const adminController = require('../controllers/adminController');
const managerController = require('../controllers/managerController');
const employeeController = require('../controllers/employeeController');
const authController = require('../controllers/authController');

const {
    requireAuth,
    requireSuperAdmin,
    requireManager,
    requireBranchManager,
    requireEmployee,
    verifyCsrf,
    validateObjectId
} = require('../middleware/authMiddleware');

const {
    loginLimiter,
    enquiryLimiter
} = require('../middleware/rateLimiters');

// ==========================================
// 1. PUBLIC WEBSITE PAGES (Free Access)
// ==========================================
router.get(['/', '/index.html'], pageController.getHome);
router.get(['/about', '/about.html'], pageController.getAbout);
router.get(['/services', '/services.html'], pageController.getServices);
router.get(['/products', '/products.html'], pageController.getProducts);
router.get(['/careers', '/careers.html'], pageController.getCareers);
router.get(['/projects', '/projects.html'], pageController.getProjects);
router.get(['/calculator', '/calculator.html'], pageController.getCalculator);
router.get(['/schemes', '/schemes.html'], (req, res) => res.redirect(301, '/#govt-scheme-section'));
router.get(['/contact', '/contact.html'], pageController.getContact);
router.get(['/complaints', '/complaints.html'], complaintController.getComplaintPage);
router.get(['/franchise', '/franchise.html'], franchiseController.getFranchisePage);

// ==========================================
// 2. AUTHENTICATION & LOGIN EXPERIENCES
// ==========================================
// Super Admin Login (No public registration)
router.get('/admin/login', authController.getAdminLogin);
router.post('/admin/login', loginLimiter, authController.postAdminLogin);
router.get('/admin/logout', authController.logout);
router.post('/admin/logout', authController.logout);

// Branch Manager Login
router.get('/manager/login', authController.getManagerLogin);
router.post('/manager/login', loginLimiter, authController.postManagerLogin);
router.get('/manager/logout', authController.logout);
router.post('/manager/logout', authController.logout);

// Employee Login & Registration Request Workflow
router.get('/employee/login', authController.getEmployeeLogin);
router.post('/employee/login', loginLimiter, authController.postEmployeeLogin);
router.get('/employee/register', authController.getEmployeeRegister);
router.post('/employee/register', loginLimiter, authController.postEmployeeRegister);
router.get('/employee/logout', authController.logout);
router.post('/employee/logout', authController.logout);

// Unified Logout
router.get('/auth/logout', authController.logout);
router.post('/auth/logout', authController.logout);

// ==========================================
// 3. SUPER ADMIN MANAGEMENT ROUTES (SUPER_ADMIN ONLY)
// ==========================================
router.get('/admin', requireAuth, requireSuperAdmin, adminController.getDashboard);
router.get('/admin/employees', requireAuth, requireSuperAdmin, adminController.getEmployees);
router.get('/admin/managers', requireAuth, requireSuperAdmin, adminController.getManagers);
router.get('/admin/customers', requireAuth, requireSuperAdmin, adminController.getModulePlaceholder('customers'));
router.get('/admin/quotations', requireAuth, requireSuperAdmin, adminController.getQuotations);
router.get('/admin/projects', requireAuth, requireSuperAdmin, adminController.getModulePlaceholder('projects'));
router.get('/admin/invoices', requireAuth, requireSuperAdmin, adminController.getInvoices);
router.get('/admin/reports', requireAuth, requireSuperAdmin, adminController.getModulePlaceholder('reports'));
router.get('/admin/activity-logs', requireAuth, requireSuperAdmin, adminController.getActivityLogs);
router.get('/admin/settings', requireAuth, requireSuperAdmin, adminController.getModulePlaceholder('settings'));
router.get('/admin/profile', requireAuth, requireSuperAdmin, adminController.getProfile);

// Legacy admin aliases
router.get('/admin/branches', requireAuth, requireSuperAdmin, adminController.getManagers);
router.get('/admin/enquiries', requireAuth, requireSuperAdmin, adminController.getDashboard);
router.get('/admin/complaints', requireAuth, requireSuperAdmin, adminController.getDashboard);

// ==========================================
// 4. BRANCH MANAGER ROUTES (BRANCH_MANAGER & SUPER_ADMIN)
// ==========================================
router.get('/manager/dashboard', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/employees', requireAuth, requireBranchManager, managerController.getEmployees);
router.get('/manager/attendance', requireAuth, requireBranchManager, managerController.getAttendance);
router.get('/manager/quotations', requireAuth, requireBranchManager, managerController.getQuotations);
router.get('/manager/projects', requireAuth, requireBranchManager, managerController.getProjects);
router.get('/manager/invoices', requireAuth, requireBranchManager, managerController.getInvoices);
router.get('/manager/profile', requireAuth, requireBranchManager, managerController.getProfile);
router.get('/manager/enquiries', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/complaints', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/reports', requireAuth, requireBranchManager, managerController.getDashboard);

// ==========================================
// 5. EMPLOYEE ROUTES (STAFF PORTAL)
// ==========================================
router.get('/employee/dashboard', requireAuth, requireEmployee, employeeController.getDashboard);
router.get('/employee/attendance', requireAuth, requireEmployee, employeeController.getAttendancePage);
router.get('/employee/quotations', requireAuth, requireEmployee, employeeController.getQuotations);
router.get('/employee/projects', requireAuth, requireEmployee, employeeController.getProjects);
router.get('/employee/profile', requireAuth, requireEmployee, employeeController.getProfile);

// ==========================================
// 6. PUBLIC APIs (Rate-limited, Input Validated)
// ==========================================
router.post('/api/enquiry', enquiryLimiter, pageController.submitEnquiry);
router.post('/api/complaints', complaintController.submitComplaint);
router.get('/api/complaints/track', complaintController.trackComplaint);
router.post('/api/franchise', franchiseController.submitFranchise);

// ==========================================
// 7. PRIVATE & MUTATING APIs (Protected + CSRF Verified + RBAC)
// ==========================================
// Employee Attendance (Session-Derived Identity Enforced)
router.post('/api/attendance', requireAuth, requireEmployee, verifyCsrf, employeeController.submitAttendance);

// CRM Lead Status Update (Branch Manager or Super Admin)
router.post('/api/admin/enquiries/status', requireAuth, requireBranchManager, verifyCsrf, adminController.updateEnquiryStatus);

// Quotation Creation (Employees, Managers & Admins)
router.post('/api/admin/quotations/save', requireAuth, requireEmployee, verifyCsrf, adminController.saveQuotation);

// Invoice Creation (STRICT: Super Admin & Branch Managers only! Employees receive 403)
router.post('/api/admin/invoices/save', requireAuth, requireBranchManager, verifyCsrf, adminController.saveInvoice);

// User & Access Management (Super Admin & Managers with branch limits)
router.post('/api/admin/users/create', requireAuth, requireSuperAdmin, verifyCsrf, adminController.createUser);
router.post('/api/admin/users/status', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('userId'), adminController.updateUserStatus);
router.post('/api/admin/users/reset-password', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('userId'), adminController.resetUserPassword);
router.post('/api/admin/employees/assign-manager', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('employeeId'), adminController.assignManager);

// Password Change for Authenticated User
router.post('/api/auth/change-password', requireAuth, verifyCsrf, authController.changePassword);

module.exports = router;
