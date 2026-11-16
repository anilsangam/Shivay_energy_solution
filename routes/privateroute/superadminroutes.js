const express = require('express');
const router = express.Router();

const adminController = require('../../controllers/adminController');
const customerController = require('../../controllers/customerController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');

const {
    requireAuth,
    requireSuperAdmin,
    requireBranchManager,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// SUPER ADMIN MANAGEMENT & GOVERNANCE ROUTES
// ==========================================

// Dashboard & Core Operations
router.get('/admin', requireAuth, requireSuperAdmin, adminController.getDashboard);
router.get('/admin/employees', requireAuth, requireSuperAdmin, adminController.getEmployees);
router.get('/admin/managers', requireAuth, requireSuperAdmin, adminController.getManagers);
router.get('/admin/customers', requireAuth, requireSuperAdmin, customerController.getCustomersList);

// Commercial Lifecycle: Quotations & Maker-Checker Approvals
router.get('/admin/quotations', requireAuth, requireSuperAdmin, quotationController.getAdminQuotations);
router.get('/admin/quotations/new', requireAuth, requireSuperAdmin, quotationController.getNewRequestPage);
router.post('/admin/quotations/new', requireAuth, requireSuperAdmin, verifyCsrf, quotationController.postCreateRequest);
router.get(['/admin/quotations/request/:id', '/admin/quotations/requests/:id'], requireAuth, requireSuperAdmin, validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/admin/quotations/request/:id/status', '/admin/quotations/requests/:id/status'], requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), quotationController.postUpdateRequestStatus);
router.get('/admin/quotations/prepare/:requestId', requireAuth, requireSuperAdmin, validateObjectId('requestId'), quotationController.getPrepareQuotationPage);
router.post('/admin/quotations/preview-financials', requireAuth, requireSuperAdmin, verifyCsrf, quotationController.previewFinancials);
router.post('/admin/quotations/save-prepared', requireAuth, requireSuperAdmin, verifyCsrf, quotationController.postSavePreparedQuotation);
router.get('/admin/quotations/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/admin/quotations/:id/edit', requireAuth, requireSuperAdmin, validateObjectId('id'), quotationController.getEditQuotationPage);
router.get('/admin/quotations/:id/document', requireAuth, requireSuperAdmin, validateObjectId('id'), quotationController.getQuotationDocument);
router.post('/admin/quotations/:id/approve', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), quotationController.postApproveQuotation);
router.post('/admin/quotations/:id/reject', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), quotationController.postRejectQuotation);
router.post('/admin/quotations/:id/archive', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), quotationController.postArchiveQuotation);

// Phase 3: Project Execution, Staging & Grid Commissioning
router.get('/admin/projects', requireAuth, requireSuperAdmin, projectController.getProjectsPage);
router.get('/admin/projects/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/admin/projects/:id/status', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/admin/projects/:id/tasks', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.createTask);
router.post('/admin/projects/:id/assign', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.assignEmployee);
router.post('/admin/projects/:id/materials/:materialId', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.updateMaterial);
router.post('/admin/projects/:id/complete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.completeProject);
router.post('/admin/projects/:id/documents', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/admin/projects/:id/documents/:documentId', requireAuth, requireSuperAdmin, validateObjectId('id'), projectController.downloadDocument);

// Financials, System Audit & Organization Management
router.get('/admin/invoices', requireAuth, requireSuperAdmin, adminController.getInvoices);
router.get('/admin/reports', requireAuth, requireSuperAdmin, adminController.getReports);
router.get('/api/admin/reports/export/:type', requireAuth, requireSuperAdmin, adminController.exportReportCsv);
router.get('/admin/activity-logs', requireAuth, requireSuperAdmin, adminController.getActivityLogs);
router.get('/admin/settings', requireAuth, requireSuperAdmin, adminController.getSettings);
router.get('/admin/profile', requireAuth, requireSuperAdmin, adminController.getProfile);
router.get('/admin/branches', requireAuth, requireSuperAdmin, adminController.getBranches);
router.get('/admin/enquiries', requireAuth, requireSuperAdmin, adminController.getDashboard);
router.get('/admin/complaints', requireAuth, requireSuperAdmin, adminController.getComplaints);
router.post('/api/admin/complaints/status', requireAuth, requireBranchManager, verifyCsrf, adminController.updateComplaintStatus);

// Super Admin / Governance Mutating APIs
router.post('/api/admin/enquiries/status', requireAuth, requireBranchManager, verifyCsrf, adminController.updateEnquiryStatus);
router.post('/api/admin/quotations/save', requireAuth, verifyCsrf, adminController.saveQuotation);
router.post('/api/admin/invoices/save', requireAuth, requireBranchManager, verifyCsrf, adminController.saveInvoice);
router.post('/api/admin/invoices/delete', requireAuth, requireBranchManager, verifyCsrf, adminController.deleteInvoice);
router.post('/api/admin/users/create', requireAuth, requireSuperAdmin, verifyCsrf, adminController.createUser);
router.post('/api/admin/users/status', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('userId'), adminController.updateUserStatus);
router.post('/api/admin/users/reset-password', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('userId'), adminController.resetUserPassword);
router.post('/api/admin/employees/assign-manager', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('employeeId'), adminController.assignManager);
router.post('/api/admin/branches/create', requireAuth, requireSuperAdmin, verifyCsrf, adminController.createBranch);
router.post('/api/admin/branches/update', requireAuth, requireSuperAdmin, verifyCsrf, adminController.updateBranch);
router.post('/api/admin/branches/status', requireAuth, requireSuperAdmin, verifyCsrf, adminController.toggleBranchStatus);
router.post('/api/admin/settings/save', requireAuth, requireSuperAdmin, verifyCsrf, adminController.saveSettings);

module.exports = router;
