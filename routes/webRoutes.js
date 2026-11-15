const express = require('express');
const router = express.Router();

// ==========================================
// 1. PUBLIC ROUTES (Website Pages, Inquiries, Public Customer Acceptance)
// ==========================================
const publicRoutes = require('./publicroute/publicroutes');

// ==========================================
// 2. PRIVATE ROUTES (Authentication, RBAC & Role Modules)
// ==========================================
const authRoutes = require('./privateroute/authroutes');
const superAdminRoutes = require('./privateroute/superadminroutes');
const managerRoutes = require('./privateroute/managerroutes');
const employeeRoutes = require('./privateroute/employeeroutes');

// Mount Sub-Routers
router.use('/', publicRoutes);
router.use('/', authRoutes);
router.use('/', superAdminRoutes);
router.use('/', managerRoutes);
router.use('/', employeeRoutes);

module.exports = router;
module.exports.publicRoutes = publicRoutes;
module.exports.authRoutes = authRoutes;
module.exports.superAdminRoutes = superAdminRoutes;
module.exports.managerRoutes = managerRoutes;
module.exports.employeeRoutes = employeeRoutes;
