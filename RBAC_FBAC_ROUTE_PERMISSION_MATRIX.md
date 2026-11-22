# SHIVAY ENERGY SOLUTIONS — ROUTE-TO-PERMISSION MATRIX
## Comprehensive Mapping of Private Routes, APIs, Roles, Permissions, and Scopes
**Version:** 1.0.0 (Phase 1 Approved)  
**Author:** Antigravity AI Engineering Team  
**Date:** November 22, 2026

---

## 1. ROUTING ARCHITECTURE OVERVIEW

All private routes in Shivay Energy Solutions are mounted via [routes/webRoutes.js](file:///c:/rid/solar_panial/routes/webRoutes.js):
- `superadminroutes.js` (`/admin/*`, `/api/admin/*`)
- `managerroutes.js` (`/manager/*`)
- `employeeroutes.js` (`/employee/*`, `/api/*`, `/quotations/*`)
- `authroutes.js` (`/login`, `/logout`, `/api/auth/*`)

This document establishes the exact required permission key, action verb, role restrictions, data scoping, and cross-module dependencies for every private route.

---

## 2. SUPER ADMIN ROUTER (`superadminroutes.js`)

| HTTP Method | Route Path | Target Module | Required Permission Key | Required Role / Hierarchy | Data Scope / Ownership |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/admin` | `reports` | `reports.analytics.view` | `SUPER_ADMIN` | Global Company Dashboard |
| `GET` | `/admin/employees` | `users` | `users.employees.view` | `SUPER_ADMIN` | Global Staff Directory |
| `GET` | `/admin/managers` | `users` | `users.managers.view` | `SUPER_ADMIN` | Global Manager Directory |
| `GET` | `/admin/customers` | `crm` | `crm.customers.view` | `SUPER_ADMIN` | Global Customer Master |
| `GET` | `/admin/quotations` | `quotations` | `quotations.records.view` | `SUPER_ADMIN` | Global Quotations |
| `GET` | `/admin/quotations/new` | `quotations` | `quotations.requests.create` | `SUPER_ADMIN` | Global |
| `POST` | `/admin/quotations/new` | `quotations` | `quotations.requests.create` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/quotations/request/:id` | `quotations` | `quotations.requests.view` | `SUPER_ADMIN` | Global |
| `POST` | `/admin/quotations/request/:id/status` | `quotations` | `quotations.requests.reject` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/quotations/prepare/:requestId` | `quotations` | `quotations.preparation.view` | `SUPER_ADMIN` | Global |
| `POST` | `/admin/quotations/preview-financials` | `quotations` | `quotations.preparation.create` | `SUPER_ADMIN` | Global |
| `POST` | `/admin/quotations/save-prepared` | `quotations` | `quotations.preparation.create` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/quotations/:id` | `quotations` | `quotations.records.detail` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/quotations/:id/edit` | `quotations` | `quotations.preparation.create` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/quotations/:id/document` | `quotations` | `quotations.document.view` | `SUPER_ADMIN` | Global |
| `POST` | `/admin/quotations/:id/approve` | `quotations` | `quotations.approval.approve` | `SUPER_ADMIN` | Global (Maker-Checker) |
| `POST` | `/admin/quotations/:id/reject` | `quotations` | `quotations.approval.reject` | `SUPER_ADMIN` | Global (Maker-Checker) |
| `POST` | `/admin/quotations/:id/archive` | `quotations` | `quotations.archive.manage` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/projects` | `projects` | `projects.records.view` | `SUPER_ADMIN` | Global Projects |
| `GET` | `/admin/projects/:id` | `projects` | `projects.records.detail` | `SUPER_ADMIN` | Global Project Detail |
| `POST` | `/admin/projects/:id/status` | `projects` | `projects.status.edit` | `SUPER_ADMIN` | Global Project |
| `POST` | `/admin/projects/:id/tasks` | `projects` | `projects.tasks.create` | `SUPER_ADMIN` | Global Project |
| `POST` | `/admin/projects/:id/assign` | `projects` | `projects.assignment.assign` | `SUPER_ADMIN` | Global Project |
| `POST` | `/admin/projects/:id/materials/:materialId` | `projects` | `projects.materials.manage` | `SUPER_ADMIN` | Global Project |
| `POST` | `/admin/projects/:id/complete` | `projects` | `projects.completion.approve` | `SUPER_ADMIN` | Global Project |
| `POST` | `/admin/projects/:id/documents` | `projects` | `projects.documents.create` | `SUPER_ADMIN` | Global Project |
| `GET` | `/admin/projects/:id/documents/:documentId` | `projects` | `projects.documents.view` | `SUPER_ADMIN` | Global Project |
| `GET` | `/admin/invoices` | `invoices` | `invoices.records.view` | `SUPER_ADMIN` | Global Invoices |
| `GET` | `/admin/reports` | `reports` | `reports.analytics.view` | `SUPER_ADMIN` | Global Reports |
| `GET` | `/api/admin/reports/export/:type` | `reports` | `reports.analytics.export` | `SUPER_ADMIN` | Global Reports CSV |
| `GET` | `/admin/activity-logs` | `settings` | `settings.audit_logs.view` | `SUPER_ADMIN` | Global Audit Logs |
| `GET` | `/admin/settings` | `settings` | `settings.general.view` | `SUPER_ADMIN` | Global Settings |
| `GET` | `/admin/profile` | (Profile) | `auth` | Any Authenticated | Self Profile |
| `GET` | `/admin/branches` | `branches` | `branches.offices.view` | `SUPER_ADMIN` | Global Branches |
| `GET` | `/admin/enquiries` | `crm` | `crm.enquiries.view` | `SUPER_ADMIN` | Global Inquiries |
| `GET` | `/admin/complaints` | `complaints` | `complaints.tickets.view` | `SUPER_ADMIN` | Global Complaints |
| `POST` | `/api/admin/complaints/status` | `complaints` | `complaints.tickets.edit` | `MANAGER` / `SUPER_ADMIN` | Branch Scoped |
| `POST` | `/api/admin/enquiries/status` | `crm` | `crm.enquiries.edit` | `MANAGER` / `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/quotations/save` | `quotations` | `quotations.preparation.create` | `MANAGER` / `SUPER_ADMIN` | Branch Scoped |
| `POST` | `/api/admin/invoices/save` | `invoices` | `invoices.records.create` | `MANAGER` / `SUPER_ADMIN` | Branch Scoped |
| `POST` | `/api/admin/invoices/delete` | `invoices` | `invoices.records.delete` | `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/users/create` | `users` | `users.employees.create` | `SUPER_ADMIN` | Global User Provisioning |
| `POST` | `/api/admin/users/status` | `users` | `users.employees.manage` | `MANAGER` / `SUPER_ADMIN` | Branch Scoped (Staff Only) |
| `POST` | `/api/admin/users/reset-password` | `users` | `users.employees.manage` | `SUPER_ADMIN` | Global Password Reset |
| `POST` | `/api/admin/employees/assign-manager` | `users` | `users.employees.manage` | `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/branches/create` | `branches` | `branches.offices.create` | `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/branches/update` | `branches` | `branches.offices.edit` | `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/branches/status` | `branches` | `branches.offices.manage` | `SUPER_ADMIN` | Global |
| `POST` | `/api/admin/settings/save` | `settings` | `settings.general.edit` | `SUPER_ADMIN` | Global |
| `GET` | `/admin/materials` | `material` | `material.catalog.view` | Delegable to Staff | Global Catalog |
| `POST` | `/api/admin/materials` | `material` | `material.catalog.create` | Delegable to Staff | Global Catalog |
| `GET` | `/admin/materials/:id` | `material` | `material.catalog.view` | Delegable to Staff | Global Catalog |
| `POST` | `/api/admin/materials/:id` | `material` | `material.catalog.edit` | Delegable to Staff | Global Catalog |
| `POST` | `/api/admin/materials/:id/status` | `material` | `material.catalog.manage` | Delegable to Staff | Global Catalog |
| `GET` | `/admin/suppliers` | `material` | `material.suppliers.view` | Delegable to Staff | Global Suppliers |
| `POST` | `/api/admin/suppliers` | `material` | `material.suppliers.create` | Delegable to Staff | Global Suppliers |
| `GET` | `/api/admin/suppliers/search` | `material` | `material.suppliers.view` | Delegable to Staff | Supplier Search |
| `GET` | `/admin/suppliers/:id` | `material` | `material.suppliers.view` | Delegable to Staff | Global Suppliers |
| `POST` | `/api/admin/suppliers/:id` | `material` | `material.suppliers.edit` | Delegable to Staff | Global Suppliers |
| `POST` | `/api/admin/suppliers/:id/status` | `material` | `material.suppliers.manage` | Delegable to Staff | Global Suppliers |
| `GET` | `/admin/purchases` | `inventory` | `inventory.purchases.view` | Delegable to Staff | Global Purchases |
| `GET` | `/admin/purchases/new` | `inventory` | `inventory.purchases.create` | Delegable to Staff | Purchase Order Form |
| `POST` | `/api/admin/purchases` | `inventory` | `inventory.purchases.create` | Delegable to Staff | PO Creation |
| `GET` | `/admin/purchases/:id` | `inventory` | `inventory.purchases.view` | Delegable to Staff | PO Details |
| `POST` | `/api/admin/purchases/:id/confirm` | `inventory` | `inventory.purchases.approve` | `MANAGER` / `SUPER_ADMIN` | Stock Inwarding Approval |
| `POST` | `/api/admin/purchases/:id/cancel` | `inventory` | `inventory.purchases.reject` | `MANAGER` / `SUPER_ADMIN` | PO Cancellation |
| `GET` | `/admin/inventory` | `inventory` | `inventory.stock.view` | Delegable to Staff | Warehouse Stock |
| `POST` | `/api/admin/inventory/:id/selling-price` | `inventory` | `inventory.stock.manage` | `SUPER_ADMIN` | Price Configuration |
| `POST` | `/api/admin/inventory/:id/adjust` | `inventory` | `inventory.adjustments.manage` | `MANAGER` / `SUPER_ADMIN` | Stock Adjustment Audit |
| `GET` | `/api/admin/inventory/:id/history` | `inventory` | `inventory.history.view` | Delegable to Staff | Stock Ledger History |
| `GET` | `/admin/inventory/reports` | `inventory` | `inventory.reports.view` | Delegable to Staff | Inventory Valuation |
| `GET` | `/api/admin/inventory/export/stock` | `inventory` | `inventory.reports.export` | Delegable to Staff | Stock CSV Export |
| `GET` | `/api/admin/inventory/export/ledger` | `inventory` | `inventory.reports.export` | Delegable to Staff | Ledger CSV Export |
| `GET` | `/admin/sales-out` | `inventory` | `inventory.sales_out.view` | Delegable to Staff | Sales Out Register |
| `GET` | `/admin/sales-out/new` | `inventory` | `inventory.sales_out.create` | Delegable to Staff | Sales Out Form |
| `GET` | `/admin/sales-out/:id` | `inventory` | `inventory.sales_out.view` | Delegable to Staff | Sales Out Detail |
| `GET` | `/admin/sales-out/:id/invoice` | `invoices` | `invoices.records.view` | Delegable to Staff | Sales Invoice |
| `POST` | `/api/admin/sales` | `inventory` | `inventory.sales_out.create` | Delegable to Staff | Create Sale Order |
| `POST` | `/api/admin/sales/:id/confirm` | `inventory` | `inventory.sales_out.approve` | `MANAGER` / `SUPER_ADMIN` | Finalize Stock Out |
| `POST` | `/api/admin/sales/:id/cancel` | `inventory` | `inventory.sales_out.reject` | `MANAGER` / `SUPER_ADMIN` | Cancel Sale Order |
| `GET` | `/api/admin/sales/export` | `inventory` | `inventory.sales_out.export` | Delegable to Staff | Sales CSV Export |
| `GET` | `/admin/dispatch` | `dispatch` | `dispatch.orders.view` | Delegable to Staff | Dispatch Queue |
| `GET` | `/admin/dispatch/:id` | `dispatch` | `dispatch.orders.detail` | Delegable to Staff | Dispatch Slip |
| `POST` | `/api/admin/dispatch` | `dispatch` | `dispatch.orders.create` | Delegable to Staff | Create Shipment |
| `POST` | `/api/admin/dispatch/:id/status` | `dispatch` | `dispatch.orders.edit` | Delegable to Staff | Update Tracking Status |
| `GET` | `/admin/returns` | `inventory` | `inventory.returns.view` | Delegable to Staff | Returns Queue |
| `GET` | `/admin/returns/:id` | `inventory` | `inventory.returns.view` | Delegable to Staff | Return View |
| `POST` | `/api/admin/returns` | `inventory` | `inventory.returns.create` | Delegable to Staff | Create Return Order |
| `POST` | `/api/admin/returns/:id/approve` | `inventory` | `inventory.returns.approve` | `MANAGER` / `SUPER_ADMIN` | Restock Approval |
| `POST` | `/api/admin/returns/:id/reject` | `inventory` | `inventory.returns.reject` | `MANAGER` / `SUPER_ADMIN` | Return Rejection |
| `GET` | `/admin/enquiries/surveys` | `crm` | `crm.surveys.view` | Delegable to Staff | Solar Survey Leads |
| `POST` | `/api/admin/enquiries/surveys/:id/status` | `crm` | `crm.surveys.edit` | Delegable to Staff | Advance Survey Lead |
| `POST` | `/api/admin/enquiries/surveys/:id/delete` | `crm` | `crm.surveys.delete` | `SUPER_ADMIN` | Delete Lead |
| `GET` | `/admin/enquiries/franchise` | `franchise` | `franchise.applications.view` | Delegable to Staff | Franchise Leads |
| `POST` | `/api/admin/enquiries/franchise/:id/status` | `franchise` | `franchise.applications.edit` | Delegable to Staff | Process Application |
| `POST` | `/api/admin/enquiries/franchise/:id/delete` | `franchise` | `franchise.applications.delete` | `SUPER_ADMIN` | Delete Application |
| `GET` | `/admin/website/*` | `cms` | `cms.*.manage` | Delegable to Staff | Public Website CMS |
| `POST` | `/api/admin/website/*` | `cms` | `cms.*.manage` | Delegable to Staff | Public Website Mutations |

---

## 3. BRANCH MANAGER ROUTER (`managerroutes.js`)

| HTTP Method | Route Path | Target Module | Required Permission Key | Required Role | Data Scope / Ownership |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/manager/dashboard` | (Portal) | `auth` | `BRANCH_MANAGER` | Branch Overview |
| `GET` | `/manager/employees` | `users` | `users.employees.view` | `BRANCH_MANAGER` | Branch Staff Only |
| `GET` | `/manager/attendance` | `attendance` | `attendance.branch.view` | `BRANCH_MANAGER` | Branch Staff Attendance |
| `GET` | `/manager/quotations` | `quotations` | `quotations.records.view` | `BRANCH_MANAGER` | Branch Quotations |
| `GET` | `/manager/quotations/new` | `quotations` | `quotations.requests.create` | `BRANCH_MANAGER` | Branch Creation |
| `POST` | `/manager/quotations/new` | `quotations` | `quotations.requests.create` | `BRANCH_MANAGER` | Branch Submission |
| `GET` | `/manager/quotations/request/:id` | `quotations` | `quotations.requests.view` | `BRANCH_MANAGER` | Branch Request Detail |
| `POST` | `/manager/quotations/request/:id/status` | `quotations` | `quotations.requests.reject` | `BRANCH_MANAGER` | Branch Rejection |
| `GET` | `/manager/quotations/prepare/:requestId` | `quotations` | `quotations.preparation.view` | `BRANCH_MANAGER` | Branch Worksheet |
| `POST` | `/manager/quotations/preview-financials` | `quotations` | `quotations.preparation.create` | `BRANCH_MANAGER` | Branch Preview |
| `POST` | `/manager/quotations/save-prepared` | `quotations` | `quotations.preparation.create` | `BRANCH_MANAGER` | Branch Save Prepared |
| `GET` | `/manager/quotations/:id` | `quotations` | `quotations.records.detail` | `BRANCH_MANAGER` | Branch Quote Detail |
| `GET` | `/manager/quotations/:id/edit` | `quotations` | `quotations.preparation.create` | `BRANCH_MANAGER` | Branch Quote Edit |
| `GET` | `/manager/quotations/:id/document` | `quotations` | `quotations.document.view` | `BRANCH_MANAGER` | Branch PDF Document |
| `POST` | `/manager/quotations/:id/approve` | `quotations` | `quotations.approval.approve` | `BRANCH_MANAGER` | Maker-Checker Approval |
| `POST` | `/manager/quotations/:id/reject` | `quotations` | `quotations.approval.reject` | `BRANCH_MANAGER` | Maker-Checker Rejection |
| `POST` | `/manager/quotations/:id/archive` | `quotations` | `quotations.archive.manage` | `BRANCH_MANAGER` | Branch Archive |
| `GET` | `/manager/projects` | `projects` | `projects.records.view` | `BRANCH_MANAGER` | Branch Projects |
| `GET` | `/manager/projects/:id` | `projects` | `projects.records.detail` | `BRANCH_MANAGER` | Branch Project Detail |
| `POST` | `/manager/projects/:id/status` | `projects` | `projects.status.edit` | `BRANCH_MANAGER` | Branch Project |
| `POST` | `/manager/projects/:id/site-visit/review` | `projects` | `projects.site_visit.approve` | `BRANCH_MANAGER` | Survey Approval |
| `POST` | `/manager/projects/:id/tasks` | `projects` | `projects.tasks.create` | `BRANCH_MANAGER` | Branch Tasks |
| `POST` | `/manager/projects/:id/tasks/:taskId/status` | `projects` | `projects.tasks.edit` | `BRANCH_MANAGER` | Branch Task Status |
| `POST` | `/manager/projects/:id/assign` | `projects` | `projects.assignment.assign` | `BRANCH_MANAGER` | Assign Branch Engineer |
| `POST` | `/manager/projects/:id/materials/:materialId` | `projects` | `projects.materials.manage` | `BRANCH_MANAGER` | Allocate Equipment |
| `POST` | `/manager/projects/:id/complete` | `projects` | `projects.completion.approve` | `BRANCH_MANAGER` | Commission Project |
| `POST` | `/manager/projects/:id/documents` | `projects` | `projects.documents.create` | `BRANCH_MANAGER` | Upload Document |
| `GET` | `/manager/projects/:id/documents/:documentId` | `projects` | `projects.documents.view` | `BRANCH_MANAGER` | Download Document |
| `GET` | `/manager/invoices` | `invoices` | `invoices.records.view` | `BRANCH_MANAGER` | Branch Invoices |
| `GET` | `/manager/profile` | (Profile) | `auth` | `BRANCH_MANAGER` | Self Profile |

---

## 4. EMPLOYEE ROUTER (`employeeroutes.js`)

| HTTP Method | Route Path | Target Module | Required Permission Key | Required Role | Data Scope / Ownership |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/employee/attendance` | `attendance` | `attendance.personal.view` | `EMPLOYEE` | Own Attendance Punches |
| `POST` | `/api/attendance` | `attendance` | `attendance.punch.create` | `EMPLOYEE` | Geo-Fenced GPS Punch |
| `GET` | `/employee/quotations` | `quotations` | `quotations.records.view` | `EMPLOYEE` | Own Created Quotations |
| `GET` | `/employee/quotations/new` | `quotations` | `quotations.requests.create` | `EMPLOYEE` | New Solar Request Form |
| `POST` | `/employee/quotations/new` | `quotations` | `quotations.requests.create` | `EMPLOYEE` | Request Intake |
| `GET` | `/employee/quotations/request/:id` | `quotations` | `quotations.requests.view` | `EMPLOYEE` | Own Request Detail |
| `POST` | `/employee/quotations/request/:id/resubmit` | `quotations` | `quotations.requests.edit` | `EMPLOYEE` | Own Returned Request |
| `GET` | `/employee/quotations/:id` | `quotations` | `quotations.records.detail` | `EMPLOYEE` | Own Quote View |
| `GET` | `/employee/quotations/:id/document` | `quotations` | `quotations.document.view` | `EMPLOYEE` | Own Branded PDF |
| `POST` | `/employee/quotations/:id/customer-response` | `quotations` | `quotations.customer_response.edit` | `EMPLOYEE` | Log Client Feedback |
| `GET` | `/employee/projects` | `projects` | `projects.records.view` | `EMPLOYEE` | Assigned Projects Only |
| `GET` | `/employee/projects/:id` | `projects` | `projects.records.detail` | `EMPLOYEE` | Assigned Project Detail |
| `POST` | `/employee/projects/:id/status` | `projects` | `projects.status.edit` | `EMPLOYEE` | Assigned Project Stage |
| `POST` | `/employee/projects/:id/site-visit` | `projects` | `projects.site_visit.create` | `EMPLOYEE` | Submit Field Measurements |
| `POST` | `/employee/projects/:id/tasks/:taskId/status` | `projects` | `projects.tasks.edit` | `EMPLOYEE` | Assigned Task Checkoff |
| `POST` | `/employee/projects/:id/documents` | `projects` | `projects.documents.create` | `EMPLOYEE` | Upload Field Photos |
| `GET` | `/employee/projects/:id/documents/:documentId` | `projects` | `projects.documents.view` | `EMPLOYEE` | Download Assigned Docs |
| `GET` | `/employee/profile` | (Profile) | `auth` | `EMPLOYEE` | Self Profile |

---

## 5. CROSS-MODULE SHARED ENDPOINTS (EXPLICIT OR LOGIC)

| HTTP Method | Route Path | Modules Involved | Permission Logic (OR Condition) | Justification |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/customers/search` | `crm` OR `quotations` | `crm.search.view` OR `quotations.requests.create` | Staff creating a quote must look up existing customer mobile numbers without needing full CRM access |
| `POST` | `/api/customers/create` | `crm` OR `quotations` | `crm.customers.create` OR `quotations.requests.create` | Quick customer onboarding inside the quotation drafting wizard |
| `GET` | `/attachments/:filename` | `projects` OR `quotations` | `projects.documents.view` OR `quotations.document.view` | Secure serving of uploaded customer DISCOM sanctions and roof survey photos |
