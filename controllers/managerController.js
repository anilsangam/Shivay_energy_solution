const User = require('../models/User');
const Branch = require('../models/Branch');
const Attendance = require('../models/Attendance');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Enquiry = require('../models/Enquiry');
const Complaint = require('../models/Complaint');
const companyData = require('../config/company');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');
const UploadService = require('../services/uploadService');
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    DESIGNATION_PRESETS,
    getFullPermissionTree,
    isValidPermission,
    isValidFieldPermission,
    filterValidPermissions,
    filterValidFieldPermissions
} = require('../config/permissionRegistry');
const { EmployeeCardController } = require('./employeeCardController');

class ManagerController {
    // -------------------------------------------------------------
    // BRANCH MANAGER DASHBOARD
    // -------------------------------------------------------------
    static async getDashboard(req, res) {
        try {
            const manager = req.session.user;
            const branchId = manager.branchId;

            let branch = null;
            if (branchId && mongoose.isValidObjectId(branchId) && mongoose.connection.readyState === 1) {
                try {
                    branch = await Branch.findById(branchId);
                } catch (e) {}
            }

            // Retrieve actual assigned employees strictly for this manager and their branch
            const assignedEmployees = await DataStore.getEmployeesByManager(manager._id, manager.branchId);

            const activeStaffCount = assignedEmployees.filter(e => e.status === 'ACTIVE').length;
            const enquiries = DataStore.getAllEnquiries();
            const attendance = DataStore.getTodayAttendance();

            const stats = {
                branchName: branch ? branch.name : 'Raisen Central Branch',
                branchCode: branch ? branch.code : 'MP-RSN-01',
                activeStaff: activeStaffCount,
                totalAssigned: assignedEmployees.length,
                pendingEnquiries: enquiries.filter(e => e.status === 'new').length,
                todayPunches: attendance.length
            };

            // Real-time Phase 3 Branch Project Metrics & Recent Projects
            let branchProjectStats = { total: 0, active: 0, completed: 0, onHold: 0, totalKw: 0 };
            let branchProjects = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                try {
                    const Project = require('../models/Project');
                    const bFilter = branchId ? { $or: [{ branch: branchId }, { assignedManager: manager._id }] } : { assignedManager: manager._id };
                    const projs = await Project.find(bFilter)
                        .select('projectNumber title capacityKw status customer assignedEngineer updatedAt createdAt')
                        .populate('customer', 'name mobile city')
                        .populate('assignedEngineer', 'name employeeId')
                        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
                        .lean();

                    branchProjectStats.total = projs.length;
                    projs.forEach(p => {
                        if (p.status !== 'CANCELLED') branchProjectStats.totalKw += (p.capacityKw || 0);
                        if (p.status === 'COMPLETED') branchProjectStats.completed++;
                        else if (p.status === 'ON_HOLD') branchProjectStats.onHold++;
                        else if (p.status !== 'CANCELLED') branchProjectStats.active++;
                    });
                    branchProjectStats.totalKw = Math.round(branchProjectStats.totalKw * 10) / 10;
                    branchProjects = projs.slice(0, 5);
                } catch (pe) {}
            }
            stats.projects = branchProjectStats;

            res.render('private/manager/dashboard', {
                title: `Branch Manager Dashboard | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                stats,
                branch,
                employees: assignedEmployees,
                recentProjects: branchProjects,
                enquiries,
                attendance,
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'manager-dashboard',
                pageTitle: 'Manager Operations Dashboard',
                breadcrumbs: [{ label: 'Manager Panel' }]
            });
        } catch (err) {
            console.error('Manager Dashboard Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading manager dashboard.'
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEES
    // -------------------------------------------------------------
    static async getEmployees(req, res) {
        try {
            const manager = req.session.user;
            const employees = await DataStore.getEmployeesByManager(manager._id, manager.branchId);

            res.render('private/manager/employees', {
                title: `Branch Staff Management | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                employees,
                csrfToken: req.csrfToken ? req.csrfToken() : (req.session.csrfToken || ''),
                user: req.session.user,
                currentUser: req.session.user,
                activePage: 'manager-employees',
                pageTitle: 'Assigned Branch Employees',
                breadcrumbs: [{ label: 'Manager' }, { label: 'Employees' }]
            });
        } catch (err) {
            console.error('Error fetching manager employees:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading assigned employees.'
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEE CREATION (BY MANAGER)
    // -------------------------------------------------------------
    static async postCreateEmployee(req, res) {
        try {
            const manager = req.session.user;
            let {
                name,
                email,
                mobile,
                password,
                designation,
                department,
                bloodGroup,
                alternateMobile,
                joiningDate,
                expiryDate,
                employeeId,
                avatar,
                avatarData,
                avatarFilename,
                avatarMimeType
            } = req.body;

            if (!name || !email || !mobile || !password) {
                return res.status(400).json({ success: false, message: 'Mandatory fields missing: Full Name, Email, Mobile and Password are required.' });
            }

            if (password.length < 8) {
                return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
            }

            let resolvedAvatar = (avatar && typeof avatar === 'string' && avatar.trim()) ? avatar.trim() : '';
            if (avatarData) {
                try {
                    const uploadedUrl = await UploadService.processProfileAvatar({
                        avatarData,
                        avatarFilename,
                        avatarMimeType
                    });
                    if (uploadedUrl) resolvedAvatar = uploadedUrl;
                } catch (uploadErr) {
                    return res.status(400).json({ success: false, message: uploadErr.message || 'Invalid profile picture upload.' });
                }
            }

            // Check duplicate email
            if (mongoose.connection.readyState === 1) {
                const existing = await User.findOne({ email: email.trim().toLowerCase() });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'An account with this email address already exists.' });
                }
            } else {
                const existingMem = (await DataStore.getUsers()).find(u => u.email.toLowerCase() === email.trim().toLowerCase());
                if (existingMem) {
                    return res.status(400).json({ success: false, message: 'An account with this email address already exists.' });
                }
            }

            // Branch is strictly locked to Manager's assigned branch
            const branchId = manager.branchId ? (manager.branchId._id || manager.branchId) : null;
            const managerId = manager._id;

            // Generate clean unique employee ID
            let cleanEmpId = '';
            if (employeeId && employeeId.trim()) {
                cleanEmpId = employeeId.trim().toUpperCase();
            } else {
                cleanEmpId = `SES-EMP-${Date.now().toString().slice(-4)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
            }

            // Default dates
            const parsedJoiningDate = joiningDate ? new Date(joiningDate) : new Date();
            const parsedExpiryDate = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000);

            let createdUserObj = null;
            if (mongoose.connection.readyState === 1) {
                createdUserObj = await User.create({
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    mobile: mobile.trim(),
                    password,
                    role: 'EMPLOYEE',
                    employeeId: cleanEmpId,
                    idCardNumber: cleanEmpId,
                    branchId: (branchId && mongoose.isValidObjectId(branchId)) ? branchId : null,
                    managerId: (managerId && mongoose.isValidObjectId(managerId)) ? managerId : null,
                    designation: designation ? designation.trim() : 'Solar Technician',
                    department: department ? department.trim() : 'Field Operations',
                    bloodGroup: bloodGroup ? bloodGroup.trim() : 'B+',
                    alternateMobile: alternateMobile ? alternateMobile.trim() : '',
                    joiningDate: parsedJoiningDate,
                    expiryDate: parsedExpiryDate,
                    avatar: resolvedAvatar,
                    status: 'PENDING'
                });
            } else {
                createdUserObj = {
                    _id: new mongoose.Types.ObjectId(),
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    mobile: mobile.trim(),
                    role: 'EMPLOYEE',
                    isPrimarySuperAdmin: false,
                    permissions: [],
                    fieldPermissions: [],
                    permissionVersion: 1,
                    employeeId: cleanEmpId,
                    idCardNumber: cleanEmpId,
                    branchId: branchId || 'br-raisen-1',
                    managerId: managerId,
                    designation: designation ? designation.trim() : 'Solar Technician',
                    department: department ? department.trim() : 'Field Operations',
                    bloodGroup: bloodGroup ? bloodGroup.trim() : 'B+',
                    alternateMobile: alternateMobile ? alternateMobile.trim() : '',
                    joiningDate: parsedJoiningDate,
                    expiryDate: parsedExpiryDate,
                    avatar: resolvedAvatar,
                    status: 'PENDING',
                    createdAt: new Date()
                };
                DataStore.addInMemoryUser(createdUserObj);
            }

            AuditService.log({
                action: 'EMPLOYEE_CREATED',
                user: manager._id,
                targetUser: createdUserObj._id,
                role: manager.role,
                ipAddress: req.ip,
                details: {
                    employeeId: cleanEmpId,
                    branchId: branchId,
                    name: name.trim(),
                    designation: designation || 'Solar Technician',
                    status: 'PENDING'
                }
            });

            return res.json({
                success: true,
                message: `Staff member ${createdUserObj.name} (${cleanEmpId}) created successfully. Super Admin approval is required before they can log in. Official ID Card and Visiting Card are ready.`,
                employee: {
                    _id: createdUserObj._id,
                    name: createdUserObj.name,
                    employeeId: createdUserObj.employeeId,
                    email: createdUserObj.email,
                    mobile: createdUserObj.mobile,
                    designation: createdUserObj.designation,
                    bloodGroup: createdUserObj.bloodGroup,
                    alternateMobile: createdUserObj.alternateMobile,
                    joiningDate: createdUserObj.joiningDate,
                    expiryDate: createdUserObj.expiryDate,
                    avatar: createdUserObj.avatar,
                    status: createdUserObj.status
                }
            });
        } catch (err) {
            console.error('Error creating branch employee:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error creating employee.' });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEE MODIFICATION (BY MANAGER)
    // -------------------------------------------------------------
    static async postUpdateEmployee(req, res) {
        try {
            const manager = req.session.user;
            const { id } = req.params;
            const {
                name,
                email,
                mobile,
                password,
                designation,
                department,
                bloodGroup,
                alternateMobile,
                joiningDate,
                expiryDate,
                status,
                avatarData,
                avatarFilename,
                avatarMimeType
            } = req.body;

            let targetUser = null;
            if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                targetUser = await User.findById(id);
            } else {
                targetUser = await DataStore.getUserById(id);
            }

            if (!targetUser) {
                return res.status(404).json({ success: false, message: 'Employee not found.' });
            }

            // Verify manager has jurisdiction over this employee
            const mBranch = manager.branchId ? (manager.branchId._id || manager.branchId).toString() : '';
            const uBranch = targetUser.branchId ? (targetUser.branchId._id || targetUser.branchId).toString() : '';
            const mId = (manager._id?._id || manager._id || '').toString();
            const uMgr = targetUser.managerId ? (targetUser.managerId._id || targetUser.managerId).toString() : '';

            const isSuperAdmin = manager.role === 'SUPER_ADMIN' || manager.isPrimarySuperAdmin;
            const hasBranchJurisdiction = (mBranch && uBranch && mBranch === uBranch) || (mId && uMgr && mId === uMgr);

            if (!isSuperAdmin && (!hasBranchJurisdiction || targetUser.role !== 'EMPLOYEE')) {
                return res.status(403).json({ success: false, message: 'Forbidden: You can only modify personnel assigned to your branch.' });
            }

            if (avatarData) {
                try {
                    const uploadedUrl = await UploadService.processProfileAvatar({
                        avatarData,
                        avatarFilename,
                        avatarMimeType
                    });
                    if (uploadedUrl) targetUser.avatar = uploadedUrl;
                } catch (uploadErr) {
                    return res.status(400).json({ success: false, message: uploadErr.message || 'Invalid profile picture upload.' });
                }
            }

            if (name) targetUser.name = name.trim();
            if (email) targetUser.email = email.trim().toLowerCase();
            if (mobile) targetUser.mobile = mobile.trim();
            if (designation !== undefined) targetUser.designation = designation.trim();
            if (department !== undefined) targetUser.department = department.trim();
            if (bloodGroup !== undefined) targetUser.bloodGroup = bloodGroup.trim();
            if (alternateMobile !== undefined) targetUser.alternateMobile = alternateMobile.trim();
            if (joiningDate) targetUser.joiningDate = new Date(joiningDate);
            if (expiryDate) targetUser.expiryDate = new Date(expiryDate);
            if (status && ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'REJECTED'].includes(status)) {
                if (!isSuperAdmin && ['PENDING', 'REJECTED'].includes(targetUser.status) && status === 'ACTIVE') {
                    return res.status(403).json({
                        success: false,
                        message: 'Super Admin approval is required before activating a pending or rejected employee account.'
                    });
                }
                if (isSuperAdmin || ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
                    if (isSuperAdmin || targetUser.status !== 'PENDING') {
                        targetUser.status = status;
                    }
                }
            }
            if (password && password.trim().length >= 8) {
                targetUser.password = password.trim();
            }

            if (targetUser.save) {
                await targetUser.save();
            }

            AuditService.log({
                action: 'EMPLOYEE_MODIFIED',
                user: manager._id,
                targetUser: targetUser._id,
                role: manager.role,
                ipAddress: req.ip,
                details: { name: targetUser.name, designation: targetUser.designation, status: targetUser.status }
            });

            return res.json({
                success: true,
                message: `Personnel profile for ${targetUser.name} updated successfully.`
            });
        } catch (err) {
            console.error('Error modifying employee:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error updating employee.' });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEE PERMISSIONS MANAGEMENT CONSOLE (BY MANAGER)
    // -------------------------------------------------------------
    static async getEmployeePermissions(req, res) {
        try {
            const { id } = req.params;
            const manager = req.session.user;

            let targetUser = null;
            if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                targetUser = await User.findById(id)
                    .populate('branchId', 'name code city')
                    .populate('managerId', 'name email role employeeId')
                    .select('-password')
                    .lean();
            } else {
                targetUser = await DataStore.getUserById(id);
            }

            if (!targetUser) {
                return res.status(404).render('private/errors/403', {
                    title: 'Staff Member Not Found | Shivay Energy Solutions',
                    message: 'The requested staff account was not found in the personnel database.',
                    user: manager
                });
            }

            // Verify manager jurisdiction
            const mBranch = manager.branchId ? (manager.branchId._id || manager.branchId).toString() : '';
            const uBranch = targetUser.branchId ? (targetUser.branchId._id || targetUser.branchId).toString() : '';
            const mId = (manager._id?._id || manager._id || '').toString();
            const uMgr = targetUser.managerId ? (targetUser.managerId._id || targetUser.managerId).toString() : '';
            const isSuperAdmin = manager.role === 'SUPER_ADMIN' || manager.isPrimarySuperAdmin;

            if (!isSuperAdmin && ((mBranch && uBranch && mBranch !== uBranch) || targetUser.role !== 'EMPLOYEE')) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Restricted | Shivay Energy Solutions',
                    message: 'Forbidden: You can only configure permissions for employees within your branch.',
                    user: manager
                });
            }

            let branchList = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                branchList = await Branch.find({ isActive: true }).select('name code city').lean().catch(() => []);
            }
            if (!branchList || branchList.length === 0) {
                branchList = [
                    { _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01', city: 'Raisen' },
                    { _id: 'br-bhopal-1', name: 'Bhopal Regional Hub', code: 'MP-BPL-02', city: 'Bhopal' },
                    { _id: 'br-vidisha-1', name: 'Vidisha Operational Center', code: 'MP-VDS-03', city: 'Vidisha' }
                ];
            }

            const permissionTree = getFullPermissionTree();

            res.render('private/admin/user-permissions', {
                title: `Manage Staff Permissions: ${targetUser.name} | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                targetUser,
                isTargetPrimaryAdmin: false,
                isCallerPrimaryAdmin: false,
                canEdit: true,
                isSelf: false,
                permissionTree,
                sensitiveFields: SENSITIVE_FIELDS,
                roleBaselines: ROLE_MIGRATION_BASELINES,
                designationPresets: DESIGNATION_PRESETS,
                modules: MODULES,
                branches: branchList,
                user: manager,
                currentUser: manager,
                csrfToken: req.csrfToken ? req.csrfToken() : (req.session.csrfToken || ''),
                activePage: 'manager-employees',
                pageTitle: `Permissions & Capabilities: ${targetUser.name}`,
                breadcrumbs: [
                    { label: 'Manager', url: '/manager/employees' },
                    { label: 'Personnel', url: '/manager/employees' },
                    { label: `Permissions (${targetUser.name})` }
                ]
            });
        } catch (err) {
            console.error('Error fetching manager employee permissions:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading permission management console.',
                user: req.session.user
            });
        }
    }

    // -------------------------------------------------------------
    // BRANCH EMPLOYEE PERMISSIONS UPDATE (BY MANAGER)
    // -------------------------------------------------------------
    static async postUpdateEmployeePermissions(req, res) {
        try {
            const { id } = req.params;
            const manager = req.session.user;

            let targetUser = null;
            if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                targetUser = await User.findById(id);
            } else {
                targetUser = await DataStore.getUserById(id);
            }

            if (!targetUser) {
                return res.status(404).json({ success: false, message: 'Target user not found.' });
            }

            // Verify manager jurisdiction
            const mBranch = manager.branchId ? (manager.branchId._id || manager.branchId).toString() : '';
            const uBranch = targetUser.branchId ? (targetUser.branchId._id || targetUser.branchId).toString() : '';
            const isSuperAdmin = manager.role === 'SUPER_ADMIN' || manager.isPrimarySuperAdmin;

            if (!isSuperAdmin && ((mBranch && uBranch && mBranch !== uBranch) || targetUser.role !== 'EMPLOYEE')) {
                return res.status(403).json({ success: false, message: 'Forbidden: You can only modify staff in your branch.' });
            }

            // Privilege Escalation & Delegation Boundaries Check
            const requestedChanges = {
                permissions: req.body.permissions,
                fieldPermissions: req.body.fieldPermissions,
                role: targetUser.role
            };
            const escalationCheck = AuthorizationService.preventPrivilegeEscalation(manager, targetUser, requestedChanges);
            if (!escalationCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    message: escalationCheck.reason || 'Privilege Escalation: You cannot assign permissions you do not possess.'
                });
            }

            const rawPermissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
            const rawFieldPermissions = Array.isArray(req.body.fieldPermissions) ? req.body.fieldPermissions : [];

            const validPermissions = Array.from(new Set(filterValidPermissions(rawPermissions)));
            const validFieldPermissions = Array.from(new Set(filterValidFieldPermissions(rawFieldPermissions)));

            const newVersion = (targetUser.permissionVersion || 1) + 1;
            const metadata = {
                assignedBy: manager._id,
                assignedAt: new Date(),
                notes: req.body.notes ? String(req.body.notes).trim() : 'Updated by Branch Manager'
            };

            if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                await User.findByIdAndUpdate(id, {
                    $set: {
                        permissions: validPermissions,
                        fieldPermissions: validFieldPermissions,
                        permissionVersion: newVersion,
                        permissionMetadata: metadata
                    }
                });
            } else {
                targetUser.permissions = validPermissions;
                targetUser.fieldPermissions = validFieldPermissions;
                targetUser.permissionVersion = newVersion;
                targetUser.permissionMetadata = metadata;
            }

            AuditService.log({
                action: 'PERMISSIONS_DELEGATED',
                user: manager._id,
                targetUser: targetUser._id,
                role: manager.role,
                ipAddress: req.ip,
                details: {
                    permissionsCount: validPermissions.length,
                    fieldPermissionsCount: validFieldPermissions.length,
                    version: newVersion
                }
            });

            return res.json({
                success: true,
                message: `Permissions updated successfully for ${targetUser.name} (${validPermissions.length} permissions assigned).`,
                version: newVersion
            });
        } catch (err) {
            console.error('Error updating employee permissions by manager:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error updating permissions.' });
        }
    }

    // -------------------------------------------------------------
    // BRANCH ATTENDANCE
    // -------------------------------------------------------------
    static async getAttendance(req, res) {
        try {
            await DataStore.syncAttendanceFromDb();
        } catch (_) {}
        const attendance = DataStore.getTodayAttendance();
        res.render('private/manager/attendance', {
            title: `Branch Field Attendance Logs | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            attendance,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-attendance',
            pageTitle: 'Branch Attendance & Field GPS Logs',
            breadcrumbs: [{ label: 'Operations' }, { label: 'Attendance' }]
        });
    }

    // -------------------------------------------------------------
    // BRANCH QUOTATIONS (PLACEHOLDER FOR PHASE 2)
    // -------------------------------------------------------------
    static async getQuotations(req, res) {
        const quotations = DataStore.getAllQuotations();
        res.render('private/admin/quotations', {
            title: `Branch Quotation Requests | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            quotations,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-quotations',
            pageTitle: 'Quotation Requests & Proposals',
            breadcrumbs: [{ label: 'Operations' }, { label: 'Quotations' }]
        });
    }

    // -------------------------------------------------------------
    // BRANCH PROJECTS (PLACEHOLDER FOR PHASE 3)
    // -------------------------------------------------------------
    static async getProjects(req, res) {
        const mod = {
            title: 'Branch Solar Project Management',
            pageTitle: 'Branch Projects & Commissioning',
            desc: 'Turnkey solar rooftop installation milestones, DISCOM net-meter applications, and PM Surya Ghar subsidy tracking for your branch team will be enabled in Phase 3.',
            phase: 'Phase 3 Architecture',
            icon: 'icofont-solar-panel',
            activePage: 'manager-projects',
            plannedFeatures: [
                'Assign solar engineers to local customer sites in Raisen',
                'Upload site survey measurements and shadow analysis',
                'Track MPPKVVCL DISCOM bi-directional net meter installation',
                'Verify subsidy application status for branch clients'
            ]
        };

        res.render('private/admin/placeholder', {
            title: `${mod.title} | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            module: mod,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'manager-projects',
            pageTitle: mod.pageTitle,
            breadcrumbs: [{ label: 'Operations' }, { label: 'Projects' }]
        });
    }

    // -------------------------------------------------------------
    // BRANCH INVOICES
    // -------------------------------------------------------------
    static async getInvoices(req, res) {
        let invoices = [];
        let projects = [];
        let quotations = [];
        const sessionUser = req.session.user;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const Invoice = require('../models/Invoice');
                const Project = require('../models/Project');
                const Quotation = require('../models/Quotation');
                
                // Strict Branch Isolation: Managers only view records within their branch jurisdiction
                const branchQuery = sessionUser.branchId ? { branch: sessionUser.branchId } : { createdByUser: sessionUser._id };
                invoices = await Invoice.find({ isArchived: { $ne: true }, ...branchQuery }).sort({ createdAt: -1 }).lean();
                
                const projectFilter = { status: { $ne: 'CANCELLED' } };
                if (sessionUser.branchId) {
                    projectFilter.$or = [{ branch: sessionUser.branchId }, { assignedManager: sessionUser._id }];
                } else {
                    projectFilter.assignedManager = sessionUser._id;
                }
                projects = await Project.find(projectFilter).populate('customer').lean();
                
                quotations = await Quotation.find({ 
                    isArchived: { $ne: true }, 
                    status: { $in: ['CUSTOMER_ACCEPTED', 'APPROVED'] },
                    ...branchQuery 
                }).populate('customerId').lean();
            } catch (e) {}
        }
        res.render('private/admin/invoices', {
            title: `Branch Invoices | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            invoices,
            projects,
            quotations,
            csrfToken: req.session ? req.session.csrfToken : '',
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'invoices',
            pageTitle: 'Branch Tax Invoices & Billing',
            breadcrumbs: [{ label: 'Billing' }, { label: 'Invoices' }]
        });
    }

    // -------------------------------------------------------------
    // MANAGER PROFILE
    // -------------------------------------------------------------
    static async getProfile(req, res) {
        const sessionUser = req.session.user;
        const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;

        res.render('private/admin/profile', {
            title: `Manager Profile | ${companyData.company.name}`,
            data: companyData,
            company: companyData.company,
            profileUser: freshUser,
            user: sessionUser,
            currentUser: sessionUser,
            activePage: 'manager-profile',
            pageTitle: 'Manager Profile & Security',
            breadcrumbs: [{ label: 'Account' }, { label: 'My Profile' }]
        });
    }
}

module.exports = ManagerController;
