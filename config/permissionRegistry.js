/**
 * SHIVAY ENERGY SOLUTIONS - Centralized Authorization & Permission Registry
 * Single Source of Truth for RBAC + FBAC + Granular Feature + Field Permissions
 */

// =========================================================================
// 1. CANONICAL MODULE DEFINITIONS (15 Modules)
// =========================================================================
const MODULES = {
    attendance: {
        id: 'attendance',
        name: 'Attendance & GPS',
        category: 'Operations',
        icon: 'icofont-location-pin',
        description: 'Geo-tagged field check-in/check-out, punch logs, and branch attendance monitoring'
    },
    projects: {
        id: 'projects',
        name: 'Project Execution',
        category: 'Operations',
        icon: 'icofont-energy-solar',
        description: 'Project lifecycle stages, site surveys, technical task tracking, engineer assignments'
    },
    quotations: {
        id: 'quotations',
        name: 'Quotations & Commercials',
        category: 'Commercial',
        icon: 'icofont-calculator-alt-2',
        description: 'Solar capacity costing, quotation drafting, discount approvals, customer acceptance'
    },
    invoices: {
        id: 'invoices',
        name: 'Tax Invoices & Billing',
        category: 'Finance',
        icon: 'icofont-bill',
        description: 'GST tax invoices, billing management, payment tracking, PDF generation'
    },
    crm: {
        id: 'crm',
        name: 'CRM & Lead Management',
        category: 'Commercial',
        icon: 'icofont-address-book',
        description: 'Customer directory, fast mobile search, website inquiries, and free solar survey leads'
    },
    material: {
        id: 'material',
        name: 'Material Master & Suppliers',
        category: 'Supply Chain',
        icon: 'icofont-box',
        description: 'Solar equipment catalog, technical specifications, supplier onboarding, and vendor terms'
    },
    inventory: {
        id: 'inventory',
        name: 'Stock Inventory & Purchases',
        category: 'Supply Chain',
        icon: 'icofont-database',
        description: 'Stock ledger, purchase orders (stock-in), sales out, returns, inventory valuation'
    },
    dispatch: {
        id: 'dispatch',
        name: 'Dispatch Management',
        category: 'Supply Chain',
        icon: 'icofont-delivery-time',
        description: 'Order packaging, shipping manifests, tracking numbers, and delivery confirmation'
    },
    complaints: {
        id: 'complaints',
        name: 'Service Complaints',
        category: 'Support',
        icon: 'icofont-tools-alt-2',
        description: 'After-sales service tickets, maintenance claims, and technician resolution workflows'
    },
    franchise: {
        id: 'franchise',
        name: 'Franchise & Dealership',
        category: 'Business Development',
        icon: 'icofont-handshake-deal',
        description: 'Dealer applications, territorial allocations, partner vetting, and expansion leads'
    },
    reports: {
        id: 'reports',
        name: 'Reports & Analytics',
        category: 'Executive',
        icon: 'icofont-chart-growth',
        description: 'Company revenue metrics, commercial analytics, performance audits, CSV exports'
    },
    users: {
        id: 'users',
        name: 'Staff & Personnel',
        category: 'Governance',
        icon: 'icofont-users-alt-2',
        description: 'Staff directory, role assignments, reporting manager structures, account governance'
    },
    branches: {
        id: 'branches',
        name: 'Branches & Offices',
        category: 'Governance',
        icon: 'icofont-building-alt',
        description: 'Physical branch offices, geographical boundary mapping, branch manager assignments'
    },
    settings: {
        id: 'settings',
        name: 'System Settings & Audit',
        category: 'Administration',
        icon: 'icofont-gear',
        description: 'Company master configuration, security parameters, system logs, activity audit'
    },
    cms: {
        id: 'cms',
        name: 'Website CMS',
        category: 'Marketing',
        icon: 'icofont-globe',
        description: 'Dynamic website homepage, solar services, product gallery, team bios, testimonials'
    }
};

