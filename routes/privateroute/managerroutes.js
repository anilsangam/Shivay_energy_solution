const express = require('express');
const router = express.Router();

const managerController = require('../../controllers/managerController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');

const {
    requireAuth,
    requireBranchManager,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// BRANCH MANAGER GOVERNANCE & EXECUTION ROUTES
// ==========================================

// Dashboard, Branch Staff & Attendance Overview
router.get('/manager/dashboard', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/employees', requireAuth, requireBranchManager, managerController.getEmployees);
router.get('/manager/attendance', requireAuth, requireBranchManager, managerController.getAttendance);

// Commercial Lifecycle: Branch Quotations & Verification
router.get('/manager/quotations', requireAuth, requireBranchManager, quotationController.getManagerQuotations);
router.get('/manager/quotations/new', requireAuth, requireBranchManager, quotationController.getNewRequestPage);
router.post('/manager/quotations/new', requireAuth, requireBranchManager, verifyCsrf, quotationController.postCreateRequest);
router.get(['/manager/quotations/request/:id', '/manager/quotations/requests/:id'], requireAuth, requireBranchManager, validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/manager/quotations/request/:id/status', '/manager/quotations/requests/:id/status'], requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), quotationController.postUpdateRequestStatus);
router.get('/manager/quotations/prepare/:requestId', requireAuth, requireBranchManager, validateObjectId('requestId'), quotationController.getPrepareQuotationPage);
router.post('/manager/quotations/preview-financials', requireAuth, requireBranchManager, verifyCsrf, quotationController.previewFinancials);
router.post('/manager/quotations/save-prepared', requireAuth, requireBranchManager, verifyCsrf, quotationController.postSavePreparedQuotation);
router.get('/manager/quotations/:id', requireAuth, requireBranchManager, validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/manager/quotations/:id/edit', requireAuth, requireBranchManager, validateObjectId('id'), quotationController.getEditQuotationPage);
router.get('/manager/quotations/:id/document', requireAuth, requireBranchManager, validateObjectId('id'), quotationController.getQuotationDocument);
router.post('/manager/quotations/:id/approve', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), quotationController.postApproveQuotation);
router.post('/manager/quotations/:id/reject', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), quotationController.postRejectQuotation);
router.post('/manager/quotations/:id/archive', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), quotationController.postArchiveQuotation);

// Phase 3: Branch Project Execution & Commissioning
router.get('/manager/projects', requireAuth, requireBranchManager, projectController.getProjectsPage);
router.get('/manager/projects/:id', requireAuth, requireBranchManager, validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/manager/projects/:id/status', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/manager/projects/:id/site-visit/review', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.reviewSiteVisit);
router.post('/manager/projects/:id/tasks', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.createTask);
router.post('/manager/projects/:id/tasks/:taskId/status', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.updateTaskStatus);
router.post('/manager/projects/:id/assign', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.assignEmployee);
router.post('/manager/projects/:id/materials/:materialId', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.updateMaterial);
router.post('/manager/projects/:id/complete', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.completeProject);
router.post('/manager/projects/:id/documents', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/manager/projects/:id/documents/:documentId', requireAuth, requireBranchManager, validateObjectId('id'), projectController.downloadDocument);

// Financials, Profile & Inquiries
router.get('/manager/invoices', requireAuth, requireBranchManager, managerController.getInvoices);
router.get('/manager/profile', requireAuth, requireBranchManager, managerController.getProfile);
router.get('/manager/enquiries', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/complaints', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/reports', requireAuth, requireBranchManager, managerController.getDashboard);

module.exports = router;
