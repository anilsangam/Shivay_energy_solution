const express = require('express');
const router = express.Router();

const managerController = require('../../controllers/managerController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');

const {
    requireAuth,
    requireBranchManager,
    requirePermission,
    requireAnyPermission,
    requireQuotationRequestStatusPermission,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// BRANCH MANAGER GOVERNANCE & EXECUTION ROUTES
// ==========================================

// Dashboard, Branch Staff & Attendance Overview
router.get('/manager/dashboard', requireAuth, requireBranchManager, managerController.getDashboard);
router.get('/manager/employees', requireAuth, requireBranchManager, requirePermission('users.employees.view'), managerController.getEmployees);
router.get('/manager/attendance', requireAuth, requireBranchManager, requirePermission('attendance.branch.view'), managerController.getAttendance);

// Commercial Lifecycle: Branch Quotations & Verification
router.get('/manager/quotations', requireAuth, requireBranchManager, requirePermission('quotations.records.view'), quotationController.getManagerQuotations);
router.get('/manager/quotations/new', requireAuth, requireBranchManager, requirePermission('quotations.requests.create'), quotationController.getNewRequestPage);
router.post('/manager/quotations/new', requireAuth, requireBranchManager, requirePermission('quotations.requests.create'), verifyCsrf, quotationController.postCreateRequest);
router.get(['/manager/quotations/request/:id', '/manager/quotations/requests/:id'], requireAuth, requireBranchManager, requirePermission('quotations.requests.view'), validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/manager/quotations/request/:id/status', '/manager/quotations/requests/:id/status'], requireAuth, requireBranchManager, requireQuotationRequestStatusPermission(), verifyCsrf, validateObjectId('id'), quotationController.postUpdateRequestStatus);
router.get('/manager/quotations/prepare/:requestId', requireAuth, requireBranchManager, requirePermission('quotations.preparation.view'), validateObjectId('requestId'), quotationController.getPrepareQuotationPage);
router.post('/manager/quotations/preview-financials', requireAuth, requireBranchManager, requirePermission('quotations.preparation.view'), verifyCsrf, quotationController.previewFinancials);
router.post('/manager/quotations/save-prepared', requireAuth, requireBranchManager, requirePermission('quotations.preparation.create'), verifyCsrf, quotationController.postSavePreparedQuotation);
router.get('/manager/quotations/:id', requireAuth, requireBranchManager, requirePermission('quotations.records.detail'), validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/manager/quotations/:id/edit', requireAuth, requireBranchManager, requirePermission('quotations.preparation.create'), validateObjectId('id'), quotationController.getEditQuotationPage);
router.get('/manager/quotations/:id/document', requireAuth, requireBranchManager, requirePermission('quotations.document.view'), validateObjectId('id'), quotationController.getQuotationDocument);
router.post('/manager/quotations/:id/approve', requireAuth, requireBranchManager, requirePermission('quotations.approval.approve'), verifyCsrf, validateObjectId('id'), quotationController.postApproveQuotation);
router.post('/manager/quotations/:id/reject', requireAuth, requireBranchManager, requirePermission('quotations.approval.reject'), verifyCsrf, validateObjectId('id'), quotationController.postRejectQuotation);
router.post('/manager/quotations/:id/archive', requireAuth, requireBranchManager, requirePermission('quotations.archive.manage'), verifyCsrf, validateObjectId('id'), quotationController.postArchiveQuotation);

// Phase 3: Branch Project Execution & Commissioning
router.get('/manager/projects', requireAuth, requireBranchManager, requirePermission('projects.records.view'), projectController.getProjectsPage);
router.get('/manager/projects/:id', requireAuth, requireBranchManager, requirePermission('projects.records.detail'), validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/manager/projects/:id/status', requireAuth, requireBranchManager, requirePermission('projects.status.edit'), verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/manager/projects/:id/site-visit/review', requireAuth, requireBranchManager, requirePermission('projects.site_visit.approve'), verifyCsrf, validateObjectId('id'), projectController.reviewSiteVisit);
router.post('/manager/projects/:id/tasks', requireAuth, requireBranchManager, requirePermission('projects.tasks.create'), verifyCsrf, validateObjectId('id'), projectController.createTask);
router.post('/manager/projects/:id/tasks/:taskId/status', requireAuth, requireBranchManager, requirePermission('projects.tasks.edit'), verifyCsrf, validateObjectId('id'), projectController.updateTaskStatus);
router.post('/manager/projects/:id/assign', requireAuth, requireBranchManager, requirePermission('projects.assignment.assign'), verifyCsrf, validateObjectId('id'), projectController.assignEmployee);
router.post('/manager/projects/:id/materials/:materialId', requireAuth, requireBranchManager, requirePermission('projects.materials.manage'), verifyCsrf, validateObjectId('id'), projectController.updateMaterial);
router.post('/manager/projects/:id/complete', requireAuth, requireBranchManager, requirePermission('projects.completion.approve'), verifyCsrf, validateObjectId('id'), projectController.completeProject);
router.post('/manager/projects/:id/documents', requireAuth, requireBranchManager, requirePermission('projects.documents.create'), verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/manager/projects/:id/documents/:documentId', requireAuth, requireBranchManager, requirePermission('projects.documents.view'), validateObjectId('id'), projectController.downloadDocument);

// Financials, Profile & Inquiries
router.get('/manager/invoices', requireAuth, requireBranchManager, requirePermission('invoices.records.view'), managerController.getInvoices);
router.get('/manager/profile', requireAuth, requireBranchManager, managerController.getProfile);
router.get('/manager/enquiries', requireAuth, requireBranchManager, requirePermission('crm.enquiries.view'), managerController.getDashboard);
router.get('/manager/complaints', requireAuth, requireBranchManager, requirePermission('complaints.tickets.view'), managerController.getDashboard);
router.get('/manager/reports', requireAuth, requireBranchManager, requirePermission('reports.analytics.view'), managerController.getDashboard);

module.exports = router;
