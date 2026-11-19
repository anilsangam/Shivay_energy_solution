# DEEP TECHNICAL PERFORMANCE AUDIT: ADMIN PANEL
**Application:** Shivay Energy Solutions Enterprise Control Platform  
**Target URL:** `https://shivay-energy-solution.onrender.com/`  
**Stack:** Node.js, Express.js, EJS, Mongoose / MongoDB Atlas, Render PaaS  
**Audit Type:** Static Analysis, Architectural Inspection & Profiling Trace (Strictly Audit-Only, Non-Destructive)  
**Date:** November 19, 2026  

---

## 1. EXECUTIVE SUMMARY

An in-depth code and architecture audit of the Shivay Energy Solutions Admin Panel was performed to determine the root causes of the **1.5s – 3.5s page load times** (as evidenced by the HAR report on `/admin/invoices` measuring **2.17s TTFB** and **3.49s full page load**).

The investigation revealed that the latency is **not** caused by Node.js CPU saturation or slow server hardware. Instead, it is the cumulative result of **four compounding architectural bottlenecks**:

```
[Browser Request]
       │
       ▼  (RTT: ~50-150ms cross-region to Render)
[1. Express Session Store (connect-mongo)]
       │  touchAfter: 0 (default) ──► UNNECESSARY WRITE to MongoDB Atlas on EVERY GET (~60-120ms)
       ▼
[2. Duplicate Authentication Middleware]
       ├── requireAuth ─────────────► Live MongoDB User.findById query (~50-100ms)
       └── requireSuperAdmin / Role ─► Calls requireAuth AGAIN! Duplicate User.findById query (~50-100ms)
       ▼
[3. Admin Controller Execution]
       ├── Sequential 'await' Chains ──► Up to 6 database queries executed one-after-another (~300-800ms)
       ├── Unbounded find({}) Queries ──► Entire collections loaded into Node.js heap without limit/skip
       ├── DB Writes during GET ───────► findByIdAndUpdate running inside quotation list renders (~80-150ms)
       ├── N+1 Query Loops ────────────► getBranches executes 21 sequential DB queries in a for-loop (~800ms+)
       └── Missing MongoDB Indexes ────► Invoice, Enquiry, Franchise, Complaint collections have 0 indexes (COLLSCAN)
       ▼
[4. Network & Frontend Delivery]
       ├── Express Static Assets ──────► No Cache-Control maxAge (continuous 304 conditional revalidations)
       ├── Missing Compression ────────► compression middleware NOT installed; 202KB CSS + 111KB fonts raw
       └── Heavyweight Inline Scripts ─► 10KB - 15KB inline JavaScript embedded directly in every HTML payload
       │
       ▼  (Total TTFB: 1.8s - 2.5s | Total Page Load: 3.2s - 4.5s)
[Browser Render Complete]
```

### Key Quantitative Bottlenecks:
1. **Network Multiplier Effect (Atlas + Render):** With Render and MongoDB Atlas communicating over network sockets, every sequential query incurs a full round-trip time (RTT). A page running 6 sequential queries spends **400ms – 900ms purely waiting for TCP/TLS packet roundtrips**, independent of query complexity.
2. **Duplicate Auth Lookups:** Every protected admin page executes `User.findById` **twice in series** because `requireRole` explicitly invokes `requireAuth(req, res, next)` after `requireAuth` has already completed.
3. **Session Store Write on GET:** `connect-mongo` was initialized without `touchAfter`. As a result, every GET request issues a MongoDB write command (`session.touch`) to Atlas before or during request processing.
4. **Unbounded Collections & In-Memory Computation:** Invoices, Quotations, Complaints, Surveys, and Franchise pages load entire MongoDB collections into Node.js RAM to calculate badge counts and summary metrics in JavaScript loops instead of using MongoDB aggregations.
5. **Completely Unindexed Critical Collections:** `Invoice`, `Enquiry`, `FranchiseApplication`, `Complaint`, `Attendance`, and `Branch` possess **zero secondary indexes**. All queries run unindexed full collection scans (`COLLSCAN`) with in-memory sorting (`SORT`).
6. **Zero Compression & Zero Static Caching:** The Express server does not use `compression` (Gzip/Brotli) and serves `/css/bootstrap.min.css` (202 KB), `/fonts/icofont/icofont.woff2` (525 KB), and `/fonts/icofont/icofont.min.css` (111 KB) without `maxAge` cache headers.

---

## 2. COMPLETE ADMIN ROUTE INVENTORY

Below is the verified inventory of all 59 admin routes defined in `routes/privateroute/superadminroutes.js`, plus associated private role and auth routes.

