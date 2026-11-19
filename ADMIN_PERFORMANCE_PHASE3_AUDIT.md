# SHIVAY ENERGY SOLUTIONS — ADMIN PANEL PERFORMANCE OPTIMIZATION
# PHASE 3: BACKEND ARCHITECTURE & QUERY AUDIT

**Date:** 2026-11-19  
**Audit Scope:** Read-Only Performance & Architecture Inspection  
**Application Stack:** Node.js, Express.js 5.3, EJS, Mongoose 9.12, MongoDB Atlas, Render  
**Baseline Tests:** 17 Test Suites | 310 / 310 Tests Passing (100%)

---

## 1. INVENTORY OF CONTROLLER BOTTLENECKS & QUERY PATTERNS

### 1.1 `controllers/adminController.js`
1. **Invoice Creator Filter Mismatch (Confirmed Phase 2 Issue):**
   - **Location:** Lines 226 & 230 in `getInvoices`:
     ```javascript
     invFilter.$or = [{ branch: sessionUser.branchId }, { createdBy: sessionUser._id }];
     invFilter.createdBy = sessionUser._id;
     ```
   - **Issue:** The Mongoose schema in [models/Invoice.js](file:///c:/rid/solar_panial/models/Invoice.js#L63) defines `createdByUser`, not `createdBy`.
   - **Impact:** When a branch manager has no `branchId`, querying `{ createdBy: sessionUser._id }` fails to match documents stored with `createdByUser`.
   - **Remediation:** Replace `createdBy` with `createdByUser` in invoice filter expressions.
2. **Dashboard Full Collection Dumps (`getDashboard`):**
   - **Location:** Lines 39–57:
     ```javascript
     const allProjs = await Project.find({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
     const allQuotes = await Quotation.find({}).sort({ createdAt: -1 }).lean();
     ```
   - **Issue:** Fetches every single project and quotation in the entire database just to compute 4 integer counters and slice the top 6 (`allProjs.slice(0, 6)`, `allQuotes.slice(0, 6)`).
   - **Impact:** High TTFB and memory bloat on larger datasets.
   - **Remediation:** Use MongoDB `$facet` aggregation or separate `.limit(6)` queries alongside scalar `$group` aggregations.
3. **Branch Counting N+1 Pattern (`getBranches`):**
   - **Location:** Lines 370–385:
     ```javascript
     await Promise.all(branches.map(async (b) => {
         const [empCount, prjCount] = await Promise.all([
             User.countDocuments({ branchId: b._id, role: 'EMPLOYEE' }),
             Project.countDocuments({ branch: b._id, status: { $ne: 'CANCELLED' } })
         ]);
         ...
     }));
     ```
   - **Issue:** While concurrent, for $N$ branches this still executes $2 \times N$ round-trips to MongoDB.
   - **Impact:** Network latency multiplier on Atlas connection pool.
   - **Remediation:** Replace with two single-shot `$group` aggregations: one on `User` and one on `Project`, grouped by `branchId` / `branch`.
4. **Reports Financial Aggregation (`getReports`):**
   - **Location:** Lines 935–943 & 980–983:
     Loads all unarchived invoices into memory to calculate `totalInvoicedValue += inv.totalAmount`.
   - **Remediation:** Replace full-collection invoice fetch with `Invoice.aggregate([ { $match: ... }, { $group: { _id: null, total: { $sum: "$totalAmount" } } } ])`.

---

### 1.2 `controllers/quotationController.js`
1. **Unnecessary GET Side Effects (Auto-heal writes on read requests):**
   - **Locations:**
     - `getEmployeeQuotations` / `getEmployeeDashboard`: Lines 259–281
     - `getManagerQuotations` / `getManagerDashboard`: Lines 506–530
     - `getAdminQuotations`: Lines 1327–1353
   - **Issue:** On every `GET` request to these routes, a loop checks unlinked quotation requests and triggers sequential database write mutations:
     ```javascript
     await QuotationRequest.findByIdAndUpdate(r._id, { linkedQuotation: matchQ._id, status: 'QUOTATION_PREPARED' });
     await Quotation.findByIdAndUpdate(matchQ._id, { quotationRequestId: r._id, ... });
     ```
   - **Impact:** Severe TTFB degradation on every list refresh. GET requests are not idempotent.
   - **Remediation:** Remove database write mutations from GET requests. Link records in-memory for the view render, and persist linkages only during explicit POST mutation workflows (prepare, approve, revise) or scheduled maintenance.
2. **Missing Tie-Breaker for Pagination:**
   - In `getAdminQuotations`, sorting uses `.sort({ createdAt: -1 })`. Adding `_id: -1` ensures deterministic pagination across page boundaries.

---

### 1.3 `controllers/enquiryController.js`
1. **Missing Tie-Breaker for Pagination:**
   - In `getSurveysPage` and `getFranchiseApplicationsPage`, sorting uses `.sort({ createdAt: -1 })`.
   - **Remediation:** Add `_id: -1` as secondary sort key (`{ createdAt: -1, _id: -1 }`).

---

### 1.4 `controllers/managerController.js`
1. **Dashboard Heavy Query Missing Field Selection:**
   - In `getDashboard` line 52: `Project.find(bFilter)` loads all project documents without `.select()`, deserializing nested subdocuments (`tasks`, `materials`, `documents`) only to slice 5 items.
   - **Remediation:** Add selective field projection `.select('projectNumber title capacityKw status customer assignedEngineer updatedAt createdAt')`.

---

### 1.5 `controllers/materialController.js` & `materialPhase2Controller.js`
1. **Sequential Queries in `getMaterialDetails`:**
   - Lines 278–288 in `materialController.js`: sequentially awaits `InventoryTransaction.find` then `Purchase.find`.
   - **Remediation:** Run concurrently using `Promise.all()`.
2. **Deterministic Pagination Sorting:**
   - Add `_id: -1` secondary sort keys to `getMaterialsPage`, `getSuppliersPage`, `getPurchasesPage`, `getSalesPage`, and `getDispatchListPage`.

---

## 2. ATTENDANCE PERSISTENCE ARCHITECTURE AUDIT

### 2.1 Current Architecture & Limitations
- **Current State:**
  - `DataStore.attendanceRecords` holds all attendance punches in an in-memory JavaScript array (`let attendanceRecords = [];`).
  - `DataStore.getTodayAttendance()` and `DataStore.addAttendance(data)` operate exclusively on this array.
  - Server restarts (e.g. Render spin-down / deployment) clear all attendance punches for the day.
- **Model Definition:**
  - [models/Attendance.js](file:///c:/rid/solar_panial/models/Attendance.js) exists with compiled Mongoose schema and indexes (`{ employee: 1, date: -1 }`, `{ branch: 1, date: -1 }`, `{ date: -1 }`).
  - However, no queries currently read from or write to the `Attendance` collection.

### 2.2 Schema & Data Model Comparison
| Concept / Field | In-Memory `DataStore` | Mongoose `Attendance` Model | Alignment Solution |
|---|---|---|---|
| **Employee Reference** | `employeeId` (string, e.g. "SES-EMP-01")<br>`employeeName` (string) | `employee` (`ObjectId`, ref `User`) | Store both `employee` (`ObjectId`) and `employeeId` / `employeeName` on document. |
| **Branch Reference** | Not stored on punch record | `branch` (`ObjectId`, ref `Branch`) | Capture `sessionUser.branchId` on punch. |
| **Punch Type** | `type`: `'check_in'` \| `'check_out'` | Separate `checkInTime` and `checkOutTime` fields | Add `type: { type: String, enum: ['check_in', 'check_out'] }` and timestamp fields to ensure 100% template compatibility. |
| **Date & Timezone** | `date`: String (IST formatted: `DD-MM-YYYY`)<br>`timestamp`: String (IST formatted: `HH:MM AM/PM`) | `date`: String (`YYYY-MM-DD`)<br>`checkInTime`: `Date` | Support IST date string format and store `Date` timestamps. |
| **GPS Geolocation** | `latitude`, `longitude`, `accuracy` | `checkInLocation` / `checkOutLocation` subdocuments | Store top-level `latitude`, `longitude`, `accuracy` alongside location subdocuments. |

### 2.3 Migration & Persistence Requirements
1. **Non-blocking / Synchronous Contract Preservation:**
   `employeeController.submitAttendance` must continue returning synchronous responses to preserve full compatibility with existing security tests (`tests/security.test.js`).
2. **Dual-Layer Resilience (MongoDB + Memory Buffer):**
   - Writes write to in-memory `attendanceRecords` for instant availability and concurrently persist to MongoDB `Attendance.create()`.
   - On startup or when querying today's attendance, if MongoDB is connected, seed/sync from MongoDB to ensure punches survive server restarts.
3. **Duplicate Punch Validation:**
   Ensure check-in and check-out duplicate prevention checks both MongoDB and memory.

---

## 3. PROPOSED IMPLEMENTATION PLAN

1. **Step 1:** Fix confirmed Phase 2 issues:
   - Update `adminController.js` invoice filter to `createdByUser`.
   - Add `_id: -1` secondary sort keys for deterministic pagination across all paginated queries.
   - Document migration plan for legacy `isArchived` records without touching `$ne: true`.
2. **Step 2:** Remove GET side effects:
   - Remove `findByIdAndUpdate` loops from `quotationController.js` (`getEmployeeQuotations`, `getManagerQuotations`, `getAdminQuotations`). Perform in-memory association for views without write side effects.
3. **Step 3:** Implement MongoDB Aggregations & Query Elimination:
   - Collapse `getBranches` $2 \times N$ loop to 2 aggregation queries (`User.aggregate`, `Project.aggregate`).
   - Optimize `adminController.getDashboard` project and quotation metric calculation.
   - Add `.select()` field projections in `managerController.getDashboard`.
   - Parallelize `materialController.getMaterialDetails` transaction and purchase lookups with `Promise.all`.
4. **Step 4:** Implement Attendance MongoDB Persistence:
   - Enhance `models/Attendance.js` to support punch logs seamlessly.
   - Update `DataStore` to persist attendance records to MongoDB and load existing day records on startup.
   - Verify punch-in, punch-out, GPS coordinates, and duplicate prevention.
5. **Step 5:** Rigorous Verification & Testing:
   - Run all existing 17 test suites (310 tests).
   - Write new comprehensive test suite `tests/phase3_backend_architecture.test.js`.
   - Generate `ADMIN_PERFORMANCE_PHASE3_REPORT.md`.