// =========================================================================
// 2. GRANULAR FEATURE & ACTION PERMISSIONS REGISTRY
// Format: `<module>.<feature>.<action>`
// =========================================================================
const PERMISSIONS = {
    // -------------------------------------------------------------
    // 1. ATTENDANCE MODULE
    // -------------------------------------------------------------
    'attendance.module.access': {
        module: 'attendance', feature: 'module', action: 'access',
        label: 'Attendance Module Access', description: 'Access the attendance portal and navigation'
    },
    'attendance.punch.create': {
        module: 'attendance', feature: 'punch', action: 'create',
        label: 'Punch Geo-Attendance', description: 'Submit daily check-in and check-out GPS punches'
    },
    'attendance.personal.view': {
        module: 'attendance', feature: 'personal', action: 'view',
        label: 'View Own Attendance', description: 'View personal historical attendance punches'
    },
    'attendance.branch.view': {
        module: 'attendance', feature: 'branch', action: 'view',
        label: 'View Branch Staff Attendance', description: 'Review attendance records of assigned branch staff'
    },
    'attendance.all.view': {
        module: 'attendance', feature: 'all', action: 'view',
        label: 'View All Attendance Logs', description: 'View company-wide staff attendance logs and audit history'
    },
    'attendance.all.export': {
        module: 'attendance', feature: 'all', action: 'export',
        label: 'Export Attendance Reports', description: 'Export attendance logs to CSV or spreadsheets'
    },

    // -------------------------------------------------------------
    // 2. PROJECTS MODULE
    // -------------------------------------------------------------
    'projects.module.access': {
        module: 'projects', feature: 'module', action: 'access',
        label: 'Projects Module Access', description: 'Access solar installation projects portal'
    },
    'projects.records.view': {
        module: 'projects', feature: 'records', action: 'view',
        label: 'View Projects List', description: 'View list and status overview of solar projects'
    },
    'projects.records.detail': {
        module: 'projects', feature: 'records', action: 'view',
        label: 'View Project Details', description: 'View comprehensive project detail page and timeline'
    },
    'projects.records.create': {
        module: 'projects', feature: 'records', action: 'create',
        label: 'Create Project', description: 'Initialize new rooftop solar installation project'
    },
    'projects.status.edit': {
        module: 'projects', feature: 'status', action: 'edit',
        label: 'Update Project Status', description: 'Advance project execution stage and milestone status'
    },
    'projects.site_visit.create': {
        module: 'projects', feature: 'site_visit', action: 'create',
        label: 'Submit Site Visit Survey', description: 'Record field survey measurements, roof photos, and DISCOM notes'
    },
    'projects.site_visit.approve': {
        module: 'projects', feature: 'site_visit', action: 'approve',
        label: 'Review & Approve Site Visit', description: 'Approve or reject field survey findings'
    },
    'projects.tasks.view': {
        module: 'projects', feature: 'tasks', action: 'view',
        label: 'View Project Tasks', description: 'Inspect individual execution tasks within a project'
    },
    'projects.tasks.create': {
        module: 'projects', feature: 'tasks', action: 'create',
        label: 'Create Project Task', description: 'Add operational or compliance tasks to a project'
    },
    'projects.tasks.edit': {
        module: 'projects', feature: 'tasks', action: 'edit',
        label: 'Update Task Status', description: 'Mark project tasks as in-progress or completed'
    },
    'projects.assignment.assign': {
        module: 'projects', feature: 'assignment', action: 'assign',
        label: 'Assign Engineers & Staff', description: 'Assign field engineers and project supervisors'
    },
    'projects.materials.manage': {
        module: 'projects', feature: 'materials', action: 'manage',
        label: 'Allocate Project Materials', description: 'Attach required panels, inverters, and BOS to project'
    },
    'projects.documents.view': {
        module: 'projects', feature: 'documents', action: 'view',
        label: 'Download Project Documents', description: 'Download site drawings, DISCOM sanctions, and certificates'
    },
    'projects.documents.create': {
        module: 'projects', feature: 'documents', action: 'create',
        label: 'Upload Project Documents', description: 'Upload inspection reports, net-metering NOCs, warranties'
    },
    'projects.completion.approve': {
        module: 'projects', feature: 'completion', action: 'approve',
        label: 'Commission & Complete Project', description: 'Final project commissioning sign-off and completion'
    },

    // -------------------------------------------------------------
    // 3. QUOTATIONS MODULE
    // -------------------------------------------------------------
    'quotations.module.access': {
        module: 'quotations', feature: 'module', action: 'access',
        label: 'Quotations Module Access', description: 'Access commercial quotation management portal'
    },
    'quotations.requests.view': {
        module: 'quotations', feature: 'requests', action: 'view',
        label: 'View Quotation Requests', description: 'View client solar quotation requests and intake forms'
    },
    'quotations.requests.create': {
        module: 'quotations', feature: 'requests', action: 'create',
        label: 'Submit Quotation Request', description: 'Create and submit new rooftop quotation request'
    },
    'quotations.requests.edit': {
        module: 'quotations', feature: 'requests', action: 'edit',
        label: 'Resubmit Quotation Request', description: 'Edit and resubmit returned quotation requests'
    },
    'quotations.requests.reject': {
        module: 'quotations', feature: 'requests', action: 'reject',
        label: 'Reject Quotation Request', description: 'Decline unqualified quotation requests'
    },
    'quotations.preparation.view': {
        module: 'quotations', feature: 'preparation', action: 'view',
        label: 'Access Quotation Calculator', description: 'Open financial worksheet and system capacity calculator'
    },
    'quotations.preparation.create': {
        module: 'quotations', feature: 'preparation', action: 'create',
        label: 'Save Prepared Quotation', description: 'Calculate and save prepared solar proposal financials'
    },
    'quotations.records.view': {
        module: 'quotations', feature: 'records', action: 'view',
        label: 'View Quotations List', description: 'View directory of prepared commercial quotations'
    },
    'quotations.records.detail': {
        module: 'quotations', feature: 'records', action: 'view',
        label: 'View Quotation Details', description: 'Inspect full pricing and technical specifications of a quote'
    },
    'quotations.document.view': {
        module: 'quotations', feature: 'document', action: 'view',
        label: 'View Official Quotation Document', description: 'View and print branded client proposal document'
    },
    'quotations.approval.approve': {
        module: 'quotations', feature: 'approval', action: 'approve',
        label: 'Approve Quotation (Maker-Checker)', description: 'Approve prepared quotation and discount pricing'
    },
    'quotations.approval.reject': {
        module: 'quotations', feature: 'approval', action: 'reject',
        label: 'Reject Quotation (Maker-Checker)', description: 'Reject prepared quotation with reviewer remarks'
    },
    'quotations.archive.manage': {
        module: 'quotations', feature: 'archive', action: 'manage',
        label: 'Archive Outdated Quotation', description: 'Archive obsolete or expired commercial quotations'
    },
    'quotations.customer_response.edit': {
        module: 'quotations', feature: 'customer_response', action: 'edit',
        label: 'Record Customer Acceptance', description: 'Log client acceptance, feedback, or negotiation status'
    },

    // -------------------------------------------------------------
    // 4. INVOICES MODULE
    // -------------------------------------------------------------
    'invoices.module.access': {
        module: 'invoices', feature: 'module', action: 'access',
        label: 'Invoices Module Access', description: 'Access tax invoices and billing portal'
    },
    'invoices.records.view': {
        module: 'invoices', feature: 'records', action: 'view',
        label: 'View Tax Invoices List', description: 'Browse issued tax invoices and payment records'
    },
    'invoices.records.create': {
        module: 'invoices', feature: 'records', action: 'create',
        label: 'Create Tax Invoice', description: 'Generate and issue official GST tax invoice'
    },
    'invoices.records.edit': {
        module: 'invoices', feature: 'records', action: 'edit',
        label: 'Edit Tax Invoice', description: 'Update invoice payment status and transaction details'
    },
    'invoices.records.delete': {
        module: 'invoices', feature: 'records', action: 'delete',
        label: 'Cancel or Delete Invoice', description: 'Void or remove invalid tax invoices'
    },
    'invoices.records.export': {
        module: 'invoices', feature: 'records', action: 'export',
        label: 'Export Invoice Register', description: 'Export billing and GST ledger data to CSV'
    },

    // -------------------------------------------------------------
    // 5. CRM & CUSTOMERS MODULE
    // -------------------------------------------------------------
    'crm.module.access': {
        module: 'crm', feature: 'module', action: 'access',
        label: 'CRM Module Access', description: 'Access customer relationship and lead management'
    },
    'crm.customers.view': {
        module: 'crm', feature: 'customers', action: 'view',
        label: 'View Customers Directory', description: 'Access full customer database and contact history'
    },
    'crm.customers.create': {
        module: 'crm', feature: 'customers', action: 'create',
        label: 'Onboard New Customer', description: 'Register customer profile with contact and location data'
    },
    'crm.customers.edit': {
        module: 'crm', feature: 'customers', action: 'edit',
        label: 'Edit Customer Profile', description: 'Update customer contact info, address, and consumer number'
    },
    'crm.search.view': {
        module: 'crm', feature: 'search', action: 'view',
        label: 'Search Customers by Mobile', description: 'Query customer database by phone number (used in quotes)'
    },
    'crm.enquiries.view': {
        module: 'crm', feature: 'enquiries', action: 'view',
        label: 'View Website Inquiries', description: 'Inspect general solar contact inquiries from public website'
    },
    'crm.enquiries.edit': {
        module: 'crm', feature: 'enquiries', action: 'edit',
        label: 'Update Inquiry Status', description: 'Mark inquiries as contacted, follow-up, or closed'
    },
    'crm.surveys.view': {
        module: 'crm', feature: 'surveys', action: 'view',
        label: 'View Solar Survey Leads', description: 'Review website requests for free rooftop solar surveys'
    },
    'crm.surveys.edit': {
        module: 'crm', feature: 'surveys', action: 'edit',
        label: 'Update Survey Lead Status', description: 'Qualify and advance rooftop solar site survey requests'
    },
    'crm.surveys.delete': {
        module: 'crm', feature: 'surveys', action: 'delete',
        label: 'Delete Survey Lead', description: 'Remove spam or duplicate site survey submissions'
    },

    // -------------------------------------------------------------
    // 6. MATERIAL MASTER & SUPPLIERS MODULE
    // -------------------------------------------------------------
    'material.module.access': {
        module: 'material', feature: 'module', action: 'access',
        label: 'Material Master Module Access', description: 'Access solar equipment master catalog'
    },
    'material.catalog.view': {
        module: 'material', feature: 'catalog', action: 'view',
        label: 'View Material Catalog', description: 'Browse materials, specifications, and categories'
    },
    'material.catalog.create': {
        module: 'material', feature: 'catalog', action: 'create',
        label: 'Create Material Master', description: 'Add new solar panel, inverter, or structure product'
    },
    'material.catalog.edit': {
        module: 'material', feature: 'catalog', action: 'edit',
        label: 'Edit Material Specifications', description: 'Modify item dimensions, ratings, and master data'
    },
    'material.catalog.manage': {
        module: 'material', feature: 'catalog', action: 'manage',
        label: 'Toggle Material Status', description: 'Activate or deactivate items in the component master'
    },
    'material.suppliers.view': {
        module: 'material', feature: 'suppliers', action: 'view',
        label: 'View Suppliers Directory', description: 'Inspect vendor and manufacturer master profiles'
    },
    'material.suppliers.create': {
        module: 'material', feature: 'suppliers', action: 'create',
        label: 'Register New Supplier', description: 'Onboard vendor with GSTIN, contact, and credit terms'
    },
    'material.suppliers.edit': {
        module: 'material', feature: 'suppliers', action: 'edit',
        label: 'Edit Supplier Details', description: 'Update supplier address, contact, and business terms'
    },
    'material.suppliers.manage': {
        module: 'material', feature: 'suppliers', action: 'manage',
        label: 'Toggle Supplier Status', description: 'Activate or blacklist procurement suppliers'
    },

    // -------------------------------------------------------------
    // 7. INVENTORY & STOCK MANAGEMENT MODULE
    // -------------------------------------------------------------
    'inventory.module.access': {
        module: 'inventory', feature: 'module', action: 'access',
        label: 'Inventory Module Access', description: 'Access stock ledger and warehouse operations'
    },
    'inventory.stock.view': {
        module: 'inventory', feature: 'stock', action: 'view',
        label: 'View Current Stock Levels', description: 'Inspect warehouse quantities, reorder points, availability'
    },
    'inventory.stock.manage': {
        module: 'inventory', feature: 'stock', action: 'manage',
        label: 'Update Default Selling Price', description: 'Update standard retail selling prices of stock items'
    },
    'inventory.purchases.view': {
        module: 'inventory', feature: 'purchases', action: 'view',
        label: 'View Purchase Orders (Stock-In)', description: 'Inspect supplier purchase orders and receiving logs'
    },
    'inventory.purchases.create': {
        module: 'inventory', feature: 'purchases', action: 'create',
        label: 'Create Purchase Order', description: 'Draft and submit new equipment purchase orders'
    },
    'inventory.purchases.approve': {
        module: 'inventory', feature: 'purchases', action: 'approve',
        label: 'Confirm Stock-In Inwarding', description: 'Confirm receipt of goods and increment physical inventory'
    },
    'inventory.purchases.reject': {
        module: 'inventory', feature: 'purchases', action: 'reject',
        label: 'Cancel Purchase Order', description: 'Void draft or unfulfilled supplier purchase orders'
    },
    'inventory.adjustments.manage': {
        module: 'inventory', feature: 'adjustments', action: 'manage',
        label: 'Execute Stock Adjustments', description: 'Record physical audit variances, breakages, or adjustments'
    },
    'inventory.sales_out.view': {
        module: 'inventory', feature: 'sales_out', action: 'view',
        label: 'View Sales Out Orders', description: 'View stock-out records and direct equipment sales'
    },
    'inventory.sales_out.create': {
        module: 'inventory', feature: 'sales_out', action: 'create',
        label: 'Create Sales Out Order', description: 'Issue stock for external sale or contractor handover'
    },
    'inventory.sales_out.approve': {
        module: 'inventory', feature: 'sales_out', action: 'approve',
        label: 'Confirm Sales Out & Decrement Stock', description: 'Finalize sale and deduct items from inventory'
    },
    'inventory.sales_out.reject': {
        module: 'inventory', feature: 'sales_out', action: 'reject',
        label: 'Cancel Sales Out Order', description: 'Cancel pending material sale order'
    },
    'inventory.sales_out.export': {
        module: 'inventory', feature: 'sales_out', action: 'export',
        label: 'Export Sales Out Report', description: 'Export sales register and tax summaries to CSV'
    },
    'inventory.returns.view': {
        module: 'inventory', feature: 'returns', action: 'view',
        label: 'View Returns Register', description: 'View material returns from projects or customers'
    },
    'inventory.returns.create': {
        module: 'inventory', feature: 'returns', action: 'create',
        label: 'Initiate Return Request', description: 'Submit return request for damaged or surplus goods'
    },
    'inventory.returns.approve': {
        module: 'inventory', feature: 'returns', action: 'approve',
        label: 'Inspect & Approve Returns', description: 'Verify returned equipment condition and restock inventory'
    },
    'inventory.returns.reject': {
        module: 'inventory', feature: 'returns', action: 'reject',
        label: 'Reject Return Request', description: 'Decline ineligible or damaged equipment returns'
    },
    'inventory.history.view': {
        module: 'inventory', feature: 'history', action: 'view',
        label: 'View Stock Movement Ledger', description: 'Audit historical transactions and item movement logs'
    },
    'inventory.reports.view': {
        module: 'inventory', feature: 'reports', action: 'view',
        label: 'View Inventory Reports', description: 'Inspect stock valuation, turnover, and low-stock alerts'
    },
    'inventory.reports.export': {
        module: 'inventory', feature: 'reports', action: 'export',
        label: 'Export Stock Reports', description: 'Export stock ledger and audit reports to CSV'
    },

    // -------------------------------------------------------------
    // 8. DISPATCH MANAGEMENT MODULE
    // -------------------------------------------------------------
    'dispatch.module.access': {
        module: 'dispatch', feature: 'module', action: 'access',
        label: 'Dispatch Module Access', description: 'Access dispatch and shipment fulfillment portal'
    },
    'dispatch.orders.view': {
        module: 'dispatch', feature: 'orders', action: 'view',
        label: 'View Dispatch Orders', description: 'Inspect dispatch queues, waybills, and delivery statuses'
    },
    'dispatch.orders.detail': {
        module: 'dispatch', feature: 'orders', action: 'view',
        label: 'View Dispatch Details', description: 'View packaging slip, items, serials, and transporter'
    },
    'dispatch.orders.create': {
        module: 'dispatch', feature: 'orders', action: 'create',
        label: 'Create Dispatch Package', description: 'Package project or sales order items for shipment'
    },
    'dispatch.orders.edit': {
        module: 'dispatch', feature: 'orders', action: 'edit',
        label: 'Update Dispatch Status', description: 'Update status (PACKING, SHIPPED, DELIVERED) and tracking ID'
    },

    // -------------------------------------------------------------
    // 9. SERVICE COMPLAINTS MODULE
    // -------------------------------------------------------------
    'complaints.module.access': {
        module: 'complaints', feature: 'module', action: 'access',
        label: 'Complaints Module Access', description: 'Access service complaints and ticketing portal'
    },
    'complaints.tickets.view': {
        module: 'complaints', feature: 'tickets', action: 'view',
        label: 'View Complaints Register', description: 'Browse warranty claims, inverter faults, customer complaints'
    },
    'complaints.tickets.edit': {
        module: 'complaints', feature: 'tickets', action: 'edit',
        label: 'Update Complaint Status', description: 'Assign technician, log visit notes, and resolve tickets'
    },

    // -------------------------------------------------------------
    // 10. FRANCHISE & DEALERSHIP MODULE
    // -------------------------------------------------------------
    'franchise.module.access': {
        module: 'franchise', feature: 'module', action: 'access',
        label: 'Franchise Module Access', description: 'Access dealer and franchise expansion portal'
    },
    'franchise.applications.view': {
        module: 'franchise', feature: 'applications', action: 'view',
        label: 'View Franchise Applications', description: 'Review dealership applications and applicant profiles'
    },
    'franchise.applications.edit': {
        module: 'franchise', feature: 'applications', action: 'edit',
        label: 'Update Application Status', description: 'Process franchise vetting, interview, and approval stages'
    },
    'franchise.applications.delete': {
        module: 'franchise', feature: 'applications', action: 'delete',
        label: 'Delete Franchise Application', description: 'Remove invalid or duplicate dealership inquiries'
    },

    // -------------------------------------------------------------
    // 11. REPORTS & BUSINESS ANALYTICS MODULE
    // -------------------------------------------------------------
    'reports.module.access': {
        module: 'reports', feature: 'module', action: 'access',
        label: 'Reports Module Access', description: 'Access executive analytics and reports dashboard'
    },
    'reports.analytics.view': {
        module: 'reports', feature: 'analytics', action: 'view',
        label: 'View Business Analytics', description: 'Inspect revenue charts, project pipelines, and sales metrics'
    },
    'reports.analytics.export': {
        module: 'reports', feature: 'analytics', action: 'export',
        label: 'Export Financial Reports', description: 'Download executive revenue and sales data CSV files'
    },

    // -------------------------------------------------------------
    // 12. STAFF & PERSONNEL MANAGEMENT MODULE
    // -------------------------------------------------------------
    'users.module.access': {
        module: 'users', feature: 'module', action: 'access',
        label: 'Staff Management Module Access', description: 'Access personnel and employee governance portal'
    },
    'users.employees.view': {
        module: 'users', feature: 'employees', action: 'view',
        label: 'View Employees Directory', description: 'Browse registered staff members, roles, and branch assignments'
    },
    'users.employees.create': {
        module: 'users', feature: 'employees', action: 'create',
        label: 'Create Staff Account', description: 'Onboard new employee, manager, or administrator'
    },
    'users.employees.edit': {
        module: 'users', feature: 'employees', action: 'edit',
        label: 'Edit User Profile & Permissions', description: 'Modify staff details, branch assignment, and permission flags'
    },
    'users.employees.manage': {
        module: 'users', feature: 'employees', action: 'manage',
        label: 'Manage Status & Passwords', description: 'Suspend/activate accounts, reset passwords, assign managers'
    },
    'users.managers.view': {
        module: 'users', feature: 'managers', action: 'view',
        label: 'View Managers Overview', description: 'Inspect branch operational managers and supervisory hierarchy'
    },

    // -------------------------------------------------------------
    // 13. BRANCHES MANAGEMENT MODULE
    // -------------------------------------------------------------
    'branches.module.access': {
        module: 'branches', feature: 'module', action: 'access',
        label: 'Branches Module Access', description: 'Access physical branch management portal'
    },
    'branches.offices.view': {
        module: 'branches', feature: 'offices', action: 'view',
        label: 'View Branch Directory', description: 'Inspect branch office locations, codes, and assigned managers'
    },
    'branches.offices.create': {
        module: 'branches', feature: 'offices', action: 'create',
        label: 'Create New Branch', description: 'Register new regional office location and contact details'
    },
    'branches.offices.edit': {
        module: 'branches', feature: 'offices', action: 'edit',
        label: 'Edit Branch Details', description: 'Update branch address, geofencing coordinates, and staff'
    },
    'branches.offices.manage': {
        module: 'branches', feature: 'offices', action: 'manage',
        label: 'Toggle Branch Status', description: 'Activate or close regional branch offices'
    },

    // -------------------------------------------------------------
    // 14. SETTINGS & SYSTEM AUDIT MODULE
    // -------------------------------------------------------------
    'settings.module.access': {
        module: 'settings', feature: 'module', action: 'access',
        label: 'Settings Module Access', description: 'Access system configuration and activity logs'
    },
    'settings.general.view': {
        module: 'settings', feature: 'general', action: 'view',
        label: 'View System Settings', description: 'Inspect company master configuration and operational parameters'
    },
    'settings.general.edit': {
        module: 'settings', feature: 'general', action: 'edit',
        label: 'Save System Settings', description: 'Update company address, tax credentials, and system parameters'
    },
    'settings.audit_logs.view': {
        module: 'settings', feature: 'audit_logs', action: 'view',
        label: 'View Security Audit Logs', description: 'Inspect access attempts, role changes, and security events'
    },

    // -------------------------------------------------------------
    // 15. DYNAMIC WEBSITE CMS MODULE
    // -------------------------------------------------------------
    'cms.module.access': {
        module: 'cms', feature: 'module', action: 'access',
        label: 'Website CMS Module Access', description: 'Access dynamic public website content management'
    },
    'cms.services.manage': {
        module: 'cms', feature: 'services', action: 'manage',
        label: 'Manage Solar Services CMS', description: 'Create, update, or remove services displayed on public website'
    },
    'cms.products.manage': {
        module: 'cms', feature: 'products', action: 'manage',
        label: 'Manage Products CMS', description: 'Create, update, or remove products displayed on public website'
    },
    'cms.projects.manage': {
        module: 'cms', feature: 'projects', action: 'manage',
        label: 'Manage Projects CMS', description: 'Publish or edit completed rooftop project portfolio items'
    },
    'cms.team.manage': {
        module: 'cms', feature: 'team', action: 'manage',
        label: 'Manage Team & Founders CMS', description: 'Update executive team profiles, photos, and descriptions'
    },
    'cms.testimonials.manage': {
        module: 'cms', feature: 'testimonials', action: 'manage',
        label: 'Manage Customer Testimonials', description: 'Publish or edit verified customer reviews and ratings'
    },
    'cms.contact.manage': {
        module: 'cms', feature: 'contact', action: 'manage',
        label: 'Manage Website Contact Info', description: 'Update public office contact, helpline numbers, and emails'
    }
};

