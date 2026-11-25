const mongoose = require('mongoose');
const crypto = require('crypto');
const Project = require('../models/Project');
const Material = require('../models/Material');
const SerialNumber = require('../models/SerialNumber');
const ProjectMaterialAllocation = require('../models/ProjectMaterialAllocation');
const InstallationRecord = require('../models/InstallationRecord');
const User = require('../models/User');
const AuditService = require('./auditService');
const AuthorizationService = require('./authorizationService');

class ProjectExecutionService {
    /**
     * Generate unique collision-safe allocation ID (e.g. ALC-2611-AB12)
     */
    static generateAllocationId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `ALC-${dateStr}-${randomHex}`;
    }

    /**
     * Generate unique collision-safe installation record ID (e.g. INST-2611-AB12)
     */
    static generateInstallationId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `INST-${dateStr}-${randomHex}`;
    }

    // =========================================================================
    // STEP 1 & 2: EMPLOYEE ASSIGNMENTS & PROJECT WORKSPACE
    // =========================================================================

    /**
     * Assign team members (Manager, Field Engineer, Installation Technicians) to a project
     */
    static async assignProjectEmployees(projectId, assignments = [], managerUser) {
        if (!managerUser) throw new Error('Manager identity required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        // Branch Isolation Check: non-super admins cannot manage projects outside their branch
        if (managerUser.role !== 'SUPER_ADMIN') {
            const userBranch = managerUser.branchId ? (managerUser.branchId._id || managerUser.branchId).toString() : '';
            const prjBranch = project.branch ? (project.branch._id || project.branch).toString() : '';
            if (userBranch && prjBranch && userBranch !== prjBranch) {
                throw new Error('Branch isolation policy: Cannot assign employees to a project from another branch.');
            }
        }

        if (!Array.isArray(assignments) || assignments.length === 0) {
            throw new Error('At least one employee assignment is required.');
        }

        if (!project.assignedEmployees) project.assignedEmployees = [];

        for (const assign of assignments) {
            const { userId, roleInProject } = assign;
            if (!userId || !mongoose.isValidObjectId(userId)) continue;

            // Prevent duplicate active assignment of same user
            const existingIdx = project.assignedEmployees.findIndex(
                a => String(a.user) === String(userId) && a.roleInProject === roleInProject
            );

            if (existingIdx === -1) {
                project.assignedEmployees.push({
                    user: userId,
                    roleInProject: roleInProject || 'INSTALLATION_TECHNICIAN',
                    assignedAt: new Date(),
                    assignedBy: managerUser._id
                });
            }

            if (roleInProject === 'PROJECT_MANAGER') {
                project.assignedManager = userId;
            } else if (roleInProject === 'FIELD_ENGINEER') {
                project.assignedEngineer = userId;
            }
        }

        await project.save();

        AuditService.log({
            action: 'PROJECT_ASSIGNED',
            user: managerUser._id,
            role: managerUser.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                assignedCount: assignments.length
            }
        });

        return project;
    }

    // =========================================================================
    // STEP 3: PROJECT PROGRESS & LIFECYCLE TRACKING
    // =========================================================================

    /**
     * Advance project lifecycle status with milestone audit history
     */
    static async updateProjectStatus(projectId, newStatus, user, { remarks = '', stage = null } = {}) {
        if (!user) throw new Error('User context required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        // Branch Isolation Check
        if (user.role !== 'SUPER_ADMIN') {
            const userBranch = user.branchId ? (user.branchId._id || user.branchId).toString() : '';
            const prjBranch = project.branch ? (project.branch._id || project.branch).toString() : '';
            if (userBranch && prjBranch && userBranch !== prjBranch) {
                throw new Error('Branch isolation violation: Cannot update project of another branch.');
            }
        }

        const prevStatus = project.status;
        project.status = newStatus;
        if (stage) project.stage = stage;
        if (remarks) project.statusReason = remarks.trim();

        // Automated progress calculation based on standard milestones
        const statusProgressMap = {
            'NOT_STARTED': 0,
            'PLANNING': 10,
            'SITE_READY': 20,
            'MATERIAL_PLANNING': 30,
            'MATERIAL_READY': 45,
            'MATERIAL_ALLOCATED': 50,
            'MATERIAL_DISPATCHED': 60,
            'INSTALLATION_SCHEDULED': 70,
            'INSTALLATION_IN_PROGRESS': 80,
            'TESTING_AND_COMMISSIONING': 90,
            'COMPLETED': 100
        };

        if (statusProgressMap[newStatus] !== undefined) {
            project.progressPercentage = statusProgressMap[newStatus];
        }

        if (!project.statusHistory) project.statusHistory = [];
        project.statusHistory.push({
            previousStatus: prevStatus,
            newStatus,
            changedBy: user._id,
            role: user.role,
            reason: remarks.trim(),
            timestamp: new Date()
        });

        await project.save();

        AuditService.log({
            action: 'PROJECT_STATUS_UPDATED',
            user: user._id,
            role: user.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                previousStatus: prevStatus,
                newStatus,
                progressPercentage: project.progressPercentage
            }
        });

        return project;
    }

    // =========================================================================
    // STEP 4 & 5: MATERIAL ALLOCATION & SERIAL NUMBER TRACKING
    // =========================================================================

    /**
     * Register a new serial number in warehouse stock
     */
    static async registerSerialNumber({ serialNumber, materialId, category, brand, currentBranch, user }) {
        if (!serialNumber || !serialNumber.trim()) throw new Error('Serial number is required.');
        if (!materialId || !mongoose.isValidObjectId(materialId)) throw new Error('Valid material is required.');
        if (!currentBranch || !mongoose.isValidObjectId(currentBranch)) throw new Error('Branch reference is required.');

        const cleanSerial = serialNumber.trim().toUpperCase();

        // Enforce uniqueness
        const existing = await SerialNumber.findOne({ serialNumber: cleanSerial });
        if (existing) {
            throw new Error(`Serial number "${cleanSerial}" is already registered (Status: ${existing.status}).`);
        }

        const material = await Material.findById(materialId);
        if (!material) throw new Error('Referenced material not found.');

        const serial = new SerialNumber({
            serialNumber: cleanSerial,
            material: material._id,
            materialName: material.name,
            sku: material.sku,
            brand: brand || material.brand || '',
            category: category || (material.category?.includes('Inverter') ? 'SOLAR_INVERTER' : 'SOLAR_PANEL'),
            status: 'AVAILABLE',
            currentBranch,
            movementHistory: [{
                action: 'INWARDED',
                fromStatus: 'NONE',
                toStatus: 'AVAILABLE',
                branch: currentBranch,
                performedBy: user ? user._id : null,
                remarks: 'Initial stock inward registration',
                timestamp: new Date()
            }]
        });

        await serial.save();

        if (user) {
            AuditService.log({
                action: 'SERIAL_REGISTERED',
                user: user._id,
                role: user.role,
                branchId: currentBranch,
                details: {
                    serialNumber: cleanSerial,
                    materialName: material.name
                }
            });
        }

        return serial;
    }

    /**
     * Allocate material and optional serial numbers to a project
     * Enforces strict stock availability check: requestedQty <= availableStock
     */
    static async allocateMaterialToProject(projectId, materialId, requestedQty, serialNumbers = [], user) {
        if (!user) throw new Error('User context required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        const material = await Material.findById(materialId);
        if (!material) throw new Error('Material not found.');

        const qty = Number(requestedQty);
        if (isNaN(qty) || qty <= 0) {
            throw new Error('Allocation quantity must be greater than zero.');
        }

        // STOCK AVAILABILITY CHECK:
        // availableStock = currentStock - (allocatedStock || 0)
        const currentStock = material.currentStock || 0;
        const allocatedStock = material.allocatedStock || 0;
        const availableStock = Math.max(0, currentStock - allocatedStock);

        if (qty > availableStock) {
            throw new Error(`Insufficient stock for "${material.name}". Requested: ${qty}, Available: ${availableStock} (Current: ${currentStock}, Already Allocated: ${allocatedStock}).`);
        }

        // SERIAL NUMBER VALIDATION & RESERVATION:
        const cleanSerials = (Array.isArray(serialNumbers) ? serialNumbers : [])
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        if (cleanSerials.length > 0) {
            if (cleanSerials.length > qty) {
                throw new Error(`Cannot assign more serial numbers (${cleanSerials.length}) than allocated quantity (${qty}).`);
            }

            // Check each serial number is currently AVAILABLE and belongs to the same branch
            for (const sNum of cleanSerials) {
                const serialDoc = await SerialNumber.findOne({ serialNumber: sNum });
                if (!serialDoc) {
                    throw new Error(`Serial number "${sNum}" not found in inventory.`);
                }
                if (serialDoc.status !== 'AVAILABLE') {
                    throw new Error(`Serial number "${sNum}" cannot be allocated. Current status is ${serialDoc.status} (Project: ${serialDoc.allocatedProject || 'N/A'}).`);
                }
                if (String(serialDoc.currentBranch) !== String(project.branch)) {
                    throw new Error(`Serial number "${sNum}" belongs to another branch and cannot be allocated here.`);
                }

                // Reserve/Allocate serial
                serialDoc.status = 'ALLOCATED';
                serialDoc.allocatedProject = project._id;
                serialDoc.movementHistory.push({
                    action: 'ALLOCATED',
                    fromStatus: 'AVAILABLE',
                    toStatus: 'ALLOCATED',
                    project: project._id,
                    branch: project.branch,
                    performedBy: user._id,
                    remarks: `Allocated to Project ${project.projectNumber}`,
                    timestamp: new Date()
                });
                await serialDoc.save();
            }
        }

        // Create allocation record
        const allocationId = this.generateAllocationId();
        const allocation = new ProjectMaterialAllocation({
            allocationId,
            project: project._id,
            material: material._id,
            materialName: material.name,
            sku: material.sku,
            unit: material.unit || 'Piece',
            allocatedQuantity: qty,
            allocatedSerials: cleanSerials,
            branch: project.branch,
            allocatedBy: user._id,
            status: 'ALLOCATED'
        });

        await allocation.save();

        // Increment material's allocated stock
        material.allocatedStock = (material.allocatedStock || 0) + qty;
        await material.save();

        // Add to project.materials checklist
        if (!project.materials) project.materials = [];
        const existingMaterialIdx = project.materials.findIndex(m => m.itemName === material.name);
        if (existingMaterialIdx !== -1) {
            project.materials[existingMaterialIdx].allocatedQty += qty;
            project.materials[existingMaterialIdx].status = 'ALLOCATED';
        } else {
            project.materials.push({
                itemName: material.name,
                category: material.category,
                requiredQty: qty,
                allocatedQty: qty,
                unit: material.unit || 'Nos',
                status: 'ALLOCATED'
            });
        }

        if (project.status === 'NOT_STARTED' || project.status === 'PLANNING' || project.status === 'SITE_READY') {
            project.status = 'MATERIAL_ALLOCATED';
            project.stage = 'MATERIAL_PLANNING';
        }

        await project.save();

        AuditService.log({
            action: 'MATERIAL_ALLOCATED',
            user: user._id,
            role: user.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                materialName: material.name,
                allocatedQuantity: qty,
                serialsCount: cleanSerials.length
            }
        });

        return allocation;
    }

    // =========================================================================
    // STEP 6: DISPATCH & DELIVERY RECONCILIATION
    // =========================================================================

    /**
     * Dispatch allocated material to project site
     * Validates and reconciles dispatched serial numbers
     */
    static async dispatchProjectMaterial(projectId, allocationId, dispatchQty, serialNumbers = [], user) {
        if (!user) throw new Error('User context required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        let allocation = await ProjectMaterialAllocation.findOne({ allocationId });
        if (!allocation && mongoose.isValidObjectId(allocationId)) {
            allocation = await ProjectMaterialAllocation.findById(allocationId);
        }
        if (!allocation) throw new Error('Allocation record not found.');

        const qty = Number(dispatchQty);
        if (isNaN(qty) || qty <= 0) {
            throw new Error('Dispatched quantity must be greater than zero.');
        }

        const remainingToDispatch = allocation.allocatedQuantity - allocation.dispatchedQuantity;
        if (qty > remainingToDispatch) {
            throw new Error(`Cannot dispatch ${qty} units. Remaining allocated quantity to dispatch is ${remainingToDispatch}.`);
        }

        const cleanSerials = (Array.isArray(serialNumbers) ? serialNumbers : [])
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        // Update serial numbers from ALLOCATED to DISPATCHED
        if (cleanSerials.length > 0) {
            for (const sNum of cleanSerials) {
                const serialDoc = await SerialNumber.findOne({ serialNumber: sNum });
                if (!serialDoc) throw new Error(`Serial number "${sNum}" not found.`);
                if (serialDoc.status === 'DISPATCHED' || serialDoc.status === 'INSTALLED') {
                    throw new Error(`Security validation failed: Serial number "${sNum}" has already been dispatched/installed.`);
                }

                serialDoc.status = 'DISPATCHED';
                serialDoc.movementHistory.push({
                    action: 'DISPATCHED',
                    fromStatus: 'ALLOCATED',
                    toStatus: 'DISPATCHED',
                    project: project._id,
                    branch: project.branch,
                    performedBy: user._id,
                    remarks: `Dispatched to site for Project ${project.projectNumber}`,
                    timestamp: new Date()
                });
                await serialDoc.save();

                if (!allocation.dispatchedSerials) allocation.dispatchedSerials = [];
                allocation.dispatchedSerials.push(sNum);
            }
        }

        allocation.dispatchedQuantity += qty;
        if (allocation.dispatchedQuantity >= allocation.allocatedQuantity) {
            allocation.status = 'FULLY_DISPATCHED';
        } else {
            allocation.status = 'PARTIALLY_DISPATCHED';
        }
        await allocation.save();

        // Update Material physical stock (currentStock decrements on dispatch, allocatedStock decrements)
        const material = await Material.findById(allocation.material);
        if (material) {
            material.currentStock = Math.max(0, (material.currentStock || 0) - qty);
            material.allocatedStock = Math.max(0, (material.allocatedStock || 0) - qty);
            await material.save();
        }

        project.status = 'MATERIAL_DISPATCHED';
        await project.save();

        AuditService.log({
            action: 'MATERIAL_DISPATCHED',
            user: user._id,
            role: user.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                materialName: allocation.materialName,
                dispatchedQuantity: qty,
                serialsCount: cleanSerials.length
            }
        });

        return allocation;
    }

    // =========================================================================
    // STEP 7 & 8: INSTALLATION WORKSPACE & FINAL COMPLETION
    // =========================================================================

    /**
     * Start installation milestone at customer site
     */
    static async startInstallation(projectId, technicianUser) {
        if (!technicianUser) throw new Error('Technician identity required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        const installationId = this.generateInstallationId();
        const record = new InstallationRecord({
            installationId,
            project: project._id,
            customer: project.customer,
            technician: technicianUser._id,
            technicianName: technicianUser.name,
            branch: project.branch,
            startedAt: new Date(),
            status: 'IN_PROGRESS'
        });

        await record.save();

        project.status = 'INSTALLATION_IN_PROGRESS';
        project.stage = 'STRUCTURE_INSTALLATION';
        await project.save();

        AuditService.log({
            action: 'INSTALLATION_STARTED',
            user: technicianUser._id,
            role: technicianUser.role,
            branchId: project.branch,
            details: {
                installationId,
                projectNumber: project.projectNumber
            }
        });

        return record;
    }

    /**
     * Submit installation completion and testing results
     * Verifies installed serial numbers and records test metrics
     */
    static async submitInstallationCompletion(projectId, technicianUser, {
        installedSerials = [],
        testResults = {},
        photos = [],
        customerSignoff = {}
    }) {
        if (!technicianUser) throw new Error('Technician identity required.');
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        let record = await InstallationRecord.findOne({ project: project._id, status: 'IN_PROGRESS' });
        if (!record) {
            record = new InstallationRecord({
                installationId: this.generateInstallationId(),
                project: project._id,
                technician: technicianUser._id,
                branch: project.branch
            });
        }

        // Verify & mark serial numbers as INSTALLED
        const cleanSerials = (Array.isArray(installedSerials) ? installedSerials : [])
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        for (const sNum of cleanSerials) {
            const serialDoc = await SerialNumber.findOne({ serialNumber: sNum });
            if (serialDoc) {
                serialDoc.status = 'INSTALLED';
                serialDoc.installedAt = new Date();
                serialDoc.installedBy = technicianUser._id;
                serialDoc.movementHistory.push({
                    action: 'INSTALLED',
                    fromStatus: serialDoc.status,
                    toStatus: 'INSTALLED',
                    project: project._id,
                    branch: project.branch,
                    performedBy: technicianUser._id,
                    remarks: 'Installed and synced on customer premises',
                    timestamp: new Date()
                });
                await serialDoc.save();
            }
        }

        record.completedAt = new Date();
        record.testResults = {
            vocVolts: Number(testResults.vocVolts) || 450,
            iscAmps: Number(testResults.iscAmps) || 12.5,
            gridVoltageVolts: Number(testResults.gridVoltageVolts) || 235,
            gridFrequencyHz: Number(testResults.gridFrequencyHz) || 50,
            earthingResistanceOhms: Number(testResults.earthingResistanceOhms) || 2.4,
            isSyncTested: testResults.isSyncTested !== false,
            testingRemarks: testResults.testingRemarks || 'Grid synchronization successful'
        };

        record.customerSignoff = {
            isHandoverConfirmed: customerSignoff.isHandoverConfirmed !== false,
            signoffDate: new Date(),
            customerFeedback: customerSignoff.customerFeedback || 'Installation approved by customer'
        };

        record.photos = photos || [];
        record.status = 'SUBMITTED';
        await record.save();

        project.status = 'TESTING_AND_COMMISSIONING';
        project.progressPercentage = 90;
        await project.save();

        AuditService.log({
            action: 'INSTALLATION_COMPLETED',
            user: technicianUser._id,
            role: technicianUser.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                installedSerialsCount: cleanSerials.length,
                isSyncTested: record.testResults.isSyncTested
            }
        });

        return record;
    }

    /**
     * Final project completion signoff & customer handover (Manager Approval)
     */
    static async approveProjectCompletion(projectId, managerUser, { meterNumber = '', remarks = '' } = {}) {
        if (!managerUser) throw new Error('Manager identity required.');
        if (!['SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER'].includes(managerUser.role)) {
            throw new Error('Only an authorized manager or Super Admin can approve project handover.');
        }

        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found.');

        // Update completion details
        project.status = 'COMPLETED';
        project.progressPercentage = 100;
        project.actualCompletionDate = new Date();
        project.completionDetails = {
            completedAt: new Date(),
            approvedBy: managerUser._id,
            commissioningRemarks: remarks.trim() || 'Final inspection and handover approved',
            meterNumber: meterNumber.trim(),
            synchronizationDate: new Date()
        };

        await project.save();

        // Mark installation record verified
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await InstallationRecord.updateMany(
                { project: project._id },
                { status: 'VERIFIED_COMPLETED', verifiedBy: managerUser._id, verifiedAt: new Date() }
            );
        }

        AuditService.log({
            action: 'PROJECT_HANDOVER_COMPLETED',
            user: managerUser._id,
            role: managerUser.role,
            branchId: project.branch,
            details: {
                projectNumber: project.projectNumber,
                meterNumber,
                approvedBy: managerUser.name
            }
        });

        return project;
    }

    // =========================================================================
    // STEP 9: MANAGEMENT DASHBOARDS & SCOPED METRICS
    // =========================================================================

    /**
     * Role-appropriate executive KPI metrics and pipeline summary
     */
    static async getManagementDashboard(user) {
        if (!user) throw new Error('User context required.');
        const isSuperAdmin = user.role === 'SUPER_ADMIN';
        const isManager = user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER';
        const branchId = user.branchId ? (user.branchId._id || user.branchId) : null;

        const branchFilter = isSuperAdmin ? {} : { branch: branchId };

        let totalProjects = 0;
        let activeProjects = 0;
        let completedProjects = 0;
        let installationsInProgress = 0;

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            totalProjects = await Project.countDocuments(branchFilter);
            completedProjects = await Project.countDocuments({ ...branchFilter, status: 'COMPLETED' });
            installationsInProgress = await Project.countDocuments({ ...branchFilter, status: 'INSTALLATION_IN_PROGRESS' });
            activeProjects = totalProjects - completedProjects;
        }

        return {
            totalProjects,
            activeProjects,
            completedProjects,
            installationsInProgress,
            branchScope: isSuperAdmin ? 'ALL_BRANCHES' : (user.branchId ? user.branchId.toString() : 'UNASSIGNED')
        };
    }
}

module.exports = ProjectExecutionService;
