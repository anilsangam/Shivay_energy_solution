const express = require('express');
const router = express.Router();

const employeeController = require('../../controllers/employeeController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');
const customerController = require('../../controllers/customerController');

const {
    requireAuth,
    requireEmployee,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// EMPLOYEE & FIELD STAFF OPERATIONS ROUTES
// ==========================================

// Dashboard & Field Attendance
router.get(['/employee', '/employee/dashboard'], requireAuth, requireEmployee, employeeController.getDashboard);
router.get('/employee/attendance', requireAuth, requireEmployee, employeeController.getAttendancePage);
router.post('/api/attendance', requireAuth, requireEmployee, verifyCsrf, employeeController.submitAttendance);

// Commercial Lifecycle: Field Quotation Requests & Drafts
router.get('/employee/quotations', requireAuth, requireEmployee, quotationController.getEmployeeQuotations);
router.get(['/employee/quotations/new', '/quotations/new'], requireAuth, requireEmployee, quotationController.getNewRequestPage);
router.post(['/employee/quotations/new', '/quotations/new', '/api/employee/quotations/request', '/api/quotations/request'], requireAuth, requireEmployee, verifyCsrf, quotationController.postCreateRequest);
router.get(['/employee/quotations/request/:id', '/employee/quotations/requests/:id'], requireAuth, requireEmployee, validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/employee/quotations/request/:id/resubmit', '/employee/quotations/requests/:id/resubmit', '/api/employee/quotations/requests/:id/resubmit'], requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), quotationController.postResubmitRequest);
router.get('/employee/quotations/:id', requireAuth, requireEmployee, validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/employee/quotations/:id/document', requireAuth, requireEmployee, validateObjectId('id'), quotationController.getQuotationDocument);
router.post(['/employee/quotations/:id/customer-response', '/manager/quotations/:id/customer-response', '/admin/quotations/:id/customer-response', '/quotations/:id/customer-response'], requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), quotationController.postCustomerResponse);

// Phase 3: Field Project Execution, Survey & Tasks
router.get('/employee/projects', requireAuth, requireEmployee, projectController.getProjectsPage);
router.get('/employee/projects/:id', requireAuth, requireEmployee, validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/employee/projects/:id/status', requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/employee/projects/:id/site-visit', requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), projectController.submitSiteVisit);
router.post('/employee/projects/:id/tasks/:taskId/status', requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), projectController.updateTaskStatus);
router.post('/employee/projects/:id/documents', requireAuth, requireEmployee, verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/employee/projects/:id/documents/:documentId', requireAuth, requireEmployee, validateObjectId('id'), projectController.downloadDocument);

// Employee Profile
router.get('/employee/profile', requireAuth, requireEmployee, employeeController.getProfile);

// Authenticated CRM Customer APIs (Search & Creation for Quotations)
router.get('/api/customers/search', requireAuth, customerController.searchByMobile);
router.post('/api/customers/create', requireAuth, verifyCsrf, customerController.createCustomer);

// Cross-Role Authenticated Project & Quotation Aliases
router.post('/private/projects/:id/documents', requireAuth, verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/private/projects/:id/documents/:documentId', requireAuth, validateObjectId('id'), projectController.downloadDocument);
router.get('/quotations/:id', requireAuth, validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/quotations/:id/document', requireAuth, validateObjectId('id'), quotationController.getQuotationDocument);
router.get('/attachments/:filename', requireAuth, quotationController.serveAttachment);

module.exports = router;