// =========================================================================
// 3. SENSITIVE FIELD PERMISSIONS (FIELD-LEVEL AUTHORIZATION)
// Format: `fields.<domain>.<sensitiveField>.view`
// =========================================================================
const SENSITIVE_FIELDS = {
    'fields.material.purchase_price.view': {
        domain: 'material', field: 'purchase_price', action: 'view',
        label: 'View Material Purchase Rate',
        description: 'Visibility of supplier purchase rates and unit procurement costs'
    },
    'fields.inventory.wac.view': {
        domain: 'inventory', field: 'wac', action: 'view',
        label: 'View Weighted Average Cost (WAC)',
        description: 'Visibility of inventory WAC cost and total stock valuation figures'
    },
    'fields.inventory.profit_margin.view': {
        domain: 'inventory', field: 'profit_margin', action: 'view',
        label: 'View Inventory Profit Margins',
        description: 'Visibility of cost vs. sales price margins on inventory out transactions'
    },
    'fields.quotation.cost_breakdown.view': {
        domain: 'quotation', field: 'cost_breakdown', action: 'view',
        label: 'View Quotation Cost Breakdown',
        description: 'Visibility of internal cost worksheets, base equipment price, and profit margin'
    },
    'fields.invoice.financial_metrics.view': {
        domain: 'invoice', field: 'financial_metrics', action: 'view',
        label: 'View Executive Financial Totals',
        description: 'Visibility of global company turnover, tax collections, and gross receivables'
    },
    'fields.customer.pii.view': {
        domain: 'customer', field: 'pii', action: 'view',
        label: 'View Full Customer Identity PII',
        description: 'Visibility of unmasked personal identification documents (Aadhaar, electricity bills)'
    }
};

