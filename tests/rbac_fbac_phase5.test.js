/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * RBAC + FBAC Authorization Reconstruction: Phase 5 Verification
 * Dynamic UI, Sidebar, Feature-Level & Field-Level Visibility Engine
 */

const assert = require('assert');
const path = require('path');
const ejs = require('ejs');

const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    isValidPermission,
    isValidFieldPermission
} = require('../config/permissionRegistry');

const AUTH_CONFIG = require('../config/authConfig');
const AuthorizationService = require('../services/authorizationService');

let testsPassed = 0;
let testsFailed = 0;

function it(name, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        testsFailed++;
    }
}

async function itAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        testsFailed++;
    }
}

console.log('='.repeat(70));
console.log('🛡️  PHASE 5 VERIFICATION: DYNAMIC UI & PERMISSION-BASED VISIBILITY');
console.log('='.repeat(70));

const sidebarPath = path.join(__dirname, '../views/private/admin/partials/admin-sidebar.ejs');

// =========================================================================
// SECTION 1: DYNAMIC SIDEBAR & NAVIGATION (6 PERSONAS)
// =========================================================================
console.log('\n--- SECTION 1: Dynamic Sidebar & Navigation Across Personas ---');

itAsync('Persona 1: Primary Super Admin sees 100% full sidebar navigation unconditionally', async () => {
    const primarySuperAdmin = {
        _id: '507f1f77bcf86cd799439011',
        email: AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: true,
        permissions: [],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: primarySuperAdmin,
        currentUser: primarySuperAdmin,
        activePage: 'dashboard',
        hasPermission: (k) => AuthorizationService.hasPermission(primarySuperAdmin, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(primarySuperAdmin, keys)
    });

    // Check that core navigation links exist
    assert(rendered.includes('href="/admin"'), 'Primary Super Admin must see Dashboard link (/admin)');
    assert(rendered.includes('/admin/invoices'), 'Primary Super Admin must see Tax Invoices link');
    assert(rendered.includes('/admin/inventory'), 'Primary Super Admin must see Inventory link');
    assert(rendered.includes('/admin/branches'), 'Primary Super Admin must see Regional Hubs link');
    assert(rendered.includes('/admin/employees'), 'Primary Super Admin must see Staff Directory link');
    assert(rendered.includes('/admin/settings'), 'Primary Super Admin must see System Master Config link');
    assert(rendered.includes('/admin/customers'), 'Primary Super Admin must see Customers link');
    assert(rendered.includes('/admin/reports'), 'Primary Super Admin must see Reports link');
    assert(rendered.includes('/admin/complaints'), 'Primary Super Admin must see Complaints link');
});

itAsync('Persona 2: Secondary Super Admin (0 permissions) sees NO unauthorized module links', async () => {
    const secondarySuperAdmin = {
        _id: '507f1f77bcf86cd799439022',
        email: 'secondary_admin@shivayenergy.com',
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: false,
        permissions: [],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: secondarySuperAdmin,
        currentUser: secondarySuperAdmin,
        activePage: 'dashboard',
        hasPermission: (k) => AuthorizationService.hasPermission(secondarySuperAdmin, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(secondarySuperAdmin, keys)
    });

    // Must NOT have access to unauthorized links
    assert(!rendered.includes('href="/admin"'), 'Secondary Super Admin with 0 permissions must NOT see Dashboard link');
    assert(!rendered.includes('/admin/invoices'), 'Secondary Super Admin with 0 permissions must NOT see Tax Invoices link');
    assert(!rendered.includes('/admin/inventory'), 'Secondary Super Admin with 0 permissions must NOT see Inventory link');
    assert(!rendered.includes('/admin/branches'), 'Secondary Super Admin with 0 permissions must NOT see Regional Hubs link');
    assert(!rendered.includes('/admin/employees'), 'Secondary Super Admin with 0 permissions must NOT see Staff Directory link');
    assert(!rendered.includes('/admin/settings'), 'Secondary Super Admin with 0 permissions must NOT see System Master Config link');
    assert(!rendered.includes('/admin/customers'), 'Secondary Super Admin with 0 permissions must NOT see Customers link');
    assert(!rendered.includes('/admin/reports'), 'Secondary Super Admin with 0 permissions must NOT see Reports link');
});

