const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Customer = require('../models/Customer');
const LeadService = require('../services/leadService');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');
const companyData = require('../config/company');

class LeadController {
    /**
     * Telecaller Dashboard & Lead Directory View
     */
    static async getLeadsPage(req, res) {
        try {
            const currentUser = req.session.user;
            const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
            const limit = Math.max(5, Math.min(100, parseInt(req.query.limit, 10) || 15));
            const skip = (page - 1) * limit;

            const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
            const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
            const callStatusFilter = typeof req.query.callStatus === 'string' ? req.query.callStatus.trim() : '';
            const priorityFilter = typeof req.query.priority === 'string' ? req.query.priority.trim() : '';
            const followUpFilter = typeof req.query.followUp === 'string' ? req.query.followUp.trim() : '';
            const telecallerFilter = typeof req.query.telecaller === 'string' ? req.query.telecaller.trim() : '';
            const branchFilter = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';

            // Build Scoped Query based on RBAC + FBAC and Branch isolation
            const conditions = [];

            if (currentUser.role === 'SUPER_ADMIN') {
                if (branchFilter && mongoose.isValidObjectId(branchFilter)) {
                    conditions.push({ branch: branchFilter });
                }
            } else if (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'MANAGER') {
                const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId) : null;
                if (userBranch) {
                    conditions.push({ branch: userBranch });
                }
            } else {
                // EMPLOYEE (Telecaller / Sales Executive)
                // Telecallers with branch/manager lead permissions (assign/reassign/edit) see branch leads; others see assigned/created leads
                const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId) : null;
                const viewAllBranchLeads = AuthorizationService.hasAnyPermission(currentUser, ['crm.leads.assign', 'crm.leads.reassign', 'crm.leads.edit']);

                if (viewAllBranchLeads && userBranch) {
                    conditions.push({ branch: userBranch });
                } else {
                    conditions.push({
                        $or: [
                            { assignedTelecaller: currentUser._id },
                            { assignedFieldEngineer: currentUser._id },
                            { createdBy: currentUser._id }
                        ]
                    });
                }
            }

            // Status filter
            if (statusFilter && statusFilter !== 'ALL') {
                conditions.push({ leadStatus: statusFilter });
            }

            // Call status filter
            if (callStatusFilter && callStatusFilter !== 'ALL') {
                conditions.push({ callStatus: callStatusFilter });
            }

            // Priority filter
            if (priorityFilter && priorityFilter !== 'ALL') {
                conditions.push({ leadPriority: priorityFilter });
            }

            // Telecaller filter (for managers)
            if (telecallerFilter && telecallerFilter !== 'ALL' && mongoose.isValidObjectId(telecallerFilter)) {
                conditions.push({ assignedTelecaller: telecallerFilter });
            }

            // Follow-up Date filter
            if (followUpFilter) {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

                if (followUpFilter === 'today') {
                    conditions.push({
                        followUpDate: { $gte: startOfToday, $lte: endOfToday }
                    });
                } else if (followUpFilter === 'overdue') {
                    conditions.push({
                        followUpDate: { $lt: startOfToday },
                        leadStatus: { $in: ['New', 'Contacted', 'Follow-up Required'] }
                    });
                } else if (followUpFilter === 'upcoming') {
                    conditions.push({
                        followUpDate: { $gt: endOfToday }
                    });
                } else if (followUpFilter === 'none') {
                    conditions.push({
                        $or: [{ followUpDate: null }, { followUpDate: { $exists: false } }]
                    });
                }
            }

            // Search query (clean regex)
            if (search) {
                const cleanSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp(cleanSearch, 'i');
                const mobileDigits = search.replace(/\D/g, '');

                const searchOr = [
                    { name: searchRegex },
                    { leadId: searchRegex },
                    { city: searchRegex },
                    { district: searchRegex }
                ];
                if (mobileDigits.length >= 4) {
                    searchOr.push({ mobile: new RegExp(mobileDigits) });
                }
                conditions.push({ $or: searchOr });
            }

            const query = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