// =========================================================================
// 4. ROLE PRESET BASELINES (FOR BACKWARD-COMPATIBLE MIGRATION ONLY)
// New Super Admins start with EMPTY permissions ([]).
// Existing users receive these baselines during migration to preserve access.
// =========================================================================
const ROLE_MIGRATION_BASELINES = {
    SUPER_ADMIN: {
        permissions: Object.keys(PERMISSIONS),
        fieldPermissions: Object.keys(SENSITIVE_FIELDS)
    },
    BRANCH_MANAGER: {
        permissions: [
            // Attendance
            'attendance.module.access',
            'attendance.punch.create',
            'attendance.personal.view',
            'attendance.branch.view',
            // Projects
            'projects.module.access',
            'projects.records.view',
            'projects.records.detail',
            'projects.records.create',
            'projects.status.edit',
            'projects.site_visit.approve',
            'projects.tasks.view',
            'projects.tasks.create',
            'projects.tasks.edit',
            'projects.assignment.assign',
            'projects.materials.manage',
            'projects.documents.view',
            'projects.documents.create',
            'projects.completion.approve',
            // Quotations
            'quotations.module.access',
            'quotations.requests.view',
            'quotations.requests.create',
            'quotations.requests.edit',
            'quotations.requests.reject',
            'quotations.preparation.view',
            'quotations.preparation.create',
            'quotations.records.view',
            'quotations.records.detail',
            'quotations.document.view',
            'quotations.approval.approve',
            'quotations.approval.reject',
            'quotations.archive.manage',
            'quotations.customer_response.edit',
            // Invoices
            'invoices.module.access',
            'invoices.records.view',
            'invoices.records.create',
            'invoices.records.edit',
            // CRM
            'crm.module.access',
            'crm.customers.view',
            'crm.customers.create',
            'crm.customers.edit',
            'crm.search.view',
            'crm.enquiries.view',
            'crm.enquiries.edit',
            'crm.surveys.view',
            'crm.surveys.edit',
            // Complaints
            'complaints.module.access',
            'complaints.tickets.view',
            'complaints.tickets.edit',
            // Staff
            'users.module.access',
            'users.employees.view',
            // Reports (branch view)
            'reports.module.access',
            'reports.analytics.view'
        ],
        fieldPermissions: [
            'fields.quotation.cost_breakdown.view'
        ]
    },
    MANAGER: {
        permissions: [
            'attendance.module.access',
            'attendance.punch.create',
            'attendance.personal.view',
            'attendance.branch.view',
            'projects.module.access',
            'projects.records.view',
            'projects.records.detail',
            'projects.records.create',
            'projects.status.edit',
            'projects.site_visit.approve',
            'projects.tasks.view',
            'projects.tasks.create',
            'projects.tasks.edit',
            'projects.assignment.assign',
            'projects.materials.manage',
            'projects.documents.view',
            'projects.documents.create',
            'projects.completion.approve',
            'quotations.module.access',
            'quotations.requests.view',
            'quotations.requests.create',
            'quotations.requests.edit',
            'quotations.requests.reject',
            'quotations.preparation.view',
            'quotations.preparation.create',
            'quotations.records.view',
            'quotations.records.detail',
            'quotations.document.view',
            'quotations.approval.approve',
            'quotations.approval.reject',
            'quotations.archive.manage',
            'quotations.customer_response.edit',
            'invoices.module.access',
            'invoices.records.view',
            'invoices.records.create',
            'invoices.records.edit',
            'crm.module.access',
            'crm.customers.view',
            'crm.customers.create',
            'crm.customers.edit',
            'crm.search.view',
            'crm.enquiries.view',
            'crm.enquiries.edit',
            'crm.surveys.view',
            'crm.surveys.edit',
            'complaints.module.access',
            'complaints.tickets.view',
            'complaints.tickets.edit',
            'users.module.access',
            'users.employees.view',
            'reports.module.access',
            'reports.analytics.view'
        ],
        fieldPermissions: [
            'fields.quotation.cost_breakdown.view'
        ]
    },
    EMPLOYEE: {
        permissions: [
            // Attendance
            'attendance.module.access',
            'attendance.punch.create',
            'attendance.personal.view',
            // Projects
            'projects.module.access',
            'projects.records.view',
            'projects.records.detail',
            'projects.site_visit.create',
            'projects.tasks.view',
            'projects.tasks.edit',
            'projects.documents.view',
            'projects.documents.create',
            // Quotations
            'quotations.module.access',
            'quotations.requests.view',
            'quotations.requests.create',
            'quotations.requests.edit',
            'quotations.records.view',
            'quotations.records.detail',
            'quotations.document.view',
            'quotations.customer_response.edit',
            // CRM
            'crm.search.view',
            'crm.customers.create'
        ],
        fieldPermissions: []
    }
};

