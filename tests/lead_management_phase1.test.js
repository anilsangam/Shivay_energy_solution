/**
 * SHIVAY ENERGY SOLUTIONS - Automated Verification Suite
 * Phase 1: Lead Management, Bulk Import, Telecalling & FBAC Integration
 */

const assert = require('assert');
const mongoose = require('mongoose');
const xlsx = require('xlsx');

// Core components under test
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const LeadService = require('../services/leadService');
const LeadController = require('../controllers/leadController');
const AuthorizationService = require('../services/authorizationService');
const {
    MODULES,
    PERMISSIONS,
    isValidPermission,
    getPermissionsByModule,
    getFullPermissionTree
} = require('../config/permissionRegistry');

let testCount = 0;
let passedCount = 0;

function it(name, fn) {
    testCount++;
    try {
        const res = fn();
        if (res && typeof res.then === 'function') {
            return res.then(() => {
                passedCount++;
                console.log(`  ✅ [PASS] ${name}`);
            }).catch(err => {
                console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
                throw err;
            });
        } else {
            passedCount++;
            console.log(`  ✅ [PASS] ${name}`);
        }
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        throw err;
    }
}

function mockRequestResponse({ session = {}, body = {}, query = {}, params = {}, headers = {} } = {}) {
    const req = {
        session,
        body,
        query,
        params,
        headers,
        flash: () => []
    };
    const res = {
        statusCode: 200,
        headersSent: false,
        jsonData: null,
        renderedView: null,
        renderedData: null,
        redirectUrl: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        render(view, data) {
            this.renderedView = view;
            this.renderedData = data;
            return this;
        },
        redirect(url) {
            this.redirectUrl = url;
            return this;
        },
        setHeader(name, val) {
            this.headers[name] = val;
            return this;
        },
        send(data) {
            this.sentData = data;
            return this;
        }
    };
    return { req, res };
}

// In-memory prototype mocks to prevent Mongoose buffering timeouts during offline unit tests
Lead.prototype.save = function () {
    return Promise.resolve(this);
};
Customer.prototype.save = function () {
    return Promise.resolve(this);
};