            let leads = [];
            let total = 0;
            let stats = {
                totalLeads: 0,
                notCalled: 0,
                called: 0,
                connected: 0,
                followUpDue: 0,
                qualified: 0,
                notInterested: 0,
                converted: 0
            };
            let telecallers = [];
            let branches = [];

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                // Base filter for stats calculation (scoping without UI filters applied)
                const baseScoping = [];
                if (currentUser.role === 'SUPER_ADMIN') {
                    if (branchFilter && mongoose.isValidObjectId(branchFilter)) {
                        baseScoping.push({ branch: branchFilter });
                    }
                } else if (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'MANAGER') {
                    const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId) : null;
                    if (userBranch) baseScoping.push({ branch: userBranch });
                } else {
                    const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId) : null;
                    const viewAllBranchLeads = AuthorizationService.hasAnyPermission(currentUser, ['crm.leads.assign', 'crm.leads.reassign', 'crm.leads.edit']);
                    if (viewAllBranchLeads && userBranch) {
                        baseScoping.push({ branch: userBranch });
                    } else {
                        baseScoping.push({
                            $or: [
                                { assignedTelecaller: currentUser._id },
                                { assignedFieldEngineer: currentUser._id },
                                { createdBy: currentUser._id }
                            ]
                        });
                    }
                }
                const statsMatch = baseScoping.length > 1 ? { $and: baseScoping } : (baseScoping[0] || {});

                // Now compute pagination & stats concurrently
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

                const [
                    totalCount,
                    leadDocs,
                    [statsAgg],
                    telecallerStaff,
                    activeBranches
                ] = await Promise.all([
                    Lead.countDocuments(query),
                    Lead.find(query)
                        .populate('assignedTelecaller', 'name employeeId mobile email designation')
                        .populate('assignedFieldEngineer', 'name employeeId mobile')
                        .populate('branch', 'name code city')
                        .populate('createdBy', 'name employeeId')
                        .sort({ createdAt: -1, _id: -1 })
                        .skip(skip)
                        .limit(limit)
                        .lean(),
                    Lead.aggregate([
                        { $match: statsMatch },
                        {
                            $group: {
                                _id: null,
                                totalLeads: { $sum: 1 },
                                notCalled: { $sum: { $cond: [{ $eq: ['$callStatus', 'Not Called'] }, 1, 0] } },
                                called: { $sum: { $cond: [{ $eq: ['$callStatus', 'Called'] }, 1, 0] } },
                                connected: { $sum: { $cond: [{ $eq: ['$leadStatus', 'Contacted'] }, 1, 0] } },
                                qualified: { $sum: { $cond: [{ $eq: ['$leadStatus', 'Qualified'] }, 1, 0] } },
                                notInterested: { $sum: { $cond: [{ $eq: ['$leadStatus', 'Not Interested'] }, 1, 0] } },
                                converted: { $sum: { $cond: [{ $eq: ['$leadStatus', 'Converted'] }, 1, 0] } },
                                followUpDue: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $lte: ['$followUpDate', endOfToday] },
                                                    { $in: ['$leadStatus', ['New', 'Contacted', 'Follow-up Required']] }
                                                ]
                                            },
                                            1,
                                            0
                                        ]
                                    }
                                }
                            }
                        }
                    ]),
                    // Fetch telecallers in this scope
                    User.find({
                        status: 'ACTIVE',
                        role: { $in: ['EMPLOYEE', 'BRANCH_MANAGER', 'MANAGER'] },
                        ...(currentUser.role !== 'SUPER_ADMIN' && currentUser.branchId ? { branchId: currentUser.branchId } : {})
                    }).select('name employeeId role designation branchId').lean(),
                    // Fetch branches for Super Admin filter
                    Branch.find({ isActive: true }).select('name code city').lean()
                ]);

                total = totalCount;
                leads = leadDocs || [];
                if (statsAgg) {
                    stats = {
                        totalLeads: statsAgg.totalLeads || 0,
                        notCalled: statsAgg.notCalled || 0,
                        called: statsAgg.called || 0,
                        connected: statsAgg.connected || 0,
                        followUpDue: statsAgg.followUpDue || 0,
                        qualified: statsAgg.qualified || 0,
                        notInterested: statsAgg.notInterested || 0,
                        converted: statsAgg.converted || 0
                    };
                }
                telecallers = telecallerStaff || [];
                branches = activeBranches || [];
            }

            res.render('private/admin/leads/index', {
                title: `Lead Management & Telecalling | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: currentUser,
                currentUser,
                leads,
                stats,
                telecallers,
                branches,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1
                },
                filters: {
                    search,
                    status: statusFilter,
                    callStatus: callStatusFilter,
                    priority: priorityFilter,
                    followUp: followUpFilter,
                    telecaller: telecallerFilter,
                    branch: branchFilter
                },
                activePage: 'admin-leads',
                pageTitle: 'Lead Management & Telecalling Console',
                breadcrumbs: [{ label: 'CRM & Leads', url: '/admin/leads' }, { label: 'Telecalling' }]
            });
        } catch (err) {
            console.error('[LeadController.getLeadsPage] Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load Lead Management directory.'
            });
        }
    }

    /**
     * Get Lead Details (JSON API for drawer / modal)
     */
    static async getLeadDetails(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: 'Invalid lead ID format.' });
            }

            const lead = await Lead.findById(id)
                .populate('assignedTelecaller', 'name employeeId mobile email designation')
                .populate('assignedFieldEngineer', 'name employeeId mobile email')
                .populate('branch', 'name code city state')
                .populate('convertedCustomerId', 'name mobile consumerNumber')
                .populate('createdBy', 'name employeeId')
                .lean();

            if (!lead) {
                return res.status(404).json({ success: false, message: 'Lead record not found.' });
            }

            // Check branch isolation
            if (currentUser.role !== 'SUPER_ADMIN') {
                const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId).toString() : '';
                const leadBranch = lead.branch ? (lead.branch._id || lead.branch).toString() : '';

                if (currentUser.role === 'EMPLOYEE') {
                    const isAssigned = lead.assignedTelecaller && String(lead.assignedTelecaller._id || lead.assignedTelecaller) === String(currentUser._id);
                    const isCreator = lead.createdBy && String(lead.createdBy._id || lead.createdBy) === String(currentUser._id);
                    const canViewBranch = AuthorizationService.hasAnyPermission(currentUser, ['crm.leads.assign', 'crm.leads.reassign', 'crm.leads.edit']);

                    if (!isAssigned && !isCreator && !(canViewBranch && userBranch === leadBranch)) {
                        return res.status(403).json({ success: false, message: 'Access denied: You are not assigned to this lead.' });
                    }
                } else if (userBranch && leadBranch && userBranch !== leadBranch) {
                    return res.status(403).json({ success: false, message: 'Access denied: Lead belongs to another branch.' });
                }
            }

            return res.json({ success: true, lead });
        } catch (err) {
            console.error('[LeadController.getLeadDetails] Error:', err);
            return res.status(500).json({ success: false, message: 'Error fetching lead details.' });
        }
    }

    /**
     * Create Single Lead (Manual Entry)
     */
    static async createLead(req, res) {
        try {
            const currentUser = req.session.user;
            const {
                name,
                mobile,
                alternateMobile,
                email,
                address,
                city,
                district,
                state,
                pincode,
                solarRequirement,
                monthlyBill,
                leadSource,
                leadPriority,
                branchId,
                assignedTelecallerId,
                notes
            } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ success: false, message: 'Customer / Contact name is required.' });
            }

            const mobileValidation = LeadService.cleanAndValidateMobile(mobile);
            if (!mobileValidation.isValid) {
                return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit Indian mobile number.' });
            }

            // Check duplicate
            const existingLead = await Lead.findOne({
                mobile: { $regex: mobileValidation.cleanMobile + '$' }
            }).select('leadId name leadStatus assignedTelecaller');

            if (existingLead) {
                return res.status(409).json({
                    success: false,
                    message: `A lead with this mobile number already exists (${existingLead.leadId}: ${existingLead.name}, Status: ${existingLead.leadStatus}).`
                });
            }

            const targetBranch = (currentUser.role === 'SUPER_ADMIN' && branchId && mongoose.isValidObjectId(branchId))
                ? branchId
                : (currentUser.branchId || null);

            let telecaller = null;
            const assignmentHistory = [];

            if (assignedTelecallerId && mongoose.isValidObjectId(assignedTelecallerId)) {
                const assignedUser = await User.findById(assignedTelecallerId).select('name employeeId status branchId');
                if (assignedUser && assignedUser.status === 'ACTIVE') {
                    telecaller = assignedUser._id;
                    assignmentHistory.push({
                        newOwner: assignedUser._id,
                        newOwnerName: assignedUser.name,
                        assignedBy: currentUser._id,
                        assignedByName: currentUser.name,
                        assignedAt: new Date(),
                        reason: 'Initial Lead Assignment'
                    });
                }
            }

            const leadId = LeadService.generateLeadId();
            const lead = new Lead({
                leadId,
                name: name.trim(),
                mobile: mobileValidation.formatted,
                alternateMobile: alternateMobile ? alternateMobile.trim() : '',
                email: email ? email.trim().toLowerCase() : '',
                address: address ? address.trim() : '',
                city: city ? city.trim() : 'Raisen',
                district: district ? district.trim() : 'Raisen',
                state: state ? state.trim() : 'Madhya Pradesh',
                pincode: pincode ? pincode.trim() : '',
                solarRequirement: solarRequirement ? solarRequirement.trim() : 'Residential Rooftop (PM Surya Ghar)',
                monthlyBill: parseFloat(monthlyBill) || 0,
                leadSource: leadSource || 'MANUAL',
                leadPriority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(leadPriority) ? leadPriority : 'MEDIUM',
                branch: targetBranch,
                assignedTelecaller: telecaller,
                assignmentHistory,
                createdBy: currentUser._id
            });

            if (notes && notes.trim()) {
                lead.comments.push({
                    author: currentUser._id,
                    authorName: currentUser.name,
                    comment: notes.trim(),
                    createdAt: new Date()
                });
            }

            await lead.save();

            AuditService.log({
                action: 'LEAD_CREATED',
                user: currentUser._id,
                role: currentUser.role,
                branchId: lead.branch,
                details: {
                    leadId: lead._id,
                    leadCode: lead.leadId,
                    name: lead.name,
                    mobile: lead.mobile
                }
            });

            return res.json({
                success: true,
                message: `Lead ${lead.leadId} created successfully.`,
                lead
            });
        } catch (err) {
            console.error('[LeadController.createLead] Error:', err);
            return res.status(500).json({ success: false, message: 'Server error while creating lead.' });
        }
    }

    /**
     * Preview Import (CSV / Excel / Copy-Paste Text)
     */
    static async postImportPreview(req, res) {
        try {
            const { fileData, filename, rawText, format, defaultSource } = req.body;
            let rawRecords = [];

            if (rawText && typeof rawText === 'string' && rawText.trim().length > 0) {
                rawRecords = LeadService.parseTabularText(rawText);
            } else if (fileData && typeof fileData === 'string') {
                const base64Clean = fileData.replace(/^data:.*?;base64,/, '');
                const buffer = Buffer.from(base64Clean, 'base64');
                rawRecords = LeadService.parseFileBuffer(buffer, filename || `import.${format || 'xlsx'}`);
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide either a valid CSV/Excel file or copy-pasted tabular data.'
                });
            }

            if (rawRecords.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No readable data rows found. Please ensure your file or text contains column headers (e.g. Name, Mobile).'
                });
            }

            const previewResult = await LeadService.validateAndPreview(rawRecords, {
                defaultSource: defaultSource || 'BULK_IMPORT'
            });

            return res.json({
                success: true,
                ...previewResult
            });
        } catch (err) {
            console.error('[LeadController.postImportPreview] Error:', err);
            return res.status(500).json({ success: false, message: `Error parsing import data: ${err.message}` });
        }
    }

    /**
     * Confirm and Execute Bulk Import
     */
    static async postImportConfirm(req, res) {
        try {
            const currentUser = req.session.user;
            const { records, branchId, telecallerId, autoDistribute, leadSource } = req.body;

            if (!records || !Array.isArray(records) || records.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid records provided for import.' });
            }

            const targetBranch = (currentUser.role === 'SUPER_ADMIN' && branchId && mongoose.isValidObjectId(branchId))
                ? branchId
                : (currentUser.branchId || null);

            const result = await LeadService.saveBulkLeads(records, {
                branchId: targetBranch,
                telecallerId: (telecallerId && mongoose.isValidObjectId(telecallerId)) ? telecallerId : null,
                autoDistribute: !!autoDistribute,
                currentUser,
                leadSource: leadSource || 'BULK_IMPORT'
            });

            return res.json({
                success: true,
                message: `Import complete: ${result.imported} leads successfully imported (${result.failed} failed/skipped).`,
                summary: result
            });
        } catch (err) {
            console.error('[LeadController.postImportConfirm] Error:', err);
            return res.status(500).json({ success: false, message: `Server error during import: ${err.message}` });
        }
    }

    /**
     * Record Call Outcome & History
     */
    static async postRecordCall(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;
            const { callOutcome, notes, nextFollowUpDate, updatedLeadStatus } = req.body;

            if (!callOutcome) {
                return res.status(400).json({ success: false, message: 'Call outcome is required.' });
            }

            const validOutcomes = ['Connected', 'No Answer', 'Busy', 'Invalid Number', 'Call Back Requested'];
            if (!validOutcomes.includes(callOutcome)) {
                return res.status(400).json({ success: false, message: `Invalid call outcome. Must be one of: ${validOutcomes.join(', ')}` });
            }

            const lead = await LeadService.recordCallOutcome(id, currentUser, {
                callOutcome,
                notes,
                nextFollowUpDate,
                updatedLeadStatus
            });

            return res.json({
                success: true,
                message: 'Call outcome recorded successfully.',
                lead
            });
        } catch (err) {
            console.error('[LeadController.postRecordCall] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Reassign Lead to another Telecaller / Staff
     */
    static async postReassign(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;
            const { newOwnerId, reason } = req.body;

            if (!newOwnerId || !mongoose.isValidObjectId(newOwnerId)) {
                return res.status(400).json({ success: false, message: 'Valid employee selection is required.' });
            }

            const lead = await LeadService.reassignLead(id, newOwnerId, currentUser, reason);

            return res.json({
                success: true,
                message: 'Lead reassigned successfully.',
                lead
            });
        } catch (err) {
            console.error('[LeadController.postReassign] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Convert Lead to Customer Record
     */
    static async postConvert(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;

            const result = await LeadService.convertLeadToCustomer(id, currentUser);

            return res.json({
                success: true,
                message: result.alreadyConverted ? 'Lead is already converted.' : 'Lead converted to customer successfully.',
                customer: result.customer
            });
        } catch (err) {
            console.error('[LeadController.postConvert] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Add Comment to Lead
     */
    static async postAddComment(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;
            const { comment } = req.body;

            if (!comment || !comment.trim()) {
                return res.status(400).json({ success: false, message: 'Comment text cannot be empty.' });
            }

            const lead = await Lead.findById(id);
            if (!lead) {
                return res.status(404).json({ success: false, message: 'Lead not found.' });
            }

            lead.comments.push({
                author: currentUser._id,
                authorName: currentUser.name,
                comment: comment.trim(),
                createdAt: new Date()
            });

            await lead.save();

            return res.json({
                success: true,
                message: 'Comment added.',
                comments: lead.comments
            });
        } catch (err) {
            console.error('[LeadController.postAddComment] Error:', err);
            return res.status(500).json({ success: false, message: 'Error adding comment.' });
        }
    }

    /**
     * Export Leads to CSV
     */
    static async exportLeadsCsv(req, res) {
        try {
            const currentUser = req.session.user;
            const { status, callStatus, priority, search } = req.query;

            const conditions = [];
            if (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'MANAGER') {
                if (currentUser.branchId) conditions.push({ branch: currentUser.branchId });
            } else if (currentUser.role === 'EMPLOYEE') {
                if (AuthorizationService.hasAnyPermission(currentUser, ['crm.leads.assign', 'crm.leads.reassign', 'crm.leads.edit', 'crm.leads.export']) && currentUser.branchId) {
                    conditions.push({ branch: currentUser.branchId });
                } else {
                    conditions.push({ assignedTelecaller: currentUser._id });
                }
            }

            if (status && status !== 'ALL') conditions.push({ leadStatus: status });
            if (callStatus && callStatus !== 'ALL') conditions.push({ callStatus });
            if (priority && priority !== 'ALL') conditions.push({ leadPriority: priority });

            const query = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

            const leads = await Lead.find(query)
                .populate('assignedTelecaller', 'name employeeId')
                .populate('branch', 'name code')
                .sort({ createdAt: -1 })
                .limit(2000)
                .lean();

            const csvHeaders = 'Lead ID,Name,Mobile,Alternate Mobile,Email,City,District,State,PIN Code,Status,Call Status,Priority,Source,Follow Up Date,Assigned Telecaller,Branch,Created At\n';
            const csvRows = leads.map(l => {
                const escapeCsv = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;
                return [
                    escapeCsv(l.leadId),
                    escapeCsv(l.name),
                    escapeCsv(l.mobile),
                    escapeCsv(l.alternateMobile),
                    escapeCsv(l.email),
                    escapeCsv(l.city),
                    escapeCsv(l.district),
                    escapeCsv(l.state),
                    escapeCsv(l.pincode),
                    escapeCsv(l.leadStatus),
                    escapeCsv(l.callStatus),
                    escapeCsv(l.leadPriority),
                    escapeCsv(l.leadSource),
                    escapeCsv(l.followUpDate ? new Date(l.followUpDate).toLocaleDateString('en-IN') : ''),
                    escapeCsv(l.assignedTelecaller ? l.assignedTelecaller.name : 'Unassigned'),
                    escapeCsv(l.branch ? l.branch.name : ''),
                    escapeCsv(new Date(l.createdAt).toLocaleDateString('en-IN'))
                ].join(',');
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=leads_export_${Date.now()}.csv`);
            return res.send(csvHeaders + csvRows);
        } catch (err) {
            console.error('[LeadController.exportLeadsCsv] Error:', err);
            return res.status(500).send('Error generating CSV export.');
        }
    }
}

module.exports = LeadController;
