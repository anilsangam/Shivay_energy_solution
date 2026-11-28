const express = require('express');
const router = express.Router();

const adminController = require('../../controllers/adminController');
const customerController = require('../../controllers/customerController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');
const materialController = require('../../controllers/materialController');
const websiteCmsController = require('../../controllers/websiteCmsController');
const enquiryController = require('../../controllers/enquiryController');
const leadController = require('../../controllers/leadController');
const fieldInspectionController = require('../../controllers/fieldInspectionController');
const projectExecutionController = require('../../controllers/projectExecutionController');
const complaintController = require('../../controllers/complaintController');
const { EmployeeCardController } = require('../../controllers/employeeCardController');

const {
    requireAuth,
    requireSuperAdmin,
    requireBranchManager,
    requirePermission,
    requireAnyPermission,
    requireQuotationRequestStatusPermission,
    verifyCsrf,
    validateObjectId
} = require('../../middleware/authMiddleware');

// ==========================================
// SUPER ADMIN MANAGEMENT & GOVERNANCE ROUTES
// ==========================================

// Dashboard & Core Operations
router.get('/admin', requireAuth, requireSuperAdmin, adminController.getDashboard);
router.get(['/admin/users', '/admin/employees'], requireAuth, requirePermission('users.employees.view'), adminController.getEmployees);
router.get('/admin/users/:id/permissions', requireAuth, requirePermission('users.employees.manage'), validateObjectId('id'), adminController.getUserPermissions);
router.get('/admin/managers', requireAuth, requirePermission('users.managers.view'), adminController.getManagers);
router.get('/admin/customers', requireAuth, requirePermission('crm.customers.view'), customerController.getCustomersList);

// CRM & Lead Management (Telecalling, Bulk Import, Lead Lifecycle)
router.get('/admin/leads', requireAuth, requirePermission('crm.leads.view'), leadController.getLeadsPage);
router.get('/admin/leads/export', requireAuth, requirePermission('crm.leads.export'), leadController.exportLeadsCsv);
router.get('/admin/leads/:id', requireAuth, requirePermission('crm.leads.view'), validateObjectId('id'), leadController.getLeadDetails);
router.post('/api/admin/leads/create', requireAuth, requirePermission('crm.leads.create'), verifyCsrf, leadController.createLead);
router.post('/api/admin/leads/import-preview', requireAuth, requirePermission('crm.leads.import'), verifyCsrf, leadController.postImportPreview);
router.post('/api/admin/leads/import-confirm', requireAuth, requirePermission('crm.leads.import'), verifyCsrf, leadController.postImportConfirm);
router.post('/api/admin/leads/:id/call', requireAuth, requirePermission('crm.leads.call_update'), verifyCsrf, validateObjectId('id'), leadController.postRecordCall);
router.post('/api/admin/leads/:id/reassign', requireAuth, requirePermission('crm.leads.reassign'), verifyCsrf, validateObjectId('id'), leadController.postReassign);
router.post('/api/admin/leads/:id/convert', requireAuth, requirePermission('crm.customers.create'), verifyCsrf, validateObjectId('id'), leadController.postConvert);
router.post('/api/admin/leads/:id/comment', requireAuth, requirePermission('crm.leads.edit'), verifyCsrf, validateObjectId('id'), leadController.postAddComment);

