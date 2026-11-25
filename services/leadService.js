const mongoose = require('mongoose');
const crypto = require('crypto');
const xlsx = require('xlsx');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditService = require('./auditService');
const AuthorizationService = require('./authorizationService');

class LeadService {
    /**
     * Generate collision-safe human-readable Lead ID (e.g. LEAD-2611-AB12)
     */
    static generateLeadId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `LEAD-${dateStr}-${randomHex}`;
    }

    /**
     * Clean and validate Indian 10-digit mobile number
     */
    static cleanAndValidateMobile(mobile) {
        if (!mobile || typeof mobile !== 'string') {
            return { isValid: false, cleanMobile: '', formatted: '' };
        }
        // Remove all non-digits
        let digits = mobile.replace(/\D/g, '');
        // Strip country code (+91 or 91) or leading zero
        if (digits.length === 12 && digits.startsWith('91')) {
            digits = digits.slice(2);
        } else if (digits.length === 11 && digits.startsWith('0')) {
            digits = digits.slice(1);
        }

        // Standard Indian mobile: 10 digits starting with 6, 7, 8, 9
        const isValid = /^[6-9]\d{9}$/.test(digits);
        return {
            isValid,
            cleanMobile: digits,
            formatted: isValid ? `+91 ${digits}` : digits
        };
    }

    /**
     * Normalize column keys from uploaded files or copy-paste text
     */
    static normalizeHeader(header) {
        if (!header) return '';
        const h = header.toString().trim().toLowerCase().replace(/[\s_\-\.\:\(\)\/\\]+/g, '');
        if (['name', 'customername', 'fullname', 'clientname', 'contactname', 'leadname'].includes(h)) return 'name';
        if (['mobile', 'mobilenumber', 'mobileno', 'phone', 'phonenumber', 'phoneno', 'contact', 'contactno', 'contactnumber', 'cell', 'primarymobile'].includes(h)) return 'mobile';
        if (['altmobile', 'alternatemobile', 'altmobileno', 'secondaryphone', 'altphone', 'otherphone', 'alternatephone', 'altcontact', 'altcontactno'].includes(h)) return 'alternateMobile';
        if (['email', 'emailaddress', 'mail'].includes(h)) return 'email';
        if (['address', 'street', 'location', 'siteaddress'].includes(h)) return 'address';
        if (['city', 'town'].includes(h)) return 'city';
        if (['district'].includes(h)) return 'district';
        if (['state', 'province'].includes(h)) return 'state';
        if (['pincode', 'pin', 'zip', 'zipcode', 'postalcode'].includes(h)) return 'pincode';
        if (['solarrequirement', 'requirement', 'capacity', 'systemcapacity', 'plantcapacity', 'plantcapacitykw', 'kw'].includes(h)) return 'solarRequirement';
        if (['monthlybill', 'bill', 'electricitybill', 'avgbill', 'avgmonthlybill'].includes(h)) return 'monthlyBill';
        if (['leadpriority', 'priority'].includes(h)) return 'leadPriority';
        if (['leadsource', 'source'].includes(h)) return 'leadSource';
        return h;
    }

    /**
     * Parse raw tabular string (copy-paste from Excel / Google Sheets / TSV / CSV)
     */
    static parseTabularText(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return [];

        // Detect delimiter (tab vs comma vs pipe)
        const firstLine = lines[0];
        let delimiter = '\t';
        if (!firstLine.includes('\t')) {
            if (firstLine.includes(',')) delimiter = ',';
            else if (firstLine.includes('|')) delimiter = '|';
            else if (firstLine.includes(';')) delimiter = ';';
        }

        const headers = firstLine.split(delimiter).map(h => this.normalizeHeader(h));
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
            if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;

            const row = {};
            headers.forEach((h, idx) => {
                if (h) row[h] = cells[idx] || '';
            });
            records.push(row);
        }
        return records;
    }

    /**
     * Parse file buffer (Excel .xlsx, .xls or .csv)
     */
    static parseFileBuffer(buffer, originalFilename = '') {
        const ext = (originalFilename.split('.').pop() || '').toLowerCase();
        const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        const sheet = workbook.Sheets[sheetName];
        const rawJson = xlsx.utils.sheet_to_json(sheet, { defval: '' });

        return rawJson.map(row => {
            const normalized = {};
            for (const [k, v] of Object.entries(row)) {
                const normKey = this.normalizeHeader(k);
                if (normKey) {
                    normalized[normKey] = (v !== null && v !== undefined) ? v.toString().trim() : '';
                }
            }
            return normalized;
        });
    }

    /**
     * Validate and check duplicates across database for preview
     */
    static async validateAndPreview(rawRecords, { branchId = null, defaultSource = 'BULK_IMPORT' } = {}) {
        const MAX_IMPORT_LIMIT = 2000;
        const total = Math.min(rawRecords.length, MAX_IMPORT_LIMIT);

        const previewRows = [];
        const validRows = [];
        const duplicateRows = [];
        const invalidRows = [];

        const seenMobilesInBatch = new Set();
        const mobilesToCheck = [];

        // First pass: syntax and format validation
        for (let i = 0; i < total; i++) {
            const r = rawRecords[i];
            const name = (r.name || '').trim();
            const rawMobile = (r.mobile || '').toString().trim();
            const mobileValidation = this.cleanAndValidateMobile(rawMobile);

            const record = {
                index: i + 1,
                name: name || 'Unnamed Lead',
                mobile: mobileValidation.cleanMobile || rawMobile,
                formattedMobile: mobileValidation.formatted || rawMobile,
                alternateMobile: (r.alternateMobile || '').trim(),
                email: (r.email || '').trim().toLowerCase(),
                address: (r.address || '').trim(),
                city: (r.city || 'Raisen').trim(),
                district: (r.district || 'Raisen').trim(),
                state: (r.state || 'Madhya Pradesh').trim(),
                pincode: (r.pincode || '').trim(),
                solarRequirement: (r.solarRequirement || 'Residential Rooftop (PM Surya Ghar)').trim(),
                monthlyBill: parseFloat(r.monthlyBill) || 0,
                leadPriority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes((r.leadPriority || '').toUpperCase()) 
                    ? r.leadPriority.toUpperCase() 
                    : 'MEDIUM',
                leadSource: defaultSource,
                isValid: true,
                isDuplicate: false,
                validationError: null
            };

            if (!name) {
                record.isValid = false;
                record.validationError = 'Customer / Contact name is missing';
            } else if (!mobileValidation.isValid) {
                record.isValid = false;
                record.validationError = `Invalid 10-digit mobile number (${rawMobile || 'empty'})`;
            } else if (seenMobilesInBatch.has(record.mobile)) {
                record.isValid = false;
                record.isDuplicate = true;
                record.validationError = 'Duplicate mobile in uploaded file';
            } else {
                seenMobilesInBatch.add(record.mobile);
                mobilesToCheck.push(record.mobile);
            }

            previewRows.push(record);
        }

        // Second pass: query DB for existing duplicates in Lead and Customer collections
        const existingLeadMobiles = new Set();
        const existingCustomerMobiles = new Set();

        if (mobilesToCheck.length > 0 && mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                // Find existing leads with matching 10-digit mobiles
                const foundLeads = await Lead.find({
                    mobile: { $in: mobilesToCheck.map(m => new RegExp(m + '$')) }
                }).select('mobile name leadStatus assignedTelecaller').lean();

                foundLeads.forEach(l => {
                    const clean = l.mobile.replace(/\D/g, '').slice(-10);
                    if (clean) existingLeadMobiles.add(clean);
                });

                // Find existing customers with matching 10-digit mobiles
                const foundCustomers = await Customer.find({
                    mobile: { $in: mobilesToCheck.map(m => new RegExp(m + '$')) }
                }).select('mobile name status').lean();

                foundCustomers.forEach(c => {
                    const clean = c.mobile.replace(/\D/g, '').slice(-10);
                    if (clean) existingCustomerMobiles.add(clean);
                });
            } catch (dbErr) {
                console.error('[LeadService] DB error checking duplicate mobiles:', dbErr.message);
            }
        }

        // Third pass: mark database duplicates
        for (const r of previewRows) {
            if (r.isValid && !r.isDuplicate) {
                if (existingLeadMobiles.has(r.mobile)) {
                    r.isValid = false;
                    r.isDuplicate = true;
                    r.validationError = 'Already registered as active Lead in database';
                } else if (existingCustomerMobiles.has(r.mobile)) {
                    r.isValid = false;
                    r.isDuplicate = true;
                    r.validationError = 'Already registered as Customer in database';
                }
            }

            if (r.isDuplicate) {
                duplicateRows.push(r);
            } else if (!r.isValid) {
                invalidRows.push(r);
            } else {
                validRows.push(r);
            }
        }

        return {
            totalRecords: previewRows.length,
            validCount: validRows.length,
            duplicateCount: duplicateRows.length,
            invalidCount: invalidRows.length,
            previewRows: previewRows.slice(0, 50), // Show first 50 rows in preview table
            validRows,
            duplicateRows,
            invalidRows
        };
    }

    /**
     * Auto-assign leads among eligible telecallers in a branch (Round-Robin / Least Workload)
     */
    static async autoDistributeLeads(leadCount, branchId, assignedByUser) {
        if (!branchId || leadCount <= 0) return [];
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return [];

        try {
            // Find active staff in this branch who have telecaller capability
            const query = {
                branchId,
                status: 'ACTIVE',
                role: { $in: ['EMPLOYEE', 'BRANCH_MANAGER', 'MANAGER'] }
            };
            const candidates = await User.find(query).select('name employeeId role designation permissions').lean();
            if (!candidates || candidates.length === 0) return [];

            // Filter for telecaller capability: designation or permissions
            const telecallers = candidates.filter(u => {
                const des = (u.designation || '').toLowerCase();
                if (des.includes('telecall') || des.includes('sales') || des.includes('crm') || des.includes('calling')) return true;
                if (u.permissions && (u.permissions.includes('crm.leads.call_update') || u.permissions.includes('crm.leads.view') || u.permissions.includes('*'))) return true;
                return u.role === 'EMPLOYEE'; // Default fallback
            });

            if (telecallers.length === 0) return [];

            // Get current active lead count for each telecaller to balance workload
            const telecallerIds = telecallers.map(t => t._id);
            const countsAgg = await Lead.aggregate([
                {
                    $match: {
                        assignedTelecaller: { $in: telecallerIds },
                        leadStatus: { $in: ['New', 'Contacted', 'Follow-up Required'] }
                    }
                },
                {
                    $group: {
                        _id: '$assignedTelecaller',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const countMap = new Map();
            countsAgg.forEach(c => countMap.set(c._id.toString(), c.count));

            // Sort telecallers by least active workload first
            telecallers.sort((a, b) => {
                const countA = countMap.get(a._id.toString()) || 0;
                const countB = countMap.get(b._id.toString()) || 0;
                return countA - countB;
            });

            // Distribute round-robin
            const assignments = [];
            for (let i = 0; i < leadCount; i++) {
                const assignee = telecallers[i % telecallers.length];
                assignments.push(assignee);
            }
            return assignments;
        } catch (err) {
            console.error('[LeadService] autoDistributeLeads error:', err.message);
            return [];
        }
    }

    /**
     * Save validated leads into database in bulk
     */
    static async saveBulkLeads(validRecords, {
        branchId = null,
        telecallerId = null,
        autoDistribute = false,
        currentUser = null,
        leadSource = 'BULK_IMPORT'
    } = {}) {
        if (!validRecords || validRecords.length === 0) {
            return { total: 0, imported: 0, failed: 0, leads: [] };
        }

        let assignedList = [];
        if (autoDistribute && branchId) {
            assignedList = await this.autoDistributeLeads(validRecords.length, branchId, currentUser);
        }

        const docsToInsert = validRecords.map((r, idx) => {
            const leadId = this.generateLeadId();
            let assignedTelecaller = null;

            if (telecallerId && mongoose.isValidObjectId(telecallerId)) {
                assignedTelecaller = telecallerId;
            } else if (assignedList[idx]) {
                assignedTelecaller = assignedList[idx]._id;
            }

            const assignmentHistory = [];
            if (assignedTelecaller) {
                assignmentHistory.push({
                    newOwner: assignedTelecaller,
                    newOwnerName: assignedList[idx] ? assignedList[idx].name : 'Assigned Telecaller',
                    assignedBy: currentUser ? currentUser._id : null,
                    assignedByName: currentUser ? currentUser.name : 'System Import',
                    assignedAt: new Date(),
                    reason: autoDistribute ? 'Automatic Workload Distribution' : 'Bulk Import Assignment'
                });
            }

            return {
                leadId,
                name: r.name,
                mobile: r.formattedMobile || (r.mobile.startsWith('+91') ? r.mobile : `+91 ${r.mobile}`),
                alternateMobile: r.alternateMobile || '',
                email: r.email || '',
                address: r.address || '',
                city: r.city || 'Raisen',
                district: r.district || 'Raisen',
                state: r.state || 'Madhya Pradesh',
                pincode: r.pincode || '',
                solarRequirement: r.solarRequirement || 'Residential Rooftop (PM Surya Ghar)',
                monthlyBill: r.monthlyBill || 0,
                leadSource: r.leadSource || leadSource,
                branch: branchId || (currentUser ? currentUser.branchId : null),
                assignedTelecaller,
                leadPriority: r.leadPriority || 'MEDIUM',
                leadStatus: 'New',
                callStatus: 'Not Called',
                assignmentHistory,
                createdBy: currentUser ? currentUser._id : null
            };
        });

        let insertedDocs = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            insertedDocs = await Lead.insertMany(docsToInsert, { ordered: false });
        } else {
            insertedDocs = docsToInsert; // Mock offline mode
        }

        // Log audit event
        if (currentUser) {
            AuditService.log({
                action: 'LEAD_IMPORTED',
                user: currentUser._id,
                role: currentUser.role,
                branchId: branchId || currentUser.branchId,
                details: {
                    importedCount: insertedDocs.length,
                    leadSource,
                    autoDistribute: !!autoDistribute
                }
            });
        }

        return {
            total: validRecords.length,
            imported: insertedDocs.length,
            failed: validRecords.length - insertedDocs.length,
            leads: insertedDocs
        };
    }

    /**
     * Record call outcome and update lead lifecycle status
     */
    static async recordCallOutcome(leadId, callerUser, {
        callOutcome,
        notes = '',
        nextFollowUpDate = null,
        updatedLeadStatus = null
    }) {
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new Error('Lead not found.');
        }

        const prevLeadStatus = lead.leadStatus;
        const callRecord = {
            caller: callerUser._id,
            callerName: callerUser.name,
            callDate: new Date(),
            callOutcome,
            notes: notes ? notes.trim() : '',
            nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
            previousStatus: prevLeadStatus,
            updatedStatus: updatedLeadStatus || prevLeadStatus
        };

        lead.callHistory.push(callRecord);
        lead.callStatus = 'Called';

        if (updatedLeadStatus) {
            lead.leadStatus = updatedLeadStatus;
        } else if (callOutcome === 'Connected') {
            lead.leadStatus = 'Contacted';
        } else if (callOutcome === 'Invalid Number') {
            lead.leadStatus = 'Disqualified';
        }

        if (nextFollowUpDate) {
            lead.followUpDate = new Date(nextFollowUpDate);
        }

        await lead.save();

        AuditService.log({
            action: 'LEAD_CALL_LOGGED',
            user: callerUser._id,
            role: callerUser.role,
            branchId: lead.branch,
            details: {
                leadId: lead._id,
                callOutcome,
                updatedLeadStatus: lead.leadStatus,
                nextFollowUpDate: lead.followUpDate
            }
        });

        return lead;
    }

    /**
     * Reassign lead to a new telecaller or employee
     */
    static async reassignLead(leadId, newOwnerId, assignedByUser, reason = 'Manager Reassignment') {
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new Error('Lead not found.');
        }

        const newOwner = await User.findById(newOwnerId).select('name employeeId branchId role status');
        if (!newOwner) {
            throw new Error('Selected employee was not found.');
        }
        if (newOwner.status !== 'ACTIVE') {
            throw new Error('Cannot assign lead to an inactive employee.');
        }

        // Branch Isolation Check: Unless Super Admin, cannot assign across branches
        if (assignedByUser.role !== 'SUPER_ADMIN') {
            const userBranch = assignedByUser.branchId ? assignedByUser.branchId.toString() : '';
            const targetBranch = newOwner.branchId ? newOwner.branchId.toString() : '';
            if (userBranch && targetBranch && userBranch !== targetBranch) {
                throw new Error('Branch isolation policy: You cannot assign leads to an employee from another branch.');
            }
        }

        const prevOwnerId = lead.assignedTelecaller;
        let prevOwnerName = 'Unassigned';
        if (prevOwnerId) {
            const prevUser = await User.findById(prevOwnerId).select('name');
            if (prevUser) prevOwnerName = prevUser.name;
        }

        lead.assignmentHistory.push({
            previousOwner: prevOwnerId,
            previousOwnerName: prevOwnerName,
            newOwner: newOwner._id,
            newOwnerName: newOwner.name,
            assignedBy: assignedByUser._id,
            assignedByName: assignedByUser.name,
            assignedAt: new Date(),
            reason: reason.trim() || 'Manual Reassignment'
        });

        lead.assignedTelecaller = newOwner._id;
        // If lead had no branch, assign new owner's branch
        if (!lead.branch && newOwner.branchId) {
            lead.branch = newOwner.branchId;
        }

        await lead.save();

        AuditService.log({
            action: 'LEAD_REASSIGNED',
            user: assignedByUser._id,
            role: assignedByUser.role,
            branchId: lead.branch,
            details: {
                leadId: lead._id,
                previousOwner: prevOwnerId,
                newOwner: newOwner._id,
                reason
            }
        });

        return lead;
    }

    /**
     * Convert Lead to full Customer record
     */
    static async convertLeadToCustomer(leadId, sessionUser) {
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new Error('Lead not found.');
        }
        if (lead.leadStatus === 'Converted' && lead.convertedCustomerId) {
            return { lead, customerId: lead.convertedCustomerId, alreadyConverted: true };
        }

        const cleanMobile = lead.mobile.replace(/\D/g, '').slice(-10);

        // Find or create customer
        let customer = await Customer.findOne({
            mobile: { $regex: cleanMobile + '$' }
        });

        if (!customer) {
            customer = new Customer({
                name: lead.name,
                mobile: lead.mobile.startsWith('+91') ? lead.mobile : `+91 ${cleanMobile}`,
                alternateMobile: lead.alternateMobile || '',
                email: lead.email || '',
                address: lead.address || '',
                city: lead.city || 'Raisen',
                district: lead.district || 'Raisen',
                state: lead.state || 'Madhya Pradesh',
                pincode: lead.pincode || '',
                customerType: 'RESIDENTIAL',
                status: 'ACTIVE',
                assignedEmployee: lead.assignedTelecaller || sessionUser._id,
                assignedBranch: lead.branch || sessionUser.branchId || null,
                createdBy: sessionUser._id,
                leadId: lead._id
            });
            await customer.save();
        } else {
            customer.leadId = lead._id;
            await customer.save();
        }

        lead.leadStatus = 'Converted';
        lead.convertedCustomerId = customer._id;
        lead.convertedAt = new Date();
        await lead.save();

        AuditService.log({
            action: 'LEAD_CONVERTED',
            user: sessionUser._id,
            role: sessionUser.role,
            branchId: lead.branch,
            details: {
                leadId: lead._id,
                customerId: customer._id,
                customerName: customer.name
            }
        });

        return { lead, customer, alreadyConverted: false };
    }
}

module.exports = LeadService;
