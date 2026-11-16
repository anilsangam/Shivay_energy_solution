const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const ProjectService = require('../services/projectService');
const UploadService = require('../services/uploadService');
const User = require('../models/User');
const Quotation = require('../models/Quotation');
const companyConfig = require('../config/company');

class ProjectController {
    // -------------------------------------------------------------
    // 1. LIST PROJECTS VIEW
    // -------------------------------------------------------------
    static async getProjectsPage(req, res) {
        try {
            const user = req.session.user;
            const query = req.query;

            const { projects, total, page, pages } = await ProjectService.getProjects(user, query);

            // Compute Real-time Dashboard Summary Cards
            let totalProjectsCount = total;
            let activeProjectsCount = 0;
            let completedProjectsCount = 0;
            let onHoldProjectsCount = 0;
            let totalKwInstalled = 0;

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const Project = require('../models/Project');
                const statsFilter = {};
                if (user.role === 'EMPLOYEE') {
                    statsFilter.$or = [
                        { assignedEngineer: user._id },
                        { 'assignedEmployees.user': user._id },
                        { 'siteVisit.assignedTo': user._id }
                    ];
                } else if (user.role === 'MANAGER' || user.role === 'BRANCH_MANAGER') {
                    if (user.branchId) {
                        statsFilter.$or = [{ branch: user.branchId }, { assignedManager: user._id }];
                    } else {
                        statsFilter.assignedManager = user._id;
                    }
                }

                const allUserProjects = await Project.find(statsFilter).select('status capacityKw').lean();
                totalProjectsCount = allUserProjects.length;
                allUserProjects.forEach(p => {
                    if (p.status === 'COMPLETED') {
                        completedProjectsCount++;
                        totalKwInstalled += (p.capacityKw || 0);
                    } else if (p.status === 'ON_HOLD') {
                        onHoldProjectsCount++;
                    } else if (p.status !== 'CANCELLED') {
                        activeProjectsCount++;
                    }
                });
            }

            const activePage = user.role === 'SUPER_ADMIN' ? 'projects' : (user.role === 'EMPLOYEE' ? 'employee-projects' : 'manager-projects');
            const pageTitle = user.role === 'SUPER_ADMIN' ? 'Company Project Execution & Installation Tracking' : (user.role === 'EMPLOYEE' ? 'My Assigned Solar Rooftop Projects' : 'Branch Solar Projects & Commissioning');

            res.render('private/projects/index', {
                title: `${pageTitle} | ${companyConfig.company.name}`,
                company: companyConfig.company,
                user,
                activePage,
                pageTitle,
                breadcrumbs: [
                    { label: user.role === 'SUPER_ADMIN' ? 'Executive' : (user.role === 'EMPLOYEE' ? 'Field' : 'Branch'), url: user.role === 'SUPER_ADMIN' ? '/admin/dashboard' : (user.role === 'EMPLOYEE' ? '/employee/dashboard' : '/manager/dashboard') },
                    { label: 'Projects' }
                ],
                projects,
                total,
                page,
                pages,
                query,
                stats: {
                    total: totalProjectsCount,
                    active: activeProjectsCount,
                    completed: completedProjectsCount,
                    onHold: onHoldProjectsCount,
                    totalKw: Math.round(totalKwInstalled * 10) / 10
                }
            });
        } catch (err) {
            console.error('Project list page error:', err);
            res.status(500).render('public-site/404', {
                title: 'Error Loading Projects',
                message: err.message || 'Unable to retrieve project listings.',
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 2. PROJECT DETAIL VIEW
    // -------------------------------------------------------------
    static async getProjectDetailPage(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;

            const project = await ProjectService.getProjectById(projectId, user);
            const activities = await ProjectService.getProjectActivities(projectId);

            // Fetch eligible employees for task/site visit assignment dropdowns (Managers & Admins only)
            let branchEmployees = [];
            if (user.role !== 'EMPLOYEE' && mongoose.connection && mongoose.connection.readyState === 1) {
                const empQuery = { role: 'EMPLOYEE', status: 'ACTIVE' };
                if (['MANAGER', 'BRANCH_MANAGER'].includes(user.role)) {
                    const orFilters = [{ managerId: user._id }];
                    if (user.branchId) {
                        orFilters.push({ branchId: user.branchId });
                    }
                    empQuery.$or = orFilters;
                }
                branchEmployees = await User.find(empQuery).select('_id name email employeeId role').lean();
            } else if (user.role !== 'EMPLOYEE') {
                const DataStore = require('../services/dataStore');
                if (['MANAGER', 'BRANCH_MANAGER'].includes(user.role)) {
                    branchEmployees = await DataStore.getEmployeesByManager(user._id, user.branchId);
                } else {
                    const allUsers = await DataStore.getUsers();
                    branchEmployees = allUsers.filter(u => u.role === 'EMPLOYEE' && u.status === 'ACTIVE');
                }
            }

            const activePage = user.role === 'SUPER_ADMIN' ? 'projects' : (user.role === 'EMPLOYEE' ? 'employee-projects' : 'manager-projects');

            res.render('private/projects/detail', {
                title: `${project.projectNumber} - ${project.title} | ${companyConfig.company.name}`,
                company: companyConfig.company,
                user,
                activePage,
                pageTitle: `${project.projectNumber}: ${project.title}`,
                breadcrumbs: [
                    { label: 'Projects', url: user.role === 'SUPER_ADMIN' ? '/admin/projects' : (user.role === 'EMPLOYEE' ? '/employee/projects' : '/manager/projects') },
                    { label: project.projectNumber }
                ],
                project,
                activities,
                branchEmployees,
                successMsg: req.query.success || null,
                errorMsg: req.query.error || null
            });
        } catch (err) {
            console.error('Project detail page error:', err);
            const statusCode = err.status || 500;
            res.status(statusCode).render('public-site/404', {
                title: statusCode === 403 ? 'Access Denied' : 'Project Not Found',
                message: err.message || 'Unable to load project workspace.',
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 3. API & MUTATIONS: STATUS TRANSITION
    // -------------------------------------------------------------
    static async updateStatus(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;
            const { status, reason } = req.body;

            if (!status) {
                return res.status(400).json({ success: false, message: 'Status is required.' });
            }

            const project = await ProjectService.updateProjectStatus(projectId, status, reason, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: `Status updated to ${status}.`, project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Status+updated+to+${encodeURIComponent(status)}`);
        } catch (err) {
            console.error('Update status error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Status Update Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 4. SITE VISIT SUBMISSION & REVIEW
    // -------------------------------------------------------------
    static async submitSiteVisit(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;

            const project = await ProjectService.submitSiteVisit(projectId, req.body, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Site visit report submitted for manager review.', project });
            }

            const returnUrl = user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`;
            res.redirect(`${returnUrl}?success=Site+visit+report+submitted+successfully`);
        } catch (err) {
            console.error('Submit site visit error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Site Visit Submission Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    static async reviewSiteVisit(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;
            const { action, managerRemarks } = req.body;

            const project = await ProjectService.reviewSiteVisit(projectId, action, managerRemarks, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: `Site visit ${action === 'APPROVE' ? 'approved' : 'returned for revision'}.`, project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Site+visit+${encodeURIComponent(action === 'APPROVE' ? 'approved' : 'revision requested')}`);
        } catch (err) {
            console.error('Review site visit error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Review Action Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 5. TASK MANAGEMENT
    // -------------------------------------------------------------
    static async createTask(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;

            const project = await ProjectService.createTask(projectId, req.body, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Task assigned successfully.', project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Task+assigned+successfully`);
        } catch (err) {
            console.error('Create task error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Task Assignment Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    static async updateTaskStatus(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;
            const taskId = req.params.taskId;
            const { status, remarks } = req.body;

            const project = await ProjectService.updateTaskStatus(projectId, taskId, status, remarks, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Task status updated.', project });
            }

            const returnUrl = user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : (user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Task+status+updated+to+${encodeURIComponent(status)}`);
        } catch (err) {
            console.error('Update task error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Task Update Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 6. EMPLOYEE ASSIGNMENT
    // -------------------------------------------------------------
    static async assignEmployee(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;
            const { employeeId, roleInProject } = req.body;

            if (!employeeId) {
                return res.status(400).json({ success: false, message: 'Employee selection is required.' });
            }

            const project = await ProjectService.assignEmployee(projectId, employeeId, roleInProject, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Team member assigned successfully.', project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Team+member+assigned+successfully`);
        } catch (err) {
            console.error('Assign employee error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Employee Assignment Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 7. MATERIAL ITEM UPDATE
    // -------------------------------------------------------------
    static async updateMaterial(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;
            const materialId = req.params.materialId;

            const project = await ProjectService.updateMaterialItem(projectId, materialId, req.body, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Material allocation updated.', project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Material+item+updated`);
        } catch (err) {
            console.error('Update material error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Material Update Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 8. DOCUMENT UPLOAD & SECURE DOWNLOAD
    // -------------------------------------------------------------
    static async uploadDocument(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;

            const project = await ProjectService.getProjectById(projectId, user);

            const { title, category, fileData, filename, mimeType } = req.body;
            if (!title || !fileData || !filename || !mimeType) {
                return res.status(400).json({ success: false, message: 'Title, fileData, filename, and mimeType are required.' });
            }

            // Process secure upload with magic bytes validation and Cloudinary shivay_energy
            const uploadResult = await UploadService.processUpload({
                name: filename,
                type: mimeType,
                data: fileData,
                category: category || 'OTHER'
            });

            const docEntry = {
                documentId: `DOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                title: title.trim(),
                category: category || 'OTHER',
                filename: uploadResult.filename,
                originalName: uploadResult.originalName,
                mimeType: uploadResult.mimeType,
                sizeBytes: uploadResult.sizeBytes || uploadResult.size,
                path: uploadResult.path,
                cloudinaryUrl: uploadResult.cloudinaryUrl || null,
                cloudinaryPublicId: uploadResult.cloudinaryPublicId || null,
                uploadedBy: user._id,
                uploadedAt: new Date(),
                isPrivate: true
            };

            project.documents.push(docEntry);
            project.updatedBy = user._id;
            await project.save();

            const ProjectActivity = require('../models/ProjectActivity');
            await ProjectActivity.create({
                project: project._id,
                activityType: 'DOCUMENT_UPLOADED',
                title: `Document Uploaded: ${docEntry.title}`,
                description: `${docEntry.title} (${docEntry.category}) uploaded by ${user.name}.`,
                performedBy: user._id
            });

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Document uploaded securely.', document: docEntry });
            }

            const returnUrl = user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : (user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Document+uploaded+successfully`);
        } catch (err) {
            console.error('Upload document error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Document Upload Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }

    static async downloadDocument(req, res) {
        try {
            const user = req.session.user;
            const { id: projectId, documentId } = req.params;

            const project = await ProjectService.getProjectById(projectId, user);
            const doc = project.documents.find(d => d.documentId === documentId || (d._id && d._id.toString() === documentId));

            if (!doc) {
                return res.status(404).render('public-site/404', {
                    title: 'Document Not Found',
                    message: 'The requested project attachment does not exist.',
                    company: companyConfig.company
                });
            }

            // Redirect to secure Cloudinary CDN asset URL (signed time-limited URL where applicable)
            const { generateSignedAssetUrl } = require('../config/cloudinary');
            const isImage = doc.mimeType && doc.mimeType.startsWith('image/');
            const signedUrl = doc.cloudinaryPublicId
                ? generateSignedAssetUrl(doc.cloudinaryPublicId, { resourceType: isImage ? 'image' : 'raw' })
                : (doc.cloudinaryUrl || doc.path);

            if (signedUrl) {
                return res.redirect(signedUrl);
            }

            return res.status(404).render('public-site/404', {
                title: 'File Not Available',
                message: 'Attachment file could not be located in cloud storage.',
                company: companyConfig.company
            });
        } catch (err) {
            console.error('Download document error:', err);
            const status = err.status || 403;
            res.status(status).render('public-site/404', {
                title: 'Unauthorized Document Access',
                message: err.message || 'You do not have permission to download this project document.',
                company: companyConfig.company
            });
        }
    }

    // -------------------------------------------------------------
    // 9. PROJECT COMPLETION CLEARANCE
    // -------------------------------------------------------------
    static async completeProject(req, res) {
        try {
            const user = req.session.user;
            const projectId = req.params.id;

            const project = await ProjectService.completeProject(projectId, req.body, user);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, message: 'Project finalized and commissioned successfully.', project });
            }

            const returnUrl = user.role === 'SUPER_ADMIN' ? `/admin/projects/${projectId}` : (user.role === 'EMPLOYEE' ? `/employee/projects/${projectId}` : `/manager/projects/${projectId}`);
            res.redirect(`${returnUrl}?success=Project+successfully+commissioned+and+completed`);
        } catch (err) {
            console.error('Complete project error:', err);
            const status = err.status || 400;
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(status).json({ success: false, message: err.message });
            }
            res.status(status).render('public-site/404', {
                title: 'Project Completion Clearance Failed',
                message: err.message,
                company: companyConfig.company
            });
        }
    }
}

module.exports = ProjectController;
