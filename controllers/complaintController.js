/**
 * SHIVAY ENERGY SOLUTIONS - COMPLAINT CONTROLLER
 * Phase 4: Basic Customer Complaint & Service Management
 * Handles Public Complaint Intake, Tracking, Admin Console,
 * Technician Progress Updates, Branch Routing & Maker-Checker Closure.
 */

const mongoose = require('mongoose');
const data = require('../config/company');
const Complaint = require('../models/Complaint');
const Branch = require('../models/Branch');
const User = require('../models/User');
const ComplaintService = require('../services/complaintService');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');

// 1. PUBLIC COMPLAINT REGISTRATION & TRACKING PAGE
exports.getComplaintPage = (req, res) => {
    res.render('public-site/complaints', {
        title: `Service & Complaint Support | ${data.company.name}`,
        metaDescription: `Register or track solar repair, inverter error, or warranty complaints with ${data.company.name}. Quick turnaround in Raisen & MP.`,
        data,
        company: data.company,
        activePage: 'complaints',
        ticketResult: null
    });
};

// 2. SUBMIT COMPLAINT (PUBLIC API)
exports.submitComplaint = async (req, res) => {
    try {
        const result = await ComplaintService.createComplaint(
            req.body,
            req.session && req.session.user ? req.session.user : null
        );

        return res.status(200).json({
            success: true,
            ticketId: result.ticketId,
            complaintId: result.complaintId,
            isDuplicate: result.isDuplicate || false,
            linkingStatus: result.linkingStatus,
            branchRoutingMethod: result.branchRoutingMethod,
            message: result.message
        });
    } catch (err) {
        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({
            success: false,
            message: err.message || 'Error submitting complaint'
        });
    }
};

// 3. TRACK COMPLAINT (PUBLIC API - Case-Insensitive, Clean Mobile, Safe Fields)
exports.trackComplaint = async (req, res) => {
    try {
        const { ticketId, mobile } = req.query;

        if (!ticketId || typeof ticketId !== 'string' || !mobile || typeof mobile !== 'string') {
            return res.status(400).json({ success: false, message: 'Ticket ID and Mobile number are required.' });
        }

        const cleanTicket = ticketId.trim();
        const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

        if (!cleanTicket || cleanMobile.length !== 10) {
            return res.status(400).json({ success: false, message: 'Please provide a valid Ticket ID and 10-digit mobile number.' });
        }

        const complaint = await ComplaintService.findComplaintById(cleanTicket, false);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Complaint ticket not found. Please verify your ticket number.'
            });
        }

        const complaintMobile = (complaint.mobile || '').replace(/\D/g, '').slice(-10);
        if (complaintMobile !== cleanMobile) {
            return res.status(404).json({
                success: false,
                message: 'Complaint ticket not found with the provided registered mobile number.'
            });
        }

        // Return safe public tracking payload (no internal PII or sensitive audit details)
        const rawStatus = complaint.status || 'submitted';
        const displayStatus = rawStatus.toLowerCase() === 'submitted' ? 'submitted' : rawStatus;

        return res.json({
            success: true,
            complaint: {
                ticketId: complaint.ticketId,
                complaintId: complaint.complaintId || complaint.ticketId,
                status: displayStatus,
                category: complaint.category || 'general_service',
                createdAt: complaint.createdAt,
                scheduledVisitDate: complaint.scheduledVisitDate || null,
                resolutionNotes: (complaint.resolutionDetails && complaint.resolutionDetails.resolutionNotes) ||
                                 complaint.resolutionNotes ||
                                 'Technician assigned. Under review.',
                progressHistory: (complaint.progressHistory || []).map(p => ({
                    status: p.status,
                    updatedAt: p.updatedAt,
                    remarks: p.remarks || ''
                }))
            }
        });
    } catch (err) {
        console.error('[Track Complaint Error]:', err);
        return res.status(500).json({ success: false, message: 'Error tracking complaint.' });
    }
};

