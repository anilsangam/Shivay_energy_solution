const mongoose = require('mongoose');
const crypto = require('crypto');
const Counter = require('../models/Counter');
const Project = require('../models/Project');
const ProjectActivity = require('../models/ProjectActivity');
const ProjectNote = require('../models/ProjectNote');
const Quotation = require('../models/Quotation');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditService = require('./auditService');
const AuthorizationService = require('./authorizationService');

class ProjectService {
    // In-memory fallback registry for testing without live DB
    static _memoryProjects = new Map();
    static _memoryActivities = [];

    static async _findProject(projectId) {
        if (!projectId) return null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            return await Project.findById(projectId);
        }
        return ProjectService._memoryProjects.get(projectId.toString()) || null;
    }

    static async _saveProject(project) {
        ProjectService._memoryProjects.set(project._id.toString(), project);
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await project.save();
        }
        return project;
    }

    static async _logActivity(act) {
        act.createdAt = act.createdAt || new Date();
        ProjectService._memoryActivities.push(act);
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await ProjectActivity.create(act);
        }
    }

    // -------------------------------------------------------------
    // 1. SEQUENCE GENERATOR
    // -------------------------------------------------------------
    static async generateProjectNumber() {
        const year = new Date().getFullYear();
        const seq = await Counter.getNextSequence(`project_${year}`);
        const paddedSeq = String(seq).padStart(4, '0');
        return `SES-PRJ-${year}-${paddedSeq}`;
    }

    // -------------------------------------------------------------
    // 2. PROJECT CREATION FROM ACCEPTED QUOTATION
    // -------------------------------------------------------------
    /**
     * Create a Project strictly when quotation is approved and customer has accepted.
     * Prevents duplicate projects for the same quotation.
     */
    static async createProjectFromQuotation(quotationOrId, creatorUser = null) {
        let quotation = null;
        if (quotationOrId && typeof quotationOrId === 'object' && quotationOrId._id) {
            quotation = quotationOrId;
        } else if (mongoose.connection && mongoose.connection.readyState === 1) {
            quotation = await Quotation.findById(quotationOrId);
        }

        if (!quotation) {
            throw new Error('Quotation not found.');
        }

        // Rule: Quotation must be customer accepted
        if (quotation.status !== 'CUSTOMER_ACCEPTED') {
            throw new Error(`Cannot create project: Quotation must be in CUSTOMER_ACCEPTED status (current status: "${quotation.status}").`);
        }

        // Idempotency: Prevent duplicate project creation for the same quotation
        let existingProject = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            existingProject = await Project.findOne({ quotation: quotation._id });
        } else {
            existingProject = Array.from(ProjectService._memoryProjects.values()).find(
                p => p.quotation && p.quotation.toString() === quotation._id.toString()
            );
        }

        if (existingProject) {
            return { project: existingProject, alreadyExists: true };
        }

        const projectNumber = await ProjectService.generateProjectNumber();

        // Map initial Bill of Materials from Quotation Line Items
        const initialMaterials = (quotation.lineItems || []).map(item => ({
            itemName: item.description,
            category: 'Solar Equipment',
            requiredQty: item.quantity,
            allocatedQty: 0,
            deliveredQty: 0,
            pendingQty: item.quantity,
            unit: item.unit || 'Nos',
            status: 'PLANNED',
            remarks: item.sku ? `Model/SKU: ${item.sku}` : ''
        }));

        // Initial tasks template
        const initialTasks = [
            {
                taskId: `TSK-${Date.now()}-1`,
                title: 'Technical Rooftop Site Survey & Shadow Analysis',
                description: 'Visit client premises, verify roof structure, measure shadow-free area, and document electrical connection.',
                assignedTo: quotation.assignedEmployee || quotation.preparedBy,
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                priority: 'HIGH',
                status: 'PENDING',
                remarks: 'Mandatory before dispatch of materials.'
            },
            {
                taskId: `TSK-${Date.now()}-2`,
                title: 'MPPKVVCL Net-Metering Documentation Submission',
                description: 'File bidirectional net-meter application on DISCOM consumer portal with latest electricity bill and sanctioned load.',
                assignedTo: quotation.assignedEmployee || quotation.preparedBy,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                priority: 'MEDIUM',
                status: 'PENDING',
                remarks: 'Liaison with local Raisen sub-division office.'
            },
            {
                taskId: `TSK-${Date.now()}-3`,
                title: 'Material Allocation & Site Dispatch Clearance',
                description: 'Stage solar PV modules, grid-tied inverter, mounting rails, and DCDB at central Raisen warehouse.',
                assignedTo: quotation.assignedEmployee || quotation.preparedBy,
                dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
                priority: 'MEDIUM',
                status: 'PENDING',
                remarks: 'Pending site visit approval.'
            }
        ];

        const assignedEmpList = [];
        if (quotation.assignedEmployee) {
            assignedEmpList.push({
                user: quotation.assignedEmployee,
                roleInProject: 'LEAD_FIELD_ENGINEER',
                assignedAt: new Date(),
                assignedBy: creatorUser ? creatorUser._id : quotation.approvedBy
            });
        }

        const project = new Project({
            projectNumber,
            title: `${quotation.customerName} - ${quotation.plantCapacityKw} kW ${quotation.systemType} Solar Rooftop Installation`,
            customer: quotation.customerId,
            quotation: quotation._id,
            quotationRequest: quotation.quotationRequestId,
            capacityKw: quotation.plantCapacityKw,
            projectType: quotation.systemType === 'COMMERCIAL' ? 'COMMERCIAL_ROOFTOP' : 'RESIDENTIAL_ROOFTOP',
            priority: 'MEDIUM',
            progressPercentage: 0,
            status: 'NOT_STARTED',
            assignedManager: quotation.approvedBy || (creatorUser && creatorUser.role === 'MANAGER' ? creatorUser._id : null),
            assignedEngineer: quotation.assignedEmployee || quotation.preparedBy,
            assignedEmployees: assignedEmpList,
            branch: quotation.branch,

            customerContact: {
                name: quotation.customerName,
                mobile: quotation.customerMobile,
                email: quotation.customerEmail,
                address: quotation.customerAddress,
                city: quotation.city || 'Raisen',
                district: quotation.district || 'Raisen',
                state: quotation.state || 'Madhya Pradesh',
                pincode: quotation.pincode,
                consumerNumber: quotation.consumerNumber,
                discom: quotation.discom || 'MPPKVVCL'
            },
            siteAddress: quotation.customerAddress,
            city: quotation.city || 'Raisen',
            district: quotation.district || 'Raisen',
            state: quotation.state || 'Madhya Pradesh',
            pincode: quotation.pincode,

            solarRequirements: {
                capacityKw: quotation.plantCapacityKw,
                systemType: quotation.systemType,
                roofType: 'RCC_FLAT',
                panelSpecs: quotation.panelSpecs,
                panelQty: quotation.panelQty,
                inverterSpecs: quotation.inverterSpecs,
                inverterQty: quotation.inverterQty,
                batterySpecs: quotation.batterySpecs,
                structureSpecs: quotation.structureSpecs
            },

            financials: {
                contractAmount: quotation.grandTotal,
                subsidyAmount: quotation.estimatedSubsidy,
                netPayable: quotation.netPayableAfterSubsidy,
                advanceAmount: quotation.advanceAmount,
                balanceAmount: quotation.balanceAmount
            },
            contractAmount: quotation.grandTotal,
            subsidyAmount: quotation.estimatedSubsidy,
            amountPaid: quotation.advanceAmount,

            siteVisit: {
                scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
                assignedTo: quotation.assignedEmployee || quotation.preparedBy,
                status: 'PENDING'
            },

            tasks: initialTasks,
            materials: initialMaterials,
            documents: [],

            statusHistory: [{
                previousStatus: 'NONE',
                newStatus: 'NOT_STARTED',
                changedBy: creatorUser ? creatorUser._id : quotation.preparedBy,
                role: creatorUser ? creatorUser.role : 'SYSTEM',
                reason: 'Project initialized automatically upon confirmed customer quotation acceptance.',
                timestamp: new Date()
            }],

            startDate: new Date(),
            targetCompletionDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 Days
            createdBy: creatorUser ? creatorUser._id : quotation.preparedBy,
            updatedBy: creatorUser ? creatorUser._id : quotation.preparedBy
        });

        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'PROJECT_CREATED',
            title: 'Project Initialized from Customer Accepted Quotation',
            description: `Project ${projectNumber} created for ${quotation.customerName} (${quotation.plantCapacityKw} kW). Work order initialized with 3 installation milestones.`,
            performedBy: creatorUser ? creatorUser._id : quotation.preparedBy
        });

        AuditService.log({
            action: 'PROJECT_CREATED',
            user: creatorUser ? creatorUser._id : null,
            details: { projectNumber, quotationNumber: quotation.quotationNumber, customer: quotation.customerName }
        });

        return { project, alreadyExists: false };
    }

    // -------------------------------------------------------------
    // 3. PROJECT QUERYING WITH STRICT RBAC ENFORCEMENT
    // -------------------------------------------------------------
    static async getProjects(user, query = {}) {
        const conditions = [];

        // RBAC Boundary Isolation: Managers (and Employees with branch/manager project permissions) see branch projects
        const hasBranchProjPrivilege = AuthorizationService.hasAnyPermission(user, [
            'projects.all.view', 'projects.assignment.assign', 'projects.completion.approve',
            'projects.site_visit.approve', 'projects.records.create', 'projects.materials.manage'
        ]);
        if (user.role === 'EMPLOYEE' && !hasBranchProjPrivilege) {
            conditions.push({
                $or: [
                    { assignedEngineer: user._id },
                    { 'assignedEmployees.user': user._id },
                    { 'siteVisit.assignedTo': user._id }
                ]
            });
        } else if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER' || (user.role === 'EMPLOYEE' && hasBranchProjPrivilege)) {
            if (AuthorizationService.hasPermission(user, 'projects.all.view') || user.dataScope === 'GLOBAL') {
                // Global view
            } else if (user.branchId) {
                conditions.push({
                    $or: [
                        { branch: user.branchId },
                        { assignedManager: user._id },
                        { assignedEngineer: user._id },
                        { 'assignedEmployees.user': user._id }
                    ]
                });
            } else {
                conditions.push({
                    $or: [
                        { assignedManager: user._id },
                        { assignedEngineer: user._id },
                        { 'assignedEmployees.user': user._id }
                    ]
                });
            }
        } // SUPER_ADMIN views all

        // Status Filter (allowlist validated primitive strings only)
        const VALID_PROJECT_STATUSES = new Set([
            'NOT_STARTED', 'SITE_VISIT_PENDING', 'SITE_VISIT_COMPLETED',
            'MATERIAL_PLANNING', 'INSTALLATION_IN_PROGRESS', 'TESTING_COMMISSIONING',
            'DISCOM_INSPECTION', 'METERING_COMPLETED', 'SUBSIDY_APPLIED',
            'PROJECT_COMPLETED', 'ON_HOLD', 'CANCELLED'
        ]);
        const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

        if (typeof query.status === 'string' && VALID_PROJECT_STATUSES.has(query.status.trim())) {
            conditions.push({ status: query.status.trim() });
        }

        // Priority Filter
        if (typeof query.priority === 'string' && VALID_PRIORITIES.has(query.priority.trim())) {
            conditions.push({ priority: query.priority.trim() });
        }

        // Search Filter (Project #, Customer Name, Mobile, City) with regex escaping
        if (typeof query.search === 'string' && query.search.trim()) {
            const cleanSearch = query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(cleanSearch, 'i');
            conditions.push({
                $or: [
                    { projectNumber: regex },
                    { title: regex },
                    { 'customerContact.name': regex },
                    { 'customerContact.mobile': regex },
                    { city: regex }
                ]
            });
        }

        const filter = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

        const page = Math.max(1, parseInt(query.page, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const [projects, total] = await Promise.all([
                Project.find(filter)
                    .populate('customer', 'name mobile email')
                    .populate('assignedManager', 'name email role employeeId')
                    .populate('assignedEngineer', 'name email role employeeId')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Project.countDocuments(filter)
            ]);

            return {
                projects,
                total,
                page,
                pages: Math.ceil(total / limit)
            };
        }

        // In-memory fallback
        let memList = Array.from(ProjectService._memoryProjects.values());
        if (user.role === 'EMPLOYEE') {
            memList = memList.filter(p => {
                const isEng = p.assignedEngineer && p.assignedEngineer.toString() === user._id.toString();
                const isCrew = p.assignedEmployees && p.assignedEmployees.some(e => e.user && e.user.toString() === user._id.toString());
                const isSv = p.siteVisit && p.siteVisit.assignedTo && p.siteVisit.assignedTo.toString() === user._id.toString();
                return isEng || isCrew || isSv;
            });
        } else if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER') {
            if (user.branchId) {
                memList = memList.filter(p => (p.branch && p.branch.toString() === user.branchId.toString()) || (p.assignedManager && p.assignedManager.toString() === user._id.toString()));
            }
        }

        return {
            projects: memList.slice(skip, skip + limit),
            total: memList.length,
            page,
            pages: Math.ceil(memList.length / limit) || 1
        };
    }

    // -------------------------------------------------------------
    // 4. GET PROJECT DETAILS & VERIFY PERMISSION
    // -------------------------------------------------------------
    static async getProjectById(projectId, user) {
        if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
            throw new Error('Invalid project identifier.');
        }

        let project = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            project = await Project.findById(projectId)
                .populate('customer')
                .populate('quotation')
                .populate('quotationRequest')
                .populate('assignedManager', 'name email employeeId role')
                .populate('assignedEngineer', 'name email employeeId role')
                .populate('assignedEmployees.user', 'name email employeeId role')
                .populate('tasks.assignedTo', 'name email employeeId role')
                .populate('tasks.createdBy', 'name')
                .populate('documents.uploadedBy', 'name role')
                .populate('siteVisit.assignedTo', 'name email employeeId role')
                .populate('siteVisit.reviewedBy', 'name');
        } else {
            project = ProjectService._memoryProjects.get(projectId.toString());
        }

        if (!project) {
            throw new Error('Project not found.');
        }

        // Strict RBAC Access Check
        const hasBranchProjPrivilege = AuthorizationService.hasAnyPermission(user, [
            'projects.all.view', 'projects.assignment.assign', 'projects.completion.approve',
            'projects.site_visit.approve', 'projects.records.create', 'projects.materials.manage'
        ]);
        if (user.role === 'EMPLOYEE' && !hasBranchProjPrivilege) {
            const engId = project.assignedEngineer ? (project.assignedEngineer._id ? project.assignedEngineer._id.toString() : project.assignedEngineer.toString()) : null;
            const svId = project.siteVisit && project.siteVisit.assignedTo ? (project.siteVisit.assignedTo._id ? project.siteVisit.assignedTo._id.toString() : project.siteVisit.assignedTo.toString()) : null;
            const isAssigned = (engId === user._id.toString()) ||
                (svId === user._id.toString()) ||
                (project.assignedEmployees && project.assignedEmployees.some(e => {
                    const uId = e.user ? (e.user._id ? e.user._id.toString() : e.user.toString()) : e.toString();
                    return uId === user._id.toString();
                }));

            if (!isAssigned) {
                const err = new Error('HTTP 403 Forbidden: You do not have permission to access projects outside your direct assignment.');
                err.status = 403;
                throw err;
            }
        } else if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER' || (user.role === 'EMPLOYEE' && hasBranchProjPrivilege)) {
            if (!AuthorizationService.hasPermission(user, 'projects.all.view') && user.dataScope !== 'GLOBAL') {
                const mgrId = project.assignedManager ? (project.assignedManager._id ? project.assignedManager._id.toString() : project.assignedManager.toString()) : null;
                const isBranchMatch = (user.branchId && project.branch && project.branch.toString() === user.branchId.toString()) ||
                    (mgrId === user._id.toString());

                if (!isBranchMatch) {
                    const err = new Error('HTTP 403 Forbidden: You are not authorized to view projects from another branch.');
                    err.status = 403;
                    throw err;
                }
            }
        }

        return project;
    }

    // -------------------------------------------------------------
    // 5. STATUS WORKFLOW & PROGRESS CALCULATION
    // -------------------------------------------------------------
    static getStatusProgress(status) {
        const PROGRESS_MAP = {
            'NOT_STARTED': 0,
            'SITE_VISIT_PENDING': 10,
            'SITE_VISIT_COMPLETED': 25,
            'MATERIAL_PLANNING': 40,
            'MATERIAL_READY': 55,
            'INSTALLATION_IN_PROGRESS': 70,
            'TESTING_AND_COMMISSIONING': 85,
            'DISCOM_DOCUMENTATION': 95,
            'COMPLETED': 100
        };
        return PROGRESS_MAP[status] !== undefined ? PROGRESS_MAP[status] : null;
    }

    static async updateProjectStatus(projectId, newStatus, reason, user) {
        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        // RBAC: Employees without completion permission cannot mark COMPLETED, and without branch edit can only update assigned
        if (user.role === 'EMPLOYEE') {
            if (newStatus === 'COMPLETED' && !AuthorizationService.hasPermission(user, 'projects.completion.approve')) {
                const err = new Error('HTTP 403 Forbidden: Field employees cannot complete or commission a project without completion approval permission.');
                err.status = 403;
                throw err;
            }
            const hasBranchStatusPrivilege = AuthorizationService.hasAnyPermission(user, ['projects.assignment.assign', 'projects.completion.approve', 'projects.all.view']);
            if (!hasBranchStatusPrivilege && project.assignedEngineer) {
                const assignedEngId = project.assignedEngineer._id ? project.assignedEngineer._id.toString() : project.assignedEngineer.toString();
                if (assignedEngId !== user._id.toString()) {
                    const err = new Error('HTTP 403 Forbidden: You are only permitted to update status for projects assigned to you.');
                    err.status = 403;
                    throw err;
                }
            }
        }

        // Branch check for managers
        if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER') {
            if (user.branchId && project.branch && project.branch.toString() !== user.branchId.toString()) {
                const err = new Error('HTTP 403 Forbidden: Cannot update project of another branch.');
                err.status = 403;
                throw err;
            }
        }

        // Mandatory reason for ON_HOLD and CANCELLED
        if (newStatus === 'ON_HOLD' || newStatus === 'CANCELLED') {
            if (!reason || !reason.trim()) {
                throw new Error(`A clear, documented reason is required to place a project on ${newStatus}.`);
            }
        }

        // Completion Rules: Require mandatory conditions before marking COMPLETED
        if (newStatus === 'COMPLETED') {
            const hasPendingTasks = project.tasks && project.tasks.some(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
            if (hasPendingTasks) {
                throw new Error('Cannot complete project: There are still pending or in-progress installation tasks.');
            }
            if (!project.completionDetails || !project.completionDetails.commissioningRemarks) {
                throw new Error('Cannot complete project: Testing & commissioning remarks and DISCOM clearance must be recorded.');
            }
        }

        const prevStatus = project.status;
        project.status = newStatus;
        project.statusReason = reason ? reason.trim() : null;
        project.updatedBy = user._id;

        // Controlled progress mapping
        const mappedProgress = ProjectService.getStatusProgress(newStatus);
        if (mappedProgress !== null) {
            project.progressPercentage = mappedProgress;
        }

        if (newStatus === 'COMPLETED') {
            project.actualCompletionDate = new Date();
            project.progressPercentage = 100;
        }

        project.statusHistory = project.statusHistory || [];
        project.statusHistory.push({
            previousStatus: prevStatus,
            newStatus,
            changedBy: user._id,
            role: user.role,
            reason: reason ? reason.trim() : `Status changed to ${newStatus}`,
            timestamp: new Date()
        });

        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: newStatus === 'ON_HOLD' ? 'PROJECT_HELD' : (newStatus === 'CANCELLED' ? 'PROJECT_CANCELLED' : (newStatus === 'COMPLETED' ? 'PROJECT_COMPLETED' : 'STATUS_CHANGE')),
            title: `Project Status: ${newStatus}`,
            description: reason ? `Status moved from ${prevStatus} to ${newStatus}. Reason: "${reason.trim()}"` : `Project progressed from ${prevStatus} to ${newStatus}. Progress at ${project.progressPercentage}%.`,
            performedBy: user._id
        });

        AuditService.log({
            action: `PROJECT_STATUS_${newStatus}`,
            user: user._id,
            role: user.role,
            details: { projectNumber: project.projectNumber, prevStatus, newStatus, reason }
        });

        return project;
    }

    // -------------------------------------------------------------
    // 6. SITE VISIT WORKFLOW
    // -------------------------------------------------------------
    static async submitSiteVisit(projectId, visitData, user) {
        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        // RBAC check
        if (user.role === 'EMPLOYEE') {
            const engId = project.assignedEngineer ? (project.assignedEngineer._id ? project.assignedEngineer._id.toString() : project.assignedEngineer.toString()) : null;
            const svId = project.siteVisit && project.siteVisit.assignedTo ? (project.siteVisit.assignedTo._id ? project.siteVisit.assignedTo._id.toString() : project.siteVisit.assignedTo.toString()) : null;
            const isAssigned = (engId === user._id.toString()) ||
                (svId === user._id.toString()) ||
                (project.assignedEmployees && project.assignedEmployees.some(e => {
                    const uId = e.user ? (e.user._id ? e.user._id.toString() : e.user.toString()) : e.toString();
                    return uId === user._id.toString();
                }));

            if (!isAssigned) {
                const err = new Error('HTTP 403 Forbidden: You are not assigned to this project.');
                err.status = 403;
                throw err;
            }
        }

        if (!visitData.inspectionRemarks || !visitData.inspectionRemarks.trim()) {
            throw new Error('Inspection remarks are required for site survey submission.');
        }

        project.siteVisit = project.siteVisit || {};
        project.siteVisit.status = 'SUBMITTED';
        project.siteVisit.visitDate = visitData.visitDate ? new Date(visitData.visitDate) : new Date();
        project.siteVisit.inspectionRemarks = visitData.inspectionRemarks.trim();
        project.siteVisit.roofSuitability = visitData.roofSuitability || 'GOOD';
        project.siteVisit.roofType = visitData.roofType || 'RCC_FLAT';
        project.siteVisit.availableAreaSqFt = Number(visitData.availableAreaSqFt) || 0;
        project.siteVisit.shadowObservations = visitData.shadowObservations ? visitData.shadowObservations.trim() : 'No prominent shadow obstruction detected.';
        project.siteVisit.electricalConnectionDetails = visitData.electricalConnectionDetails ? visitData.electricalConnectionDetails.trim() : 'Single-Phase 230V';
        project.siteVisit.sanctionedLoadKw = Number(visitData.sanctionedLoadKw) || project.capacityKw;
        project.siteVisit.requiredMaterialRemarks = visitData.requiredMaterialRemarks ? visitData.requiredMaterialRemarks.trim() : '';
        project.siteVisit.submittedAt = new Date();

        if (visitData.photos && Array.isArray(visitData.photos)) {
            project.siteVisit.photos = visitData.photos;
        }

        if (project.status === 'NOT_STARTED') {
            project.status = 'SITE_VISIT_PENDING';
            project.progressPercentage = 10;
        }

        project.updatedBy = user._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'SITE_VISIT_SUBMITTED',
            title: 'Site Visit Report Submitted',
            description: `Field inspection submitted by ${user.name || 'Engineer'}. Roof suitability: ${project.siteVisit.roofSuitability}. Remarks: "${project.siteVisit.inspectionRemarks}"`,
            performedBy: user._id
        });

        return project;
    }

    static async reviewSiteVisit(projectId, action, managerRemarks, managerUser) {
        if (!AuthorizationService.hasOperationalPrivilege(managerUser, ['projects.site_visit.approve'])) {
            const err = new Error('HTTP 403 Forbidden: Missing permission to approve site visit reports.');
            err.status = 403;
            throw err;
        }

        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        project.siteVisit = project.siteVisit || {};

        if (action === 'APPROVE') {
            project.siteVisit.status = 'APPROVED';
            project.siteVisit.reviewedBy = managerUser._id;
            project.siteVisit.reviewedAt = new Date();
            project.siteVisit.managerRemarks = managerRemarks ? managerRemarks.trim() : 'Site survey approved.';
            project.status = 'SITE_VISIT_COMPLETED';
            project.progressPercentage = 25;

            // Also mark the site visit task as completed if it exists
            const svTask = (project.tasks || []).find(t => t.title.toLowerCase().includes('site survey') || t.title.toLowerCase().includes('site visit'));
            if (svTask) {
                svTask.status = 'COMPLETED';
                svTask.completionDate = new Date();
                svTask.remarks = 'Site visit approved by branch manager.';
            }
        } else if (action === 'REQUEST_REVISION') {
            if (!managerRemarks || !managerRemarks.trim()) {
                throw new Error('Manager revision remarks are required when requesting site visit corrections.');
            }
            project.siteVisit.status = 'REVISION_REQUESTED';
            project.siteVisit.managerRemarks = managerRemarks.trim();
        } else {
            throw new Error('Invalid review action. Must be APPROVE or REQUEST_REVISION.');
        }

        project.updatedBy = managerUser._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'SITE_VISIT_REVIEWED',
            title: `Site Visit ${action === 'APPROVE' ? 'Approved' : 'Revision Requested'}`,
            description: `Manager ${managerUser.name || 'Manager'} ${action === 'APPROVE' ? 'cleared' : 'requested revisions on'} site survey. Comments: "${managerRemarks || 'None'}"`,
            performedBy: managerUser._id
        });

        return project;
    }

    // -------------------------------------------------------------
    // 7. TASK MANAGEMENT
    // -------------------------------------------------------------
    static async createTask(projectId, taskData, creatorUser) {
        if (!AuthorizationService.hasOperationalPrivilege(creatorUser, ['projects.tasks.create'])) {
            const err = new Error('HTTP 403 Forbidden: Missing permission to assign project tasks.');
            err.status = 403;
            throw err;
        }

        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        if (!taskData.title || !taskData.title.trim()) {
            throw new Error('Task title is required.');
        }

        if (!taskData.assignedTo) {
            throw new Error('An assigned employee is required for the task.');
        }

        const newTask = {
            taskId: `TSK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title: taskData.title.trim(),
            description: taskData.description ? taskData.description.trim() : '',
            assignedTo: taskData.assignedTo,
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            priority: taskData.priority || 'MEDIUM',
            status: 'PENDING',
            remarks: taskData.remarks ? taskData.remarks.trim() : '',
            createdBy: creatorUser._id,
            updatedBy: creatorUser._id
        };

        project.tasks = project.tasks || [];
        project.tasks.push(newTask);
        project.updatedBy = creatorUser._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'TASK_CREATED',
            title: `New Task: ${newTask.title}`,
            description: `Task assigned with priority ${newTask.priority}. Due: ${newTask.dueDate.toLocaleDateString('en-IN')}.`,
            performedBy: creatorUser._id
        });

        return project;
    }

    static async updateTaskStatus(projectId, taskId, status, remarks, user) {
        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        const task = (project.tasks || []).find(t => t.taskId === taskId || (t._id && t._id.toString() === taskId));
        if (!task) throw new Error('Task not found.');

        // RBAC: If employee without task/team management privilege, they can ONLY update tasks assigned to them!
        if (user.role === 'EMPLOYEE' && !AuthorizationService.hasAnyPermission(user, ['projects.assignment.assign', 'projects.tasks.create'])) {
            const assignedId = task.assignedTo ? (task.assignedTo._id ? task.assignedTo._id.toString() : task.assignedTo.toString()) : null;
            if (assignedId !== user._id.toString()) {
                const err = new Error('HTTP 403 Forbidden: You cannot modify tasks assigned to another employee.');
                err.status = 403;
                throw err;
            }
        }

        const prevStatus = task.status;
        task.status = status;
        if (remarks) task.remarks = remarks.trim();
        task.updatedBy = user._id;

        if (status === 'COMPLETED') {
            task.completionDate = new Date();
        }

        project.updatedBy = user._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'TASK_UPDATED',
            title: `Task "${task.title}" -> ${status}`,
            description: remarks ? `Status updated from ${prevStatus} to ${status}. Remarks: "${remarks.trim()}"` : `Status updated to ${status}.`,
            performedBy: user._id
        });

        return project;
    }

    static async assignEmployee(projectId, employeeId, roleInProject, managerUser) {
        if (!AuthorizationService.hasOperationalPrivilege(managerUser, ['projects.assignment.assign'])) {
            const err = new Error('HTTP 403 Forbidden: Missing permission to assign employees.');
            err.status = 403;
            throw err;
        }

        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        let emp = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            emp = await User.findById(employeeId);
        } else {
            emp = { _id: employeeId, name: 'Assigned Staff', employeeId: 'SES-EMP' };
        }
        if (!emp) throw new Error('Employee user not found.');

        project.assignedEmployees = project.assignedEmployees || [];
        const alreadyAssigned = project.assignedEmployees.some(e => {
            const uId = e.user ? (e.user._id ? e.user._id.toString() : e.user.toString()) : e.toString();
            return uId === employeeId.toString();
        });

        if (!alreadyAssigned) {
            project.assignedEmployees.push({
                user: emp._id,
                roleInProject: roleInProject || 'INSTALLATION_ENGINEER',
                assignedAt: new Date(),
                assignedBy: managerUser._id
            });
        }

        if (!project.assignedEngineer) {
            project.assignedEngineer = emp._id;
        }

        project.updatedBy = managerUser._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'EMPLOYEE_ASSIGNED',
            title: `Employee Assigned: ${emp.name}`,
            description: `${emp.name} (${emp.employeeId || 'Staff'}) assigned as ${roleInProject || 'Installation Engineer'}.`,
            performedBy: managerUser._id
        });

        return project;
    }

    // -------------------------------------------------------------
    // 8. MATERIAL TRACKING
    // -------------------------------------------------------------
    static async updateMaterialItem(projectId, materialIndexOrId, updates, user) {
        if (!AuthorizationService.hasOperationalPrivilege(user, ['projects.materials.manage'])) {
            const err = new Error('HTTP 403 Forbidden: Missing permission to update material allocations.');
            err.status = 403;
            throw err;
        }

        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        project.materials = project.materials || [];
        let item = null;
        if (typeof materialIndexOrId === 'number' || !isNaN(materialIndexOrId)) {
            item = project.materials[parseInt(materialIndexOrId, 10)];
        } else if (typeof project.materials.id === 'function') {
            item = project.materials.id(materialIndexOrId);
        } else {
            item = project.materials.find(m => m._id && m._id.toString() === materialIndexOrId.toString());
        }

        if (!item) throw new Error('Material item not found.');

        if (updates.allocatedQty !== undefined) item.allocatedQty = Number(updates.allocatedQty) || 0;
        if (updates.deliveredQty !== undefined) {
            item.deliveredQty = Number(updates.deliveredQty) || 0;
            item.pendingQty = Math.max(0, item.requiredQty - item.deliveredQty);
        }
        if (updates.status) item.status = updates.status;
        if (updates.remarks) item.remarks = updates.remarks.trim();

        // Check if all materials are delivered
        const allDelivered = project.materials.every(m => m.deliveredQty >= m.requiredQty);
        if (allDelivered && (project.status === 'SITE_VISIT_COMPLETED' || project.status === 'MATERIAL_PLANNING')) {
            project.status = 'MATERIAL_READY';
            project.progressPercentage = 55;
        }

        project.updatedBy = user._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'MATERIAL_ALLOCATED',
            title: `Material Updated: ${item.itemName}`,
            description: `Allocated: ${item.allocatedQty}, Delivered: ${item.deliveredQty}, Status: ${item.status}.`,
            performedBy: user._id
        });

        return project;
    }

    // -------------------------------------------------------------
    // 9. PROJECT COMPLETION CLEARANCE
    // -------------------------------------------------------------
    static async completeProject(projectId, completionData, user) {
        if (!AuthorizationService.hasOperationalPrivilege(user, ['projects.completion.approve'])) {
            const err = new Error('HTTP 403 Forbidden: Missing permission to finalize and complete projects.');
            err.status = 403;
            throw err;
        }

        const project = await ProjectService._findProject(projectId);
        if (!project) throw new Error('Project not found.');

        if (!completionData.commissioningRemarks || !completionData.commissioningRemarks.trim()) {
            throw new Error('Commissioning remarks are required for project sign-off.');
        }

        if (!completionData.meterNumber || !completionData.meterNumber.trim()) {
            throw new Error('Bidirectional Net-Meter number is required for final DISCOM commissioning clearance.');
        }

        project.status = 'COMPLETED';
        project.progressPercentage = 100;
        project.actualCompletionDate = new Date();

        project.completionDetails = {
            completedAt: new Date(),
            approvedBy: user._id,
            commissioningRemarks: completionData.commissioningRemarks.trim(),
            meterNumber: completionData.meterNumber.trim(),
            synchronizationDate: completionData.synchronizationDate ? new Date(completionData.synchronizationDate) : new Date()
        };

        project.statusHistory = project.statusHistory || [];
        project.statusHistory.push({
            previousStatus: project.status,
            newStatus: 'COMPLETED',
            changedBy: user._id,
            role: user.role,
            reason: `Commissioned with Net Meter #${completionData.meterNumber.trim()}. Remarks: "${completionData.commissioningRemarks.trim()}"`,
            timestamp: new Date()
        });

        project.updatedBy = user._id;
        await ProjectService._saveProject(project);

        await ProjectService._logActivity({
            project: project._id,
            activityType: 'PROJECT_COMPLETED',
            title: 'Project 100% Installed, Tested & Commissioned',
            description: `Solar power plant synchronized with DISCOM grid under Meter #${completionData.meterNumber.trim()}. Certified by ${user.name}. Ready for PM Surya Ghar DBT subsidy inspection.`,
            performedBy: user._id
        });

        AuditService.log({
            action: 'PROJECT_COMPLETED',
            user: user._id,
            role: user.role,
            details: { projectNumber: project.projectNumber, meterNumber: completionData.meterNumber }
        });

        return project;
    }

    // -------------------------------------------------------------
    // 10. ACTIVITY TIMELINE RETRIEVAL (APPEND-ONLY)
    // -------------------------------------------------------------
    static async getProjectActivities(projectId) {
        if (!projectId) return [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            return await ProjectActivity.find({ project: projectId })
                .populate('performedBy', 'name role employeeId')
                .sort({ createdAt: -1 })
                .lean();
        }
        return ProjectService._memoryActivities
            .filter(a => a.project && a.project.toString() === projectId.toString())
            .reverse();
    }
}

module.exports = ProjectService;