itAsync('Persona 3: Standard Employee sees only attendance and personal work, no administrative links', async () => {
    const employee = {
        _id: '507f1f77bcf86cd799439033',
        email: 'employee@shivayenergy.com',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: ['attendance.personal.view', 'attendance.punch.create', 'projects.records.view'],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: employee,
        currentUser: employee,
        activePage: 'attendance',
        hasPermission: (k) => AuthorizationService.hasPermission(employee, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(employee, keys)
    });

    // Allowed
    assert(rendered.includes('/employee/attendance'), 'Employee must see personal attendance link (/employee/attendance)');
    assert(rendered.includes('/employee/projects'), 'Employee must see projects link (/employee/projects)');

    // Forbidden
    assert(!rendered.includes('/admin/invoices'), 'Employee must NOT see Tax Invoices link');
    assert(!rendered.includes('/admin/inventory'), 'Employee must NOT see Inventory link');
    assert(!rendered.includes('/admin/branches'), 'Employee must NOT see Regional Hubs link');
    assert(!rendered.includes('/admin/employees'), 'Employee must NOT see Staff Directory link');
    assert(!rendered.includes('/admin/settings'), 'Employee must NOT see Settings link');
    assert(!rendered.includes('/admin/customers'), 'Employee must NOT see Customers link');
});

itAsync('Persona 4: Employee with delegated Tax Invoices dynamically sees Tax Invoices link', async () => {
    const employeeWithInvoice = {
        _id: '507f1f77bcf86cd799439044',
        email: 'billing_clerk@shivayenergy.com',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: ['attendance.personal.view', 'invoices.records.view'],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: employeeWithInvoice,
        currentUser: employeeWithInvoice,
        activePage: 'invoices',
        hasPermission: (k) => AuthorizationService.hasPermission(employeeWithInvoice, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(employeeWithInvoice, keys)
    });

    // Delegated Tax Invoices link IS rendered
    assert(rendered.includes('/admin/invoices'), 'Employee with invoices.records.view MUST dynamically see Tax Invoices link in sidebar');
    assert(rendered.includes('Tax Invoices'), 'Tax Invoices label must be visible');

    // Other administrative modules remain hidden
    assert(!rendered.includes('/admin/inventory'), 'Tax Clerk must NOT see Inventory link');
    assert(!rendered.includes('/admin/branches'), 'Tax Clerk must NOT see Regional Hubs link');
    assert(!rendered.includes('/admin/employees'), 'Tax Clerk must NOT see Staff Directory link');
    assert(!rendered.includes('/admin/settings'), 'Tax Clerk must NOT see Settings link');
});

itAsync('Persona 5: Employee with Quotation Customer Lookup sees Quotations but NOT CRM Customers', async () => {
    const quoteMaker = {
        _id: '507f1f77bcf86cd799439055',
        email: 'quote_maker@shivayenergy.com',
        role: 'EMPLOYEE',
        isPrimarySuperAdmin: false,
        permissions: ['quotations.records.view', 'quotations.preparation.create'],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: quoteMaker,
        currentUser: quoteMaker,
        activePage: 'quotations',
        hasPermission: (k) => AuthorizationService.hasPermission(quoteMaker, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(quoteMaker, keys)
    });

    assert(rendered.includes('/employee/quotations'), 'Quote Maker must see Quotations link (/employee/quotations)');
    assert(!rendered.includes('/admin/customers'), 'Quote Maker must NOT see CRM Customers link');
});

itAsync('Persona 6: Branch Manager sees branch operations and branch attendance, but no master settings', async () => {
    const branchManager = {
        _id: '507f1f77bcf86cd799439066',
        email: 'bm_ahmedabad@shivayenergy.com',
        role: 'BRANCH_MANAGER',
        isPrimarySuperAdmin: false,
        permissions: [
            'dashboard.branch.view',
            'attendance.branch.view',
            'projects.records.view',
            'projects.status.edit',
            'quotations.records.view',
            'inventory.stock.view'
        ],
        fieldPermissions: []
    };

    const rendered = await ejs.renderFile(sidebarPath, {
        user: branchManager,
        currentUser: branchManager,
        activePage: 'dashboard',
        hasPermission: (k) => AuthorizationService.hasPermission(branchManager, k),
        hasAnyPermission: (keys) => AuthorizationService.hasAnyPermission(branchManager, keys)
    });

    assert(rendered.includes('/manager/dashboard'), 'Branch Manager must see Dashboard link (/manager/dashboard)');
    assert(rendered.includes('/manager/attendance'), 'Branch Manager must see Branch Attendance link (/manager/attendance)');
    assert(rendered.includes('/manager/projects'), 'Branch Manager must see Projects link (/manager/projects)');
    assert(rendered.includes('/manager/quotations'), 'Branch Manager must see Quotations link (/manager/quotations)');
    assert(rendered.includes('/admin/inventory'), 'Branch Manager must see Inventory link (/admin/inventory)');

    // Forbidden
    assert(!rendered.includes('/admin/branches'), 'Branch Manager without branches.offices.view must NOT see Regional Hubs master link');
    assert(!rendered.includes('/admin/settings'), 'Branch Manager must NOT see System Master Config link');
});