// 4. ADMIN & MANAGER COMPLAINT CONSOLE (LIST VIEW)
exports.getAdminComplaints = async (req, res) => {
    try {
        const currentUser = req.session.user;
        const search = (req.query.search || '').trim().toLowerCase();
        const statusFilter = (req.query.status || '').trim();
        const categoryFilter = (req.query.category || '').trim();
        const branchFilter = req.query.branch || '';
        const queueFilter = req.query.queue || ''; // 'unassigned', 'multiple_matches'

        let query = {};

        // Multi-Branch Isolation
        const hasBranchComplaintManage = AuthorizationService.hasAnyPermission(currentUser, ['complaints.tickets.edit', 'complaints.records.edit', 'complaints.assign', 'complaints.reassign']);
        if (currentUser.role === 'BRANCH_MANAGER' || (currentUser.role === 'EMPLOYEE' && hasBranchComplaintManage)) {
            if (currentUser.branchId) query.branch = currentUser.branchId;
        } else if (currentUser.role === 'EMPLOYEE') {
            // Field technicians view their assigned complaints
            query.$or = [
                { assignedTechnician: currentUser._id },
                { assignedEngineer: currentUser._id }
            ];
        } else if (branchFilter && mongoose.isValidObjectId(branchFilter)) {
            query.branch = branchFilter;
        }

        if (statusFilter) {
            // Case-insensitive regex match to support 'Submitted' / 'submitted' etc.
            query.status = { $regex: new RegExp('^' + statusFilter.replace(/_/g, '[_ ]') + '$', 'i') };
        }

        if (categoryFilter) {
            query.category = categoryFilter;
        }

        if (queueFilter === 'unassigned') {
            query.branch = null;
            query.branchRoutingMethod = 'UNASSIGNED';
        } else if (queueFilter === 'multiple_matches') {
            query.branchRoutingMethod = 'MULTIPLE_MATCHES';
        }

        let dbComplaints = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                dbComplaints = await Complaint.find(query)
                    .populate('branch', 'name code city')
                    .populate('assignedTechnician', 'name employeeId mobile designation')
                    .populate('assignedEngineer', 'name employeeId mobile designation')
                    .populate('customer', 'name mobile')
                    .populate('project', 'projectNumber title capacityKw systemCapacity')
                    .sort({ createdAt: -1, _id: -1 })
                    .lean();
            } catch (dbErr) {
                console.error('[DB Fetch Complaints Error]:', dbErr);
            }
        }

        // Merge with DataStore
        const memComplaints = DataStore.getAllComplaints ? DataStore.getAllComplaints() : [];
        const seenTicketIds = new Set(dbComplaints.map(c => (c.ticketId || '').toUpperCase()));
        let complaints = [...dbComplaints];

        memComplaints.forEach(mc => {
            if (mc && mc.ticketId && !seenTicketIds.has(mc.ticketId.toUpperCase())) {
                let match = true;
                if (currentUser.role === 'BRANCH_MANAGER' && mc.branch && currentUser.branchId && mc.branch.toString() !== currentUser.branchId.toString()) {
                    match = false;
                }
                if (statusFilter && mc.status && mc.status.toLowerCase() !== statusFilter.toLowerCase()) {
                    match = false;
                }
                if (match) {
                    complaints.push(mc);
                    seenTicketIds.add(mc.ticketId.toUpperCase());
                }
            }
        });

        // Search filter
        if (search && complaints.length > 0) {
            complaints = complaints.filter(c =>
                (c.ticketId && c.ticketId.toLowerCase().includes(search)) ||
                (c.complaintId && c.complaintId.toLowerCase().includes(search)) ||
                (c.customerName && c.customerName.toLowerCase().includes(search)) ||
                (c.mobile && c.mobile.includes(search)) ||
                (c.category && c.category.toLowerCase().includes(search)) ||
                (c.pinCode && c.pinCode.includes(search))
            );
        }

        const counts = {
            total: complaints.length,
            submitted: complaints.filter(c => (c.status || '').toLowerCase() === 'submitted').length,
            assigned: complaints.filter(c => (c.status || '').toLowerCase() === 'assigned').length,
            in_progress: complaints.filter(c => ['in_progress', 'visit scheduled', 'on the way', 'site visited', 'work in progress'].includes((c.status || '').toLowerCase())).length,
            waiting_material: complaints.filter(c => (c.status || '').toLowerCase() === 'waiting for material').length,
            resolved: complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length,
            closed: complaints.filter(c => (c.status || '').toLowerCase() === 'closed').length,
            reopened: complaints.filter(c => (c.status || '').toLowerCase() === 'reopened').length
        };

        // Server-side pagination
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const total = complaints.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const paginatedComplaints = complaints.slice((page - 1) * limit, page * limit);

        // Fetch active branches and eligible engineers for assignment modal
        let branches = [];
        let technicians = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                branches = await Branch.find({ isActive: true }).select('name code city serviceablePinCodes').lean();
                const techQuery = {
                    role: { $in: ['EMPLOYEE', 'BRANCH_MANAGER'] },
                    isActive: { $ne: false }
                };
                if (currentUser.role === 'BRANCH_MANAGER') {
                    techQuery.branchId = currentUser.branchId;
                }
                technicians = await User.find(techQuery).select('name employeeId mobile designation branchId').lean();
            } catch (_) {}
        }

        res.render('private/admin/complaints', {
            title: 'Customer Complaints & Service Console | Shivay Energy Solutions',
            pageTitle: 'Customer Complaints & Service Console',
            breadcrumbs: [{ label: 'Operations' }, { label: 'Service Tickets' }],
            complaints: paginatedComplaints,
            counts,
            branches,
            technicians,
            engineers: technicians,
            search,
            currentStatus: statusFilter,
            currentCategory: categoryFilter,
            currentBranch: branchFilter,
            currentQueue: queueFilter,
            page,
            totalPages,
            totalCount: total,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null
            },
            data,
            company: data.company,
            csrfToken: req.session ? req.session.csrfToken : '',
            user: currentUser,
            currentUser,
            activePage: 'complaints'
        });
    } catch (err) {
        console.error('[getAdminComplaints Error]:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading complaints workspace.'
        });
    }
};