// Field Engineer Workspace, Site Inspection & Payment Clearance (Phase 2)
router.get(['/field-engineer/workspace', '/admin/inspections'], requireAuth, requireAnyPermission(['projects.tasks.view', 'projects.inspections.view']), fieldInspectionController.getWorkspace);
router.get('/api/inspections/:id', requireAuth, requirePermission('projects.inspections.view'), fieldInspectionController.getInspection);
router.post('/api/inspections/save', requireAuth, requirePermission('projects.inspections.create'), verifyCsrf, fieldInspectionController.postSaveInspection);
router.post('/api/inspections/:id/photo', requireAuth, requirePermission('projects.inspections.photos'), verifyCsrf, fieldInspectionController.postUploadPhoto);
router.post('/api/inspections/:id/verify', requireAuth, requirePermission('projects.inspections.approve'), verifyCsrf, fieldInspectionController.postVerifyInspection);
router.post('/api/inspections/:id/quotation', requireAuth, requirePermission('quotations.preparation.create'), verifyCsrf, fieldInspectionController.postCreateOnsiteQuotation);
router.post('/api/quotations/:quotationId/customer-response', requireAuth, requirePermission('quotations.customer_response.edit'), verifyCsrf, validateObjectId('quotationId'), fieldInspectionController.postRecordCustomerAcceptance);
router.post('/api/customers/documents', requireAuth, requirePermission('projects.documents.create'), verifyCsrf, fieldInspectionController.postUploadCustomerDocument);
router.post('/api/payments/record', requireAuth, requirePermission('invoices.payments.record'), verifyCsrf, fieldInspectionController.postRecordPayment);
router.post('/api/payments/:paymentId/verify', requireAuth, requirePermission('invoices.payments.verify'), verifyCsrf, fieldInspectionController.postVerifyPayment);
router.get('/api/projects/activation-status/:quotationId', requireAuth, requirePermission('projects.records.view'), validateObjectId('quotationId'), fieldInspectionController.getPaymentClearanceStatus);
router.post('/api/projects/activate/:quotationId', requireAuth, requirePermission('projects.activation.create'), verifyCsrf, validateObjectId('quotationId'), fieldInspectionController.postActivateProject);