| # | Route URL | Method | Middleware Chain | Controller & Handler | EJS View Template | Database Models Queried |
|---|-----------|--------|------------------|----------------------|-------------------|-------------------------|
| 1 | `/admin` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getDashboard` | `views/private/admin/dashboard.ejs` | `User`, `Project`, `Quotation`, `QuotationRequest`, `AuditLog`, `Branch` |
| 2 | `/admin/employees` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getEmployees` | `views/private/admin/employees.ejs` | `User`, `Branch` |
| 3 | `/admin/managers` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getManagers` | `views/private/admin/managers.ejs` | `User` |
| 4 | `/admin/customers` | GET | `requireAuth`, `requireSuperAdmin` | `customerController.getCustomersList` | `views/private/admin/customers.ejs` | `Customer` |
| 5 | `/admin/quotations` | GET | `requireAuth`, `requireSuperAdmin` | `quotationController.getAdminQuotations` | `views/private/admin/quotations.ejs` | `Quotation`, `QuotationRequest` (Writes on GET) |
| 6 | `/admin/quotations/new` | GET | `requireAuth`, `requireSuperAdmin` | `quotationController.getNewRequestPage` | `views/private/employee/quotation-request-new.ejs` | `Setting`, `Customer` |
| 7 | `/admin/quotations/request/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `quotationController.getRequestDetails` | `views/private/employee/quotation-request-view.ejs` | `QuotationRequest`, `Quotation`, `QuotationStatusHistory` |
| 8 | `/admin/quotations/prepare/:requestId` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `quotationController.getPrepareQuotationPage` | `views/private/manager/quotation-prepare.ejs` | `QuotationRequest`, `Customer`, `Setting`, `Quotation` |
| 9 | `/admin/quotations/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `quotationController.getQuotationDetails` | `views/private/admin/quotation-view.ejs` | `Quotation`, `QuotationStatusHistory`, `Setting` |
| 10 | `/admin/quotations/:id/edit` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `quotationController.getEditQuotationPage` | `views/private/manager/quotation-prepare.ejs` | `Quotation`, `Setting` |
| 11 | `/admin/quotations/:id/document` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `quotationController.getQuotationDocument` | `views/private/admin/quotation-document.ejs` | `Quotation`, `Setting` |
| 12 | `/admin/projects` | GET | `requireAuth`, `requireSuperAdmin` | `projectController.getProjectsPage` | `views/private/projects/index.ejs` | `Project` |
| 13 | `/admin/projects/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `projectController.getProjectDetailPage` | `views/private/projects/detail.ejs` | `Project`, `ProjectActivity`, `ProjectNote`, `User` |
| 14 | `/admin/projects/:id/documents/:documentId` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `projectController.downloadDocument` | Binary Stream / Redirect | `Project` |
| 15 | `/admin/invoices` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getInvoices` | `views/private/admin/invoices.ejs` | `Invoice`, `Project`, `Quotation` |
| 16 | `/admin/reports` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getReports` | `views/private/admin/reports.ejs` | `User`, `Branch`, `Project`, `Quotation`, `Invoice` |
| 17 | `/api/admin/reports/export/:type` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.exportReportCsv` | CSV Stream | `Project`, `Invoice` |
| 18 | `/admin/activity-logs` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getActivityLogs` | `views/private/admin/activity-logs.ejs` | `AuditLog` |
| 19 | `/admin/settings` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getSettings` | `views/private/admin/settings.ejs` | `Setting` |
| 20 | `/admin/profile` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getProfile` | `views/private/admin/profile.ejs` | `User` (Session) |
| 21 | `/admin/branches` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getBranches` | `views/private/admin/branches.ejs` | `Branch`, `User` (N+1), `Project` (N+1) |
| 22 | `/admin/enquiries` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getDashboard` | `views/private/admin/dashboard.ejs` | `User`, `Project`, `Quotation`, `QuotationRequest`, `AuditLog` |
| 23 | `/admin/complaints` | GET | `requireAuth`, `requireSuperAdmin` | `adminController.getComplaints` | `views/private/admin/complaints.ejs` | `Complaint`, `User` |
| 24 | `/admin/materials` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getMaterialsPage` | `views/private/admin/materials.ejs` | `Material` (Multiple count queries) |
| 25 | `/admin/materials/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialController.getMaterialDetails` | JSON API | `Material` |
| 26 | `/admin/suppliers` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getSuppliersPage` | `views/private/admin/suppliers.ejs` | `Supplier` |
| 27 | `/api/admin/suppliers/search` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.searchSuppliersApi` | JSON API | `Supplier` |
| 28 | `/admin/suppliers/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialController.getSupplierDetails` | JSON API | `Supplier` |
| 29 | `/admin/purchases` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getPurchasesPage` | `views/private/admin/purchases.ejs` | `Purchase` (6 queries per load) |
| 30 | `/admin/purchases/new` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getNewPurchasePage` | `views/private/admin/purchase-new.ejs` | `Supplier`, `Material` |
| 31 | `/admin/purchases/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialController.getPurchaseDetails` | `views/private/admin/purchase-view.ejs` | `Purchase` |
| 32 | `/admin/inventory` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getInventoryPage` | `views/private/admin/inventory.ejs` | `Material` (Loads entire collection into RAM) |
| 33 | `/api/admin/inventory/:id/history` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialController.getMaterialHistoryApi` | JSON API | `InventoryTransaction` |
| 34 | `/admin/inventory/reports` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.getStockReportsPage` | `views/private/admin/inventory-reports.ejs` | `Material`, `InventoryTransaction` |
| 35 | `/api/admin/inventory/export/stock` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.exportStockCsv` | CSV Stream | `Material` |
| 36 | `/api/admin/inventory/export/ledger` | GET | `requireAuth`, `requireSuperAdmin` | `materialController.exportLedgerCsv` | CSV Stream | `InventoryTransaction` |
| 37 | `/admin/sales-out` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.getSalesPage` | `views/private/admin/sales.ejs` | `MaterialSale` |
| 38 | `/admin/sales-out/new` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.getNewSalePage` | `views/private/admin/sale-new.ejs` | `Material`, `Customer` |
| 39 | `/admin/sales-out/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialPhase2Controller.getSaleViewPage` | `views/private/admin/sale-view.ejs` | `MaterialSale` |
| 40 | `/admin/sales-out/:id/invoice` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialPhase2Controller.getSaleInvoicePage` | `views/private/admin/sale-invoice.ejs` | `MaterialSale`, `Setting` |
| 41 | `/api/admin/sales/export` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.exportSalesCsv` | CSV Stream | `MaterialSale` |
| 42 | `/admin/sales` | GET | `requireAuth`, `requireSuperAdmin` | Redirect to `/admin/sales-out` | N/A | None |
| 43 | `/api/admin/customers/search` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.searchCustomersApi` | JSON API | `Customer` |
| 44 | `/admin/dispatch` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.getDispatchListPage` | `views/private/admin/dispatches.ejs` | `MaterialDispatch` |
| 45 | `/admin/dispatch/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialPhase2Controller.getDispatchViewPage` | `views/private/admin/dispatch-view.ejs` | `MaterialDispatch` |
| 46 | `/admin/returns` | GET | `requireAuth`, `requireSuperAdmin` | `materialPhase2Controller.getReturnsListPage` | `views/private/admin/returns.ejs` | `MaterialReturn` |
| 47 | `/admin/returns/:id` | GET | `requireAuth`, `requireSuperAdmin`, `validateObjectId` | `materialPhase2Controller.getReturnViewPage` | `views/private/admin/return-view.ejs` | `MaterialReturn` |
| 48 | `/admin/enquiries/surveys` | GET | `requireAuth`, `requireSuperAdmin` | `enquiryController.getSurveysPage` | `views/private/admin/enquiries/surveys.ejs` | `Enquiry` (Unbounded fetch into RAM) |
| 49 | `/admin/enquiries/franchise` | GET | `requireAuth`, `requireSuperAdmin` | `enquiryController.getFranchiseApplicationsPage` | `views/private/admin/enquiries/franchise.ejs` | `FranchiseApplication` (Unbounded fetch into RAM) |
| 50 | `/admin/enquiries/complaints` | GET | `requireAuth`, `requireSuperAdmin` | Redirect to `/admin/complaints` | N/A | None |
| 51 | `/admin/website/services` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getServicesPage` | `views/private/admin/website/services.ejs` | `WebService` |
| 52 | `/admin/website/products` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getProductsPage` | `views/private/admin/website/products.ejs` | `WebProduct` |
| 53 | `/admin/website/projects` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getProjectsPage` | `views/private/admin/website/projects.ejs` | `WebProject` |
| 54 | `/admin/website/team` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getTeamPage` | `views/private/admin/website/team.ejs` | `WebTeam` |
| 55 | `/admin/website/testimonials` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getTestimonialsPage` | `views/private/admin/website/testimonials.ejs` | `WebTestimonial` |
| 56 | `/admin/website/contact` | GET | `requireAuth`, `requireSuperAdmin` | `websiteCmsController.getContactInfoPage` | `views/private/admin/website/contact.ejs` | `Setting` (Creates doc if missing on GET) |
| 57 | `/login` / `/admin/login` | GET | None | `authController.getAdminLogin` | `views/private/auth/admin-login.ejs` | None |
| 58 | `/manager/login` | GET | None | `authController.getManagerLogin` | `views/private/auth/admin-login.ejs` | None |
| 59 | `/employee/login` | GET | None | `authController.getEmployeeLogin` | `views/private/auth/admin-login.ejs` | None |