// 5. COMPLAINT DETAILED WORKSPACE (12 VIEW SECTIONS)
exports.getComplaintDetailPage = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.session.user;

        const details = await ComplaintService.getComplaintDetails(id, currentUser);
        if (!details || !details.complaint) {
            return res.status(404).render('private/errors/404', {
                title: 'Complaint Not Found | Shivay Energy Solutions',
                message: 'The requested complaint ticket does not exist.'
            });
        }

        const complaint = details.complaint;

        // Multi-branch security check
        const hasBranchComplaintManage = AuthorizationService.hasAnyPermission(currentUser, ['complaints.tickets.edit', 'complaints.records.edit', 'complaints.assign', 'complaints.reassign']);
        if (currentUser.role === 'BRANCH_MANAGER' || (currentUser.role === 'EMPLOYEE' && hasBranchComplaintManage)) {
            const compBranchId = complaint.branch ? (complaint.branch._id || complaint.branch).toString() : null;
            const userBranchId = currentUser.branchId ? currentUser.branchId.toString() : null;
            if (compBranchId && userBranchId && compBranchId !== userBranchId) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Denied',
                    message: 'You are not authorized to view complaints of other branches.'
                });
            }
        } else if (currentUser.role === 'EMPLOYEE') {
            const assignedTechId = complaint.assignedTechnician ? (complaint.assignedTechnician._id || complaint.assignedTechnician).toString() : null;
            const assignedEngId = complaint.assignedEngineer ? (complaint.assignedEngineer._id || complaint.assignedEngineer).toString() : null;
            const userId = currentUser._id.toString();
            if (assignedTechId !== userId && assignedEngId !== userId) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Denied',
                    message: 'You are only authorized to view complaints assigned to you.'
                });
            }
        }

        let branches = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                branches = await Branch.find({ isActive: true }).select('name code city').lean();
            } catch (_) {}
        }

        res.render('private/admin/complaint-detail', {
            title: `Complaint Ticket ${complaint.ticketId} | Shivay Energy Solutions`,
            pageTitle: `Service Ticket ${complaint.ticketId}`,
            breadcrumbs: [
                { label: 'Operations' },
                { label: 'Service Tickets', url: currentUser.role === 'EMPLOYEE' ? '/employee/complaints' : '/admin/complaints' },
                { label: complaint.ticketId }
            ],
            complaint,
            installedEquipment: details.installedEquipment || [],
            installationHistory: details.installationHistory || [],
            candidateProjects: details.candidateProjects || [],
            candidateTechnicians: details.candidateTechnicians || [],
            branches,
            user: currentUser,
            currentUser,
            activePage: 'complaints'
        });
    } catch (err) {
        console.error('[getComplaintDetailPage Error]:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading complaint detail page.'
        });
    }
};