// Project Execution, Material Allocation, Serials & Installation (Phase 3)
router.get(['/installation/workspace', '/admin/installation/workspace'], requireAuth, requireAnyPermission(['projects.tasks.view', 'projects.installation.manage']), projectExecutionController.getInstallationWorkspace);
router.post('/api/projects/:projectId/assign-employees', requireAuth, requirePermission('projects.assignment.assign'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postAssignEmployees);
router.post('/api/projects/:projectId/status', requireAuth, requirePermission('projects.status.edit'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postUpdateStatus);
router.post('/api/inventory/serials/register', requireAuth, requirePermission('inventory.serials.manage'), verifyCsrf, projectExecutionController.postRegisterSerial);
router.post('/api/projects/:projectId/allocate-material', requireAuth, requirePermission('inventory.allocation.manage'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postAllocateMaterial);
router.post('/api/projects/:projectId/dispatch-material', requireAuth, requireAnyPermission(['dispatch.orders.create', 'inventory.allocation.manage']), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postDispatchMaterial);
router.post('/api/projects/:projectId/installation/start', requireAuth, requirePermission('projects.installation.manage'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postStartInstallation);
router.post('/api/projects/:projectId/installation/submit', requireAuth, requirePermission('projects.installation.manage'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postSubmitInstallation);
router.post('/api/projects/:projectId/approve-completion', requireAuth, requirePermission('projects.completion.approve'), verifyCsrf, validateObjectId('projectId'), projectExecutionController.postApproveCompletion);
router.get('/api/projects/dashboard/executive', requireAuth, requireAnyPermission(['reports.analytics.view', 'projects.records.view']), projectExecutionController.getExecutiveDashboard);

// Commercial Lifecycle: Quotations & Maker-Checker Approvals
router.get('/admin/quotations', requireAuth, requirePermission('quotations.records.view'), quotationController.getAdminQuotations);
router.get('/admin/quotations/new', requireAuth, requirePermission('quotations.requests.create'), quotationController.getNewRequestPage);
router.post('/admin/quotations/new', requireAuth, requirePermission('quotations.requests.create'), verifyCsrf, quotationController.postCreateRequest);
router.get(['/admin/quotations/request/:id', '/admin/quotations/requests/:id'], requireAuth, requirePermission('quotations.requests.view'), validateObjectId('id'), quotationController.getRequestDetails);
router.post(['/admin/quotations/request/:id/status', '/admin/quotations/requests/:id/status'], requireAuth, requireQuotationRequestStatusPermission(), verifyCsrf, validateObjectId('id'), quotationController.postUpdateRequestStatus);
router.get('/admin/quotations/prepare/:requestId', requireAuth, requirePermission('quotations.preparation.view'), validateObjectId('requestId'), quotationController.getPrepareQuotationPage);
router.post('/admin/quotations/preview-financials', requireAuth, requirePermission('quotations.preparation.view'), verifyCsrf, quotationController.previewFinancials);
router.post('/admin/quotations/save-prepared', requireAuth, requirePermission('quotations.preparation.create'), verifyCsrf, quotationController.postSavePreparedQuotation);
router.get('/admin/quotations/:id', requireAuth, requirePermission('quotations.records.detail'), validateObjectId('id'), quotationController.getQuotationDetails);
router.get('/admin/quotations/:id/edit', requireAuth, requirePermission('quotations.preparation.create'), validateObjectId('id'), quotationController.getEditQuotationPage);
router.get('/admin/quotations/:id/document', requireAuth, requirePermission('quotations.document.view'), validateObjectId('id'), quotationController.getQuotationDocument);
router.post('/admin/quotations/:id/approve', requireAuth, requirePermission('quotations.approval.approve'), verifyCsrf, validateObjectId('id'), quotationController.postApproveQuotation);
router.post('/admin/quotations/:id/reject', requireAuth, requirePermission('quotations.approval.reject'), verifyCsrf, validateObjectId('id'), quotationController.postRejectQuotation);
router.post('/admin/quotations/:id/archive', requireAuth, requirePermission('quotations.archive.manage'), verifyCsrf, validateObjectId('id'), quotationController.postArchiveQuotation);

// Phase 3: Project Execution, Staging & Grid Commissioning
router.get('/admin/projects', requireAuth, requirePermission('projects.records.view'), projectController.getProjectsPage);
router.get('/admin/projects/:id', requireAuth, requirePermission('projects.records.detail'), validateObjectId('id'), projectController.getProjectDetailPage);
router.post('/admin/projects/:id/status', requireAuth, requirePermission('projects.status.edit'), verifyCsrf, validateObjectId('id'), projectController.updateStatus);
router.post('/admin/projects/:id/tasks', requireAuth, requirePermission('projects.tasks.create'), verifyCsrf, validateObjectId('id'), projectController.createTask);
router.post('/admin/projects/:id/assign', requireAuth, requirePermission('projects.assignment.assign'), verifyCsrf, validateObjectId('id'), projectController.assignEmployee);
router.post('/admin/projects/:id/materials/:materialId', requireAuth, requirePermission('projects.materials.manage'), verifyCsrf, validateObjectId('id'), projectController.updateMaterial);
router.post('/admin/projects/:id/complete', requireAuth, requirePermission('projects.completion.approve'), verifyCsrf, validateObjectId('id'), projectController.completeProject);
router.post('/admin/projects/:id/documents', requireAuth, requirePermission('projects.documents.create'), verifyCsrf, validateObjectId('id'), projectController.uploadDocument);
router.get('/admin/projects/:id/documents/:documentId', requireAuth, requirePermission('projects.documents.view'), validateObjectId('id'), projectController.downloadDocument);

// Financials, System Audit & Organization Management
router.get('/admin/invoices', requireAuth, requirePermission('invoices.records.view'), adminController.getInvoices);
router.get('/admin/invoices/:id/document', requireAuth, requirePermission('invoices.records.view'), adminController.getInvoiceDocumentPage);
router.get('/admin/reports', requireAuth, requirePermission('reports.analytics.view'), adminController.getReports);
router.get('/api/admin/reports/export/:type', requireAuth, requirePermission('reports.analytics.export'), adminController.exportReportCsv);
router.get('/admin/activity-logs', requireAuth, requirePermission('settings.audit_logs.view'), adminController.getActivityLogs);
router.get('/admin/settings', requireAuth, requirePermission('settings.general.view'), adminController.getSettings);
router.get('/admin/profile', requireAuth, adminController.getProfile);
router.get('/admin/branches', requireAuth, requirePermission('branches.offices.view'), adminController.getBranches);
router.get('/api/admin/geocode', requireAuth, requireAnyPermission(['branches.offices.view', 'branches.offices.edit', 'branches.offices.create', 'settings.general.view', 'settings.general.edit']), adminController.geocodeLocation);
router.get('/admin/enquiries', requireAuth, requirePermission('crm.enquiries.view'), adminController.getDashboard);
router.get('/admin/complaints', requireAuth, requireAnyPermission(['complaints.tickets.view', 'complaints.records.view']), complaintController.getAdminComplaints);
router.get('/admin/complaints/:id', requireAuth, requireAnyPermission(['complaints.tickets.view', 'complaints.records.view']), validateObjectId('id'), complaintController.getComplaintDetailPage);
router.post('/api/admin/complaints/status', requireAuth, requireAnyPermission(['complaints.tickets.edit', 'complaints.records.edit']), verifyCsrf, complaintController.updateComplaintStatus);

// Complaint Management Action APIs (Phase 4)
router.post('/api/complaints/:id/link', requireAuth, requireAnyPermission(['complaints.records.edit', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postLinkCustomerProject);
router.post('/api/complaints/:id/transfer-branch', requireAuth, requireAnyPermission(['complaints.branch_transfer', 'complaints.assign']), verifyCsrf, validateObjectId('id'), complaintController.postTransferBranch);
router.post('/api/complaints/:id/assign-technician', requireAuth, requireAnyPermission(['complaints.technician_assign', 'complaints.assign', 'complaints.reassign', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postAssignTechnician);
router.post('/api/complaints/:id/progress', requireAuth, requireAnyPermission(['complaints.progress.update', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postUpdateProgress);
router.post('/api/complaints/:id/resolve', requireAuth, requireAnyPermission(['complaints.resolve', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postResolveComplaint);
router.post('/api/complaints/:id/approve-closure', requireAuth, requireAnyPermission(['complaints.close', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postApproveClosure);
router.post('/api/complaints/:id/reopen', requireAuth, requireAnyPermission(['complaints.reopen', 'complaints.tickets.edit']), verifyCsrf, validateObjectId('id'), complaintController.postReopenComplaint);

// Super Admin / Governance Mutating APIs
router.post('/api/admin/enquiries/status', requireAuth, requirePermission('crm.enquiries.edit'), verifyCsrf, adminController.updateEnquiryStatus);
router.post('/api/admin/quotations/save', requireAuth, requirePermission('quotations.preparation.create'), verifyCsrf, adminController.saveQuotation);
router.post('/api/admin/invoices/save', requireAuth, requireAnyPermission(['invoices.records.create', 'invoices.records.edit']), verifyCsrf, adminController.saveInvoice);
router.post('/api/admin/invoices/delete', requireAuth, requirePermission('invoices.records.delete'), verifyCsrf, adminController.deleteInvoice);
router.post('/api/admin/users/create', requireAuth, requireSuperAdmin, requirePermission('users.employees.create'), verifyCsrf, adminController.createUser);
router.post('/api/admin/users/:id/update', requireAuth, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('id'), adminController.updateUserDetails);
router.post('/api/admin/users/status', requireAuth, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('userId'), adminController.updateUserStatus);
router.post('/api/admin/users/reset-password', requireAuth, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('userId'), adminController.resetUserPassword);
router.post('/api/admin/employees/assign-manager', requireAuth, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('employeeId'), adminController.assignManager);
router.get('/api/admin/users/:id/permissions', requireAuth, requirePermission('users.employees.manage'), validateObjectId('id'), adminController.getUserPermissionsJson);
router.post('/api/admin/users/:id/permissions', requireAuth, requirePermission('users.employees.manage'), verifyCsrf, validateObjectId('id'), adminController.updateUserPermissions);

// Employee Identity Card & Visiting Card Routes (Super Admin & Managers)
router.get('/admin/employees/:id/id-card', requireAuth, validateObjectId('id'), EmployeeCardController.getIdCard);
router.get('/admin/employees/:id/visiting-card', requireAuth, validateObjectId('id'), EmployeeCardController.getVisitingCard);
router.get('/api/admin/employees/:id/share/:type', requireAuth, validateObjectId('id'), EmployeeCardController.getSharePayload);
router.get('/cards/view/:type/:id', validateObjectId('id'), (req, res) => {
    const type = req.params.type;
    if (type === 'visiting-card' || type === 'visiting') {
        return EmployeeCardController.getVisitingCard(req, res);
    }
    return EmployeeCardController.getIdCard(req, res);
});
router.post('/api/admin/branches/create', requireAuth, requireSuperAdmin, requirePermission('branches.offices.create'), verifyCsrf, adminController.createBranch);
router.post('/api/admin/branches/update', requireAuth, requirePermission('branches.offices.edit'), verifyCsrf, adminController.updateBranch);
router.post('/api/admin/branches/status', requireAuth, requirePermission('branches.offices.manage'), verifyCsrf, adminController.toggleBranchStatus);
router.post('/api/admin/settings/save', requireAuth, requireSuperAdmin, requirePermission('settings.general.edit'), verifyCsrf, adminController.saveSettings);

// =========================================================================
// MATERIAL MANAGEMENT & INVENTORY FOUNDATION
// =========================================================================

// 1. Material Master
router.get('/admin/materials', requireAuth, requirePermission('material.catalog.view'), materialController.getMaterialsPage);
router.post('/api/admin/materials', requireAuth, requirePermission('material.catalog.create'), verifyCsrf, materialController.createMaterial);
router.get('/admin/materials/:id', requireAuth, requirePermission('material.catalog.view'), validateObjectId('id'), materialController.getMaterialDetails);
router.post('/api/admin/materials/:id', requireAuth, requirePermission('material.catalog.edit'), verifyCsrf, validateObjectId('id'), materialController.updateMaterial);
router.post('/api/admin/materials/:id/status', requireAuth, requirePermission('material.catalog.edit'), verifyCsrf, validateObjectId('id'), materialController.toggleMaterialStatus);

// 2. Supplier Management
router.get('/admin/suppliers', requireAuth, requirePermission('material.suppliers.view'), materialController.getSuppliersPage);
router.post('/api/admin/suppliers', requireAuth, requirePermission('material.suppliers.create'), verifyCsrf, materialController.createSupplier);
router.get('/api/admin/suppliers/search', requireAuth, requirePermission('material.suppliers.view'), materialController.searchSuppliersApi);
router.get('/admin/suppliers/:id', requireAuth, requirePermission('material.suppliers.view'), validateObjectId('id'), materialController.getSupplierDetails);
router.post('/api/admin/suppliers/:id', requireAuth, requirePermission('material.suppliers.edit'), verifyCsrf, validateObjectId('id'), materialController.updateSupplier);
router.post('/api/admin/suppliers/:id/status', requireAuth, requirePermission('material.suppliers.edit'), verifyCsrf, validateObjectId('id'), materialController.toggleSupplierStatus);

// 3. Purchase / Stock In
router.get('/admin/purchases', requireAuth, requirePermission('inventory.purchases.view'), materialController.getPurchasesPage);
router.get('/admin/purchases/new', requireAuth, requirePermission('inventory.purchases.create'), materialController.getNewPurchasePage);
router.post('/api/admin/purchases', requireAuth, requirePermission('inventory.purchases.create'), verifyCsrf, materialController.createPurchase);
router.get('/admin/purchases/:id', requireAuth, requirePermission('inventory.purchases.view'), validateObjectId('id'), materialController.getPurchaseDetails);
router.post('/api/admin/purchases/:id/confirm', requireAuth, requirePermission('inventory.purchases.approve'), verifyCsrf, validateObjectId('id'), materialController.confirmPurchase);
router.post('/api/admin/purchases/:id/cancel', requireAuth, requirePermission('inventory.purchases.approve'), verifyCsrf, validateObjectId('id'), materialController.cancelPurchase);

// 4. Stock Inventory & Adjustments
router.get('/admin/inventory', requireAuth, requirePermission('inventory.stock.view'), materialController.getInventoryPage);
router.post('/api/admin/inventory/:id/selling-price', requireAuth, requirePermission('inventory.stock.manage'), verifyCsrf, validateObjectId('id'), materialController.updateSellingPrice);
router.post('/api/admin/inventory/:id/adjust', requireAuth, requirePermission('inventory.adjustments.manage'), verifyCsrf, validateObjectId('id'), materialController.adjustStock);
router.get('/api/admin/inventory/:id/history', requireAuth, requirePermission('inventory.history.view'), validateObjectId('id'), materialController.getMaterialHistoryApi);

// 5. Stock Reports & CSV Exports
router.get('/admin/inventory/reports', requireAuth, requirePermission('inventory.reports.view'), materialController.getStockReportsPage);
router.get('/api/admin/inventory/export/stock', requireAuth, requirePermission('inventory.reports.export'), materialController.exportStockCsv);
router.get('/api/admin/inventory/export/ledger', requireAuth, requirePermission('inventory.reports.export'), materialController.exportLedgerCsv);

// =========================================================================
// MATERIAL SALES, STOCK OUT, DISPATCH & RETURNS
// =========================================================================

// 6. Sales / Stock Out
router.get('/admin/sales-out', requireAuth, requirePermission('inventory.sales_out.view'), materialController.getSalesPage);
router.get('/admin/sales-out/new', requireAuth, requirePermission('inventory.sales_out.create'), materialController.getNewSalePage);
router.get('/admin/sales-out/:id', requireAuth, requirePermission('inventory.sales_out.view'), validateObjectId('id'), materialController.getSaleViewPage);
router.get('/admin/sales-out/:id/invoice', requireAuth, requirePermission('inventory.sales_out.view'), validateObjectId('id'), materialController.getSaleInvoicePage);
router.post('/api/admin/sales', requireAuth, requirePermission('inventory.sales_out.create'), verifyCsrf, materialController.createSale);
router.post('/api/admin/sales/:id/confirm', requireAuth, requirePermission('inventory.sales_out.approve'), verifyCsrf, validateObjectId('id'), materialController.confirmSale);
router.post('/api/admin/sales/:id/cancel', requireAuth, requirePermission('inventory.sales_out.reject'), verifyCsrf, validateObjectId('id'), materialController.cancelSale);
router.get('/api/admin/sales/export', requireAuth, requirePermission('inventory.sales_out.export'), materialController.exportSalesCsv);

// Route Aliases
router.get('/admin/sales', requireAuth, requirePermission('inventory.sales_out.view'), (req, res) => res.redirect('/admin/sales-out'));
router.get('/admin/sales/new', requireAuth, requirePermission('inventory.sales_out.create'), (req, res) => res.redirect('/admin/sales-out/new'));
router.get('/admin/sales/:id', requireAuth, requirePermission('inventory.sales_out.view'), validateObjectId('id'), (req, res) => res.redirect(`/admin/sales-out/${req.params.id}`));
router.get('/admin/sales/:id/invoice', requireAuth, requirePermission('inventory.sales_out.view'), validateObjectId('id'), (req, res) => res.redirect(`/admin/sales-out/${req.params.id}/invoice`));

// Customer Search & Quick Create (Shared Lookup)
router.get('/api/admin/customers/search', requireAuth, requireAnyPermission('crm.search.view', 'quotations.requests.create', 'quotations.preparation.view'), materialController.searchCustomersApi);
router.post('/api/admin/customers/quick-create', requireAuth, requirePermission('crm.customers.create'), verifyCsrf, materialController.quickCreateCustomerApi);

// 7. Dispatch Management
router.get('/admin/dispatch', requireAuth, requirePermission('dispatch.orders.view'), materialController.getDispatchListPage);
router.get('/admin/dispatch/:id', requireAuth, requirePermission('dispatch.orders.detail'), validateObjectId('id'), materialController.getDispatchViewPage);
router.post('/api/admin/dispatch', requireAuth, requirePermission('dispatch.orders.create'), verifyCsrf, materialController.createDispatch);
router.post('/api/admin/dispatch/:id/status', requireAuth, requirePermission('dispatch.orders.edit'), verifyCsrf, validateObjectId('id'), materialController.updateDispatchStatus);

// 8. Returns Management
router.get('/admin/returns', requireAuth, requirePermission('inventory.returns.view'), materialController.getReturnsListPage || materialController.getReturnsListPagePage);
router.get('/admin/returns/:id', requireAuth, requirePermission('inventory.returns.view'), validateObjectId('id'), materialController.getReturnViewPage);
router.post('/api/admin/returns', requireAuth, requirePermission('inventory.returns.create'), verifyCsrf, materialController.createReturnRequest);
router.post('/api/admin/returns/:id/approve', requireAuth, requirePermission('inventory.returns.approve'), verifyCsrf, validateObjectId('id'), materialController.inspectAndApproveReturn);
router.post('/api/admin/returns/:id/reject', requireAuth, requirePermission('inventory.returns.reject'), verifyCsrf, validateObjectId('id'), materialController.rejectReturn);

// =========================================================================
// WEBSITE ENQUIRIES MANAGEMENT (SURVEYS, FRANCHISE, COMPLAINTS)
// =========================================================================
router.get('/admin/enquiries/surveys', requireAuth, requirePermission('crm.surveys.view'), enquiryController.getSurveysPage);
router.post('/api/admin/enquiries/surveys/:id/status', requireAuth, requirePermission('crm.surveys.edit'), verifyCsrf, enquiryController.updateSurveyStatus);
router.post('/api/admin/enquiries/surveys/:id/delete', requireAuth, requirePermission('crm.surveys.delete'), verifyCsrf, enquiryController.deleteSurvey);

router.get('/admin/enquiries/franchise', requireAuth, requirePermission('franchise.applications.view'), enquiryController.getFranchiseApplicationsPage);
router.post('/api/admin/enquiries/franchise/:id/status', requireAuth, requirePermission('franchise.applications.edit'), verifyCsrf, enquiryController.updateFranchiseStatus);
router.post('/api/admin/enquiries/franchise/:id/delete', requireAuth, requirePermission('franchise.applications.delete'), verifyCsrf, enquiryController.deleteFranchiseApplication);
router.get('/admin/enquiries/complaints', requireAuth, requirePermission('complaints.tickets.view'), (req, res) => res.redirect('/admin/complaints'));

// =========================================================================
// DYNAMIC WEBSITE CONTENT MANAGEMENT SYSTEM (CMS)
// =========================================================================

// Services
router.get('/admin/website/services', requireAuth, requirePermission('cms.services.manage'), websiteCmsController.getServicesPage);
router.post('/api/admin/website/services', requireAuth, requirePermission('cms.services.manage'), verifyCsrf, websiteCmsController.createService);
router.post('/api/admin/website/services/:id/update', requireAuth, requirePermission('cms.services.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.updateService);
router.post('/api/admin/website/services/:id/delete', requireAuth, requirePermission('cms.services.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.deleteService);

// Products
router.get('/admin/website/products', requireAuth, requirePermission('cms.products.manage'), websiteCmsController.getProductsPage);
router.post('/api/admin/website/products', requireAuth, requirePermission('cms.products.manage'), verifyCsrf, websiteCmsController.createProduct);
router.post('/api/admin/website/products/:id/update', requireAuth, requirePermission('cms.products.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.updateProduct);
router.post('/api/admin/website/products/:id/delete', requireAuth, requirePermission('cms.products.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.deleteProduct);

// Projects
router.get('/admin/website/projects', requireAuth, requirePermission('cms.projects.manage'), websiteCmsController.getProjectsPage);
router.post('/api/admin/website/projects', requireAuth, requirePermission('cms.projects.manage'), verifyCsrf, websiteCmsController.createProject);
router.post('/api/admin/website/projects/:id/update', requireAuth, requirePermission('cms.projects.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.updateProject);
router.post('/api/admin/website/projects/:id/delete', requireAuth, requirePermission('cms.projects.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.deleteProject);

// Team & Founders
router.get('/admin/website/team', requireAuth, requirePermission('cms.team.manage'), websiteCmsController.getTeamPage);
router.post('/api/admin/website/team', requireAuth, requirePermission('cms.team.manage'), verifyCsrf, websiteCmsController.createTeamMember);
router.post('/api/admin/website/team/:id/update', requireAuth, requirePermission('cms.team.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.updateTeamMember);
router.post('/api/admin/website/team/:id/delete', requireAuth, requirePermission('cms.team.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.deleteTeamMember);

// Testimonials
router.get('/admin/website/testimonials', requireAuth, requirePermission('cms.testimonials.manage'), websiteCmsController.getTestimonialsPage);
router.post('/api/admin/website/testimonials', requireAuth, requirePermission('cms.testimonials.manage'), verifyCsrf, websiteCmsController.createTestimonial);
router.post('/api/admin/website/testimonials/:id/update', requireAuth, requirePermission('cms.testimonials.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.updateTestimonial);
router.post('/api/admin/website/testimonials/:id/delete', requireAuth, requirePermission('cms.testimonials.manage'), verifyCsrf, validateObjectId('id'), websiteCmsController.deleteTestimonial);

// Contact & Company Info
router.get('/admin/website/contact', requireAuth, requirePermission('cms.contact.manage'), websiteCmsController.getContactInfoPage);
router.post('/api/admin/website/contact', requireAuth, requirePermission('cms.contact.manage'), verifyCsrf, websiteCmsController.updateContactInfo);

// Home Page Quick Stats
router.get('/admin/website/quick-stats', requireAuth, requirePermission('cms.contact.manage'), websiteCmsController.getQuickStatsPage);
router.post('/api/admin/website/quick-stats', requireAuth, requirePermission('cms.contact.manage'), verifyCsrf, websiteCmsController.updateQuickStats);
router.post('/api/admin/website/quick-stats/reset', requireAuth, requirePermission('cms.contact.manage'), verifyCsrf, websiteCmsController.resetQuickStats);

module.exports = router;