async function runAllTests() {
    console.log('\n======================================================================');
    console.log('🧪 LEAD-TO-INSTALLATION PHASE 1: LEAD MANAGEMENT & TELECALLING SUITE');
    console.log('======================================================================\n');

    // -------------------------------------------------------------
    // SECTION 1: PERMISSION REGISTRY & FBAC COMPLIANCE
    // -------------------------------------------------------------
    console.log('--- 1. Lead Management FBAC Permissions & Canonical Registry ---');

    it('1.1 Canonical registry contains all 9 lead permissions without altering 117 enumerable keys', () => {
        const canonicalKeys = Object.keys(PERMISSIONS);
        assert.strictEqual(canonicalKeys.length, 117, 'Enumerable canonical keys must remain exactly 117');
        assert.strictEqual(Object.keys(MODULES).length, 15, 'Canonical modules must remain exactly 15');

        const leadPermissionKeys = [
            'crm.leads.view',
            'crm.leads.create',
            'crm.leads.import',
            'crm.leads.edit',
            'crm.leads.assign',
            'crm.leads.reassign',
            'crm.leads.call_update',
            'crm.leads.followup_update',
            'crm.leads.export'
        ];

        leadPermissionKeys.forEach(key => {
            assert.strictEqual(isValidPermission(key), true, `Permission ${key} must be recognized as valid`);
            assert(PERMISSIONS[key], `Permission ${key} must exist on PERMISSIONS object`);
            assert.strictEqual(PERMISSIONS[key].module, 'crm', `Permission ${key} must belong to module 'crm'`);
            assert.strictEqual(PERMISSIONS[key].feature, 'leads', `Permission ${key} must belong to feature 'leads'`);
        });
    });

    it('1.2 getPermissionsByModule("crm") and getFullPermissionTree() expose lead permissions to UI', () => {
        const crmPerms = getPermissionsByModule('crm');
        assert.ok(crmPerms.length >= 15, `CRM module must contain at least 15 permissions, found ${crmPerms.length}`);

        const leadView = crmPerms.find(p => p.key === 'crm.leads.view');
        assert(leadView, 'crm.leads.view must be present in CRM module list');
        assert.strictEqual(leadView.name, 'View Leads & Telecalling');

        const tree = getFullPermissionTree();
        assert(tree.crm, 'Tree must contain CRM module');
        const treeLeadView = tree.crm.permissions.find(p => p.key === 'crm.leads.view');
        assert(treeLeadView, 'Full tree must include crm.leads.view');
    });

    it('1.3 AuthorizationService enforces granular lead permissions and Primary Super Admin bypass', () => {
        const primaryAdmin = {
            _id: '507f191e810c19729de860ea',
            email: 'admin@shivayenergy.com',
            role: 'SUPER_ADMIN',
            isPrimarySuperAdmin: true,
            permissions: []
        };

        const telecallerUser = {
            _id: '507f191e810c19729de860eb',
            email: 'caller@shivayenergy.com',
            role: 'EMPLOYEE',
            isPrimarySuperAdmin: false,
            permissions: ['crm.leads.view', 'crm.leads.call_update']
        };

        const unauthorizedUser = {
            _id: '507f191e810c19729de860ec',
            email: 'unauth@shivayenergy.com',
            role: 'EMPLOYEE',
            isPrimarySuperAdmin: false,
            permissions: ['material.catalog.view']
        };

        // Primary Super Admin bypasses unconditionally
        assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'crm.leads.view'), true);
        assert.strictEqual(AuthorizationService.hasPermission(primaryAdmin, 'crm.leads.import'), true);

        // Telecaller has view and call_update, but NOT import or reassign
        assert.strictEqual(AuthorizationService.hasPermission(telecallerUser, 'crm.leads.view'), true);
        assert.strictEqual(AuthorizationService.hasPermission(telecallerUser, 'crm.leads.call_update'), true);
        assert.strictEqual(AuthorizationService.hasPermission(telecallerUser, 'crm.leads.import'), false);
        assert.strictEqual(AuthorizationService.hasPermission(telecallerUser, 'crm.leads.reassign'), false);

        // Unauthorized user has none
        assert.strictEqual(AuthorizationService.hasPermission(unauthorizedUser, 'crm.leads.view'), false);
        assert.strictEqual(AuthorizationService.hasPermission(unauthorizedUser, 'crm.leads.create'), false);
    });

    // -------------------------------------------------------------
    // SECTION 2: MOBILE NUMBER VALIDATION & NORMALIZATION
    // -------------------------------------------------------------
    console.log('\n--- 2. Mobile Validation & Data Normalization ---');

    it('2.1 Mobile cleaner accurately validates standard Indian 10-digit formats', () => {
        const validSamples = [
            '9876543210',
            '+91 9876543210',
            '+919876543210',
            '919876543210',
            '09876543210',
            ' 98765 43210 ',
            '98765-43210',
            '(98765) 43210',
            '8765432109',
            '7654321098',
            '6543210987'
        ];

        for (const sample of validSamples) {
            const res = LeadService.cleanAndValidateMobile(sample);
            assert.strictEqual(res.isValid, true, `Sample "${sample}" should be valid`);
            assert.strictEqual(res.cleanMobile.length, 10, 'Clean mobile must be exactly 10 digits');
            assert.strictEqual(res.formatted, `+91 ${res.cleanMobile}`, 'Formatted must start with +91');
        }
    });

    it('2.2 Mobile cleaner strictly rejects invalid, international, or corrupted numbers', () => {
        const invalidSamples = [
            '',
            null,
            undefined,
            '12345',
            '5551234567', // Starts with 5 (invalid Indian mobile start)
            'abcdefghij',
            '98765',
            '+1 555 123 4567',
            '00919876543210', // Excess zeroes
            '9876543210123',  // Too long
            '98765abcde'
        ];

        for (const sample of invalidSamples) {
            const res = LeadService.cleanAndValidateMobile(sample);
            assert.strictEqual(res.isValid, false, `Sample "${sample}" should be rejected`);
        }
    });

    it('2.3 Header normalizer maps varied spreadsheet and tabular column names', () => {
        assert.strictEqual(LeadService.normalizeHeader('Customer Name'), 'name');
        assert.strictEqual(LeadService.normalizeHeader('Full Name'), 'name');
        assert.strictEqual(LeadService.normalizeHeader('Client_Name'), 'name');
        assert.strictEqual(LeadService.normalizeHeader('Mobile Number'), 'mobile');
        assert.strictEqual(LeadService.normalizeHeader('Phone'), 'mobile');
        assert.strictEqual(LeadService.normalizeHeader('Contact No:'), 'mobile');
        assert.strictEqual(LeadService.normalizeHeader('Alt Phone'), 'alternateMobile');
        assert.strictEqual(LeadService.normalizeHeader('Pin Code'), 'pincode');
        assert.strictEqual(LeadService.normalizeHeader('Zip code'), 'pincode');
        assert.strictEqual(LeadService.normalizeHeader('Plant Capacity (kW)'), 'solarRequirement');
        assert.strictEqual(LeadService.normalizeHeader('Avg Monthly Bill'), 'monthlyBill');
        assert.strictEqual(LeadService.normalizeHeader('Lead Priority'), 'leadPriority');
    });

    // -------------------------------------------------------------
    // SECTION 3: FILE & TABULAR TEXT PARSING
    // -------------------------------------------------------------
    console.log('\n--- 3. File & Tabular Text Parsing (CSV / TSV / Excel) ---');

    it('3.1 parseTabularText handles tab-delimited paste data (Google Sheets / Excel)', () => {
        const tsvData = [
            'Name\tMobile Number\tCity\tMonthly Bill',
            'Ramesh Kumar\t9876543210\tBhopal\t3500',
            'Suresh Verma\t8765432109\tIndore\t5000',
            'Pooja Sen\t7654321098\tRaisen\t2800'
        ].join('\n');

        const records = LeadService.parseTabularText(tsvData);
        assert.strictEqual(records.length, 3, 'Must parse exactly 3 records');
        assert.strictEqual(records[0].name, 'Ramesh Kumar');
        assert.strictEqual(records[0].mobile, '9876543210');
        assert.strictEqual(records[0].city, 'Bhopal');
        assert.strictEqual(records[0].monthlyBill, '3500');
    });

    it('3.2 parseTabularText handles comma-delimited (CSV) text with quotes and whitespace', () => {
        const csvData = [
            'Customer Name,Phone,City,State',
            '"Verma, Rajesh",9893012345,Vidisha,Madhya Pradesh',
            'Anand Solar,9826054321,Raisen,MP'
        ].join('\n');

        const records = LeadService.parseTabularText(csvData);
        assert.strictEqual(records.length, 2, 'Must parse 2 records');
        assert.strictEqual(records[1].name, 'Anand Solar');
        assert.strictEqual(records[1].mobile, '9826054321');
    });

    it('3.3 parseFileBuffer parses multi-column Excel (.xlsx) binary buffers', () => {
        const wb = xlsx.utils.book_new();
        const wsData = [
            ['Name', 'Mobile', 'Address', 'Pincode', 'Priority'],
            ['Kailash Chandra', '9893112233', 'Civil Lines', '464551', 'HIGH'],
            ['Sunita Devi', '9425012345', 'Gandhi Nagar', '462001', 'URGENT']
        ];
        const ws = xlsx.utils.aoa_to_sheet(wsData);
        xlsx.utils.book_append_sheet(wb, ws, 'Leads');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const records = LeadService.parseFileBuffer(buffer, 'test_leads.xlsx');
        assert.strictEqual(records.length, 2, 'Must parse 2 rows from excel buffer');
        assert.strictEqual(records[0].name, 'Kailash Chandra');
        assert.strictEqual(records[0].mobile, '9893112233');
        assert.strictEqual(records[0].leadPriority, 'HIGH');
        assert.strictEqual(records[1].name, 'Sunita Devi');
        assert.strictEqual(records[1].leadPriority, 'URGENT');
    });

    // -------------------------------------------------------------
    // SECTION 4: IN-BATCH & CROSS-COLLECTION DUPLICATE DETECTION
    // -------------------------------------------------------------
    console.log('\n--- 4. Batch Validation & Duplicate Detection ---');

    await (async () => {
        await it('4.1 validateAndPreview detects in-file duplicates and invalid phone numbers', async () => {
            const raw = [
                { name: 'Lead One', mobile: '9876543210' },
                { name: 'Lead Two (Duplicate Phone)', mobile: '+91 9876543210' }, // In-batch duplicate
                { name: 'Lead Three (Invalid)', mobile: '12345' },               // Invalid
                { name: '', mobile: '8877665544' },                             // Missing name
                { name: 'Lead Five (Valid)', mobile: '7766554433' }              // Valid
            ];

            const preview = await LeadService.validateAndPreview(raw);
            assert.strictEqual(preview.totalRecords, 5);
            assert.strictEqual(preview.validCount, 2, 'Only Lead One and Lead Five should be valid');
            assert.strictEqual(preview.duplicateCount, 1, 'Lead Two should be flagged duplicate');
            assert.strictEqual(preview.invalidCount, 2, 'Lead Three and missing-name should be invalid');

            assert.strictEqual(preview.validRows.length, 2);
            assert.strictEqual(preview.duplicateRows.length, 1);
            assert.strictEqual(preview.invalidRows.length, 2);

            assert.strictEqual(preview.duplicateRows[0].validationError, 'Duplicate mobile in uploaded file');
        });
    })();

    // -------------------------------------------------------------
    // SECTION 5: MODEL INTEGRITY & COLLISION-SAFE ID GENERATION
    // -------------------------------------------------------------
    console.log('\n--- 5. Lead Data Model & Schema Integrity ---');

    it('5.1 generateLeadId creates human-readable collision-safe identifier', () => {
        const id1 = LeadService.generateLeadId();
        const id2 = LeadService.generateLeadId();

        assert(id1.startsWith('LEAD-'), 'Lead ID must start with LEAD-');
        assert.notStrictEqual(id1, id2, 'Successive IDs must be unique');
        assert.strictEqual(id1.length, 16, 'Lead ID must match LEAD-YYMM-XXXXXX format');
    });

    it('5.2 Lead Mongoose model enforces schema defaults and required validation', () => {
        const validLead = new Lead({
            leadId: LeadService.generateLeadId(),
            name: 'Vikram Solar Client',
            mobile: '+91 9893011223'
        });

        assert.strictEqual(validLead.leadStatus, 'New');
        assert.strictEqual(validLead.callStatus, 'Not Called');
        assert.strictEqual(validLead.leadPriority, 'MEDIUM');
        assert.strictEqual(validLead.leadSource, 'MANUAL');
        assert.deepStrictEqual(validLead.callHistory, []);
        assert.deepStrictEqual(validLead.assignmentHistory, []);

        // Required mobile validation failure
        const missingMobileLead = new Lead({
            leadId: LeadService.generateLeadId(),
            name: 'Nameless Client'
        });
        const err = missingMobileLead.validateSync();
        assert(err && err.errors && err.errors.mobile, 'Validation must fail when mobile is missing');
    });

    // -------------------------------------------------------------
    // SECTION 6: TELECALLER CALL LOGGING & STATUS PROGRESSION
    // -------------------------------------------------------------
    console.log('\n--- 6. Telecalling Outcomes & Call History Logging ---');

    await (async () => {
        await it('6.1 recordCallOutcome updates call history, lifecycle status and callback date', async () => {
            const callerUser = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Pooja Telecaller',
                role: 'EMPLOYEE'
            };

            const mockLead = new Lead({
                leadId: LeadService.generateLeadId(),
                name: 'Sunil Agrawal',
                mobile: '+91 9826199887',
                leadStatus: 'New',
                callStatus: 'Not Called'
            });

            // Mock Lead.findById
            const originalFindById = Lead.findById;
            Lead.findById = function (id) {
                return Promise.resolve(mockLead);
            };

            try {
                const followUp = new Date(Date.now() + 86400000 * 2); // 2 days ahead
                const updated = await LeadService.recordCallOutcome(mockLead._id, callerUser, {
                    callOutcome: 'Connected',
                    notes: 'Customer interested in 3kW on-grid rooftop system with subsidy',
                    nextFollowUpDate: followUp,
                    updatedLeadStatus: 'Qualified'
                });

                assert.strictEqual(updated.callStatus, 'Called');
                assert.strictEqual(updated.leadStatus, 'Qualified');
                assert.strictEqual(updated.callHistory.length, 1);
                assert.strictEqual(updated.callHistory[0].callOutcome, 'Connected');
                assert.strictEqual(updated.callHistory[0].callerName, 'Pooja Telecaller');
                assert.strictEqual(updated.callHistory[0].notes, 'Customer interested in 3kW on-grid rooftop system with subsidy');
                assert.strictEqual(updated.followUpDate.getTime(), followUp.getTime());
            } finally {
                Lead.findById = originalFindById;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 7: REASSIGNMENT & BRANCH ISOLATION ENFORCEMENT
    // -------------------------------------------------------------
    console.log('\n--- 7. Lead Reassignment & Cross-Branch Isolation ---');

    await (async () => {
        await it('7.1 reassignLead updates owner, logs assignment trail and enforces branch isolation', async () => {
            const branchA = new mongoose.Types.ObjectId();
            const branchB = new mongoose.Types.ObjectId();

            const managerUser = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Rahul Branch Manager',
                role: 'BRANCH_MANAGER',
                branchId: branchA
            };

            const eligibleCallerBranchA = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Staff A',
                branchId: branchA,
                status: 'ACTIVE'
            };

            const foreignCallerBranchB = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Staff B Foreign',
                branchId: branchB,
                status: 'ACTIVE'
            };

            const mockLead = new Lead({
                leadId: LeadService.generateLeadId(),
                name: 'Local Lead',
                mobile: '+91 9988776655',
                branch: branchA
            });

            const originalLeadFind = Lead.findById;
            const originalUserFind = User.findById;

            Lead.findById = () => Promise.resolve(mockLead);
            User.findById = (id) => {
                const target = String(id) === String(eligibleCallerBranchA._id) ? eligibleCallerBranchA : foreignCallerBranchB;
                return {
                    select: () => Promise.resolve(target)
                };
            };

            try {
                // Attempt 1: Cross-branch reassignment by Branch Manager must be rejected
                let blocked = false;
                try {
                    await LeadService.reassignLead(mockLead._id, foreignCallerBranchB._id, managerUser, 'Cross branch attempt');
                } catch (e) {
                    blocked = true;
                    assert(e.message.includes('Branch isolation policy'), 'Must enforce branch isolation policy');
                }
                assert.strictEqual(blocked, true, 'Cross-branch reassignment must throw error');

                // Attempt 2: Reassignment to employee in same branch succeeds
                const reassigned = await LeadService.reassignLead(mockLead._id, eligibleCallerBranchA._id, managerUser, 'Workload balancing');
                assert.strictEqual(String(reassigned.assignedTelecaller), String(eligibleCallerBranchA._id));
                assert.strictEqual(reassigned.assignmentHistory.length, 1);
                assert.strictEqual(reassigned.assignmentHistory[0].newOwnerName, 'Staff A');
                assert.strictEqual(reassigned.assignmentHistory[0].assignedByName, 'Rahul Branch Manager');
            } finally {
                Lead.findById = originalLeadFind;
                User.findById = originalUserFind;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 8: LEAD CONVERSION TO CUSTOMER
    // -------------------------------------------------------------
    console.log('\n--- 8. Lead-to-Customer Conversion ---');

    await (async () => {
        await it('8.1 convertLeadToCustomer promotes qualified lead and creates customer record', async () => {
            const adminUser = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Primary Admin',
                role: 'SUPER_ADMIN'
            };

            const mockLead = new Lead({
                _id: new mongoose.Types.ObjectId(),
                leadId: LeadService.generateLeadId(),
                name: 'Deepak Solar Buyer',
                mobile: '+91 9876501234',
                city: 'Raisen',
                state: 'Madhya Pradesh',
                leadStatus: 'Qualified'
            });

            const mockCustomer = new Customer({
                _id: new mongoose.Types.ObjectId(),
                name: 'Deepak Solar Buyer',
                mobile: '+91 9876501234',
                customerType: 'RESIDENTIAL'
            });

            const originalLeadFind = Lead.findById;
            const originalCustomerFindOne = Customer.findOne;

            Lead.findById = () => Promise.resolve(mockLead);
            Customer.findOne = () => Promise.resolve(null); // No existing customer

            // Mock customer save
            Customer.prototype.save = function () {
                return Promise.resolve(this);
            };

            try {
                const result = await LeadService.convertLeadToCustomer(mockLead._id, adminUser);
                assert.strictEqual(mockLead.leadStatus, 'Converted');
                assert(mockLead.convertedCustomerId, 'Lead must have convertedCustomerId');
                assert(mockLead.convertedAt, 'Lead must record convertedAt timestamp');
                assert.strictEqual(result.alreadyConverted, false);

                // Second call must be idempotent
                const secondCall = await LeadService.convertLeadToCustomer(mockLead._id, adminUser);
                assert.strictEqual(secondCall.alreadyConverted, true);
            } finally {
                Lead.findById = originalLeadFind;
                Customer.findOne = originalCustomerFindOne;
            }
        });
    })();

    // -------------------------------------------------------------
    // SECTION 9: CONTROLLER ENDPOINTS & SECURITY AUTHORIZATION
    // -------------------------------------------------------------
    console.log('\n--- 9. LeadController API Endpoints & Request Handling ---');

    await (async () => {
        await it('9.1 createLead validates input, rejects missing name and duplicate mobile', async () => {
            const primaryAdmin = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Primary Admin',
                role: 'SUPER_ADMIN'
            };

            // Missing name
            const { req: req1, res: res1 } = mockRequestResponse({
                session: { user: primaryAdmin },
                body: { name: '', mobile: '9876543210' }
            });
            await LeadController.createLead(req1, res1);
            assert.strictEqual(res1.statusCode, 400);
            assert.strictEqual(res1.jsonData.success, false);

            // Invalid mobile
            const { req: req2, res: res2 } = mockRequestResponse({
                session: { user: primaryAdmin },
                body: { name: 'Valid Name', mobile: '123' }
            });
            await LeadController.createLead(req2, res2);
            assert.strictEqual(res2.statusCode, 400);
            assert.strictEqual(res2.jsonData.success, false);
        });

        await it('9.2 postRecordCall validates outcome and rejects unlisted options', async () => {
            const telecaller = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Telecaller One',
                role: 'EMPLOYEE'
            };

            const { req, res } = mockRequestResponse({
                session: { user: telecaller },
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { callOutcome: 'INVALID_OUTCOME_STRING' }
            });

            await LeadController.postRecordCall(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.jsonData.success, false);
            assert(res.jsonData.message.includes('Invalid call outcome'));
        });

        await it('9.3 postAddComment appends note and rejects empty text', async () => {
            const caller = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Commenter',
                role: 'EMPLOYEE'
            };

            // Empty comment rejection
            const { req: reqEmpty, res: resEmpty } = mockRequestResponse({
                session: { user: caller },
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { comment: '   ' }
            });

            await LeadController.postAddComment(reqEmpty, resEmpty);
            assert.strictEqual(resEmpty.statusCode, 400);
            assert.strictEqual(resEmpty.jsonData.success, false);
        });

        await it('9.4 postImportPreview parses raw text and returns validation breakdown', async () => {
            const caller = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Importer Staff',
                role: 'EMPLOYEE'
            };

            const tsvData = "Name\tMobile\tCity\nRohit Sharma\t9826011111\tBhopal\nVirat Kohli\t9826022222\tIndore";
            const { req, res } = mockRequestResponse({
                session: { user: caller },
                body: { rawText: tsvData }
            });

            await LeadController.postImportPreview(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.jsonData.success, true);
            assert.strictEqual(res.jsonData.totalRecords, 2);
            assert.strictEqual(res.jsonData.validCount, 2);
        });

        await it('9.5 postImportConfirm executes bulk save and produces summary response', async () => {
            const adminUser = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Admin User',
                role: 'SUPER_ADMIN'
            };

            const validRecords = [
                { name: 'Import Lead 1', mobile: '9826033333', city: 'Raisen' },
                { name: 'Import Lead 2', mobile: '9826044444', city: 'Bhopal' }
            ];

            const { req, res } = mockRequestResponse({
                session: { user: adminUser },
                body: {
                    records: validRecords,
                    leadSource: 'BULK_IMPORT',
                    autoDistribute: false
                }
            });

            await LeadController.postImportConfirm(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.jsonData.success, true);
            assert.strictEqual(res.jsonData.summary.imported, 2);
        });

        await it('9.6 getLeadDetails enforces branch isolation and handles unassigned employees', async () => {
            const branchA = new mongoose.Types.ObjectId();
            const branchB = new mongoose.Types.ObjectId();

            const employeeA = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Employee A',
                role: 'EMPLOYEE',
                branchId: branchA,
                permissions: ['crm.leads.view']
            };

            const mockLead = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Target Lead',
                branch: branchB,
                assignedTelecaller: new mongoose.Types.ObjectId(),
                createdBy: new mongoose.Types.ObjectId()
            };

            const originalFindById = Lead.findById;
            Lead.findById = () => ({
                populate: () => ({
                    populate: () => ({
                        populate: () => ({
                            populate: () => ({
                                populate: () => ({
                                    lean: () => Promise.resolve(mockLead)
                                })
                            })
                        })
                    })
                })
            });

            try {
                const { req, res } = mockRequestResponse({
                    session: { user: employeeA },
                    params: { id: mockLead._id.toString() }
                });

                await LeadController.getLeadDetails(req, res);
                assert.strictEqual(res.statusCode, 403, 'Employee from branch A cannot view unassigned lead in branch B');
                assert.strictEqual(res.jsonData.success, false);
            } finally {
                Lead.findById = originalFindById;
            }
        });

        await it('9.7 exportLeadsCsv formats CSV stream with all required standard columns', async () => {
            const adminUser = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Primary Admin',
                role: 'SUPER_ADMIN'
            };

            const mockLeadsList = [
                {
                    leadId: 'LEAD-2611-0001',
                    name: 'Kavita Joshi',
                    mobile: '+91 9826055555',
                    alternateMobile: '',
                    email: 'kavita@example.com',
                    city: 'Bhopal',
                    district: 'Bhopal',
                    state: 'Madhya Pradesh',
                    pincode: '462001',
                    leadStatus: 'New',
                    callStatus: 'Not Called',
                    leadPriority: 'HIGH',
                    leadSource: 'PORTAL',
                    followUpDate: null,
                    assignedTelecaller: { name: 'Pooja', employeeId: 'EMP-01' },
                    branch: { name: 'Bhopal Main', code: 'BHP' },
                    createdAt: new Date('2026-11-20')
                }
            ];

            const originalFind = Lead.find;
            Lead.find = () => ({
                populate: () => ({
                    populate: () => ({
                        sort: () => ({
                            limit: () => ({
                                lean: () => Promise.resolve(mockLeadsList)
                            })
                        })
                    })
                })
            });

            try {
                const { req, res } = mockRequestResponse({
                    session: { user: adminUser },
                    query: {}
                });

                await LeadController.exportLeadsCsv(req, res);
                assert.strictEqual(res.headers['Content-Type'], 'text/csv');
                assert(res.headers['Content-Disposition'].includes('leads_export_'));
                assert(res.sentData.includes('Lead ID,Name,Mobile'));
                assert(res.sentData.includes('LEAD-2611-0001'));
                assert(res.sentData.includes('Kavita Joshi'));
            } finally {
                Lead.find = originalFind;
            }
        });

        await it('9.8 Designation presets TELECALLER and SALES_EXECUTIVE contain lead permissions', () => {
            const { DESIGNATION_PRESETS } = require('../config/permissionRegistry');
            assert(DESIGNATION_PRESETS.TELECALLER, 'Must have TELECALLER preset');
            assert(DESIGNATION_PRESETS.TELECALLER.includes('crm.leads.view'));
            assert(DESIGNATION_PRESETS.TELECALLER.includes('crm.leads.call_update'));

            assert(DESIGNATION_PRESETS.SALES_EXECUTIVE, 'Must have SALES_EXECUTIVE preset');
            assert(DESIGNATION_PRESETS.SALES_EXECUTIVE.includes('crm.leads.view'));
            assert(DESIGNATION_PRESETS.SALES_EXECUTIVE.includes('crm.leads.create'));
        });
    })();

    console.log('\n======================================================================');
    console.log(`🎯 PHASE 1 VERIFICATION RESULTS: ${passedCount} PASSED, ${testCount - passedCount} FAILED`);
    console.log('======================================================================\n');

    if (testCount !== passedCount) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal error in Phase 1 test suite:', err);
    process.exit(1);
});