// =========================================================================
// SECTION 2: FEATURE-LEVEL UI CONTROLS VISIBILITY
// =========================================================================
console.log('\n--- SECTION 2: Feature-Level Action Controls Visibility ---');

it('Invoice View: "+ Generate New Bill" button rendered only when invoices.records.create is present', () => {
    const renderInvoiceActions = (user) => {
        const checkPerm = (k) => AuthorizationService.hasPermission(user, k);
        let html = '';
        if (checkPerm('invoices.records.create')) {
            html += '<button id="createInvoiceBtn">+ Generate New Bill</button>';
        }
        return html;
    };

    const viewer = { email: 'viewer@shivayenergy.com', permissions: ['invoices.records.view'], fieldPermissions: [] };
    const creator = { email: 'creator@shivayenergy.com', permissions: ['invoices.records.view', 'invoices.records.create'], fieldPermissions: [] };

    assert(!renderInvoiceActions(viewer).includes('createInvoiceBtn'), 'Viewer must not see create button');
    assert(renderInvoiceActions(creator).includes('createInvoiceBtn'), 'Creator must see create button');
});

it('Quotations View: "Approve" and "Reject" buttons require distinct action permissions', () => {
    const renderQuotationActions = (user, quote) => {
        const checkPerm = (k) => AuthorizationService.hasPermission(user, k);
        let actions = [];
        if (quote.status === 'UNDER_REVIEW' && checkPerm('quotations.approval.approve')) {
            actions.push('APPROVE_ACTION');
        }
        if (quote.status === 'SUBMITTED' && checkPerm('quotations.requests.reject')) {
            actions.push('REJECT_ACTION');
        }
        return actions;
    };

    const quoteUnderReview = { status: 'UNDER_REVIEW' };
    const quoteSubmitted = { status: 'SUBMITTED' };

    const approver = { email: 'approver@shivay.com', permissions: ['quotations.approval.approve'], fieldPermissions: [] };
    const rejecter = { email: 'rejecter@shivay.com', permissions: ['quotations.requests.reject'], fieldPermissions: [] };

    assert(renderQuotationActions(approver, quoteUnderReview).includes('APPROVE_ACTION'));
    assert(!renderQuotationActions(rejecter, quoteUnderReview).includes('APPROVE_ACTION'), 'Rejecter cannot approve');

    assert(renderQuotationActions(rejecter, quoteSubmitted).includes('REJECT_ACTION'));
    assert(!renderQuotationActions(approver, quoteSubmitted).includes('REJECT_ACTION'), 'Approver cannot reject without reject permission');
});

it('Settings View: "Save Changes" button hidden and "View Only Mode" badge displayed when settings.general.edit is absent', () => {
    const renderSettingsControls = (user) => {
        const checkPerm = (k) => AuthorizationService.hasPermission(user, k);
        if (checkPerm('settings.general.edit')) {
            return '<button class="btn btn-primary"><i class="icofont-save"></i> Save Changes</button>';
        } else {
            return '<div class="alert alert-info"><i class="icofont-lock"></i> View Only Mode</div>';
        }
    };

    const readOnlyUser = { email: 'viewer@shivay.com', permissions: ['settings.general.view'], fieldPermissions: [] };
    const adminUser = { email: 'admin@shivay.com', permissions: ['settings.general.view', 'settings.general.edit'], fieldPermissions: [] };

    const readOnlyHtml = renderSettingsControls(readOnlyUser);
    assert(!readOnlyHtml.includes('Save Changes'), 'Read only user must NOT see Save Changes button');
    assert(readOnlyHtml.includes('View Only Mode'), 'Read only user must see View Only Mode badge');

    const adminHtml = renderSettingsControls(adminUser);
    assert(adminHtml.includes('Save Changes'), 'Admin user with edit perm must see Save Changes button');
    assert(!adminHtml.includes('View Only Mode'), 'Admin user with edit perm must NOT see View Only Mode badge');
});

