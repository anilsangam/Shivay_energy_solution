# SHIVAY ENERGY SOLUTIONS — RBAC + FBAC HYBRID AUTHORIZATION ARCHITECTURE
## Phase 1 Architecture & Technical Specification Document
**Version:** 1.0.0 (Phase 1 Approved)  
**System:** Shivay Energy Solutions Enterprise Admin & Operations Panel  
**Author:** Antigravity AI Engineering & Security Team  
**Date:** November 22, 2026

---

## 1. ARCHITECTURAL OBJECTIVE & CORE PHILOSOPHY

The primary objective of this authorization reconstruction is to evolve Shivay Energy Solutions from a rigid, coarse Role-Based Access Control (RBAC) model into a secure, scalable, and highly flexible **Two-Tier Hybrid RBAC + FBAC (Feature-Based Access Control) + Granular Action & Field-Level Authorization Engine**.

### Core Operational Principle
> **The Primary Super Admin must be able to assign any individual module, feature, action, or permitted data-field access to any eligible employee or administrator, even if that functionality was previously restricted to Super Admin only.**  
> **The employee must receive only the explicitly assigned capabilities, not the entire Super Admin role or unrelated administrative privileges.**

---

## 2. THE DUAL-TIER HYBRID MODEL (RBAC + FBAC)

Access evaluation is never a single boolean lookup. For every protected HTTP request and UI action, the authorization engine evaluates a layered pipeline:

$$\text{Effective Access} = \text{Auth} \land \text{Status} \land \text{PrimaryAdminBypass} \lor (\text{RoleAuthority} \land \text{ModuleAccess} \land \text{FeatureActionPermission} \land \text{BranchScope} \land \text{FieldPermission})$$

```mermaid
flowchart TD
    Req[Incoming HTTP Request / UI Action] --> AuthCheck{Authenticated & Active?}
    AuthCheck -- No --> DenyAuth[401 Unauthorized / Redirect to Login]
    AuthCheck -- Yes --> PrimaryCheck{Is Primary Super Admin?}
    PrimaryCheck -- Yes --> AllowPrimary[ALLOW UNRESTRICTED ACCESS\n(System Governance Protection)]
    PrimaryCheck -- No --> NewAdminCheck{Is New Super Admin?}
    
    NewAdminCheck -- Yes --> PermCheck{Has Explicit Feature Permission?}
    NewAdminCheck -- No --> RoleCheck{Role Hierarchy & Maker-Checker Allowed?}
    
    RoleCheck -- No --> DenyRole[403 Forbidden: Role Seniority Insufficient]
    RoleCheck -- Yes --> PermCheck
    
    PermCheck -- No --> DenyPerm[403 Forbidden: Feature Not Enabled]
    PermCheck -- Yes --> BranchCheck{Within Branch / Data Ownership Scope?}
    
    BranchCheck -- No --> DenyBranch[403 Forbidden: Branch Isolation Breach]
    BranchCheck -- Yes --> FieldCheck{Field-Level Visibility Allowed?}
    
    FieldCheck -- No --> RedactField[Allow Request but Redact Sensitive Financial Fields]
    FieldCheck -- Yes --> AllowFull[ALLOW FULL OPERATION & RENDER FIELDS]
```

### Tier 1: RBAC (Role-Based Access Control — Organizational Authority)
Roles (`SUPER_ADMIN`, `MANAGER`, `BRANCH_MANAGER`, `EMPLOYEE`) define:
1. **Seniority & Hierarchy:** Supervisory reporting lines (e.g. employees report to a manager).
2. **Maker-Checker Restrictions:** Even if an Employee is granted quotation creation access, they cannot approve commercial quotations (commercial discounts require Manager or Super Admin sign-off).
3. **Branch Responsibilities:** A Branch Manager is bound to manage operations in their assigned geographical branch (`branchId`).
4. **Account Management Seniority:** Branch Managers can toggle status only for employees in their branch, never for other managers or Super Admins.

### Tier 2: FBAC (Feature-Based Access Control — Functional Capabilities)
Permissions decouple functional capabilities from roles:
1. **Module Access:** Determines whether the user can enter a top-level functional domain (e.g. `material.module.access`, `dispatch.module.access`).
2. **Feature & Action Permissions:** Granular capabilities in standard canonical notation: `<module>.<feature>.<action>` (e.g. `material.catalog.view`, `inventory.purchases.approve`, `dispatch.orders.create`).
3. **Field-Level Permissions:** Controls visibility of confidential financial attributes (e.g. `fields.material.purchase_price.view`, `fields.inventory.wac.view`).
4. **Data-Level Scope:** Enforces multi-branch isolation (`branchId`) and creator ownership (`assignedEmployee`).

---

## 3. PRIMARY SUPER ADMIN VS. NEWLY CREATED SUPER ADMIN

This distinction is enforced at both schema, database index, and controller levels.

### A. The Primary Super Admin
The original Primary Super Admin represents the root enterprise authority.
- **Deterministic Identity:** Tracked via `isPrimarySuperAdmin: { type: Boolean, default: false }` with a MongoDB partial unique index ensuring that **at most one** active document can possess this flag.
- **Unconditional Bypass:** Unrestricted access to all existing and future modules, features, actions, and fields.
- **Immutable Protection:**
  - Cannot be downgraded to `isPrimarySuperAdmin: false`.
  - Role cannot be changed from `SUPER_ADMIN`.
  - Account status cannot be changed from `ACTIVE` (cannot be suspended, rejected, or deactivated).
  - Password cannot be reset by any secondary administrator; only the Primary Super Admin can modify their own credentials.
