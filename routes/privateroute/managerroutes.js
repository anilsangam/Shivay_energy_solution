const express = require('express');
const router = express.Router();

const managerController = require('../../controllers/managerController');
const employeeController = require('../../controllers/employeeController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');
const leadController = require('../../controllers/leadController');
const complaintController = require('../../controllers/complaintController');
const { EmployeeCardController } = require('../../controllers/employeeCardController');

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
router.post('/api/manager/employees/create', requireAuth, requireBranchManager, verifyCsrf, managerController.postCreateEmployee);
router.post('/api/manager/employees/:id/update', requireAuth, requireBranchManager, verifyCsrf, validateObjectId('id'), managerController.postUpdateEmployee);
router.get('/manager/employees/:id/permissions', requireAuth, requireBranchManager, requirePermission('users.employees.manage'), validateObjectId('id'), managerController.getEmployeePermissions);
router.post('/api/manager/employees/:id/permissions', requireAuth, requireBranchManager, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('id'), managerController.postUpdateEmployeePermissions);
router.get('/manager/employees/:id/id-card', requireAuth, requireBranchManager, validateObjectId('id'), EmployeeCardController.getIdCard);
router.get('/manager/employees/:id/visiting-card', requireAuth, requireBranchManager, validateObjectId('id'), EmployeeCardController.getVisitingCard);
router.get('/api/manager/employees/:id/share/:type', requireAuth, requireBranchManager, validateObjectId('id'), EmployeeCardController.getSharePayload);
router.get('/manager/attendance', requireAuth, requirePermission('attendance.branch.view'), managerController.getAttendance);
router.get('/manager/my-attendance', requireAuth, requirePermission('attendance.personal.view'), employeeController.getAttendancePage);

// Commercial Lifecycle: Branch Quotations & Verification (Permitted employees with full access can also operate)
router.get('/manager/quotations', requireAuth, requireAnyPermission('quotations.records.view', 'quotations.preparation.view', 'quotations.approval.approve'), quotationController.getManagerQuotations);
router.get('/manager/quotations/new', requireAuth, requirePermission('quotations.requests.create'), quotationController.getNewRequestPage);
router.post('/manager/quotations/new', requireAuth, requirePermission('quotations.requests.create'), verifyCsrf, quotationController.postCreateRequest);
router.get(['/manager/quotations/request/:id', '/manager/quotations/requests/:id'], requireAuth, requirePermission('quotations.requests.view'), validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/manager/quotations/request/:id/status', '/manager/quotations/requests/:id/status'], requireAuth, requireQuotationRequestStatusPermission(), verifyCsrf, validateObjectId('id'), quotationController.postUpdateRequestStatus);
router.get('/manager/quotations/prepare/:requestId', requireAuth, requirePermission('quotations.preparation.view'), validateObjectId('requestId'), quotationController.getPrepareQuotationPage);
router.post('/manager/quotations/preview-financials', requireAuth, requirePermission('quotations.preparation.view'), verifyCsrf, quotationController.previewFinancials);
router.post('/manager/quotations/save-prepared', requireAuth, requirePermission('quotations.preparation.create'), verifyCsrf, quotationController.postSavePreparedQuotation);
router.get('/manager/quotations/:id', requireAuth, requirePermission('quotations.records.detail'), validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/manager/quotations/:id/edit', requireAuth, requirePermission('quotations.preparation.create'), validateObjectId('id'), quotationController.getEditQuotationPage);
router.get('/manager/quotations/:id/document', requireAuth, requirePermission('quotations.document.view'), validateObjectId('id'), quotationController.getQuotationDocument);
router.post('/manager/quotations/:id/approve', requireAuth, requirePermission('quotations.approval.approve'), verifyCsrf, validateObjectId('id'), quotationController.postApproveQuotation);
router.post('/manager/quotations/:id/reject', requireAuth, requirePermission('quotations.approval.reject'), verifyCsrf, validateObjectId('id'), quotationController.postRejectQuotation);
router.post('/manager/quotations/:id/archive', requireAuth, requirePermission('quotations.archive.manage'), verifyCsrf, validateObjectId('id'), quotationController.postArchiveQuotation);

// Phase 3: Branch Project Execution & Commissioning (Permitted employees with full access can also execute edits)
router.get('/manager/projects', requireAuth, requirePermission('projects.records.view'), projectController.getProjectsPage);
router.get('/manager/projects/:id', requireAuth, requirePermission('projects.records.detail'), validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/manager/projects/:id/status', requireAuth, requirePermission('projects.status.edit'), verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/manager/projects/:id/site-visit/review', requireAuth, requirePermission('projects.site_visit.approve'), verifyCsrf, validateObjectId('id'), projectController.reviewSiteVisit);
router.post('/manager/projects/:id/tasks', requireAuth, requirePermission('projects.tasks.create'), verifyCsrf, validateObjectId('id'), projectController.createTask);
router.post('/manager/projects/:id/tasks/:taskId/status', requireAuth, requirePermission('projects.tasks.edit'), verifyCsrf, validateObjectId('id'), projectController.updateTaskStatus);
router.post('/manager/projects/:id/assign', requireAuth, requirePermission('projects.assignment.assign'), verifyCsrf, validateObjectId('id'), projectController.assignEmployee);
router.post('/manager/projects/:id/materials/:materialId', requireAuth, requirePermission('projects.materials.manage'), verifyCsrf, validateObjectId('id'), projectController.updateMaterial);
router.post('/manager/projects/:id/complete', requireAuth, requirePermission('projects.completion.approve'), verifyCsrf, validateObjectId('id'), projectController.completeProject);
router.post('/manager/projects/:id/documents', requireAuth, requirePermission('projects.documents.create'), verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/manager/projects/:id/documents/:documentId', requireAuth, requirePermission('projects.documents.view'), validateObjectId('id'), projectController.downloadDocument);

// Financials, Profile & Inquiries
router.get('/manager/invoices', requireAuth, requirePermission('invoices.records.view'), managerController.getInvoices);
router.get('/manager/profile', requireAuth, requireBranchManager, managerController.getProfile);
router.get('/manager/leads', requireAuth, requirePermission('crm.leads.view'), leadController.getLeadsPage);
router.get('/manager/enquiries', requireAuth, requirePermission('crm.enquiries.view'), managerController.getDashboard);
router.get('/manager/complaints', requireAuth, requireAnyPermission(['complaints.tickets.view', 'complaints.records.view']), complaintController.getAdminComplaints);
router.get('/manager/complaints/:id', requireAuth, requireAnyPermission(['complaints.tickets.view', 'complaints.records.view']), validateObjectId('id'), complaintController.getComplaintDetailPage);
router.get('/manager/reports', requireAuth, requirePermission('reports.analytics.view'), managerController.getDashboard);

module.exports = router;