// =========================================================================
// 5. REGISTRY HELPER FUNCTIONS & VALIDATORS
// =========================================================================

// Guarantee consistent 'name' and 'label' properties across all permission definitions
for (const [key, perm] of Object.entries(PERMISSIONS)) {
    if (!perm.name) {
        perm.name = perm.label || key;
    }
    if (!perm.label) {
        perm.label = perm.name || key;
    }
}

for (const [key, field] of Object.entries(SENSITIVE_FIELDS)) {
    if (!field.name) {
        field.name = field.label || key;
    }
    if (!field.label) {
        field.label = field.name || key;
    }
}

const allPermissionKeysSet = new Set(Object.keys(PERMISSIONS));
const allFieldKeysSet = new Set(Object.keys(SENSITIVE_FIELDS));

function isValidPermission(key) {
    return allPermissionKeysSet.has(key);
}

function isValidFieldPermission(key) {
    return allFieldKeysSet.has(key);
}

function getAllPermissionKeys() {
    return Object.keys(PERMISSIONS);
}

function getAllFieldPermissionKeys() {
    return Object.keys(SENSITIVE_FIELDS);
}

function filterValidPermissions(keys) {
    if (!Array.isArray(keys)) return [];
    return keys.filter(k => allPermissionKeysSet.has(k));
}

function filterValidFieldPermissions(keys) {
    if (!Array.isArray(keys)) return [];
    return keys.filter(k => allFieldKeysSet.has(k));
}

function getPermissionsByModule(moduleId) {
    const res = [];
    for (const [key, perm] of Object.entries(PERMISSIONS)) {
        if (perm.module === moduleId) {
            const label = perm.label || perm.name || key;
            res.push({
                key,
                name: label,
                label: label,
                description: perm.description || '',
                action: perm.action || '',
                feature: perm.feature || 'general',
                ...perm,
                name: label // guarantee name is always defined
            });
        }
    }
    return res;
}

function getFullPermissionTree() {
    const tree = {};
    for (const [modId, modMeta] of Object.entries(MODULES)) {
        tree[modId] = {
            ...modMeta,
            permissions: getPermissionsByModule(modId)
        };
    }
    return tree;
}

module.exports = {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    isValidPermission,
    isValidFieldPermission,
    getAllPermissionKeys,
    getAllFieldPermissionKeys,
    filterValidPermissions,
    filterValidFieldPermissions,
    getPermissionsByModule,
    getFullPermissionTree
};