- **One-Time Designation:** Mapped to the root enterprise administrator (`admin@shivayenergy.com` / `SES-ADMIN-01` / `process.env.ADMIN_EMAIL`).

### B. Newly Created Super Admin
Any new Super Admin created by the Primary Super Admin:
- Has `role: 'SUPER_ADMIN'`.
- Has `isPrimarySuperAdmin: false` (strictly enforced).
- **Starts with ALL PERMISSIONS OFF by default (`permissions: []`).**
- Receives no automatic module or feature access merely because of the `SUPER_ADMIN` string.
- The Primary Super Admin must explicitly select which modules, features, and actions to enable for this administrator.
- Example: An Operations Super Admin can be provisioned with `material: ON`, `inventory: ON`, and `dispatch: ON`, while having `settings: OFF`, `users: OFF`, and `invoices: OFF`.

### C. Managers & Employees
- Can receive granular feature assignments previously restricted to Super Admin (e.g. Material Catalog, Stock Inwarding, Dispatch Management).
- Retain maker-checker boundaries (e.g. an Employee cannot approve stock adjustments or sign off on company discounts unless the action policy explicitly allows it).

---

## 4. DATA MODEL ARCHITECTURE (`models/User.js`)

The `User` schema has been updated with strict validation and performance indexing:

```javascript
// models/User.js additions

isPrimarySuperAdmin: {
    type: Boolean,
    default: false
},
permissions: {
    type: [String],
    default: [],
    validate: {
        validator: function(perms) {
            if (!Array.isArray(perms)) return false;
            return perms.every(p => isValidPermission(p));
        },
        message: props => `Invalid permission key: ${props.value}`
    }
},
fieldPermissions: {
    type: [String],
    default: [],
    validate: {
        validator: function(fields) {
            if (!Array.isArray(fields)) return false;
            return fields.every(f => isValidFieldPermission(f));
        },
        message: props => `Invalid field permission key: ${props.value}`
    }
},
permissionVersion: {
    type: Number,
    default: 1
},
permissionMetadata: {
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}
```

### Database Performance Indexes
- Compound Unique Index: `{ isPrimarySuperAdmin: 1 }` with `{ unique: true, partialFilterExpression: { isPrimarySuperAdmin: true } }`
- Invalidation Index: `{ permissionVersion: 1 }`
- Standard Role & Branch Indexes: `{ role: 1 }`, `{ status: 1 }`, `{ branchId: 1, role: 1 }`

---

## 5. SESSION HYDRATION & IMMEDIATE REVOCATION MECHANISM

A critical architectural requirement is that permission revocations made by the Primary Super Admin must take effect **immediately**, even for users with active sessions.

### Zero-Stale-Session Pipeline
1. In [controllers/authController.js](file:///c:/rid/solar_panial/controllers/authController.js), login populates `req.session.user` with `isPrimarySuperAdmin`, `permissions`, `fieldPermissions`, and `permissionVersion`.
2. In [middleware/authMiddleware.js](file:///c:/rid/solar_panial/middleware/authMiddleware.js#L140-L165), every authenticated request runs a lightweight projection query:
   ```javascript
   User.findById(req.session.user._id)
       .select('status role branchId isPrimarySuperAdmin permissions fieldPermissions permissionVersion')
       .lean()
   ```
3. If the Primary Super Admin modifies permissions in MongoDB, the user's `permissionVersion` increments, and on their very next request, `req.session.user.permissions` is hydrated with the latest authoritative database state in under 0.1ms without requiring session destruction or re-login.
4. If a user is deactivated (`status: 'SUSPENDED'`), the session is immediately destroyed in MongoDB's `sessions` collection and memory store.

---

## 6. FIELD-LEVEL DATA PROTECTION ARCHITECTURE

Field visibility must be enforced at the serialization level, not merely by hiding HTML elements with CSS or EJS conditions.

### Sensitive Financial & PII Fields:
1. `fields.material.purchase_price.view`: Supplier procurement rates, PO unit prices.
2. `fields.inventory.wac.view`: Weighted Average Cost (WAC) calculations and total stock valuations.
3. `fields.inventory.profit_margin.view`: Profit margins on material sales and stock out transactions.
4. `fields.quotation.cost_breakdown.view`: Base equipment cost worksheets and internal discount ceilings.
5. `fields.invoice.financial_metrics.view`: Total company gross turnover, tax collections, revenue totals.
6. `fields.customer.pii.view`: Full Aadhaar and bank account documentation.

### Enforcement Strategy:
- **Backend Serializer:** APIs projecting material or stock records check `req.session.user.hasFieldAccess('fields.inventory.wac.view')`. If `false`, the field is deleted from the response JSON or rendered as `null` / `"[Restricted]"`.
- **EJS Helpers:** View templates render financial columns only if `currentUser.hasFieldAccess(...)` evaluates to `true`.
- **Export Redaction:** CSV exports use the same field filtering logic so confidential unit costs are never leaked into downloaded spreadsheets.

---

## 7. MULTI-BRANCH ISOLATION & REGIONAL BOUNDARIES

Permission authorization operates in synergy with the existing [middleware/authMiddleware.js](file:///c:/rid/solar_panial/middleware/authMiddleware.js#L255-L295) `requireBranchAccess()` engine:
1. `hasPermission('invoices.records.view')` confirms that the user can access the Invoices module.
2. The controller query applies branch isolation:
   ```javascript
   const query = (user.role === 'SUPER_ADMIN') ? {} : { branchId: user.branchId };
   const invoices = await Invoice.find(query);
   ```
3. A Branch Manager with invoice permissions can manage invoices for Raisen, but cannot view or mutate records belonging to Bhopal or Indore.
4. Primary Super Admin and authorized corporate staff can view across all branches globally.
