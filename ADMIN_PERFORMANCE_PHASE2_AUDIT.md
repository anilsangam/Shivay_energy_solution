# SHIVAY ENERGY SOLUTIONS — ADMIN PANEL PERFORMANCE OPTIMIZATION
## PHASE 2: DATABASE AUDIT & OPTIMIZATION PLAN

**Date:** November 19, 2026  
**Document:** `ADMIN_PERFORMANCE_PHASE2_AUDIT.md`  
**Scope:** Read-only audit of all database models, query execution paths, existing indexes, selective projection opportunities, and server-side pagination requirements across all admin panel modules.

---

## 1. Executive Summary

A comprehensive query-by-query audit across all 29 Mongoose schemas and 10 admin controllers revealed key structural database bottlenecks:
1. **Unindexed Collections (`COLLSCAN` on Sorts & Filters):**
   - `Invoice`, `Complaint`, `Enquiry`, `FranchiseApplication`, `Attendance`, and `Branch` possess only primary unique identifiers (`invoiceNumber`, `ticketId`, `enquiryId`, etc.).
   - All filter operations on `status`, `isArchived`, `branch`, or sorts by `{ createdAt: -1 }` force full collection scans (`COLLSCAN`) and in-memory sorts in MongoDB.
2. **Missing Compound Indexes:**
   - Multi-key filter + sort combinations (e.g. `{ branch: branchId, isArchived: false, createdAt: -1 }` on `Invoice`, `{ status: 'new', createdAt: -1 }` on `Enquiry`) lack compound index support, preventing index-covered scans (`IXSCAN`).
3. **Unbounded Full-Collection Dumps:**
   - `adminController.getReports` sequentially loads all `Project`, `Quotation`, and `Invoice` documents into Node.js RAM just to calculate sums and array lengths.
   - `quotationController.getAdminQuotations` loads all quotes and all requests with 4 deep populates on every page load to run an in-memory auto-heal loop.
4. **$N+1$ Sequential Count Queries:**
   - `adminController.getBranches` loops through all branches and fires $2 \times N$ sequential count queries (`User.countDocuments` and `Project.countDocuments`).
5. **Missing Server-Side Pagination:**
   - `Complaint` (`/admin/complaints`), `Enquiry` (`/admin/enquiries/surveys`), and `FranchiseApplication` (`/admin/enquiries/franchise`) have no pagination parameters, dumping all records into HTML on every request.

---

## 2. Query-by-Query Audit Matrix

