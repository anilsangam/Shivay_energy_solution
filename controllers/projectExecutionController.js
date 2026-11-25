const mongoose = require('mongoose');
const ProjectExecutionService = require('../services/projectExecutionService');
const Project = require('../models/Project');
const Material = require('../models/Material');
const SerialNumber = require('../models/SerialNumber');
const InstallationRecord = require('../models/InstallationRecord');
const companyData = require('../config/company');

class ProjectExecutionController {
    /**
     * Installation Technician Mobile Workspace
     */
    static async getInstallationWorkspace(req, res) {
        try {
            const currentUser = req.session.user;
            const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
            const branchId = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId) : null;

            const query = isSuperAdmin
                ? {}
                : {
                    $or: [
                        { 'assignedEmployees.user': currentUser._id },
                        { branch: branchId, status: { $in: ['MATERIAL_DISPATCHED', 'INSTALLATION_SCHEDULED', 'INSTALLATION_IN_PROGRESS', 'TESTING_AND_COMMISSIONING'] } }
                    ]
                };

            let projects = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                projects = await Project.find(query)
                    .populate('customer', 'name mobile address')
                    .populate('quotation', 'quotationNumber plantCapacityKw')
                    .populate('branch', 'name code')
                    .sort({ updatedAt: -1 })
                    .lean();
            }

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, projects });
            }

            return res.render('private/installation/workspace', {
                company: companyData.company,
                user: currentUser,
                currentUser,
                projects,
                activePage: 'installation-workspace',
                pageTitle: 'Installation Team Workspace'
            });
        } catch (err) {
            console.error('[ProjectExecutionController.getInstallationWorkspace] Error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Assign employees to project
     */
    static async postAssignEmployees(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { assignments } = req.body;

            const project = await ProjectExecutionService.assignProjectEmployees(
                projectId,
                assignments,
                currentUser
            );

            return res.json({
                success: true,
                message: 'Employees assigned to project successfully.',
                project
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postAssignEmployees] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Update project progress status
     */
    static async postUpdateStatus(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { status, remarks, stage } = req.body;

            const project = await ProjectExecutionService.updateProjectStatus(
                projectId,
                status,
                currentUser,
                { remarks, stage }
            );

            return res.json({
                success: true,
                message: `Project status advanced to ${project.status} (${project.progressPercentage}%).`,
                project
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postUpdateStatus] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Register new equipment serial number
     */
    static async postRegisterSerial(req, res) {
        try {
            const currentUser = req.session.user;
            const { serialNumber, materialId, category, brand, branchId } = req.body;

            const currentBranch = branchId || currentUser.branchId;
            const serial = await ProjectExecutionService.registerSerialNumber({
                serialNumber,
                materialId,
                category,
                brand,
                currentBranch,
                user: currentUser
            });

            return res.json({
                success: true,
                message: `Serial number ${serial.serialNumber} registered successfully.`,
                serial
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postRegisterSerial] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Allocate material and serial numbers to a project
     */
    static async postAllocateMaterial(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { materialId, quantity, serialNumbers } = req.body;

            const allocation = await ProjectExecutionService.allocateMaterialToProject(
                projectId,
                materialId,
                quantity,
                serialNumbers,
                currentUser
            );

            return res.json({
                success: true,
                message: `Allocated ${allocation.allocatedQuantity} units of ${allocation.materialName} to project.`,
                allocation
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postAllocateMaterial] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Dispatch project material to site
     */
    static async postDispatchMaterial(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { allocationId, dispatchQuantity, serialNumbers } = req.body;

            const allocation = await ProjectExecutionService.dispatchProjectMaterial(
                projectId,
                allocationId,
                dispatchQuantity,
                serialNumbers,
                currentUser
            );

            return res.json({
                success: true,
                message: `Dispatched ${dispatchQuantity} units of ${allocation.materialName} to project site.`,
                allocation
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postDispatchMaterial] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Start installation at customer site
     */
    static async postStartInstallation(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;

            const record = await ProjectExecutionService.startInstallation(projectId, currentUser);

            return res.json({
                success: true,
                message: 'Installation commenced at customer site.',
                record
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postStartInstallation] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Submit installation completion and testing results
     */
    static async postSubmitInstallation(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { installedSerials, testResults, photos, customerSignoff } = req.body;

            const record = await ProjectExecutionService.submitInstallationCompletion(
                projectId,
                currentUser,
                { installedSerials, testResults, photos, customerSignoff }
            );

            return res.json({
                success: true,
                message: 'Installation testing and customer signoff submitted.',
                record
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postSubmitInstallation] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Manager final approval & project completion signoff
     */
    static async postApproveCompletion(req, res) {
        try {
            const { projectId } = req.params;
            const currentUser = req.session.user;
            const { meterNumber, remarks } = req.body;

            const project = await ProjectExecutionService.approveProjectCompletion(
                projectId,
                currentUser,
                { meterNumber, remarks }
            );

            return res.json({
                success: true,
                message: `Project ${project.projectNumber} approved and marked COMPLETED.`,
                project
            });
        } catch (err) {
            console.error('[ProjectExecutionController.postApproveCompletion] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Executive Management Dashboard
     */
    static async getExecutiveDashboard(req, res) {
        try {
            const currentUser = req.session.user;
            const dashboard = await ProjectExecutionService.getManagementDashboard(currentUser);

            return res.json({
                success: true,
                dashboard
            });
        } catch (err) {
            console.error('[ProjectExecutionController.getExecutiveDashboard] Error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    }
}

module.exports = ProjectExecutionController;