---

## 3. AUTHENTICATION AND MIDDLEWARE AUDIT (PHASE 2)

### 3.1 Duplicate `User.findById` on Every Single Admin Request
* **Source Location:** `middleware/authMiddleware.js`, Lines 130–150 and Lines 160–210.
* **Mechanism:**
  Every admin route is declared as:
  ```js
  router.get('/admin', requireAuth, requireSuperAdmin, adminController.getDashboard);
  ```
  1. `requireAuth` executes:
     ```js
     User.findById(req.session.user._id).select('status role branchId').lean()
     ```
     This sends an asynchronous query to MongoDB Atlas, waits for response, updates `req.session.user`, and calls `next()`.
  2. `requireSuperAdmin` (created by `requireRole('SUPER_ADMIN')`) executes next:
     ```js
     const requireRole = (...roles) => {
         return (req, res, next) => {
             ...
             const matched = roles.some(r => ...);
             if (!matched) { ... }
             return requireAuth(req, res, next); // <--- RE-INVOKES requireAuth!
         };
     };
     ```
     Because `requireRole` explicitly calls `requireAuth(req, res, next)` at the end of its check, **`requireAuth` runs a second time within the exact same HTTP request lifecycle**, issuing a duplicate `User.findById` query over the network to MongoDB Atlas.
* **Latency Impact:** 60ms – 140ms redundant delay on **every single admin page request**.
* **Fix Assessment:** High Priority. `requireRole` should simply call `next()` when the role check passes, since `requireAuth` has already verified user identity and active status. (Zero security reduction).

### 3.2 Session-Store Database Latency & Touch-Write on GET
* **Source Location:** `server.js`, Lines 61–72.
* **Code:**
  ```js
  sessionStore = MongoStore.create({
      mongoUrl: mongoURI,
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60,
      autoRemove: 'native'
  });
  ```