| Module / Controller | Model | Filter Pattern | Sort Pattern | Existing Indexes | Proposed Index | Pagination Needed? | Projection Optimization | UI Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **Invoices**<br>`adminController.getInvoices`<br>`managerController.getInvoices` | `Invoice` | `{ isArchived: { $ne: true } }`<br>Or with `branch: ...`<br>Or `createdBy: ...` | `{ createdAt: -1 }` | `invoiceNumber: 1` (unique) | **1.** `{ isArchived: 1, createdAt: -1 }`<br>**2.** `{ branch: 1, isArchived: 1, createdAt: -1 }`<br>**3.** `{ createdBy: 1, isArchived: 1, createdAt: -1 }` | Deferred (Totals strip requires all records unless aggregated) | Retain full invoice document for print & modal editor. | Prefill dropdown relies on `projects` and `quotations`. Ledger totals ribbon sums subtotal and GST. |
| **Complaints**<br>`adminController.getComplaints` | `Complaint` | `{ status: statusFilter }` or `{}` | `{ createdAt: -1 }` | `ticketId: 1` (unique) | **1.** `{ status: 1, createdAt: -1 }`<br>**2.** `{ createdAt: -1 }` | **YES** (Default 20, max 100) | In `getComplaints`, replace full `DataStore.getUsers()` with `User.find({ role: 'EMPLOYEE' }).select('name employeeId mobile').lean()`. | Renders ticket table with status badges and assign modal. |
| **Solar Site Surveys**<br>`enquiryController.getSurveysPage` | `Enquiry` | `{ status: statusFilter }` or `{}` | `{ createdAt: -1 }` | `enquiryId: 1` (unique) | **1.** `{ status: 1, createdAt: -1 }`<br>**2.** `{ createdAt: -1 }` | **YES** (Default 20, max 100) | Use `.select()` for fields displayed in table. | Status filter pills, search input, status update modal. |
| **Franchise Applications**<br>`enquiryController.getFranchiseApplicationsPage` | `FranchiseApplication` | `{ status: statusFilter }` or `{}` | `{ createdAt: -1 }` | `applicationId: 1` (unique) | **1.** `{ status: 1, createdAt: -1 }`<br>**2.** `{ createdAt: -1 }` | **YES** (Default 20, max 100) | Use `.select()` for fields displayed in table. | Status filter pills, search input, status update modal. |
| **Quotations**<br>`quotationController.getAdminQuotations`<br>`getManagerQuotations` | `Quotation` | `{ isArchived: { $ne: true } }`<br>Optional: `status`, `branch`, `preparedBy` | `{ createdAt: -1 }` | `quotationNumber: 1`<br>`status: 1`<br>`preparedBy: 1`<br>`approvedBy: 1`<br>`customerId: 1`<br>`quotationRequestId: 1`<br>`createdAt: -1` | **1.** `{ isArchived: 1, createdAt: -1 }`<br>**2.** `{ branch: 1, isArchived: 1, createdAt: -1 }`<br>**3.** `{ status: 1, isArchived: 1, createdAt: -1 }` | Already paginated (`page`, `limit`). | In line 1300, `allQuotes` query for auto-heal can use `.select('quotationNumber customerMobile quotationRequestId').lean()`. | Full quotation details modal and document preview. |
| **Quotation Requests**<br>`quotationController.getManagerQuotations` | `QuotationRequest` | `{ status: ... }`, `{ branch: ... }`, `{ assignedEmployee: ... }` | `{ createdAt: -1 }` | `requestNumber: 1`<br>`status: 1`<br>`customer: 1`<br>`assignedEmployee: 1`<br>`branch: 1`<br>`createdAt: -1` | **1.** `{ branch: 1, createdAt: -1 }`<br>**2.** `{ status: 1, createdAt: -1 }`<br>**3.** `{ assignedEmployee: 1, createdAt: -1 }` | Already paginated (`skip`, `limit`). | In line 1321, `allRequests` for auto-heal can use `.select('requestNumber customerMobile linkedQuotation').lean()`. | Request verification & prepare quote workflow. |
| **Executive Reports**<br>`adminController.getReports` | `Project`<br>`Quotation`<br>`Invoice` | Read-only analytics across all 3 collections | `{ createdAt: -1 }` | See individual models | Compound indexes above cover these queries. | `recentProjects` limited to 15. | **1.** `Project`: use `.select('capacityKw status systemType branchId').lean()` for aggregates, `.limit(15)` for recent.<br>**2.** `Quotation`: replace full load with `countDocuments`.<br>**3.** `Invoice`: replace full load with `.select('totalAmount total status').lean()`. | Analytics KPI cards, category breakdown, branch metrics table. |
| **Branches & Regional Hubs**<br>`adminController.getBranches` | `Branch`<br>`User`<br>`Project` | Branch loop counting employees and active projects | `{ createdAt: -1 }` | `code: 1` (unique) | **1.** In `User`: `{ branchId: 1, role: 1 }`<br>**2.** In `Project`: `{ branch: 1, status: 1 }` | No (small dataset, typically <20 branches). | Parallelize $N+1$ loop via `Promise.all` to execute counts concurrently. | Branches table, manager card, staff & project counters. |
| **Material Sales & Orders**<br>`materialPhase2Controller.getSalesPage` | `MaterialSale` | `{ status: ... }`, `{ customer: ... }`, `{ project: ... }` | `{ saleDate: -1, createdAt: -1 }` | `saleNumber: 1`<br>`status: 1`<br>`customer: 1`<br>`project: 1`<br>`dispatchStatus: 1`<br>`saleDate: -1` | **1.** `{ status: 1, saleDate: -1 }`<br>**2.** `{ status: 1, createdAt: -1 }` | Already paginated (`page`, `limit`). | Already uses `.select()` on populated fields. | Sales order table, dispatch modal, invoice generation. |
| **Material Dispatches**<br>`materialPhase2Controller.getDispatchesPage` | `MaterialDispatch` | `{ status: ... }`, `{ sale: ... }` | `{ dispatchDate: -1, createdAt: -1 }` | `dispatchNumber: 1`<br>`sale: 1`<br>`dispatchDate: 1`<br>`status: 1`<br>`dispatchDate: -1` | **1.** `{ status: 1, dispatchDate: -1 }`<br>**2.** `{ status: 1, createdAt: -1 }` | Already paginated (`page`, `limit`). | Already projected. | Dispatch console, barcode tracking. |
| **Material Returns**<br>`materialPhase2Controller.getReturnsPage` | `MaterialReturn` | `{ status: ... }`, `{ sale: ... }` | `{ createdAt: -1 }` | `returnNumber: 1`<br>`sale: 1`<br>`status: 1`<br>`createdAt: -1` | **1.** `{ status: 1, createdAt: -1 }` | Already paginated (`page`, `limit`). | Already projected. | Return inspection, stock adjustment. |
| **Field Attendance**<br>`models/Attendance.js` | `Attendance` | `{ employee: ... }`, `{ branch: ... }`, `{ date: ... }` | `{ checkInTime: -1 }` | Zero indexes | **1.** `{ employee: 1, date: -1 }`<br>**2.** `{ branch: 1, date: -1 }` | In-memory DataStore (Phase 3 DB readiness). | Project scalar location & timestamp properties. | Manager attendance portal, GPS map coordinates. |