it('Inventory View: "Adjust Stock" and "Edit Selling Price" gated by explicit manage permissions', () => {
    const renderInventoryRowActions = (user) => {
        const checkPerm = (k) => AuthorizationService.hasPermission(user, k);
        const actions = [];
        if (checkPerm('inventory.stock.manage')) actions.push('EDIT_SELLING_PRICE');
        if (checkPerm('inventory.adjustments.manage')) actions.push('ADJUST_STOCK');
        return actions;
    };

    const stockViewer = { email: 'viewer@shivay.com', permissions: ['inventory.stock.view'], fieldPermissions: [] };
    const stockManager = { email: 'mgr@shivay.com', permissions: ['inventory.stock.view', 'inventory.stock.manage', 'inventory.adjustments.manage'], fieldPermissions: [] };

    assert.deepStrictEqual(renderInventoryRowActions(stockViewer), [], 'Stock viewer sees no row mutation actions');
    assert.deepStrictEqual(renderInventoryRowActions(stockManager), ['EDIT_SELLING_PRICE', 'ADJUST_STOCK'], 'Stock manager sees both actions');
});

// =========================================================================
// SECTION 3: FIELD-LEVEL VISIBILITY & SENSITIVE DATA MASKING
// =========================================================================
console.log('\n--- SECTION 3: Field-Level Visibility & Data Masking ---');

it('Invoice View: Financial metrics masked as "₹ ••••••" when fields.invoice.financial_metrics.view is absent', () => {
    const renderFinancialTotal = (user, amount) => {
        const canView = AuthorizationService.hasFieldAccess(user, 'fields.invoice.financial_metrics.view');
        return canView ? `₹ ${amount.toLocaleString('en-IN')}` : '₹ ••••••';
    };

    const clerkWithoutMetrics = { email: 'clerk@shivay.com', permissions: ['invoices.records.view'], fieldPermissions: [] };
    const managerWithMetrics = { email: 'accountant@shivay.com', permissions: ['invoices.records.view'], fieldPermissions: ['fields.invoice.financial_metrics.view'] };

    assert.strictEqual(renderFinancialTotal(clerkWithoutMetrics, 524000), '₹ ••••••', 'Must mask amount with bullet dots');
    assert.strictEqual(renderFinancialTotal(managerWithMetrics, 524000), '₹ 5,24,000', 'Must render full unmasked formatted amount');
});

it('Inventory View: WAC and Valuation masked when fields.inventory.wac.view is absent', () => {
    const renderInventoryValuation = (user, val) => {
        const canView = AuthorizationService.hasFieldAccess(user, 'fields.inventory.wac.view');
        return canView ? `₹ ${val.toLocaleString('en-IN')}` : '₹ ••••••';
    };

    const clerk = { email: 'clerk@shivay.com', permissions: ['inventory.stock.view'], fieldPermissions: [] };
    const finance = { email: 'finance@shivay.com', permissions: ['inventory.stock.view'], fieldPermissions: ['fields.inventory.wac.view'] };

    assert.strictEqual(renderInventoryValuation(clerk, 1250000), '₹ ••••••', 'Clerk must see masked inventory valuation');
    assert.strictEqual(renderInventoryValuation(finance, 1250000), '₹ 12,50,000', 'Finance must see unmasked inventory valuation');
});

it('Backend filterSensitiveFields: Masks purchase_price, wac, cost_breakdown, and profit_margin', () => {
    const rawRecord = {
        name: '400W Monocrystalline Panel',
        selling_price: 18500,
        purchase_price: 14200,
        wac: 14000,
        profit_margin: 24.3,
        cost_breakdown: { base: 13000, tax: 1000 }
    };

    const regularUser = {
        email: 'regular@shivay.com',
        permissions: ['inventory.stock.view'],
        fieldPermissions: []
    };

    const sanitized = AuthorizationService.filterSensitiveFields(regularUser, rawRecord);

    assert.strictEqual(sanitized.name, '400W Monocrystalline Panel');
    assert.strictEqual(sanitized.selling_price, 18500);
    assert.strictEqual(sanitized.purchase_price, undefined, 'purchase_price must be stripped');
    assert.strictEqual(sanitized.wac, undefined, 'wac must be stripped');
    assert.strictEqual(sanitized.profit_margin, undefined, 'profit_margin must be stripped');
    assert.strictEqual(sanitized.cost_breakdown, undefined, 'cost_breakdown must be stripped');
});

