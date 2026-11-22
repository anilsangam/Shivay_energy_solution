# SHIVAY ENERGY SOLUTIONS — CENTRALIZED PERMISSION REGISTRY
## Canonical Permissions, Features, Actions and Sensitive Fields Catalog
**Version:** 1.0.0 (Phase 1 Approved)  
**Source Code:** [config/permissionRegistry.js](file:///c:/rid/solar_panial/config/permissionRegistry.js)  
**Author:** Antigravity AI Engineering Team  
**Date:** November 22, 2026

---

## 1. CANONICAL MODULE INVENTORY (15 MODULES)

| Module Key | Display Name | Category | Icon Class | Primary Scope |
| :--- | :--- | :--- | :--- | :--- |
| `attendance` | Attendance & GPS | Operations | `icofont-location-pin` | Geo-tagged check-in/out, GPS logs, branch attendance oversight |
| `projects` | Project Execution | Operations | `icofont-energy-solar` | Installation milestones, surveys, tasks, engineering docs, grid tie-in |
| `quotations` | Quotations & Commercials | Commercial | `icofont-calculator-alt-2` | Cost worksheets, client proposals, approvals, customer acceptance |
| `invoices` | Tax Invoices & Billing | Finance | `icofont-bill` | GST invoices, billing management, payment receipts, PDF invoices |
| `crm` | CRM & Lead Management | Commercial | `icofont-address-book` | Customer master, mobile lookup, website leads, site survey requests |
| `material` | Material Master & Suppliers | Supply Chain | `icofont-box` | Component catalog, tech specs, vendor profiles, vendor credit terms |
| `inventory` | Stock Inventory & Purchases | Supply Chain | `icofont-database` | Stock ledger, purchase orders (stock-in), sales out, returns, WAC |
| `dispatch` | Dispatch Management | Supply Chain | `icofont-delivery-time` | Packaging, courier tracking, shipment manifests, delivery confirmation |
| `complaints` | Service Complaints | Support | `icofont-tools-alt-2` | Post-installation service tickets, warranty claims, maintenance |
| `franchise` | Franchise & Dealership | Business Expansion | `icofont-handshake-deal` | Dealer inquiries, territory allocations, partner vetting |
| `reports` | Reports & Analytics | Executive | `icofont-chart-growth` | Executive dashboards, sales analytics, financial turnover, exports |
| `users` | Staff & Personnel | Governance | `icofont-users-alt-2` | Staff directory, role assignments, reporting lines, security status |
| `branches` | Branches & Offices | Governance | `icofont-building-alt` | Regional office branches, geographic geofencing, branch managers |
| `settings` | System Settings & Audit | Administration | `icofont-gear` | Company configuration master, security parameters, audit trail logs |
| `cms` | Website CMS | Marketing | `icofont-globe` | Dynamic public homepage, services, products catalog, team bios |

---

## 2. GRANULAR FEATURE-ACTION PERMISSIONS DICTIONARY
*All keys strictly adhere to canonical dot notation: `<module>.<feature>.<action>`*

### 1. Attendance (`attendance`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `attendance.module.access` | `access` | Top-level entry to attendance portal and navigation links |
| `attendance.punch.create` | `create` | Submit daily field check-in and check-out GPS punches |
| `attendance.personal.view` | `view` | View employee personal historical attendance punch records |
| `attendance.branch.view` | `view` | Review attendance records of staff assigned to own branch |
| `attendance.all.view` | `view` | View company-wide attendance logs and audit history |
| `attendance.all.export` | `export` | Export attendance records and punch times to CSV spreadsheets |

### 2. Project Execution (`projects`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `projects.module.access` | `access` | Top-level entry to projects portal and project navigation |
| `projects.records.view` | `view` | Browse projects directory, installation stages, and filters |
| `projects.records.detail` | `view` | Access detailed project view, staging timeline, and notes |
| `projects.records.create` | `create` | Create a new solar rooftop installation project record |
| `projects.status.edit` | `edit` | Update project execution status (e.g. `SURVEY_SCHEDULED` -> `INSTALLATION`) |
| `projects.site_visit.create` | `create` | Field engineer submit site visit survey, roof photos, and data |
| `projects.site_visit.approve` | `approve` | Manager review and approve field site visit survey report |
| `projects.tasks.view` | `view` | View assigned execution and compliance tasks within project |
| `projects.tasks.create` | `create` | Create new operational, engineering, or liaison tasks |
| `projects.tasks.edit` | `edit` | Toggle task completion status and enter progress remarks |
| `projects.assignment.assign` | `assign` | Assign field engineers, project supervisors, and technicians |
| `projects.materials.manage` | `manage` | Allocate equipment (panels, inverters, structures) to project |
| `projects.documents.view` | `view` | Download site engineering blueprints, DISCOM NOCs, certificates |
| `projects.documents.create` | `create` | Upload site photos, net-metering documents, inspection certificates |
| `projects.completion.approve` | `approve` | Final commissioning sign-off and project completion approval |

### 3. Quotations & Commercials (`quotations`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `quotations.module.access` | `access` | Top-level entry to commercial quotation management portal |
| `quotations.requests.view` | `view` | View commercial quotation intake requests from field staff |
| `quotations.requests.create` | `create` | Submit new rooftop quotation intake request |
| `quotations.requests.edit` | `edit` | Edit and resubmit returned quotation requests |
| `quotations.requests.reject` | `reject` | Reject unqualified quotation requests |
| `quotations.preparation.view` | `view` | Access quotation pricing worksheet and capacity calculator |
| `quotations.preparation.create` | `create` | Calculate financials and save prepared quotation proposal |
| `quotations.records.view` | `view` | View register of prepared commercial quotations |
| `quotations.records.detail` | `view` | Inspect detailed technical specifications and client figures |
| `quotations.document.view` | `view` | View and print branded client proposal document (PDF/Print) |
| `quotations.approval.approve` | `approve` | Approve prepared quotation and commercial discounts (Maker-Checker) |
| `quotations.approval.reject` | `reject` | Reject prepared quotation with management reviewer comments |
| `quotations.archive.manage` | `manage` | Archive expired, superseded, or obsolete commercial quotations |
| `quotations.customer_response.edit` | `edit` | Record customer acceptance, negotiation remarks, or feedback |

### 4. Tax Invoices & Billing (`invoices`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `invoices.module.access` | `access` | Top-level entry to tax invoices and billing portal |
| `invoices.records.view` | `view` | Browse issued tax invoices and payment records |
| `invoices.records.create` | `create` | Generate and issue official GST tax invoice |
| `invoices.records.edit` | `edit` | Update invoice payment status, transaction ID, and dates |
| `invoices.records.delete` | `delete` | Void or cancel tax invoices |
| `invoices.records.export` | `export` | Export invoice register and GST ledger to CSV |

### 5. CRM & Customer Management (`crm`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `crm.module.access` | `access` | Top-level entry to CRM and customer relations portal |
| `crm.customers.view` | `view` | Browse full customer database and historical installations |
| `crm.customers.create` | `create` | Register customer profile with contact, address, and consumer info |
| `crm.customers.edit` | `edit` | Update customer phone numbers, address, and DISCOM info |
| `crm.search.view` | `view` | Search customer database by mobile number (shared with quotes) |
| `crm.enquiries.view` | `view` | Inspect general solar contact inquiries from public website |
| `crm.enquiries.edit` | `edit` | Advance inquiry lifecycle (contacted, quotation, closed) |
| `crm.surveys.view` | `view` | Review website submissions for free rooftop solar surveys |
| `crm.surveys.edit` | `edit` | Advance solar survey lead status and assign surveyor |
| `crm.surveys.delete` | `delete` | Remove spam or duplicate survey lead entries |

### 6. Material Master & Suppliers (`material`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `material.module.access` | `access` | Top-level entry to solar equipment master catalog |
| `material.catalog.view` | `view` | View material catalog items, ratings, and categories |
| `material.catalog.create` | `create` | Add new solar panel, inverter, or structure product |
| `material.catalog.edit` | `edit` | Modify product dimensions, technical specs, and model data |
| `material.catalog.manage` | `manage` | Toggle component active/inactive status in catalog master |
| `material.suppliers.view` | `view` | Browse vendor directory and manufacturer profiles |
| `material.suppliers.create` | `create` | Register new procurement supplier with GSTIN and address |
| `material.suppliers.edit` | `edit` | Update supplier terms, credit duration, and contact details |
| `material.suppliers.manage` | `manage` | Toggle supplier status (active / blacklisted) |

### 7. Stock Inventory & Purchases (`inventory`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `inventory.module.access` | `access` | Top-level entry to inventory and stock operations |
| `inventory.stock.view` | `view` | Inspect warehouse inventory quantities and low-stock alerts |
| `inventory.stock.manage` | `manage` | Update standard retail selling price of inventory items |
| `inventory.purchases.view` | `view` | View purchase orders (stock-in) and supplier consignments |
| `inventory.purchases.create` | `create` | Draft and submit new equipment purchase order |
| `inventory.purchases.approve` | `approve` | Confirm receipt of goods and increment warehouse stock |
| `inventory.purchases.reject` | `reject` | Cancel unfulfilled or rejected purchase order |
| `inventory.adjustments.manage` | `manage` | Perform physical inventory adjustments (damages, wastage) |
| `inventory.sales_out.view` | `view` | View stock-out orders and direct retail component sales |
| `inventory.sales_out.create` | `create` | Issue stock-out order for project handover or cash sale |
| `inventory.sales_out.approve` | `approve` | Confirm delivery and decrement physical inventory |
| `inventory.sales_out.reject` | `reject` | Cancel pending sales out order |
| `inventory.sales_out.export` | `export` | Export sales out transaction summary to CSV |
| `inventory.returns.view` | `view` | View material returns register from projects/customers |
| `inventory.returns.create` | `create` | Initiate return request for surplus or defective items |
| `inventory.returns.approve` | `approve` | Inspect returned items and restock into inventory |
| `inventory.returns.reject` | `reject` | Decline returned material request |
| `inventory.history.view` | `view` | Inspect stock ledger and item audit movement history |
| `inventory.reports.view` | `view` | View stock reports, valuation summaries, and alerts |
| `inventory.reports.export` | `export` | Export stock ledger and inventory reports to CSV |

### 8. Dispatch Management (`dispatch`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `dispatch.module.access` | `access` | Top-level entry to dispatch and shipping portal |
| `dispatch.orders.view` | `view` | View dispatch queue, shipping slips, and status |
| `dispatch.orders.detail` | `view` | Inspect dispatch items, serial numbers, customer and transporter |
| `dispatch.orders.create` | `create` | Create new dispatch shipment from sales or project order |
| `dispatch.orders.edit` | `edit` | Update shipment status (`PACKING`, `SHIPPED`, `DELIVERED`) & tracking |

### 9. Service Complaints (`complaints`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `complaints.module.access` | `access` | Top-level entry to service complaints portal |
| `complaints.tickets.view` | `view` | Browse service complaints and warranty claim tickets |
| `complaints.tickets.edit` | `edit` | Update ticket resolution status, technician visit notes |

### 10. Franchise & Dealership (`franchise`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `franchise.module.access` | `access` | Top-level entry to franchise and dealer portal |
| `franchise.applications.view` | `view` | Review dealership applications and applicant capital |
| `franchise.applications.edit` | `edit` | Update franchise application review and interview status |
| `franchise.applications.delete` | `delete` | Delete invalid or test franchise submissions |

### 11. Reports & Business Analytics (`reports`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `reports.module.access` | `access` | Top-level entry to executive analytics and reporting portal |
| `reports.analytics.view` | `view` | View revenue analytics, project pipeline charts, monthly trends |
| `reports.analytics.export` | `export` | Download financial reports and executive revenue CSV data |

### 12. Staff & Personnel Governance (`users`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `users.module.access` | `access` | Top-level entry to staff directory and governance portal |
| `users.employees.view` | `view` | Browse company staff directory and reporting structures |
| `users.employees.create` | `create` | Onboard new employee, manager, or administrator account |
| `users.employees.edit` | `edit` | Modify staff profile, department, branch, and permissions |
| `users.employees.manage` | `manage` | Toggle account status (ACTIVE/SUSPENDED), reset password, assign manager |
| `users.managers.view` | `view` | View branch operational managers directory and supervisory teams |

### 13. Branches & Offices (`branches`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `branches.module.access` | `access` | Top-level entry to branch management portal |
| `branches.offices.view` | `view` | Inspect branch locations, codes, and assigned branch heads |
| `branches.offices.create` | `create` | Register new regional branch office location |
| `branches.offices.edit` | `edit` | Update branch office address, contact, and geofencing coordinates |
| `branches.offices.manage` | `manage` | Toggle branch operational status (active / closed) |

### 14. System Settings & Audit (`settings`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `settings.module.access` | `access` | Top-level entry to system settings and audit portal |
| `settings.general.view` | `view` | Inspect company master configuration and system parameters |
| `settings.general.edit` | `edit` | Save company master configuration and operational parameters |
| `settings.audit_logs.view` | `view` | View security audit logs, authentication history, access denials |

### 15. Website CMS (`cms`)
| Permission Key | Action Verb | Description |
| :--- | :--- | :--- |
| `cms.module.access` | `access` | Top-level entry to website content management portal |
| `cms.services.manage` | `manage` | Create, update, or delete solar services on public website |
| `cms.products.manage` | `manage` | Create, update, or delete inverters and panels in public showcase |
| `cms.projects.manage` | `manage` | Create, update, or delete completed solar installations gallery |
| `cms.team.manage` | `manage` | Create, update, or delete executive founder and team profiles |
| `cms.testimonials.manage` | `manage` | Create, update, or delete client reviews on public website |
| `cms.contact.manage` | `manage` | Update public corporate contact info and office locations |

---

## 3. SENSITIVE FIELD PERMISSIONS CATALOG

| Field Permission Key | Domain | Sensitive Field Name | Description |
| :--- | :--- | :--- | :--- |
| `fields.material.purchase_price.view` | Material | Purchase Price | Visibility of procurement costs and vendor purchase rates |
| `fields.inventory.wac.view` | Inventory | Weighted Average Cost | Visibility of stock unit WAC and total inventory valuation |
| `fields.inventory.profit_margin.view` | Inventory | Profit Margin | Visibility of margin delta on Sales Out and component sales |
| `fields.quotation.cost_breakdown.view` | Quotations | Internal Cost Breakdown | Visibility of base system cost vs. customer quotation price |
| `fields.invoice.financial_metrics.view` | Invoices | Executive Financial Totals | Visibility of company gross billing, tax totals, total revenue |
| `fields.customer.pii.view` | CRM | Full Customer Identity | Visibility of unmasked Aadhaar, electricity bills, bank details |

---

## 4. ROLE PRESETS (FOR EXISTING USER MIGRATION BASELINE)

- **Primary Super Admin:** Receives all 80+ permissions and all 6 sensitive field permissions with unconditional system bypass.
- **New Super Admin:** Receives **EMPTY permissions array (`[]`)** by default. Must be explicitly assigned permissions.
- **Branch Manager:** Receives 52 operational permissions (Attendance, Projects, Quotations, Invoices, CRM, Complaints, Staff View, Branch Reports). Material purchase costs and system governance are disabled by default.
- **Employee:** Receives 21 field permissions (Attendance punch, Project viewing, Site survey submission, Task updates, Quotation drafting, Customer search/create). Approval and financial permissions are disabled by default.