---

## 3. Detailed Index Justification & Execution Plan

### 3.1 `Invoice` Model Indexes
* **Current State:** Only `{ invoiceNumber: 1 }` (unique).
* **Problem:** Every invoice query filters by `{ isArchived: { $ne: true } }` and sorts by `{ createdAt: -1 }`. Without a compound index, MongoDB performs a `COLLSCAN` and in-memory sort on every invoice load.
* **Proposed Indexes:**
  ```javascript
  invoiceSchema.index({ isArchived: 1, createdAt: -1 });
  invoiceSchema.index({ branch: 1, isArchived: 1, createdAt: -1 });
  invoiceSchema.index({ createdBy: 1, isArchived: 1, createdAt: -1 });
  ```
* **Impact:** Eliminates full collection scans and provides index-ordered result sets directly from B-tree index structures (`IXSCAN`).

### 3.2 `Complaint` Model Indexes
* **Current State:** Only `{ ticketId: 1 }` (unique).
* **Problem:** `adminController.getComplaints` filters by `status` and sorts by `createdAt: -1`.
* **Proposed Indexes:**
  ```javascript
  complaintSchema.index({ status: 1, createdAt: -1 });
  complaintSchema.index({ createdAt: -1 });
  ```
* **Impact:** Direct index scan for status-filtered and global complaints lists.

### 3.3 `Enquiry` & `FranchiseApplication` Model Indexes
* **Current State:** Only `{ enquiryId: 1 }` and `{ applicationId: 1 }` (unique).
* **Problem:** Both lead management consoles sort by `{ createdAt: -1 }` with optional `status` filter.
* **Proposed Indexes:**
  ```javascript
  // In Enquiry.js
  enquirySchema.index({ status: 1, createdAt: -1 });
  enquirySchema.index({ createdAt: -1 });

  // In FranchiseApplication.js
  franchiseApplicationSchema.index({ status: 1, createdAt: -1 });
  franchiseApplicationSchema.index({ createdAt: -1 });
  ```