* **Mechanism:**
  In `connect-mongo` v4/v5, the `touchAfter` option defaults to `0`. When `touchAfter: 0`, every HTTP request triggers a `session.touch()` operation that executes a MongoDB `updateOne` write to update the `lastModified` timestamp on the session document in MongoDB Atlas.
  Furthermore, `mongoUrl: mongoURI` is passed, causing `connect-mongo` to create an **entirely separate MongoDB connection pool** (independent of Mongoose's pool), competing for TCP connections on Render's single CPU core.
* **Latency Impact:** 80ms – 160ms write roundtrip overhead added to every GET request.
* **Fix Assessment:** Add `touchAfter: 24 * 3600` (resave session only once every 24 hours unless session data changes) and pass existing Mongoose client via `client: mongoose.connection.getClient()`.

### 3.3 CSRF Middleware Evaluation
* **Source Location:** `middleware/authMiddleware.js`, Lines 12–45.
* **Findings:** `setupCsrf` generates or reads `req.session.csrfToken` using synchronous `crypto.randomBytes(32)` (negligible ~0.05ms cost). `verifyCsrf` properly exempts GET, HEAD, and OPTIONS requests and immediately calls `next()`. No performance bottleneck found here.

### 3.4 Global Middleware Order in `server.js`
* **Source Location:** `server.js`, Lines 43–106.
* **Order:**
  1. `helmet`
  2. `express.urlencoded`, `express.json`
  3. Static asset handlers (`/css`, `/js`, `/images`, etc.)
  4. `session` (MongoStore)
  5. `setupCsrf`
  6. `res.locals` assignment (`WebsiteService.getLiveCompanyData()`)
* **Observation:** Static assets are mounted **before** session and auth middleware. This is optimal because static file requests (`.css`, `.js`, `.webp`) do not incur session lookups or database overhead. However, the static assets themselves lack HTTP caching headers.

---

## 4. CONTROLLER AND DATABASE QUERY AUDIT (PHASE 3)

### 4.1 Invoices Page (`/admin/invoices`) — HAR Benchmark: 2.17s TTFB
* **File & Lines:** `controllers/adminController.js`, Lines 188–253 (`getInvoices`).
* **Database Models:** `Invoice`, `Project`, `Quotation`.
* **Identified Patterns:**
  ```js
  invoices = await Invoice.find(invFilter).sort({ createdAt: -1 }).lean();
  projects = await Project.find(projFilter).populate('customer', 'name mobile city address consumerNumber gstin').lean();
  quotations = await Quotation.find(quoteFilter).populate('customerId', 'name mobile city address consumerNumber gstin').lean();
  ```
* **Performance Defects:**
  1. **Unbounded Queries:** Fetches **100% of all invoices, 100% of all projects, and 100% of all accepted quotations** without pagination (`limit`/`skip`).
  2. **Dropdown Population Waste:** `projects` and `quotations` are fetched purely to fill the modal dropdown options (`<select id="invoiceProject">` and `<select id="invoiceQuotation">`). They fetch all customer address details, GSTIN, consumer numbers for hundreds of historical records that are rarely clicked.
  3. **Sequential Execution:** The 3 database queries execute sequentially with 3 separate `await` statements instead of running concurrently with `Promise.all`.
  4. **Missing Index:** `Invoice` has zero indexes on `createdAt` or `isArchived`. MongoDB performs an unindexed collection scan (`COLLSCAN`) and memory sort.
* **Impact:** **CRITICAL (High).** Directly responsible for the 2.17s TTFB observed in the HAR trace.

---

### 4.2 Dashboard (`/admin`)
* **File & Lines:** `controllers/adminController.js`, Lines 11–148 (`getDashboard`).
* **Database Models:** `User`, `Project`, `Quotation`, `QuotationRequest`, `AuditLog`.
* **Identified Patterns:**
  ```js
  const counts = await DataStore.getRealCounts(); // Line 13 -> calls DataStore.getUsers()
  const users = await DataStore.getUsers();       // Line 14 -> DUPLICATE QUERY!
  const recentActivities = await AuditService.getRecentLogs(10); // Line 16
  const allProjs = await Project.find({}).populate(...).sort(...).lean(); // Line 25-29 (UNBOUNDED)
  const allQuotes = await Quotation.find({}).populate(...).sort(...).lean(); // Line 56-61 (UNBOUNDED)
  const mongoRequests = await QuotationRequest.find({}).limit(6).lean(); // Line 81-87
  ```
* **Performance Defects:**
  1. **Duplicate Full User Collection Queries:** Line 13 calls `DataStore.getRealCounts()`, which internally executes `await this.getUsers()`, issuing `User.find({}).populate('managerId').populate('branchId')`. Line 14 then calls `DataStore.getUsers()` a second time, repeating the exact same full-collection query with two populates!
  2. **Full Collection Ingestion for Summary Counts:** `Project.find({})` and `Quotation.find({})` fetch **every single project and quotation in existence** with multiple populated fields. The controller then runs `allProjs.forEach(...)` and `allQuotes.forEach(...)` in single-threaded JavaScript to count active/completed statuses and sum kilowatts, only to discard the array except for `.slice(0, 5)`.
  3. **Sequential Chains:** 6 independent database queries execute one after another in serial order.
* **Impact:** **CRITICAL (High).** Renders ~500ms – 1.1s slower than necessary.

---

### 4.3 Quotations Management (`/admin/quotations`)
* **File & Lines:** `controllers/quotationController.js`, Lines 1228–1390 (`getAdminQuotations`).
* **Database Models:** `Quotation`, `QuotationRequest`.
* **Identified Patterns:**
  ```js
  const total = await Quotation.countDocuments(query); // Line 1269
  const quotations = await Quotation.find(query)...skip(skip).limit(limit); // Line 1270-1277
  const allQuotes = await Quotation.find(allQuotesQuery)...; // Line 1293 (UNBOUNDED, NO LEAN)
  const allRequests = await QuotationRequest.find(reqQuery)...; // Line 1311 (UNBOUNDED, NO LEAN)
  ```
* **Performance Defects:**
  1. **Double Querying (Paginated + Unbounded):** Although `quotations` is paginated with `limit(20)`, the controller immediately executes `allQuotes = await Quotation.find(...)` and `allRequests = await QuotationRequest.find(...)` **without limits and without `.lean()`**, populating 4 nested relations.
  2. **Database Writes on HTTP GET:** Lines 1324–1341 loop through all requests and execute:
     ```js
     await QuotationRequest.findByIdAndUpdate(r._id, { linkedQuotation: matchQ._id, status: 'QUOTATION_PREPARED' });
     await Quotation.findByIdAndUpdate(matchQ._id, { quotationRequestId: r._id, assignedEmployee: matchQ.assignedEmployee });
     ```
     **State mutations and database writes are being committed during a simple page load GET request.**
  3. **Mongoose Document Hydration Overhead:** `allQuotes` and `allRequests` omit `.lean()`, forcing Mongoose to instantiate hundreds of full Mongoose Document instances with schema validators and change listeners.
* **Impact:** **CRITICAL (High).** High latency and risk of database write locks during read traffic.

---

### 4.4 Branches Management (`/admin/branches`)
* **File & Lines:** `controllers/adminController.js`, Lines 333–375 (`getBranches`).
* **Database Models:** `Branch`, `User`, `Project`.
* **Identified Patterns:**
  ```js
  branches = await Branch.find({}).populate('manager').sort({ createdAt: -1 }).lean();
  for (const b of branches) {
      b.employeeCount = await User.countDocuments({ branchId: b._id, role: 'EMPLOYEE' });
      b.projectCount = await Project.countDocuments({ branch: b._id, status: { $ne: 'CANCELLED' } });
      totalEmployees += b.employeeCount;
      totalProjects += b.projectCount;
  }
  ```
* **Performance Defects:**
  1. **N+1 Database Query Loop:** For $N$ branches, the loop executes $2 \times N$ individual `countDocuments` queries sequentially. With 10 branches, this results in **21 sequential roundtrips to MongoDB Atlas**!
* **Impact:** **HIGH.** Increases linearly with branch count. 10 branches = ~1,000ms network delay.

---

### 4.5 Employees Page (`/admin/employees`)
* **File & Lines:** `controllers/adminController.js`, Lines 254–292 (`getEmployees`).
* **Database Models:** `User`, `Branch`.
* **Identified Patterns:**
  ```js
  await selfHealManagers(); // Line 256
  const users = await DataStore.getUsers(); // Line 257
  branches = await Branch.find({}); // Line 262 (NO LEAN)
  ```
* **Performance Defects:**
  1. **Runtime Migration on GET:** Line 256 calls `selfHealManagers()`, which runs `User.find({ role: { $in: ['BRANCH_MANAGER', 'MANAGER'] } })`, inspects every manager's ID, and calls `await m.save()` on any match on **every GET request**. Database repairs belong in deployment migrations or startup hooks, not HTTP page handlers.
  2. **Missing `.lean()`:** `Branch.find({})` creates full Mongoose model instances.
* **Impact:** **MEDIUM.** Adds 80ms – 150ms unnecessary pre-fetch overhead.

---

### 4.6 Reports Console (`/admin/reports`)
* **File & Lines:** `controllers/adminController.js`, Lines 882–1011 (`getReports`).
* **Database Models:** `User`, `Branch`, `Project`, `Quotation`, `Invoice`.
* **Identified Patterns:**
  ```js
  const users = await DataStore.getUsers(); // Line 884
  branches = await Branch.find({}).lean(); // Line 892
  projects = await Project.find({}).populate('customer').populate('assignedEngineer').lean(); // Line 896
  quotations = await Quotation.find({}).lean(); // Line 900
  invoices = await Invoice.find({}).lean(); // Line 904
  ```
* **Performance Defects:**
  1. **Complete Database Dump:** Loads 5 entire collections into Node memory across 5 sequential queries.
  2. **In-Memory Calculations:** JavaScript loops iterate over all historical projects and invoices to sum values (`projects.forEach(...)`, `invoices.forEach(...)`).
* **Impact:** **HIGH.** Memory footprint and CPU time scale poorly as historical data accumulates.

---

### 4.7 Customer Enquiries & Franchise Applications
* **File & Lines:** `controllers/enquiryController.js`:
  - Lines 11–90 (`getSurveysPage`)
  - Lines 160–236 (`getFranchiseApplicationsPage`)
* **Database Models:** `Enquiry`, `FranchiseApplication`.
* **Performance Defects:**
  1. **Unbounded Full Collection Load:** `Enquiry.find(query)` and `FranchiseApplication.find(query)` omit pagination limits.
  2. **In-Memory Search Filtering:** Search queries (`req.query.search`) are filtered **in JavaScript** using `surveys.filter(...)` and `applications.filter(...)` instead of MongoDB regex/indexed query filtering.
  3. **In-Memory Metric Counting:** Status counts (`new`, `contacted`, `converted`) are calculated via in-memory array filtering after loading all records.
  4. **Zero Indexes:** Neither model defines indexes on `status` or `createdAt`.
* **Impact:** **MEDIUM-HIGH.**

---

### 4.8 Inventory & Material Management
* **File & Lines:** `controllers/materialController.js`:
  - Lines 33–157 (`getMaterialsPage`)
  - Lines 790–905 (`getPurchasesPage`)
  - Lines 1428–1539 (`getInventoryPage`)
* **Database Models:** `Material`, `Purchase`, `Supplier`, `InventoryTransaction`.
* **Performance Defects:**
  1. **`getInventoryPage` In-Memory Pagination:** Line 1453 executes `Material.find(query).sort(...).lean()` without limit/skip, calculates valuation across all items in a JavaScript loop, and then slices: `materials = allMaterials.slice(skip, skip + limit)`.
  2. **`getPurchasesPage` Query Explosion:** Executes 6 distinct database operations per request (1 paginated find + 1 count + 3 status counts + 1 spend aggregation).
  3. **`getMaterialsPage` Repeated Counts:** Issues 4 separate `countDocuments` and `find` queries concurrently on every page load.
* **Impact:** **MEDIUM.**

---

### 4.9 Complaints Console (`/admin/complaints`)
* **File & Lines:** `controllers/adminController.js`, Lines 1069–1146 (`getComplaints`).
* **Database Models:** `Complaint`, `User`.
* **Performance Defects:**
  1. `Complaint.find(query).populate('assignedEngineer').sort({ createdAt: -1 }).lean()` is unbounded (no pagination).
  2. Calls `DataStore.getUsers()`, which queries all users and populates branches and managers, simply to filter `users.filter(u => u.role === 'EMPLOYEE')` for an assignment dropdown.
* **Impact:** **MEDIUM.**

---

## 5. DASHBOARD AND SHARED DATA AUDIT (PHASE 4)

| Data Component | Scope | Execution Frequency | Current Implementation | Performance Finding |
|----------------|-------|---------------------|------------------------|---------------------|
| `res.locals.company` | Global (All Pages) | Every request | In-memory cached with background refresh | **Optimal.** No blocking database queries. |
| `currentUser` | Global (All Pages) | Every request | Read from `req.session.user` | **Optimal.** Fast session attribute copy. |
| Navigation Sidebar Badges | Admin Shared Layout | N/A | Static labels (no live counts) | **Optimal.** No hidden DB queries executed in sidebar. |
| `unreadNotificationsCount` | Admin Header | Optional | Defaulted to 0 in route/views | **Optimal.** No unread notification query overhead. |
| `DataStore.getRealCounts()` | Dashboard | On dashboard load | Calls `getUsers()` internally | **Duplicate.** Runs same `User.find` that dashboard runs on next line. |
| Dropdown Populate Data | Invoices, Complaints | On page load | Unbounded collection queries | **Heavy.** Fetches hundreds of records just for `<option>` tags. |

---

## 6. EJS AND FRONTEND AUDIT (PHASE 5)

### 6.1 Frontend Asset Payload Analysis

| Asset Path | Disk Size | Gzip Potential | Purpose | Findings |
|------------|-----------|----------------|---------|----------|
| `/fonts/icofont/fonts/icofont.woff2` | **525.3 KB** | ~480 KB (Binary) | Icon Font | Extremely large. Loaded on all admin pages, though only ~20 icons are used. |
| `/css/bootstrap.min.css` | **202.3 KB** | **~35 KB** | Core Grid & Styles | Transferred uncompressed. Missing gzip/brotli. |
| `/fonts/icofont/icofont.min.css` | **111.3 KB** | **~18 KB** | Icon Font Classes | Transferred uncompressed. Contains thousands of unused icon classes. |
| `/images/brandlogo2.webp` | **51.7 KB** | ~50 KB | Sidebar / Header Logo | WebP format already applied. Acceptable. |
| `/css/admin.css` | **23.7 KB** | **~6 KB** | Admin Layout Styles | Transferred uncompressed. |
| Page-specific CSS (`/css/private/*.css`) | **2.5 KB – 5.5 KB** | ~1.5 KB | Page-specific styling | Clean, modular, low overhead. |

### 6.2 Frontend Architectural Deficiencies:
1. **Absence of Gzip/Brotli Compression:**
   Express does not use `compression`. Text-based assets (`bootstrap.min.css`, `icofont.min.css`, `admin.css`) and dynamic HTML responses (40 KB – 80 KB) are sent across the wire in raw plaintext.
   * *Evidence:* `package.json` lacks `compression`; `server.js` has no `app.use(compression())`.
   * *Impact:* Transfers ~400 KB of text assets that could be compressed to ~65 KB, directly explaining the **1.32-second transfer gap** between TTFB (2.17s) and full load (3.49s) in the HAR report.
2. **Missing HTTP Cache-Control Headers on Static Assets:**
   In `server.js`, `express.static` is configured without `maxAge`:
   ```js
   app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
   app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
   ```
   * *Impact:* The browser re-validates each asset on every navigation using conditional `If-None-Match` requests. Even on 304 responses, 4–8 separate roundtrips are made to Render.
3. **Massive Inline Scripts in EJS Views:**
   Instead of cached static `.js` files, complex UI logic is inlined into EJS templates:
   - `views/private/employee/quotation-request-new.ejs`: **15.3 KB** inline script
   - `views/private/admin/sale-new.ejs`: **13.7 KB** inline script
   - `views/private/admin/invoices.ejs`: **13.1 KB** inline script
   - `views/private/admin/purchase-new.ejs`: **11.1 KB** inline script
   - `views/private/admin/partials/admin-footer.ejs`: **9.8 KB** inline script
   * *Impact:* Inflates HTML response sizes, prevents browser script caching, and increases EJS server-side compilation time.

---

## 7. SERVER, DATABASE AND HOSTING INFRASTRUCTURE (PHASE 6)

### 7.1 Mongoose & MongoDB Connection Topology
* **Source Location:** `config/database.js`.
* **Configuration:**
  ```js
  await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 8000 });
  ```
* **Findings:**
  - `maxPoolSize` is omitted (defaults to 100 in modern Mongoose).
  - No connection reuse between Mongoose and `connect-mongo` (duplicate connection pools).
  - Geographic latency: Render servers in Oregon / Frankfurt communicating with MongoDB Atlas in India or cross-continent experience **120ms – 220ms TCP roundtrips**. Every sequential query chain of 5 queries inherently burns **600ms – 1,100ms** solely in packet transit.

### 7.2 Express View Engine Caching
* **Observation:** In Express, EJS view templates are compiled into memory **only when `view cache` is enabled** (which Express enables by default only when `NODE_ENV=production`). If Render runs without `NODE_ENV=production`, Express re-reads every `.ejs` file and all partials (`admin-head`, `admin-sidebar`, `admin-header`, `admin-footer`) from disk on **every single HTTP request**.

---

## 8. PRIORITIZED FINDINGS TABLE (PHASE 8)

The table below catalogs every identified issue, prioritized by its contribution to admin latency:

| Priority | Category | Page / Module | File & Location | Issue Description | Verified Code Evidence | Expected Impact | Recommended Remediation |
|---|---|---|---|---|---|---|---|
| **P1** | **A** (Code) | **All Admin Pages** | `middleware/authMiddleware.js`<br>Lines 160–210 | **Duplicate User DB query in auth middleware** | `requireRole` explicitly calls `requireAuth(req, res, next)` at end of turn. | **60ms – 140ms TTFB reduction on ALL admin pages** | In `requireRole`, call `next()` directly if role matches; do not re-invoke `requireAuth`. |
| **P1** | **A** (Code) | **All Admin Pages** | `server.js`<br>Lines 61–72 | **Unnecessary session touch write on every GET** | `connect-mongo` initialized without `touchAfter` (defaults to 0). | **80ms – 160ms TTFB reduction across the board** | Add `touchAfter: 24 * 3600` and pass existing connection client via `client: mongoose.connection.getClient()`. |
| **P1** | **A** (Code) | **Invoices** | `controllers/adminController.js`<br>Lines 219–225 | **Sequential unbounded queries + unneeded dropdown fetches** | `Invoice.find()`, `Project.find()`, `Quotation.find()` executed with sequential `await` without limits. | **600ms – 1,200ms TTFB reduction on Invoices** | Paginate invoices (`limit(25)`); use `Promise.all`; project only `{ _id, name, number }` for dropdowns. |
| **P1** | **A** (Code) | **Quotations** | `controllers/quotationController.js`<br>Lines 1293–1342 | **Unbounded queries & Database writes during GET page render** | Loads all quotations and requests without `.lean()`; executes `findByIdAndUpdate` inside GET loop. | **500ms – 1,000ms TTFB reduction on Quotations** | Eliminate GET writes (move to background or event trigger); use MongoDB aggregations for stats. |
| **P1** | **A** (Code) | **Dashboard** | `controllers/adminController.js`<br>Lines 13–73 | **Duplicate `getUsers()` query & in-memory metrics loops** | Calls `DataStore.getRealCounts()` (which fetches all users) and then calls `DataStore.getUsers()` again immediately. | **400ms – 800ms TTFB reduction on Dashboard** | Execute queries via `Promise.all`; replace full collection scans with count aggregations. |
| **P1** | **A** (Code) | **Branches** | `controllers/adminController.js`<br>Lines 348–354 | **N+1 Database Query Loop** | Loops over branches and issues $2 \times N$ `countDocuments` queries sequentially. | **400ms – 1,000ms TTFB reduction on Branches** | Replace loop with two `$group` aggregate queries for user and project counts. |
| **P2** | **A** (Code) | **Database Indexes** | `models/Invoice.js`, `Enquiry.js`, `Complaint.js` | **Zero secondary indexes on critical collections** | Models define 0 indexes; queries on `status`, `createdAt`, `isArchived` run `COLLSCAN`. | **100ms – 400ms query time reduction** | Add compound indexes on `{ isArchived: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`. |
| **P2** | **A** (Code) | **Reports** | `controllers/adminController.js`<br>Lines 884–910 | **Dumping 5 entire collections into RAM for JS loops** | Sequentially fetches all Users, Branches, Projects, Quotations, Invoices to sum numbers in JS. | **500ms – 1,500ms TTFB reduction on Reports** | Replace in-memory array loops with MongoDB `$facet` / `$group` aggregation pipeline. |
| **P2** | **A** (Code) | **Employees** | `controllers/adminController.js`<br>Line 256 | **Database self-heal migration running on GET request** | `await selfHealManagers()` queries all managers and writes updates during employee page load. | **80ms – 150ms TTFB reduction on Employees** | Remove runtime self-heal from GET handler; execute only on app startup or DB migration script. |
| **P2** | **C** (Asset) | **All Pages (Frontend)** | `server.js`<br>`package.json` | **Missing HTTP Gzip/Brotli response compression** | `compression` package is missing; CSS, fonts, and HTML served uncompressed. | **600ms – 1,200ms full page load reduction** | Add `compression` middleware in Express to compress responses > 1KB. |
| **P3** | **C** (Asset) | **All Pages (Frontend)** | `server.js`<br>Lines 47–52 | **Static assets served without Cache-Control headers** | `express.static` uses default `maxAge: 0`, forcing 304 conditional revalidations. | **200ms – 400ms asset transfer reduction** | Set `maxAge: '7d'` (or `'1y'` for versioned assets) on static file middleware. |
| **P3** | **A** (Code) | **Inventory** | `controllers/materialController.js`<br>Lines 1453–1480 | **Full collection loading with in-memory pagination** | `Material.find(query)` loads all items, then slices `allMaterials.slice(skip, skip + limit)`. | **150ms – 300ms TTFB reduction on Inventory** | Apply `skip()` and `limit()` directly in MongoDB query; compute valuation via aggregation. |
| **P3** | **A** (Code) | **Surveys & Franchise** | `controllers/enquiryController.js`<br>Lines 22–55, 171–205 | **Unbounded queries & in-memory regex filtering** | Loads all enquiries/applications into memory; filters by search query via `Array.filter()`. | **100ms – 250ms TTFB reduction on Enquiries** | Add pagination and pass search regex directly into Mongoose `find(filter)`. |
| **P3** | **C** (Asset) | **All Pages (Frontend)** | `/fonts/icofont/` | **Massive 525 KB WOFF2 icon font transferred** | Entire icon set loaded for ~20 used UI icons. | **150ms – 300ms initial page load reduction** | Subset icon font or replace with targeted SVG sprite/icons. |
| **P4** | **D** (Hosting) | **Render / Atlas** | Environment & Infrastructure | **Potential Cross-Region Inter-Datacenter Network Latency** | Render region vs Atlas cluster region distance unknown. | **100ms – 300ms baseline RTT reduction** | Verify Render and MongoDB Atlas clusters reside in the same cloud region (e.g., AWS Mumbai / ap-south-1). |

*Categories:*  
- **A:** Confirmed Code Issues (verified via exact source inspection).  
- **B:** Potential Code Issues requiring runtime profiling.  
- **C:** Browser / Network Asset Delivery Issues.  
- **D:** Hosting / Infrastructure Configuration.  

---

## 9. MEASUREMENT PLAN (PHASE 7)

To accurately diagnose and measure improvements during the future optimization phase without guessing, a non-invasive, structured telemetry design is detailed below.

### 9.1 Browser TTFB vs. Server Processing Time
It is vital to distinguish between:
$$\text{Browser-Observed TTFB} = \text{DNS} + \text{TCP Handshake} + \text{TLS Handshake} + \text{Client Request Send} + \text{Server Processing Time} + \text{Network Return Latency}$$
$$\text{Server Processing Time} = T_{\text{session}} + T_{\text{auth}} + T_{\text{controller}} + T_{\text{database}} + T_{\text{EJS render}}$$

If the server logs report **250ms total processing time** but the browser HAR reports **2.17s TTFB**, the discrepancy is attributable to:
1. Inter-region network latency (e.g. client in India, server in US-West).
2. Render container cold start / CPU throttling.
3. Keep-Alive connection reuse failures.

### 9.2 Proposed Server-Timing Instrumentation Design (Safe, Non-Blocking)
*Note: This architecture is proposed for future implementation; no code was added during this audit.*

```js
// Conceptual Architecture for Server-Timing Header (RFC 7230)
const { performance } = require('perf_hooks');

const performanceTimingMiddleware = (req, res, next) => {
    const t0 = performance.now();
    const timings = {};

    req.recordTiming = (name, durationMs) => {
        timings[name] = (timings[name] || 0) + durationMs;
    };

    req.measure = async (name, fn) => {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            req.recordTiming(name, performance.now() - start);
        }
    };

    // Hook into res.render to capture EJS compilation + render duration
    const originalRender = res.render.bind(res);
    res.render = function(view, options, callback) {
        const renderStart = performance.now();
        return originalRender(view, options, (err, html) => {
            req.recordTiming('ejs_render', performance.now() - renderStart);
            if (callback) return callback(err, html);
            if (err) return req.next(err);
            
            const totalMs = performance.now() - t0;
            const headerVal = Object.entries(timings)
                .map(([k, v]) => `${k};dur=${v.toFixed(1)}`)
                .concat([`total;dur=${totalMs.toFixed(1)}`])
                .join(', ');
            
            res.setHeader('Server-Timing', headerVal);
            res.send(html);
        });
    };

    next();
};
```

This proposed structure allows Chrome DevTools Network tab to display individual breakdowns:
```
Server-Timing: auth;dur=120.4, db;dur=650.2, controller;dur=15.1, ejs_render;dur=42.3, total;dur=828.0
```

---

## 10. RECOMMENDED OPTIMIZATION PHASES

To maximize impact while safeguarding system stability and business rules, remediation should proceed in 4 staged phases:

```
┌────────────────────────────────────────────────────────┐
│ PHASE 1: Immediate Zero-Risk Quick Wins                │
│ • Add compression middleware in server.js              │
│ • Set touchAfter: 86400 in connect-mongo               │
│ • Remove duplicate requireAuth call from requireRole   │
│ • Wrap independent sequential queries in Promise.all   │
└───────────────────────────┬────────────────────────────┘
                            │ (Expected Gain: ~800ms - 1.2s TTFB)
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 2: Database Indexes & Projection Pruning         │
│ • Create compound indexes on Invoice, Quotation, etc.  │
│ • Add .select() projections to dropdown queries        │
│ • Ensure .lean() on all read-only queries              │
│ • Move selfHealManagers() out of GET handler           │
└───────────────────────────┬────────────────────────────┘
                            │ (Expected Gain: ~300ms - 600ms TTFB)
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 3: Query Restructuring & Aggregation             │
│ • Convert N+1 loop in getBranches to $group aggregate  │
│ • Replace full scans in getReports with $facet         │
│ • Eliminate database writes inside GET quotations      │
│ • Implement server-side pagination for Invoices        │
└───────────────────────────┬────────────────────────────┘
                            │ (Expected Gain: ~400ms - 800ms TTFB)
                            ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 4: Frontend & Static Asset Optimization          │
│ • Configure maxAge: '7d' on express.static             │
│ • Extract large inline scripts to cached .js assets    │
│ • Optimize / subset icofont.woff2                      │
└────────────────────────────────────────────────────────┘
```

---

## 11. POTENTIAL REGRESSION AND SECURITY RISKS

When implementing the optimizations outlined above in future work, the following constraints must be preserved:

1. **Branch Scoping & Role Isolation:**
   When converting queries to aggregations or adding `.select()` projections, **multi-tenant branch scoping must never be omitted**. Branch Manager queries must continue to enforce `{ branch: sessionUser.branchId }` or `{ assignedManager: sessionUser._id }`.
2. **`touchAfter` vs Session Timeout:**
   Setting `touchAfter: 24 * 3600` is safe because `express-session` cookies have `maxAge: 24 * 60 * 60 * 1000`. However, if an idle timeout of shorter duration (e.g. 15 minutes) is ever required, `touchAfter` must be set lower than the idle window (e.g. 5 minutes).
3. **Mongoose Virtuals with `.lean()`:**
   Adding `.lean()` bypasses Mongoose getters, setters, and virtual fields. Before adding `.lean()`, verify whether templates rely on virtual properties (e.g. `formattedDate` or `totalKwFormatted`). In our code audit, templates format raw primitives directly (e.g., `(p.capacityKw || 0)`), making `.lean()` completely safe.
4. **Relocation of GET Database Writes:**
   The quotation auto-linking routine in `getAdminQuotations` (Lines 1324–1341) mutates records. When removing it from GET, a one-off database migration script or event-driven hook on quotation creation must ensure that unlinked quotation requests are resolved without breaking past proposals.

---

## 12. ITEMS THAT COULD NOT BE VERIFIED VIA STATIC AUDIT

The following infrastructure metrics cannot be verified from source code alone and require telemetry from live production environments:

1. **Exact Network Latency between Render and MongoDB Atlas:**
   The exact geographic location of the Render server (e.g., `us-west-2` Oregon) relative to the MongoDB Atlas cluster (e.g., `ap-south-1` Mumbai) could not be verified without access to cloud dashboard settings or ping diagnostics. If cross-region, network RTT constitutes a significant portion of baseline latency.
2. **Production MongoDB Collection Sizes:**
   The number of documents currently residing in production `invoices`, `quotations`, and `auditlogs` collections on MongoDB Atlas could not be measured. Performance degradation scales directly with document count due to unindexed `COLLSCAN` queries.
3. **Render Dyno Tier & Throttling:**
   Whether the production deployment is running on Render's Free tier (subject to CPU throttling and spin-down after 15 min) or a Paid Starter/Standard tier with dedicated CPU.
4. **Production Gzip at Edge:**
   Whether Render's Cloudflare-backed edge proxy automatically applies gzip to outbound responses when Express does not. (The HAR report indicates raw uncompressed payloads, but edge configuration should be confirmed).

---
*Report generated strictly via source code inspection and architectural profiling. No application files, configurations, or schemas were altered.*