// 6. LINK CUSTOMER / PROJECT API
exports.postLinkCustomerProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { customerId, projectId } = req.body;
        const complaint = await ComplaintService.linkCustomerAndProject(
            id,
            { customerId, projectId },
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Customer and project linked successfully.',
            complaint
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

// 7. BRANCH TRANSFER API
exports.postTransferBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetBranchId, branchId, reason } = req.body;
        const complaint = await ComplaintService.transferBranch(
            id,
            { targetBranchId: targetBranchId || branchId, reason },
            req.session.user
        );
        return res.json({
            success: true,
            message: `Complaint ticket transferred successfully.`,
            complaint
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

// 8. TECHNICIAN ASSIGNMENT API
exports.postAssignTechnician = async (req, res) => {
    try {
        const { id } = req.params;
        const { technicianId, assignedEngineer, remarks } = req.body;
        const complaint = await ComplaintService.assignTechnician(
            id,
            { technicianId: technicianId || assignedEngineer, remarks },
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Technician assigned successfully.',
            complaint
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

// 9. PROGRESS UPDATE API
exports.postUpdateProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await ComplaintService.updateProgress(
            id,
            req.body,
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Complaint progress updated successfully.',
            complaint
        });
    } catch (err) {
        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({ success: false, message: err.message });
    }
};

// 10. RESOLVE COMPLAINT API
exports.postResolveComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await ComplaintService.resolveComplaint(
            id,
            req.body,
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Complaint marked as resolved. Awaiting manager closure approval.',
            complaint
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

// 11. APPROVE CLOSURE API (STRICT MAKER-CHECKER)
exports.postApproveClosure = async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await ComplaintService.approveClosure(
            id,
            req.body,
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Complaint ticket formally closed.',
            complaint
        });
    } catch (err) {
        const statusCode = err.statusCode || 400;
        return res.status(statusCode).json({ success: false, message: err.message });
    }
};

// 12. REOPEN COMPLAINT API
exports.postReopenComplaint = async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await ComplaintService.reopenComplaint(
            id,
            req.body,
            req.session.user
        );
        return res.json({
            success: true,
            message: 'Complaint ticket reopened.',
            complaint
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

// 13. LEGACY UPDATE STATUS API (Backward-Compatible for existing admin routes & tests)
exports.updateComplaintStatus = async (req, res) => {
    try {
        const { ticketId, status, resolutionNotes, assignedEngineer } = req.body;
        if (!ticketId || !status) {
            return res.status(400).json({ success: false, message: 'Ticket ID and status are required.' });
        }

        let complaint = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const updateFields = { status };
            if (resolutionNotes) updateFields.resolutionNotes = resolutionNotes;
            if (assignedEngineer && mongoose.isValidObjectId(assignedEngineer)) {
                updateFields.assignedEngineer = assignedEngineer;
                updateFields.assignedTechnician = assignedEngineer;
            }
            if (status === 'resolved' || status === 'Resolved' || status === 'closed' || status === 'Closed') {
                updateFields.resolvedAt = new Date();
            }

            complaint = await Complaint.findOneAndUpdate(
                { ticketId: { $regex: new RegExp('^' + ticketId.trim() + '$', 'i') } },
                { $set: updateFields },
                { new: true }
            );
        }

        if (DataStore.updateComplaintStatus) {
            DataStore.updateComplaintStatus(ticketId, status, resolutionNotes, assignedEngineer);
        }

        await AuditService.log({
            action: 'COMPLAINT_STATUS_UPDATED',
            user: req.session && req.session.user ? req.session.user._id : null,
            role: req.session && req.session.user ? req.session.user.role : 'SUPER_ADMIN',
            targetResource: `/admin/complaints/${ticketId}`,
            details: { ticketId, status, updatedBy: req.session && req.session.user ? req.session.user.name : 'Admin' }
        });

        return res.json({
            success: true,
            message: `Ticket ${ticketId} status updated to ${status}.`
        });
    } catch (err) {
        console.error('[Error updating complaint status]:', err);
        return res.status(500).json({ success: false, message: 'Error updating complaint status.' });
    }
};