it('Backend filterSensitiveFields: Primary Super Admin receives 100% unmasked record unconditionally', () => {
    const rawRecord = {
        name: '400W Monocrystalline Panel',
        selling_price: 18500,
        purchase_price: 14200,
        wac: 14000,
        profit_margin: 24.3
    };

    const primaryAdmin = {
        email: AUTH_CONFIG.PRIMARY_SUPER_ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        isPrimarySuperAdmin: true,
        permissions: [],
        fieldPermissions: []
    };

    const unmasked = AuthorizationService.filterSensitiveFields(primaryAdmin, rawRecord);

    assert.strictEqual(unmasked.purchase_price, 14200, 'Primary Super Admin must receive unmasked purchase_price');
    assert.strictEqual(unmasked.wac, 14000, 'Primary Super Admin must receive unmasked wac');
    assert.strictEqual(unmasked.profit_margin, 24.3, 'Primary Super Admin must receive unmasked profit_margin');
});

// =========================================================================
// SECTION 4: CONTEXTUAL SHARED DATA ACCESS
// =========================================================================
console.log('\n--- SECTION 4: Contextual Shared Data Access ---');

it('Quotation creator can search customers via lookup permission without CRM Customers management permission', () => {
    const quoteCreator = {
        email: 'estimator@shivay.com',
        permissions: ['quotations.requests.create', 'quotations.preparation.create'],
        fieldPermissions: []
    };

    // 1. Can perform customer lookup for quotation?
    const canLookup = AuthorizationService.hasAnyPermission(quoteCreator, [
        'crm.customers.lookup',
        'crm.customers.view',
        'quotations.requests.create',
        'quotations.preparation.create'
    ]);
    assert.strictEqual(canLookup, true, 'Quotation creator must be permitted to lookup customers');

    // 2. Can access CRM customers management page?
    const canAccessCRM = AuthorizationService.hasPermission(quoteCreator, 'crm.customers.view');
    assert.strictEqual(canAccessCRM, false, 'Quotation creator must NOT have access to CRM module');
});

// =========================================================================
// SECTION 5: DASHBOARD WIDGET VISIBILITY & EMPTY STATE
// =========================================================================
console.log('\n--- SECTION 5: Dashboard Widget Visibility & Fallbacks ---');

it('Dashboard Widgets: Renders only assigned operational cards and handles empty state gracefully', () => {
    const getVisibleWidgets = (user) => {
        const checkAnyPerm = (keys) => AuthorizationService.hasAnyPermission(user, keys);
        const widgets = [];
        if (checkAnyPerm(['projects.records.view', 'projects.all.view'])) widgets.push('PROJECTS_WIDGET');
        if (checkAnyPerm(['crm.enquiries.view', 'crm.leads.view'])) widgets.push('ENQUIRIES_WIDGET');
        if (checkAnyPerm(['quotations.records.view', 'quotations.all.view'])) widgets.push('QUOTATIONS_WIDGET');
        if (checkAnyPerm(['users.employees.view', 'users.employees.manage'])) widgets.push('STAFF_WIDGET');
        return widgets;
    };

    const emptyUser = { email: 'empty@shivay.com', permissions: [], fieldPermissions: [] };
    const projectCoordinator = { email: 'coord@shivay.com', permissions: ['projects.records.view'], fieldPermissions: [] };

    assert.strictEqual(getVisibleWidgets(emptyUser).length, 0, 'User with 0 permissions sees 0 dashboard widgets');
    assert.deepStrictEqual(getVisibleWidgets(projectCoordinator), ['PROJECTS_WIDGET'], 'Project coordinator sees only Projects widget');
});

// =========================================================================
// SUMMARY REPORT
// =========================================================================
setTimeout(() => {
    console.log('\n' + '='.repeat(70));
    console.log(`Phase 5 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('='.repeat(70));
    if (testsFailed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 ALL PHASE 5 DYNAMIC UI & VISIBILITY TESTS PASSED!');
        process.exit(0);
    }
}, 500);