### 3.4 `Quotation` & `QuotationRequest` Model Indexes
* **Current State:** Has single-key indexes (`status: 1`, `preparedBy: 1`, `createdAt: -1`), but lacks compound index with `isArchived`.
* **Proposed Indexes:**
  ```javascript
  // In Quotation.js
  quotationSchema.index({ isArchived: 1, createdAt: -1 });
  quotationSchema.index({ branch: 1, isArchived: 1, createdAt: -1 });
  quotationSchema.index({ status: 1, isArchived: 1, createdAt: -1 });

  // In QuotationRequest.js
  quotationRequestSchema.index({ branch: 1, createdAt: -1 });
  quotationRequestSchema.index({ status: 1, createdAt: -1 });
  quotationRequestSchema.index({ assignedEmployee: 1, createdAt: -1 });
  ```

### 3.5 `Branch`, `User` & `Project` Count Optimization
* **Current State:** $N+1$ count queries inside `adminController.getBranches`.
* **Proposed Compound Indexes:**
  ```javascript
  // In User.js
  userSchema.index({ branchId: 1, role: 1 });

  // In Project.js
  projectSchema.index({ branch: 1, status: 1 });
  ```
* **Impact:** Converts `countDocuments` queries into fast, index-covered B-tree counts (`IXSCAN`).

### 3.6 `Attendance` Model Indexes
* **Proposed Indexes:**
  ```javascript
  attendanceSchema.index({ employee: 1, date: -1 });
  attendanceSchema.index({ branch: 1, date: -1 });
  ```

---

## 4. Implementation Steps for Phase 2

1. **Step 1: Schema Index Definitions**
   - Update `models/Invoice.js`
   - Update `models/Complaint.js`
   - Update `models/Enquiry.js`
   - Update `models/FranchiseApplication.js`
   - Update `models/Quotation.js`
   - Update `models/QuotationRequest.js`
   - Update `models/User.js`
   - Update `models/Project.js`
   - Update `models/Attendance.js`
2. **Step 2: Selective Query Projections & Memory Reductions**
   - In `adminController.getReports`:
     - Run `Project`, `Quotation`, and `Invoice` queries in parallel via `Promise.all()`.
     - Project scalar fields for metrics calculation.
     - Replace full collection quotation load with `Quotation.countDocuments(...)`.
     - Limit `recentProjects` to 15 records.
   - In `quotationController.getAdminQuotations`:
     - Apply `.select()` and `.lean()` to auto-heal queries (`allQuotes` and `allRequests`).
   - In `adminController.getComplaints`:
     - Replace full `DataStore.getUsers()` with `User.find({ role: 'EMPLOYEE' }).select('name employeeId mobile').lean()`.
   - In `adminController.getBranches`:
     - Execute branch employee and project counts in parallel with `Promise.all()`.
3. **Step 3: Server-Side Pagination Implementation**
   - Add pagination (`page = 1`, `limit = 20`, max 100) to `adminController.getComplaints`.
   - Add pagination (`page = 1`, `limit = 20`, max 100) to `enquiryController.getSurveysPage`.
   - Add pagination (`page = 1`, `limit = 20`, max 100) to `enquiryController.getFranchiseApplicationsPage`.
   - Add pagination footer component to `views/private/admin/complaints.ejs`, `views/private/admin/enquiries/surveys.ejs`, and `views/private/admin/enquiries/franchise.ejs`.
4. **Step 4: Comprehensive Verification & Benchmarking**
   - Run automated test battery.
   - Verify index creation on Mongoose schemas.
   - Verify pagination bounds, search query persistence, and status filtering.
   - Generate `ADMIN_PERFORMANCE_PHASE2_REPORT.md`.
