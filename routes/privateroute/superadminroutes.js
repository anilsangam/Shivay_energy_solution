const express = require('express');
const router = express.Router();

const adminController = require('../../controllers/adminController');
const customerController = require('../../controllers/customerController');
const quotationController = require('../../controllers/quotationController');
const projectController = require('../../controllers/projectController');
const materialController = require('../../controllers/materialController');
const websiteCmsController = require('../../controllers/websiteCmsController');
const enquiryController = require('../../controllers/enquiryController');

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

// =========================================================================
// PHASE 1: INDEPENDENT MATERIAL MANAGEMENT & INVENTORY FOUNDATION (RBAC: SUPER_ADMIN)
// =========================================================================

// 1. Material Master
router.get('/admin/materials', requireAuth, requireSuperAdmin, materialController.getMaterialsPage);
router.post('/api/admin/materials', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createMaterial);
router.get('/admin/materials/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getMaterialDetails);
router.post('/api/admin/materials/:id', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.updateMaterial);
router.post('/api/admin/materials/:id/status', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.toggleMaterialStatus);

// 2. Supplier Management
router.get('/admin/suppliers', requireAuth, requireSuperAdmin, materialController.getSuppliersPage);
router.post('/api/admin/suppliers', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createSupplier);
router.get('/api/admin/suppliers/search', requireAuth, requireSuperAdmin, materialController.searchSuppliersApi);
router.get('/admin/suppliers/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getSupplierDetails);
router.post('/api/admin/suppliers/:id', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.updateSupplier);
router.post('/api/admin/suppliers/:id/status', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.toggleSupplierStatus);

// 3. Purchase / Stock In
router.get('/admin/purchases', requireAuth, requireSuperAdmin, materialController.getPurchasesPage);
router.get('/admin/purchases/new', requireAuth, requireSuperAdmin, materialController.getNewPurchasePage);
router.post('/api/admin/purchases', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createPurchase);
router.get('/admin/purchases/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getPurchaseDetails);
router.post('/api/admin/purchases/:id/confirm', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.confirmPurchase);
router.post('/api/admin/purchases/:id/cancel', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.cancelPurchase);

// 4. Stock Inventory & Adjustments
router.get('/admin/inventory', requireAuth, requireSuperAdmin, materialController.getInventoryPage);
router.post('/api/admin/inventory/:id/selling-price', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.updateSellingPrice);
router.post('/api/admin/inventory/:id/adjust', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.adjustStock);
router.get('/api/admin/inventory/:id/history', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getMaterialHistoryApi);

// 5. Stock Reports & CSV Exports
router.get('/admin/inventory/reports', requireAuth, requireSuperAdmin, materialController.getStockReportsPage);
router.get('/api/admin/inventory/export/stock', requireAuth, requireSuperAdmin, materialController.exportStockCsv);
router.get('/api/admin/inventory/export/ledger', requireAuth, requireSuperAdmin, materialController.exportLedgerCsv);

// =========================================================================
// PHASE 2: MATERIAL SALES, STOCK OUT, DISPATCH & RETURNS (RBAC: SUPER_ADMIN)
// =========================================================================

// 6. Sales / Stock Out
router.get('/admin/sales-out', requireAuth, requireSuperAdmin, materialController.getSalesPage);
router.get('/admin/sales-out/new', requireAuth, requireSuperAdmin, materialController.getNewSalePage);
router.get('/admin/sales-out/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getSaleViewPage);
router.get('/admin/sales-out/:id/invoice', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getSaleInvoicePage);
router.post('/api/admin/sales', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createSale);
router.post('/api/admin/sales/:id/confirm', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.confirmSale);
router.post('/api/admin/sales/:id/cancel', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.cancelSale);
router.get('/api/admin/sales/export', requireAuth, requireSuperAdmin, materialController.exportSalesCsv);

// Route Aliases
router.get('/admin/sales', requireAuth, requireSuperAdmin, (req, res) => res.redirect('/admin/sales-out'));
router.get('/admin/sales/new', requireAuth, requireSuperAdmin, (req, res) => res.redirect('/admin/sales-out/new'));
router.get('/admin/sales/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), (req, res) => res.redirect(`/admin/sales-out/${req.params.id}`));
router.get('/admin/sales/:id/invoice', requireAuth, requireSuperAdmin, validateObjectId('id'), (req, res) => res.redirect(`/admin/sales-out/${req.params.id}/invoice`));

// Customer Search & Quick Create
router.get('/api/admin/customers/search', requireAuth, requireSuperAdmin, materialController.searchCustomersApi);
router.post('/api/admin/customers/quick-create', requireAuth, requireSuperAdmin, verifyCsrf, materialController.quickCreateCustomerApi);

// 7. Dispatch Management
router.get('/admin/dispatch', requireAuth, requireSuperAdmin, materialController.getDispatchListPage);
router.get('/admin/dispatch/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getDispatchViewPage);
router.post('/api/admin/dispatch', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createDispatch);
router.post('/api/admin/dispatch/:id/status', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.updateDispatchStatus);

// 8. Returns Management
router.get('/admin/returns', requireAuth, requireSuperAdmin, materialController.getReturnsListPage);
router.get('/admin/returns/:id', requireAuth, requireSuperAdmin, validateObjectId('id'), materialController.getReturnViewPage);
router.post('/api/admin/returns', requireAuth, requireSuperAdmin, verifyCsrf, materialController.createReturnRequest);
router.post('/api/admin/returns/:id/approve', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.inspectAndApproveReturn);
router.post('/api/admin/returns/:id/reject', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), materialController.rejectReturn);

// =========================================================================
// WEBSITE ENQUIRIES MANAGEMENT (SURVEYS, FRANCHISE, COMPLAINTS)
// =========================================================================
router.get('/admin/enquiries/surveys', requireAuth, requireSuperAdmin, enquiryController.getSurveysPage);
router.post('/api/admin/enquiries/surveys/:id/status', requireAuth, requireBranchManager, verifyCsrf, enquiryController.updateSurveyStatus);
router.post('/api/admin/enquiries/surveys/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, enquiryController.deleteSurvey);

router.get('/admin/enquiries/franchise', requireAuth, requireSuperAdmin, enquiryController.getFranchiseApplicationsPage);
router.post('/api/admin/enquiries/franchise/:id/status', requireAuth, requireBranchManager, verifyCsrf, enquiryController.updateFranchiseStatus);
router.post('/api/admin/enquiries/franchise/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, enquiryController.deleteFranchiseApplication);
router.get('/admin/enquiries/complaints', requireAuth, requireSuperAdmin, (req, res) => res.redirect('/admin/complaints'));

// =========================================================================
// DYNAMIC WEBSITE CONTENT MANAGEMENT SYSTEM (CMS)
// =========================================================================

// Services
router.get('/admin/website/services', requireAuth, requireSuperAdmin, websiteCmsController.getServicesPage);
router.post('/api/admin/website/services', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.createService);
router.post('/api/admin/website/services/:id/update', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.updateService);
router.post('/api/admin/website/services/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.deleteService);

// Products
router.get('/admin/website/products', requireAuth, requireSuperAdmin, websiteCmsController.getProductsPage);
router.post('/api/admin/website/products', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.createProduct);
router.post('/api/admin/website/products/:id/update', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.updateProduct);
router.post('/api/admin/website/products/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.deleteProduct);

// Projects
router.get('/admin/website/projects', requireAuth, requireSuperAdmin, websiteCmsController.getProjectsPage);
router.post('/api/admin/website/projects', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.createProject);
router.post('/api/admin/website/projects/:id/update', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.updateProject);
router.post('/api/admin/website/projects/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.deleteProject);

// Team & Founders
router.get('/admin/website/team', requireAuth, requireSuperAdmin, websiteCmsController.getTeamPage);
router.post('/api/admin/website/team', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.createTeamMember);
router.post('/api/admin/website/team/:id/update', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.updateTeamMember);
router.post('/api/admin/website/team/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.deleteTeamMember);

// Testimonials
router.get('/admin/website/testimonials', requireAuth, requireSuperAdmin, websiteCmsController.getTestimonialsPage);
router.post('/api/admin/website/testimonials', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.createTestimonial);
router.post('/api/admin/website/testimonials/:id/update', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.updateTestimonial);
router.post('/api/admin/website/testimonials/:id/delete', requireAuth, requireSuperAdmin, verifyCsrf, validateObjectId('id'), websiteCmsController.deleteTestimonial);

// Contact & Company Info
router.get('/admin/website/contact', requireAuth, requireSuperAdmin, websiteCmsController.getContactInfoPage);
router.post('/api/admin/website/contact', requireAuth, requireSuperAdmin, verifyCsrf, websiteCmsController.updateContactInfo);

module.exports = router;
