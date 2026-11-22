const express = require('express');
const router = express.Router();

const employeeController = require('../../controllers/employeeController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');
const customerController = require('../../controllers/customerController');

const {
    requireAuth,
    requireEmployee,
    requirePermission,
    requireAnyPermission,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// EMPLOYEE & FIELD STAFF OPERATIONS ROUTES
// ==========================================

// Dashboard & Field Attendance
router.get(['/employee', '/employee/dashboard'], requireAuth, requirePermission('attendance.personal.view'), employeeController.getDashboard);
router.get('/employee/attendance', requireAuth, requirePermission('attendance.personal.view'), employeeController.getAttendancePage);
router.post('/api/attendance', requireAuth, requirePermission('attendance.punch.create'), verifyCsrf, employeeController.submitAttendance);

// Commercial Lifecycle: Field Quotation Requests & Drafts
router.get('/employee/quotations', requireAuth, requirePermission('quotations.requests.view'), quotationController.getEmployeeQuotations);
router.get(['/employee/quotations/new', '/quotations/new'], requireAuth, requirePermission('quotations.requests.create'), quotationController.getNewRequestPage);
router.post(['/employee/quotations/new', '/quotations/new', '/api/employee/quotations/request', '/api/quotations/request'], requireAuth, requirePermission('quotations.requests.create'), verifyCsrf, quotationController.postCreateRequest);
router.get(['/employee/quotations/request/:id', '/employee/quotations/requests/:id'], requireAuth, requirePermission('quotations.requests.view'), validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/employee/quotations/request/:id/resubmit', '/employee/quotations/requests/:id/resubmit', '/api/employee/quotations/requests/:id/resubmit'], requireAuth, requirePermission('quotations.requests.edit'), verifyCsrf, validateObjectId('id'), quotationController.postResubmitRequest);
router.get('/employee/quotations/:id', requireAuth, requirePermission('quotations.records.detail'), validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/employee/quotations/:id/document', requireAuth, requirePermission('quotations.document.view'), validateObjectId('id'), quotationController.getQuotationDocument);
router.post(['/employee/quotations/:id/customer-response', '/manager/quotations/:id/customer-response', '/admin/quotations/:id/customer-response', '/quotations/:id/customer-response'], requireAuth, requirePermission('quotations.customer_response.edit'), verifyCsrf, validateObjectId('id'), quotationController.postCustomerResponse);

// Phase 3: Field Project Execution, Survey & Tasks
router.get('/employee/projects', requireAuth, requirePermission('projects.records.view'), projectController.getProjectsPage);
router.get('/employee/projects/:id', requireAuth, requirePermission('projects.records.detail'), validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/employee/projects/:id/status', requireAuth, requirePermission('projects.status.edit'), verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/employee/projects/:id/site-visit', requireAuth, requirePermission('projects.site_visit.create'), verifyCsrf, validateObjectId('id'), projectController.submitSiteVisit);
router.post('/employee/projects/:id/tasks/:taskId/status', requireAuth, requirePermission('projects.tasks.edit'), verifyCsrf, validateObjectId('id'), projectController.updateTaskStatus);
router.post('/employee/projects/:id/documents', requireAuth, requirePermission('projects.documents.create'), verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/employee/projects/:id/documents/:documentId', requireAuth, requirePermission('projects.documents.view'), validateObjectId('id'), projectController.downloadDocument);

// Employee Profile
router.get('/employee/profile', requireAuth, employeeController.getProfile);

// Authenticated CRM Customer APIs (Search & Creation for Quotations - Shared Lookup)
router.get('/api/customers/search', requireAuth, requireAnyPermission('crm.search.view', 'quotations.requests.create', 'quotations.preparation.view'), customerController.searchByMobile);
router.post('/api/customers/create', requireAuth, requirePermission('crm.customers.create'), verifyCsrf, customerController.createCustomer);

// Cross-Role Authenticated Project & Quotation Aliases
router.post('/private/projects/:id/documents', requireAuth, requirePermission('projects.documents.create'), verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/private/projects/:id/documents/:documentId', requireAuth, requirePermission('projects.documents.view'), validateObjectId('id'), projectController.downloadDocument);
router.get('/quotations/:id', requireAuth, requirePermission('quotations.records.detail'), validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/quotations/:id/document', requireAuth, requirePermission('quotations.document.view'), validateObjectId('id'), quotationController.getQuotationDocument);
router.get('/attachments/:filename', requireAuth, requireAnyPermission('quotations.requests.view', 'quotations.records.detail'), quotationController.serveAttachment);

module.exports = router;
