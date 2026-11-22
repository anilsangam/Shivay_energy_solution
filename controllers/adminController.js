const data = require('../config/company');
const DataStore = require('../services/dataStore');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Setting = require('../models/Setting');
const AuditService = require('../services/auditService');
const WebsiteService = require('../services/websiteService');
const AuthorizationService = require('../services/authorizationService');
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
    MODULES,
    PERMISSIONS,
    SENSITIVE_FIELDS,
    ROLE_MIGRATION_BASELINES,
    getFullPermissionTree,
    isValidPermission,
    isValidFieldPermission,
    filterValidPermissions,
    filterValidFieldPermissions
} = require('../config/permissionRegistry');

// 1. SUPER ADMIN DASHBOARD
exports.getDashboard = async (req, res) => {
    try {
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await DataStore.syncAttendanceFromDb().catch(() => {});
        }
        const recentEnquiries = DataStore.getAllEnquiries();
        const todayAttendance = DataStore.getTodayAttendance();

        let users = [];
        let counts = { totalUsers: 0, employeeCount: 0, managerCount: 0, activeCount: 0, inactiveCount: 0 };
        let recentActivities = [];
        let projectStats = { total: 0, active: 0, completed: 0, onHold: 0, totalKw: 0 };
        let recentProjects = [];
        let quotationStats = { total: 0, pending: 0, approved: 0, accepted: 0 };
        let recentQuotations = [];
        let liveInquiries = [];

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const Project = require('../models/Project');
            const Quotation = require('../models/Quotation');
            const QuotationRequest = require('../models/QuotationRequest');

            const [
                fetchedUsers,
                fetchedActivities,
                fetchedRecentProjects,
                fetchedRecentQuotes,
                mongoRequests,
                projStatsAgg,
                quoteStatsAgg
            ] = await Promise.all([
                DataStore.getUsers().catch(() => []),
                AuditService.getRecentLogs(10).catch(() => []),
                Project.find({})
                    .select('projectNumber status priority customer customerContact siteAddress city capacityKw progressPercentage updatedAt createdAt')
                    .populate('customer', 'name mobile city')
                    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
                    .limit(5)
                    .lean()
                    .catch(pErr => {
                        console.error('Project stats error in admin dashboard:', pErr);
                        return [];
                    }),
                Quotation.find({})
                    .select('quotationNumber status preparedBy customer customerId customerName customerMobile systemCapacityKw pricing createdAt')
                    .populate('customerId', 'name mobile city')
                    .populate('preparedBy', 'name employeeId')
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(5)
                    .lean()
                    .catch(qErr => {
                        console.error('Quotation stats error in admin dashboard:', qErr);
                        return [];
                    }),
                QuotationRequest.find({})
                    .select('requestNumber customer customerName customerMobile proposedCapacityKw city status createdAt')
                    .populate('customer', 'name mobile city district')
                    .populate('assignedEmployee', 'name employeeId')
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(6)
                    .lean()
                    .catch(reqErr => {
                        console.error('QuotationRequest inquiry error in admin dashboard:', reqErr);
                        return [];
                    }),
                Project.aggregate([
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                            onHold: { $sum: { $cond: [{ $eq: ['$status', 'ON_HOLD'] }, 1, 0] } },
                            active: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $ne: ['$status', 'COMPLETED'] },
                                                { $ne: ['$status', 'ON_HOLD'] },
                                                { $ne: ['$status', 'CANCELLED'] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },
                            totalKw: {
                                $sum: {
                                    $cond: [
                                        { $ne: ['$status', 'CANCELLED'] },
                                        { $ifNull: ['$capacityKw', 0] },
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ]).catch(pAggErr => {
                    console.error('Project stats aggregation error in admin dashboard:', pAggErr);
                    return [];
                }),
                Quotation.aggregate([
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_APPROVAL'] }, 1, 0] } },
                            approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
                            accepted: { $sum: { $cond: [{ $eq: ['$status', 'CUSTOMER_ACCEPTED'] }, 1, 0] } }
                        }
                    }
                ]).catch(qAggErr => {
                    console.error('Quotation stats aggregation error in admin dashboard:', qAggErr);
                    return [];
                })
            ]);

            users = fetchedUsers;
            counts = await DataStore.getRealCounts(users);
            recentActivities = fetchedActivities;
            recentProjects = fetchedRecentProjects || [];
            recentQuotations = fetchedRecentQuotes || [];

            if (projStatsAgg && projStatsAgg[0]) {
                const pa = projStatsAgg[0];
                projectStats.total = pa.total || 0;
                projectStats.completed = pa.completed || 0;
                projectStats.onHold = pa.onHold || 0;
                projectStats.active = pa.active || 0;
                projectStats.totalKw = Math.round((pa.totalKw || 0) * 10) / 10;
            }

            if (quoteStatsAgg && quoteStatsAgg[0]) {
                const qa = quoteStatsAgg[0];
                quotationStats.total = qa.total || 0;
                quotationStats.pending = qa.pending || 0;
                quotationStats.approved = qa.approved || 0;
                quotationStats.accepted = qa.accepted || 0;
            }

            if (mongoRequests && mongoRequests.length > 0) {
                liveInquiries = mongoRequests.map(r => ({
                    id: r.requestNumber || 'REQ',
                    name: (r.customer && r.customer.name) || r.customerName || 'Direct Customer',
                    mobile: (r.customer && r.customer.mobile) || r.customerMobile || 'N/A',
                    requirement: `${r.proposedCapacityKw || 3} kW Solar Rooftop`,
                    district: (r.customer && r.customer.city) || r.city || 'Raisen (M.P.)',
                    status: r.status || 'SUBMITTED',
                    createdAt: r.createdAt,
                    rawId: r._id
                }));
            }
        } else {
            users = await DataStore.getUsers();
            counts = await DataStore.getRealCounts(users);
            recentActivities = await AuditService.getRecentLogs(10);
        }

        if (liveInquiries.length === 0 && recentEnquiries && recentEnquiries.length > 0) {
            liveInquiries = recentEnquiries.slice(0, 6);
        }

        res.render('private/admin/dashboard', {
            title: `Admin Management Dashboard | ${data.company.name}`,
            data,
            company: data.company,
            stats: {
                totalEmployees: counts.employeeCount,
                totalManagers: counts.managerCount,
                activeUsers: counts.activeCount,
                inactiveUsers: counts.inactiveCount,
                totalUsers: counts.totalUsers,
                totalEnquiries: liveInquiries.length,
                todayAttendance: todayAttendance.length,
                projects: projectStats,
                quotations: quotationStats
            },
            users,
            recentProjects,
            recentQuotations,
            recentEnquiries: liveInquiries,
            todayAttendance,
            recentActivities,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin',
            pageTitle: 'Dashboard Overview',
            breadcrumbs: [{ label: 'Executive Dashboard' }]
        });
    } catch (err) {
        console.error('Super Admin Dashboard Error:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error rendering Admin Dashboard.'
        });
    }
};

// 2. QUOTATIONS MODULE
exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('private/admin/quotations', {
        title: `Quotation Management | ${data.company.name}`,
        data,
        company: data.company,
        quotations,
        user: req.session.user,
        currentUser: req.session.user,
        activePage: 'quotations',
        pageTitle: 'Solar Quotation Generator',
        breadcrumbs: [{ label: 'Quotations', url: '/admin/quotations' }]
    });
};

// 3. INVOICES MODULE
// Helper to self-heal existing managers with legacy SES-EMP IDs or assigned managers (deprecated: run explicitly via scripts/self_heal_managers.js)
const selfHealManagers = async () => {
    console.warn('[DEPRECATION] selfHealManagers is deprecated and has been moved to scripts/self_heal_managers.js. It will not run automatically.');
};
exports.selfHealManagers = selfHealManagers;

exports.getInvoices = async (req, res) => {
    try {
        let invoices = [];
        let projects = [];
        let quotations = [];
        const sessionUser = req.session.user;

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const Invoice = require('../models/Invoice');
                const Project = require('../models/Project');
                const Quotation = require('../models/Quotation');

                let invFilter = { isArchived: { $ne: true } };
                let projFilter = { status: { $ne: 'CANCELLED' } };
                let quoteFilter = { status: { $in: ['CUSTOMER_ACCEPTED', 'APPROVED'] }, isArchived: { $ne: true } };

                // Scope dropdowns and invoices for Branch Managers to their own branch/team
                if (['MANAGER', 'BRANCH_MANAGER'].includes(sessionUser.role)) {
                    if (sessionUser.branchId) {
                        invFilter.$or = [{ branch: sessionUser.branchId }, { createdByUser: sessionUser._id }];
                        projFilter.$or = [{ branch: sessionUser.branchId }, { assignedManager: sessionUser._id }];
                        quoteFilter.$or = [{ branch: sessionUser.branchId }, { preparedBy: sessionUser._id }];
                    } else {
                        invFilter.createdByUser = sessionUser._id;
                        projFilter.assignedManager = sessionUser._id;
                        quoteFilter.preparedBy = sessionUser._id;
                    }
                }

                const [invoicesData, projectsData, quotationsData] = await Promise.all([
                    Invoice.find(invFilter).sort({ createdAt: -1, _id: -1 }).lean(),
                    Project.find(projFilter)
                        .select('projectNumber capacityKw siteAddress city customer customerContact')
                        .populate('customer', 'name mobile city address consumerNumber gstin')
                        .lean(),
                    Quotation.find(quoteFilter)
                        .select('quotationNumber systemCapacityKw customerId customer customerName customerMobile customerAddress customerCity pricing')
                        .populate('customerId', 'name mobile city address consumerNumber gstin')
                        .lean()
                ]);
                invoices = invoicesData || [];
                projects = projectsData || [];
                quotations = quotationsData || [];
            } catch (dbErr) {
                console.error('Invoice DB fetch error:', dbErr);
            }
        }

        res.render('private/admin/invoices', {
            title: `Tax Invoices & Customer Billing | ${data.company.name}`,
            data,
            company: data.company,
            invoices,
            projects,
            quotations,
            csrfToken: req.session ? req.session.csrfToken : '',
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'invoices',
            pageTitle: 'Tax Invoices & Billing',
            breadcrumbs: [{ label: 'Invoices', url: '/admin/invoices' }]
        });
    } catch (err) {
        console.error('Error in getInvoices:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Unable to load invoice records.'
        });
    }
};

// 4. USER & EMPLOYEE MANAGEMENT
exports.getEmployees = async (req, res) => {
    try {
        const [users, branchList] = await Promise.all([
            DataStore.getUsers(),
            (mongoose.connection && mongoose.connection.readyState === 1)
                ? Branch.find({}).lean().catch(() => [])
                : Promise.resolve([])
        ]);
        let branches = (branchList && branchList.length > 0)
            ? branchList
            : [{ _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01' }];

        const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER');

        res.render('private/admin/employees', {
            title: `Staff & User Management | ${data.company.name}`,
            data,
            company: data.company,
            users,
            managers,
            branches,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-employees',
            pageTitle: 'Employee & Staff Management',
            breadcrumbs: [{ label: 'Team', url: '/admin/employees' }, { label: 'Employees' }]
        });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading staff database'
        });
    }
};

// 5. MANAGERS MANAGEMENT
exports.getManagers = async (req, res) => {
    try {
        const users = await DataStore.getUsers();
        const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER');
        const employees = users.filter(u => u.role === 'EMPLOYEE');

        // Annotate each manager with their assigned employees
        const annotatedManagers = managers.map(mgr => {
            const mId = mgr._id.toString();
            const assigned = employees.filter(e => {
                const empMgrId = (e.managerId && e.managerId._id) ? e.managerId._id.toString() : (e.managerId ? e.managerId.toString() : null);
                return empMgrId === mId;
            });
            const mgrObj = mgr.toObject ? mgr.toObject() : { ...mgr };
            mgrObj.assignedEmployees = assigned;
            mgrObj.assignedCount = assigned.length;
            return mgrObj;
        });

        res.render('private/admin/managers', {
            title: `Branch Managers | ${data.company.name}`,
            data,
            company: data.company,
            managers: annotatedManagers,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-managers',
            pageTitle: 'Branch Managers',
            breadcrumbs: [{ label: 'Team', url: '/admin/employees' }, { label: 'Managers' }]
        });
    } catch (err) {
        console.error('Error fetching managers:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading managers list.'
        });
    }
};

// 5.1 BRANCHES MANAGEMENT (SUPER ADMIN)
exports.getBranches = async (req, res) => {
    try {
        let branches = [];
        let allManagers = [];
        let totalEmployees = 0;
        let totalProjects = 0;

        if (mongoose.connection.readyState === 1) {
            try {
                const Project = require('../models/Project');
                const [dbBranches, dbManagers, empCountsAgg, prjCountsAgg] = await Promise.all([
                    Branch.find({})
                        .populate('manager', 'name employeeId mobile email role status')
                        .sort({ createdAt: -1, _id: -1 })
                        .lean(),
                    User.find({
                        role: { $in: ['BRANCH_MANAGER', 'MANAGER'] },
                        status: { $in: ['ACTIVE', 'PENDING'] }
                    }).select('name employeeId email mobile branchId').lean(),
                    User.aggregate([
                        { $match: { role: 'EMPLOYEE', branchId: { $ne: null } } },
                        { $group: { _id: '$branchId', count: { $sum: 1 } } }
                    ]).catch(err => {
                        console.error('[Branch Operations] User count aggregation error:', err);
                        return null; // Return null so failure is distinguished from empty count
                    }),
                    Project.aggregate([
                        { $match: { status: { $ne: 'CANCELLED' }, branch: { $ne: null } } },
                        { $group: { _id: '$branch', count: { $sum: 1 } } }
                    ]).catch(err => {
                        console.error('[Branch Operations] Project count aggregation error:', err);
                        return null; // Return null so failure is distinguished from empty count
                    })
                ]);

                branches = dbBranches || [];
                allManagers = dbManagers || [];

                const empAggregationFailed = empCountsAgg === null;
                const prjAggregationFailed = prjCountsAgg === null;
                if (empAggregationFailed || prjAggregationFailed) {
                    console.warn(`[Branch Operations] Aggregation degraded: empFailed=${empAggregationFailed}, prjFailed=${prjAggregationFailed}`);
                }

                const empCountMap = new Map((empCountsAgg || []).map(a => [String(a._id), a.count]));
                const prjCountMap = new Map((prjCountsAgg || []).map(a => [String(a._id), a.count]));

                for (const b of branches) {
                    const empCount = empAggregationFailed ? (b.employeeCount || 0) : (empCountMap.get(String(b._id)) || 0);
                    const prjCount = prjAggregationFailed ? (b.projectCount || 0) : (prjCountMap.get(String(b._id)) || 0);
                    b.employeeCount = empCount;
                    b.projectCount = prjCount;
                    totalEmployees += empCount;
                    totalProjects += prjCount;
                }
            } catch (dbErr) {
                console.error('Error fetching branches from DB:', dbErr);
            }
        }

        // In-memory fallback
        if (!branches || branches.length === 0) {
            branches = [
                {
                    _id: 'br-raisen-1',
                    name: 'Raisen Central Branch (HQ)',
                    code: 'MP-RSN-01',
                    contactNumber: '+91 70005 75496',
                    email: 'raisen@shivayenergy.com',
                    city: 'Raisen',
                    district: 'Raisen',
                    state: 'Madhya Pradesh',
                    address: 'Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen',
                    coordinates: { latitude: 23.3315, longitude: 77.7807 },
                    geofenceRadiusMeters: 500,
                    isActive: true,
                    manager: { name: 'Rahul Saini', employeeId: 'SES-MGR-01', mobile: '+91 93997 61750' },
                    employeeCount: 4,
                    projectCount: 6
                }
            ];
            totalEmployees = 4;
            totalProjects = 6;
        }

        res.render('private/admin/branches', {
            title: `Branches & Regional Offices | ${data.company.name}`,
            data,
            company: data.company,
            branches,
            managers: allManagers,
            stats: {
                totalBranches: branches.length,
                activeBranches: branches.filter(b => b.isActive !== false).length,
                totalEmployees,
                totalProjects
            },
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'admin-branches',
            pageTitle: 'Regional Branches & Offices',
            breadcrumbs: [{ label: 'Organization' }, { label: 'Branches' }]
        });
    } catch (err) {
        console.error('Error in getBranches:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Unable to load branch locations.'
        });
    }
};

// 5.2 API: CREATE BRANCH
exports.createBranch = async (req, res) => {
    try {
        const {
            name,
            code,
            contactNumber,
            email,
            address,
            city,
            district,
            state,
            latitude,
            longitude,
            geofenceRadiusMeters,
            managerId
        } = req.body;

        if (!name || !name.trim() || !contactNumber || !contactNumber.trim() || !address || !address.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Branch Name, Contact Number, and Office Address are required.'
            });
        }

        const cleanCity = city ? city.trim() : 'Raisen';
        const cleanDistrict = district ? district.trim() : cleanCity;
        const cleanState = state ? state.trim() : 'Madhya Pradesh';

        // Auto-generate unique Branch Code if blank
        let cleanCode = code ? code.trim().toUpperCase() : '';
        if (!cleanCode) {
            const cityPrefix = cleanCity.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'BRN';
            const randomNum = Math.floor(10 + Math.random() * 90);
            cleanCode = `MP-${cityPrefix}-${randomNum}`;
        }

        // Verify Branch Code uniqueness
        if (mongoose.connection.readyState === 1) {
            const existingCode = await Branch.findOne({ code: cleanCode });
            if (existingCode) {
                return res.status(400).json({
                    success: false,
                    message: `Branch code '${cleanCode}' is already in use. Please specify a unique code.`
                });
            }
        }

        // Validate Manager assignment (if selected)
        let validatedManagerId = null;
        if (managerId && mongoose.isValidObjectId(managerId)) {
            // Check if manager is already assigned to another branch
            if (mongoose.connection.readyState === 1) {
                const existingBranchManager = await Branch.findOne({ manager: managerId, isActive: true });
                if (existingBranchManager) {
                    return res.status(400).json({
                        success: false,
                        message: `This manager is already leading another branch (${existingBranchManager.name}). Each branch can only have one Branch Manager.`
                    });
                }
            }
            validatedManagerId = managerId;
        }

        let newBranch = null;
        if (mongoose.connection.readyState === 1) {
            newBranch = await Branch.create({
                name: name.trim(),
                code: cleanCode,
                manager: validatedManagerId,
                contactNumber: contactNumber.trim(),
                email: email ? email.trim().toLowerCase() : '',
                address: address.trim(),
                city: cleanCity,
                district: cleanDistrict,
                state: cleanState,
                coordinates: {
                    latitude: parseFloat(latitude) || 23.3315,
                    longitude: parseFloat(longitude) || 77.7807
                },
                geofenceRadiusMeters: parseInt(geofenceRadiusMeters, 10) || 500,
                isActive: true
            });

            // If a manager was assigned, update manager's branchId
            if (validatedManagerId) {
                await User.findByIdAndUpdate(validatedManagerId, { branchId: newBranch._id });
            }
        } else {
            newBranch = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                code: cleanCode,
                manager: validatedManagerId,
                contactNumber: contactNumber.trim(),
                email: email || '',
                address: address.trim(),
                city: cleanCity,
                district: cleanDistrict,
                state: cleanState,
                coordinates: { latitude: parseFloat(latitude) || 23.3315, longitude: parseFloat(longitude) || 77.7807 },
                geofenceRadiusMeters: parseInt(geofenceRadiusMeters, 10) || 500,
                isActive: true,
                createdAt: new Date()
            };
        }

        AuditService.log({
            action: 'BRANCH_CREATED',
            user: req.session.user._id,
            role: req.session.user.role,
            ipAddress: req.ip,
            details: { branchName: newBranch.name, branchCode: cleanCode, city: cleanCity }
        });

        return res.json({
            success: true,
            branch: newBranch,
            message: `Branch '${newBranch.name}' (${cleanCode}) created successfully.`
        });
    } catch (err) {
        console.error('Error creating branch:', err);
        return res.status(500).json({ success: false, message: err.message || 'Server error creating branch.' });
    }
};

// 5.3 API: UPDATE BRANCH
exports.updateBranch = async (req, res) => {
    try {
        const {
            branchId,
            name,
            contactNumber,
            email,
            address,
            city,
            district,
            state,
            latitude,
            longitude,
            geofenceRadiusMeters,
            managerId,
            isActive
        } = req.body;

        if (!branchId || !mongoose.isValidObjectId(branchId)) {
            return res.status(400).json({ success: false, message: 'Valid Branch ID is required.' });
        }

        if (mongoose.connection.readyState === 1) {
            const branch = await Branch.findById(branchId);
            if (!branch) {
                return res.status(404).json({ success: false, message: 'Branch not found.' });
            }

            if (name) branch.name = name.trim();
            if (contactNumber) branch.contactNumber = contactNumber.trim();
            if (email !== undefined) branch.email = email.trim().toLowerCase();
            if (address) branch.address = address.trim();
            if (city) branch.city = city.trim();
            if (district) branch.district = district.trim();
            if (state) branch.state = state.trim();
            if (latitude) branch.coordinates.latitude = parseFloat(latitude);
            if (longitude) branch.coordinates.longitude = parseFloat(longitude);
            if (geofenceRadiusMeters) branch.geofenceRadiusMeters = parseInt(geofenceRadiusMeters, 10);
            if (isActive !== undefined) branch.isActive = Boolean(isActive);

            if (managerId && mongoose.isValidObjectId(managerId)) {
                // Verify manager not leading another branch
                const otherBranch = await Branch.findOne({ manager: managerId, _id: { $ne: branch._id }, isActive: true });
                if (otherBranch) {
                    return res.status(400).json({
                        success: false,
                        message: `Manager already assigned to ${otherBranch.name}. A manager can lead only one branch.`
                    });
                }
                branch.manager = managerId;
                await User.findByIdAndUpdate(managerId, { branchId: branch._id });
            } else if (managerId === '' || managerId === null) {
                branch.manager = null;
            }

            await branch.save();

            AuditService.log({
                action: 'BRANCH_UPDATED',
                user: req.session.user._id,
                role: req.session.user.role,
                ipAddress: req.ip,
                details: { branchId, branchName: branch.name }
            });

            return res.json({
                success: true,
                message: `Branch '${branch.name}' updated successfully.`
            });
        }

        return res.json({ success: true, message: 'Branch updated successfully.' });
    } catch (err) {
        console.error('Error updating branch:', err);
        return res.status(500).json({ success: false, message: err.message || 'Server error updating branch.' });
    }
};

// 5.4 API: TOGGLE BRANCH ACTIVE STATUS
exports.toggleBranchStatus = async (req, res) => {
    try {
        const { branchId, isActive } = req.body;
        if (!branchId || !mongoose.isValidObjectId(branchId)) {
            return res.status(400).json({ success: false, message: 'Valid Branch ID is required.' });
        }

        if (mongoose.connection.readyState === 1) {
            const branch = await Branch.findById(branchId);
            if (!branch) {
                return res.status(404).json({ success: false, message: 'Branch not found.' });
            }

            branch.isActive = Boolean(isActive);
            await branch.save();

            return res.json({
                success: true,
                message: `Branch '${branch.name}' status changed to ${branch.isActive ? 'Active' : 'Inactive'}.`
            });
        }

        return res.json({ success: true, message: 'Branch status updated.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 8.1 SETTINGS VIEW (SUPER ADMIN)
exports.getSettings = async (req, res) => {
    try {
        let setting = null;
        if (mongoose.connection.readyState === 1) {
            try {
                setting = await Setting.findOne({}).lean();
            } catch (dbErr) {
                console.error('Error fetching settings:', dbErr);
            }
        }

        if (!setting && DataStore.getSettings) {
            setting = DataStore.getSettings();
        }

        // Fallback default from companyData
        if (!setting) {
            setting = {
                companyName: data.company.name || "SHIVAY ENERGY SOLUTIONS",
                shortName: data.company.shortName || "Shivay Energy",
                tagline: data.company.tagline || "Save Green Energy To Build A Better Future",
                gstin: data.company.gstin || "23AXXXX0000X1Z5",
                officialEmail: data.company.email || "shivayenergysolutions@gmail.com",
                primaryPhone: (data.company.contact && data.company.contact.phone) || "+91 70005 75496",
                alternatePhone: (data.company.contact && data.company.contact.alternatePhone) || "+91 93997 61750",
                whatsappNumber: (data.company.contact && data.company.contact.whatsapp) || "+91 70005 75496",
                website: data.company.website || "https://shivayenergysolutions.com",
                addressLine: (data.company.address && data.company.address.line1) || "Ward No. 15, In front of PHE Office, Arjun Nagar",
                city: (data.company.address && data.company.address.city) || "Raisen",
                district: (data.company.address && data.company.address.district) || "Raisen",
                state: (data.company.address && data.company.address.state) || "Madhya Pradesh",
                pincode: (data.company.address && data.company.address.pincode) || "464551",

                defaultRatePerKw: 58000,
                subsidy1Kw: 30000,
                subsidy2Kw: 60000,
                subsidy3KwMax: 78000,
                defaultGstPercent: 13.8,

                hqLatitude: 23.3315,
                hqLongitude: 77.7807,
                defaultGeofenceRadiusMeters: 500,
                enforceGeofence: true,

                maxFailedLoginAttempts: 5,
                lockoutDurationMinutes: 15,
                sessionTimeoutHours: 24,

                primaryDiscom: "MPPKVVCL (Madhya Kshetra)",
                discomPortalUrl: "https://portal.mpcz.in/",
                discomHelpline: "1912",
                privacyPolicy: "",
                termsAndConditions: ""
            };
        }

        if (!setting.privacyPolicy) {
            setting.privacyPolicy = WebsiteService.getDefaultPrivacyPolicy(data.company);
        }
        if (!setting.termsAndConditions) {
            setting.termsAndConditions = WebsiteService.getDefaultTermsConditions(data.company);
        }

        res.render('private/admin/settings', {
            title: `System & Business Settings | ${data.company.name}`,
            data,
            company: data.company,
            setting,
            defaultPrivacyPolicy: WebsiteService.getDefaultPrivacyPolicy(data.company),
            defaultTermsConditions: WebsiteService.getDefaultTermsConditions(data.company),
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'admin-settings',
            pageTitle: 'Company & System Settings',
            breadcrumbs: [{ label: 'Settings' }, { label: 'System Configuration' }]
        });
    } catch (err) {
        console.error('Error in getSettings:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Unable to load system configuration.'
        });
    }
};

// 8.2 API: SAVE SYSTEM SETTINGS
exports.saveSettings = async (req, res) => {
    try {
        const body = req.body;
        const updateData = {
            companyName: body.companyName ? body.companyName.trim() : "SHIVAY ENERGY SOLUTIONS",
            shortName: body.shortName ? body.shortName.trim() : "Shivay Energy",
            tagline: body.tagline ? body.tagline.trim() : "",
            gstin: body.gstin ? body.gstin.trim().toUpperCase() : "",
            officialEmail: body.officialEmail ? body.officialEmail.trim().toLowerCase() : "",
            primaryPhone: body.primaryPhone ? body.primaryPhone.trim() : "",
            alternatePhone: body.alternatePhone ? body.alternatePhone.trim() : "",
            whatsappNumber: body.whatsappNumber ? body.whatsappNumber.trim() : "",
            website: body.website ? body.website.trim() : "",
            addressLine: body.addressLine ? body.addressLine.trim() : "",
            city: body.city ? body.city.trim() : "Raisen",
            district: body.district ? body.district.trim() : "Raisen",
            state: body.state ? body.state.trim() : "Madhya Pradesh",
            pincode: body.pincode ? body.pincode.trim() : "464551",

            defaultRatePerKw: parseFloat(body.defaultRatePerKw) || 58000,
            subsidy1Kw: parseFloat(body.subsidy1Kw) || 30000,
            subsidy2Kw: parseFloat(body.subsidy2Kw) || 60000,
            subsidy3KwMax: parseFloat(body.subsidy3KwMax) || 78000,
            defaultGstPercent: parseFloat(body.defaultGstPercent) || 13.8,

            hqLatitude: parseFloat(body.hqLatitude) || 23.3315,
            hqLongitude: parseFloat(body.hqLongitude) || 77.7807,
            defaultGeofenceRadiusMeters: parseInt(body.defaultGeofenceRadiusMeters, 10) || 500,
            enforceGeofence: body.enforceGeofence === 'true' || body.enforceGeofence === true,

            maxFailedLoginAttempts: parseInt(body.maxFailedLoginAttempts, 10) || 5,
            lockoutDurationMinutes: parseInt(body.lockoutDurationMinutes, 10) || 15,
            sessionTimeoutHours: parseInt(body.sessionTimeoutHours, 10) || 24,

            primaryDiscom: body.primaryDiscom ? body.primaryDiscom.trim() : "MPPKVVCL (Madhya Kshetra)",
            discomPortalUrl: body.discomPortalUrl ? body.discomPortalUrl.trim() : "https://portal.mpcz.in/",
            discomHelpline: body.discomHelpline ? body.discomHelpline.trim() : "1912"
        };

        if (typeof body.privacyPolicy !== 'undefined') {
            updateData.privacyPolicy = body.privacyPolicy;
            updateData.privacyPolicyUpdatedAt = new Date();
        }
        if (typeof body.termsAndConditions !== 'undefined') {
            updateData.termsAndConditions = body.termsAndConditions;
            updateData.termsAndConditionsUpdatedAt = new Date();
        }

        if (mongoose.connection.readyState === 1) {
            await Setting.findOneAndUpdate({}, updateData, { upsert: true, new: true });
        }
        if (DataStore.saveSettings) {
            DataStore.saveSettings(updateData);
        }

        // Refresh WebsiteService cache
        if (WebsiteService && WebsiteService.refreshCompanyCache) {
            await WebsiteService.refreshCompanyCache();
        }

        // Synchronize in-memory company configuration so headers and invoices reflect it
        if (data.company) {
            if (updateData.companyName) data.company.name = updateData.companyName;
            if (updateData.shortName) data.company.shortName = updateData.shortName;
            if (updateData.gstin) data.company.gstin = updateData.gstin;
            if (updateData.officialEmail) data.company.email = updateData.officialEmail;
            if (updateData.primaryPhone && data.company.contact) data.company.contact.phone = updateData.primaryPhone;
            if (updateData.whatsappNumber && data.company.contact) data.company.contact.whatsapp = updateData.whatsappNumber;
        }

        AuditService.log({
            action: 'SETTINGS_UPDATED',
            user: req.session.user._id,
            role: req.session.user.role,
            ipAddress: req.ip,
            details: { updatedBy: req.session.user.name }
        });

        return res.json({
            success: true,
            message: 'Company and system settings saved successfully.'
        });
    } catch (err) {
        console.error('Error saving settings:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error saving settings.' });
    }
};

// 6. SYSTEM ACTIVITY & AUDIT LOGS
exports.getActivityLogs = async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const logs = await AuditService.getRecentLogs(100);
        res.render('private/admin/activity-logs', {
            title: `System Activity Logs | ${data.company.name}`,
            data,
            company: data.company,
            logs,
            search,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-logs',
            pageTitle: 'System Audit & Activity Logs',
            breadcrumbs: [{ label: 'Security' }, { label: 'Activity Logs' }]
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading audit logs.'
        });
    }
};

// 7. USER PROFILE
exports.getProfile = async (req, res) => {
    try {
        const sessionUser = req.session.user;
        const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;

        res.render('private/admin/profile', {
            title: `My Profile | ${data.company.name}`,
            data,
            company: data.company,
            profileUser: freshUser,
            user: sessionUser,
            currentUser: sessionUser,
            activePage: sessionUser.role === 'SUPER_ADMIN' ? 'admin-profile' : (sessionUser.role === 'EMPLOYEE' ? 'employee-profile' : 'manager-profile'),
            pageTitle: 'User Profile & Account Security',
            breadcrumbs: [{ label: 'Account' }, { label: 'My Profile' }]
        });
    } catch (err) {
        console.error('Error loading profile:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading user profile.'
        });
    }
};

// 7.1 EXECUTIVE SOLAR EPC REPORTS & ANALYTICS
exports.getReports = async (req, res) => {
    try {
        const users = await DataStore.getUsers();
        let branches = [];
        let projects = [];
        let quotations = [];
        let invoices = [];

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const Project = require('../models/Project');
                const Quotation = require('../models/Quotation');
                const Invoice = require('../models/Invoice');

                const [dbBranches, dbProjects, qCount, dbInvoices] = await Promise.all([
                    Branch.find({}).select('name code city state isActive').lean(),
                    Project.find({})
                        .select('_id projectId projectNumber title customer assignedEngineer capacityKw systemType status branch branchId createdAt')
                        .populate('customer', 'name mobile city')
                        .populate('assignedEngineer', 'name employeeId')
                        .sort({ createdAt: -1 })
                        .lean(),
                    Quotation.countDocuments({ isArchived: { $ne: true } }),
                    Invoice.find({})
                        .select('status totalAmount total isArchived paymentStatus')
                        .lean()
                ]);

                branches = dbBranches || [];
                projects = dbProjects || [];
                quotations = { length: qCount || 0 };
                invoices = dbInvoices || [];
            } catch (e) {
                console.error('Error fetching analytics data in getReports:', e);
            }
        }

        // Fallback default branch if none exists
        if (!branches || branches.length === 0) {
            branches = [{ _id: 'br-raisen-1', name: 'Raisen Central Branch', code: 'MP-RSN-01', city: 'Raisen', state: 'Madhya Pradesh', isActive: true }];
        }

        let totalCapacityKw = 0;
        let commissionedCapacityKw = 0;
        let totalInvoicedValue = 0;
        let totalSubsidyDisbursed = 0;
        let residentialKw = 0;
        let commercialKw = 0;
        let agriculturalKw = 0;

        projects.forEach(p => {
            const cap = Number(p.capacityKw) || 0;
            if (p.status !== 'CANCELLED') {
                totalCapacityKw += cap;
                if (p.status === 'COMPLETED') {
                    commissionedCapacityKw += cap;
                    if (cap <= 1) totalSubsidyDisbursed += 30000;
                    else if (cap <= 2) totalSubsidyDisbursed += 60000;
                    else totalSubsidyDisbursed += 78000;
                }
            }
            const sys = (p.systemType || '').toUpperCase();
            if (sys.includes('COMMERCIAL') || cap > 10) commercialKw += cap;
            else if (sys.includes('PUMP') || sys.includes('AGRICULTURAL')) agriculturalKw += cap;
            else residentialKw += cap;
        });

        invoices.forEach(inv => {
            if (inv.status !== 'ARCHIVED' && inv.status !== 'CANCELLED') {
                totalInvoicedValue += (Number(inv.totalAmount) || Number(inv.total) || 0);
            }
        });

        // Branch-wise stats
        const branchStats = branches.map(b => {
            const bIdStr = b._id ? b._id.toString() : '';
            const branchStaff = users.filter(u => {
                const uBId = (u.branchId && u.branchId._id) ? u.branchId._id.toString() : (u.branchId ? u.branchId.toString() : '');
                return uBId === bIdStr;
            });
            const branchMgr = branchStaff.find(u => u.role === 'MANAGER' || u.role === 'BRANCH_MANAGER');
            const bProjects = projects.filter(p => {
                const pBId = (p.branchId && p.branchId._id) ? p.branchId._id.toString() : (p.branchId ? p.branchId.toString() : '');
                return pBId === bIdStr || !p.branchId;
            });
            const bKw = bProjects.reduce((sum, p) => sum + (Number(p.capacityKw) || 0), 0);
            const bCompleted = bProjects.filter(p => p.status === 'COMPLETED').length;

            return {
                _id: b._id,
                name: b.name,
                code: b.code,
                city: b.city || 'Raisen',
                state: b.state || 'Madhya Pradesh',
                isActive: b.isActive !== false,
                managerName: branchMgr ? branchMgr.name : 'Unassigned',
                staffCount: branchStaff.length,
                projectCount: bProjects.length,
                completedCount: bCompleted,
                totalKw: bKw
            };
        });

        res.render('private/admin/reports', {
            title: `Executive Solar Analytics & Reports | ${data.company.name}`,
            data,
            company: data.company,
            stats: {
                totalCapacityKw: totalCapacityKw.toFixed(1),
                commissionedCapacityKw: commissionedCapacityKw.toFixed(1),
                totalProjects: projects.length,
                completedProjects: projects.filter(p => p.status === 'COMPLETED').length,
                activeProjects: projects.filter(p => p.status !== 'COMPLETED' && p.status !== 'CANCELLED').length,
                totalInvoicedValue: totalInvoicedValue.toLocaleString('en-IN'),
                totalSubsidyDisbursed: totalSubsidyDisbursed.toLocaleString('en-IN'),
                totalQuotations: quotations.length,
                residentialKw: residentialKw.toFixed(1),
                commercialKw: commercialKw.toFixed(1),
                agriculturalKw: agriculturalKw.toFixed(1)
            },
            branchStats,
            recentProjects: projects.slice(0, 15),
            user: req.session.user,
            currentUser: req.session.user,
            activePage: 'admin-reports',
            pageTitle: 'Solar EPC Business Intelligence & Reports',
            breadcrumbs: [
                { label: 'Executive Dashboard', url: '/admin' },
                { label: 'Business Reports & Analytics' }
            ]
        });
    } catch (err) {
        console.error('Admin Reports Error:', err);
        res.status(500).render('private/errors/403', {
            title: 'Reports Error | Shivay Energy Solutions',
            message: 'Unable to compile business analytics and installation reports.'
        });
    }
};

// 7.2 DIRECT CSV EXPORT FOR REPORTS
exports.exportReportCsv = async (req, res) => {
    try {
        const { type } = req.params;
        let filename = `solar_report_${type}_${Date.now()}.csv`;
        let csvContent = '';

        const hasPii = AuthorizationService.hasFieldAccess(req.session ? req.session.user : null, 'fields.customer.pii.view');
        const maskPhone = (phoneStr) => {
            if (!phoneStr || phoneStr === 'N/A') return 'N/A';
            if (hasPii) return phoneStr;
            const clean = String(phoneStr).replace(/[^0-9]/g, '');
            if (clean.length >= 10) {
                return 'XXXXXX' + clean.slice(-4);
            }
            return 'XXXXXX';
        };

        if (type === 'projects') {
            let list = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const Project = require('../models/Project');
                list = await Project.find({})
                    .select('_id projectId customer capacityKw systemType status createdAt')
                    .populate('customer', 'name mobile city')
                    .lean();
            }
            csvContent = 'Project ID,Customer Name,Customer Mobile,City,Capacity (kW),System Type,Status,Created At\n';
            list.forEach(p => {
                const cName = (p.customer && p.customer.name) ? `"${p.customer.name.replace(/"/g, '""')}"` : 'N/A';
                const cMob = (p.customer && p.customer.mobile) ? maskPhone(p.customer.mobile) : 'N/A';
                const cCity = (p.customer && p.customer.city) ? p.customer.city : 'Raisen';
                csvContent += `${p.projectId || p._id},${cName},${cMob},${cCity},${p.capacityKw || 0},${p.systemType || 'On-Grid'},${p.status || 'NEW'},${p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : ''}\n`;
            });
        } else if (type === 'invoices') {
            let list = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const Invoice = require('../models/Invoice');
                list = await Invoice.find({})
                    .select('_id invoiceNumber clientName customerName clientMobile customerMobile subtotal amount gstAmount totalAmount total status paymentStatus date invoiceDate')
                    .lean();
            } else {
                list = DataStore.getAllInvoices(true);
            }
            csvContent = 'Invoice Number,Client Name,Client Mobile,Taxable Amount,GST Amount,Total Amount,Status,Issue Date\n';
            list.forEach(i => {
                const clientName = (i.clientName || i.customerName) ? `"${(i.clientName || i.customerName).replace(/"/g, '""')}"` : 'N/A';
                csvContent += `${i.invoiceNumber || i._id},${clientName},${maskPhone(i.clientMobile || i.customerMobile || 'N/A')},${i.subtotal || i.amount || 0},${i.gstAmount || 0},${i.totalAmount || i.total || 0},${i.status || i.paymentStatus || 'PAID'},${i.date || i.invoiceDate || ''}\n`;
            });
        } else if (type === 'quotations') {
            let list = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const Quotation = require('../models/Quotation');
                list = await Quotation.find({})
                    .select('_id quotationNumber customerName customerMobile systemCapacityKw finalPrice subsidyAmount status createdAt')
                    .lean();
            }
            csvContent = 'Quotation Number,Customer Name,Mobile,System Capacity (kW),Final Price,Subsidy Amount,Status,Created At\n';
            list.forEach(q => {
                const name = q.customerName ? `"${q.customerName.replace(/"/g, '""')}"` : 'N/A';
                csvContent += `${q.quotationNumber || q._id},${name},${maskPhone(q.customerMobile || 'N/A')},${q.systemCapacityKw || 0},${q.finalPrice || 0},${q.subsidyAmount || 0},${q.status || 'PENDING'},${q.createdAt ? new Date(q.createdAt).toISOString().split('T')[0] : ''}\n`;
            });
        } else {
            return res.status(400).send('Invalid export type requested');
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
    } catch (err) {
        console.error('Export CSV Error:', err);
        return res.status(500).send('Error generating CSV export.');
    }
};

// 7.3 SERVICE & COMPLAINTS MANAGEMENT (SUPER ADMIN & MANAGERS)
exports.getComplaints = async (req, res) => {
    try {
        const Complaint = require('../models/Complaint');
        let dbComplaints = [];
        const statusFilter = req.query.status || '';
        const search = (req.query.search || '').trim().toLowerCase();

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                let query = {};
                if (statusFilter) query.status = statusFilter;
                dbComplaints = await Complaint.find(query).populate('assignedEngineer', 'name employeeId mobile').sort({ createdAt: -1, _id: -1 }).lean();
            } catch (dbErr) {
                console.error('Error fetching complaints from DB:', dbErr);
            }
        }

        // Merge with DataStore complaints (so submitted tickets are never lost)
        const memComplaints = DataStore.getAllComplaints ? DataStore.getAllComplaints() : [];
        const seenTicketIds = new Set(dbComplaints.map(c => (c.ticketId || '').toUpperCase()));
        let complaints = [...dbComplaints];
        memComplaints.forEach(mc => {
            if (mc && mc.ticketId && !seenTicketIds.has(mc.ticketId.toUpperCase())) {
                if (!statusFilter || mc.status === statusFilter) {
                    complaints.push(mc);
                    seenTicketIds.add(mc.ticketId.toUpperCase());
                }
            }
        });

        if (search && complaints.length > 0) {
            complaints = complaints.filter(c => 
                (c.ticketId && c.ticketId.toLowerCase().includes(search)) ||
                (c.customerName && c.customerName.toLowerCase().includes(search)) ||
                (c.mobile && c.mobile.includes(search)) ||
                (c.category && c.category.toLowerCase().includes(search))
            );
        }

        const counts = {
            total: complaints.length,
            submitted: complaints.filter(c => c.status === 'submitted').length,
            in_progress: complaints.filter(c => c.status === 'in_progress' || c.status === 'assigned').length,
            resolved: complaints.filter(c => c.status === 'resolved' || c.status === 'closed').length
        };

        // Server-side pagination
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const total = complaints.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginatedComplaints = complaints.slice(startIndex, startIndex + limit);

        let engineers = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            engineers = await User.find({ role: 'EMPLOYEE' }).select('name employeeId mobile email').lean();
        }
        if (!engineers || engineers.length === 0) {
            const users = await DataStore.getUsers();
            engineers = users.filter(u => u.role === 'EMPLOYEE');
        }

        res.render('private/admin/complaints', {
            title: `Service & Complaint Management | ${data.company.name}`,
            data,
            company: data.company,
            complaints: paginatedComplaints,
            counts,
            engineers,
            currentStatus: statusFilter,
            search,
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
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'admin-complaints',
            pageTitle: 'Customer Solar Service & Complaints Console',
            breadcrumbs: [
                { label: 'Executive Dashboard', url: '/admin' },
                { label: 'Service & Complaints' }
            ]
        });
    } catch (err) {
        console.error('Error in getComplaints:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading complaints.'
        });
    }
};

// 7.4 UPDATE COMPLAINT STATUS API
exports.updateComplaintStatus = async (req, res) => {
    try {
        const { ticketId, status, resolutionNotes, assignedEngineer } = req.body;
        if (!ticketId || !status) {
            return res.status(400).json({ success: false, message: 'Ticket ID and status are required.' });
        }

        const Complaint = require('../models/Complaint');
        let complaint = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const updateFields = { status };
            if (resolutionNotes) updateFields.resolutionNotes = resolutionNotes;
            if (assignedEngineer && mongoose.isValidObjectId(assignedEngineer)) updateFields.assignedEngineer = assignedEngineer;
            if (status === 'resolved' || status === 'closed') updateFields.resolvedAt = new Date();

            complaint = await Complaint.findOneAndUpdate(
                { ticketId: { $regex: new RegExp('^' + ticketId.trim() + '$', 'i') } },
                { $set: updateFields },
                { new: true }
            );
        }

        // Also update in DataStore
        if (DataStore.updateComplaintStatus) {
            DataStore.updateComplaintStatus(ticketId, status, resolutionNotes, assignedEngineer);
        }

        AuditService.log({
            action: 'COMPLAINT_STATUS_UPDATED',
            user: req.session.user._id,
            role: req.session.user.role,
            ipAddress: req.ip,
            details: { ticketId, status, updatedBy: req.session.user.name }
        });

        return res.json({
            success: true,
            message: `Ticket ${ticketId} status updated to ${status}.`
        });
    } catch (err) {
        console.error('Error updating complaint status:', err);
        return res.status(500).json({ success: false, message: 'Error updating complaint status.' });
    }
};

// 8. FUTURE MODULE PLACEHOLDER (CUSTOMERS, PROJECTS, REPORTS, SETTINGS)
exports.getModulePlaceholder = (moduleKey) => {
    const modules = {
        customers: {
            title: 'Customer Relationship Management (CRM)',
            pageTitle: 'Customers & Prospective Clients',
            desc: 'The centralized customer database, residential rooftop client records, DISCOM electricity connection consumer numbers, and solar survey history are part of Phase 2.',
            phase: 'Phase 2 Architecture',
            icon: 'icofont-address-book',
            activePage: 'admin-customers',
            plannedFeatures: [
                'Full Customer 360° profile with DISCOM Consumer No. & ALMM requirements',
                'Automatic quotation request linking',
                'Residential, Commercial & Agricultural customer categorization',
                'Survey history and roof feasibility attachments'
            ]
        },
        projects: {
            title: 'Solar Turnkey EPC & Project Tracking',
            pageTitle: 'Solar Projects & Commissioning',
            desc: 'Full solar plant lifecycle tracking from site survey, DISCOM net-meter sanctioning, structure mounting, Tier-1 Mono PERC panel wiring, to PM Surya Ghar DBT subsidy disbursal is scheduled for Phase 3.',
            phase: 'Phase 3 Architecture',
            icon: 'icofont-solar-panel',
            activePage: 'admin-projects',
            plannedFeatures: [
                'Milestone-by-milestone installation tracking',
                'DISCOM MPPKVVCL net-meter inspection and bi-directional meter commissioning',
                'Direct DBT subsidy tracking up to ₹78,000 under PM Surya Ghar Muft Bijli Yojana',
                'Field engineer GPS geo-tagged site check-ins and inspection notes'
            ]
        },
        reports: {
            title: 'Business Intelligence & Reports',
            pageTitle: 'Performance & Growth Reports',
            desc: 'Monthly solar installation capacity analytics, Raisen & MP district installation distribution, financial receipts, and subsidy statistics will be enabled in future phases.',
            phase: 'Future Roadmap',
            icon: 'icofont-chart-growth',
            activePage: 'admin-reports',
            plannedFeatures: [
                'Kilowatt (kW) capacity sanctioned & commissioned monthly',
                'Branch-by-branch revenue and performance leaderboards',
                'Subsidy release cycle time and customer satisfaction indices',
                'Export to Excel, CSV and signed PDF audit reports'
            ]
        },
        settings: {
            title: 'System & Security Settings',
            pageTitle: 'System Settings',
            desc: 'System parameters, branch GPS geofence radiuses, DISCOM tariff tables, PM Surya Ghar subsidy slabs, and security policies.',
            phase: 'System Configuration',
            icon: 'icofont-gear',
            activePage: 'admin-settings',
            plannedFeatures: [
                'PM Surya Ghar subsidy slab configurations (1kW to 10kW+)',
                'Branch geofence location and radius parameters',
                'Role permission matrix editor for Super Admin',
                'DISCOM net-metering portal API integration keys'
            ]
        }
    };

    return (req, res) => {
        const mod = modules[moduleKey] || {
            title: 'Module Under Construction',
            pageTitle: 'Module Placeholder',
            desc: 'This module is scheduled for development in future phases.',
            phase: 'Roadmap',
            icon: 'icofont-tools-alt-2',
            activePage: 'admin',
            plannedFeatures: []
        };

        res.render('private/admin/placeholder', {
            title: `${mod.title} | ${data.company.name}`,
            data,
            company: data.company,
            module: mod,
            user: req.session.user,
            currentUser: req.session.user,
            activePage: mod.activePage,
            pageTitle: mod.pageTitle,
            breadcrumbs: [{ label: 'Modules' }, { label: mod.pageTitle }]
        });
    };
};

// 9. API: CREATE USER (SUPER ADMIN ONLY)
exports.createUser = async (req, res) => {
    let { name, email, mobile, password, role, employeeId, branchId, managerId, designation, department } = req.body;
    const adminUser = req.session.user;

    try {
        if (!name || !email || !mobile || !password || !role) {
            return res.status(400).json({ success: false, message: 'Required fields missing: name, email, mobile, password, role.' });
        }

        const validRoles = ['SUPER_ADMIN', 'MANAGER', 'BRANCH_MANAGER', 'EMPLOYEE'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role specified.' });
        }

        // Check existing user by email
        if (mongoose.connection.readyState === 1) {
            const existing = await User.findOne({ email: email.trim().toLowerCase() });
            if (existing) {
                return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
            }
        }

        // Role-Specific Validation & ID Prefix Generation:
        // SES-MGR- for Manager/Branch Manager, SES-ADMIN- for Super Admin, SES-EMP- for Employee
        let prefix = 'SES-EMP-';
        if (role === 'BRANCH_MANAGER' || role === 'MANAGER') {
            prefix = 'SES-MGR-';

            // Branch is MANDATORY for a Branch Manager
            if (!branchId || (typeof branchId === 'string' && !branchId.trim())) {
                return res.status(400).json({ success: false, message: 'Branch selection is required when creating a Branch Manager.' });
            }

            // Enforce: "ek branch me 2 manager na ho" (Only one active Branch Manager per branch)
            if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(branchId)) {
                const existingBranchManager = await User.findOne({
                    role: { $in: ['BRANCH_MANAGER', 'MANAGER'] },
                    branchId: branchId,
                    status: { $in: ['ACTIVE', 'PENDING'] }
                });
                if (existingBranchManager) {
                    return res.status(400).json({
                        success: false,
                        message: `This branch already has an active Branch Manager (${existingBranchManager.name} - ${existingBranchManager.employeeId || 'Manager'}). Each branch can only have one Branch Manager.`
                    });
                }
            } else {
                const existingMemManager = (await DataStore.getUsers()).find(u =>
                    (u.role === 'BRANCH_MANAGER' || u.role === 'MANAGER') &&
                    u.branchId && (u.branchId._id || u.branchId).toString() === branchId.toString() &&
                    (u.status === 'ACTIVE' || u.status === 'PENDING')
                );
                if (existingMemManager) {
                    return res.status(400).json({
                        success: false,
                        message: `This branch already has an active Branch Manager (${existingMemManager.name} - ${existingMemManager.employeeId || 'Manager'}). Each branch can only have one Branch Manager.`
                    });
                }
            }

            // Manager cannot be assigned to another manager
            managerId = null;
        } else if (role === 'SUPER_ADMIN') {
            prefix = 'SES-ADMIN-';
            managerId = null;
            branchId = null;
        }

        // Clean & Auto-generate unique ID with correct role-based prefix
        let cleanEmpId = '';
        if (employeeId && employeeId.trim()) {
            cleanEmpId = employeeId.trim().toUpperCase();
            if ((role === 'BRANCH_MANAGER' || role === 'MANAGER') && cleanEmpId.startsWith('SES-EMP-')) {
                cleanEmpId = cleanEmpId.replace('SES-EMP-', 'SES-MGR-');
            }
        } else {
            cleanEmpId = `${prefix}${Date.now().toString().slice(-4)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        }

        let createdUserObj = null;
        if (mongoose.connection.readyState === 1) {
            // Verify ID uniqueness
            const duplicateId = await User.findOne({ employeeId: cleanEmpId });
            if (duplicateId) {
                cleanEmpId = `${prefix}${Date.now().toString().slice(-4)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
            }

            createdUserObj = await User.create({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                mobile: mobile.trim(),
                password,
                role,
                employeeId: cleanEmpId,
                branchId: (branchId && mongoose.isValidObjectId(branchId)) ? branchId : null,
                managerId: (managerId && mongoose.isValidObjectId(managerId)) ? managerId : null,
                designation: designation ? designation.trim() : (role === 'BRANCH_MANAGER' ? 'Branch Manager' : 'Staff'),
                department: department ? department.trim() : (role === 'BRANCH_MANAGER' ? 'Operations Management' : 'Field Operations'),
                status: 'ACTIVE'
            });

            // If a Branch Manager was created, link Branch.manager reference
            if ((role === 'BRANCH_MANAGER' || role === 'MANAGER') && branchId && mongoose.isValidObjectId(branchId)) {
                try {
                    await Branch.findByIdAndUpdate(branchId, { manager: createdUserObj._id });
                } catch (bErr) {}
            }
        } else {
            createdUserObj = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                email: email.trim().toLowerCase(),
                mobile: mobile.trim(),
                role,
                isPrimarySuperAdmin: false,
                permissions: [],
                fieldPermissions: [],
                permissionVersion: 1,
                employeeId: cleanEmpId,
                branchId: branchId || 'br-raisen-1',
                managerId: managerId || null,
                designation: designation || (role === 'BRANCH_MANAGER' ? 'Branch Manager' : 'Staff'),
                department: department || (role === 'BRANCH_MANAGER' ? 'Operations Management' : 'General'),
                status: 'ACTIVE',
                createdAt: new Date()
            };
            DataStore.addInMemoryUser(createdUserObj);
        }

        AuditService.log({
            action: 'ROLE_CHANGE',
            user: adminUser._id,
            targetUser: createdUserObj._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { createdRole: role, email: createdUserObj.email, employeeId: cleanEmpId, branchId }
        });

        return res.json({
            success: true,
            user: createdUserObj,
            message: `User ${createdUserObj.name} created successfully as ${createdUserObj.role} with ID ${cleanEmpId}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 10. API: UPDATE USER STATUS (WITH IMMEDIATE SESSION TERMINATION FOR SUSPENSIONS)
exports.updateUserStatus = async (req, res) => {
    const { userId, status } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !status) {
            return res.status(400).json({ success: false, message: 'User ID and status are required.' });
        }

        const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status specified.' });
        }

        let targetUser = null;
        if (mongoose.connection.readyState === 1) {
            targetUser = await User.findById(userId);
        } else {
            targetUser = await DataStore.getUserById(userId);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Primary Super Admin cannot be deactivated or suspended
        if (targetUser.isPrimarySuperAdmin && status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Security Policy Violation: The Primary Super Admin account cannot be deactivated, suspended, or rejected.'
            });
        }

        // Branch Managers can only manage employees within their branch or team
        if (['MANAGER', 'BRANCH_MANAGER'].includes(adminUser.role)) {
            const sameBranch = targetUser.branchId && adminUser.branchId && targetUser.branchId.toString() === adminUser.branchId.toString();
            const sameManager = targetUser.managerId && targetUser.managerId.toString() === adminUser._id.toString();
            if (targetUser.role !== 'EMPLOYEE' || (!sameBranch && !sameManager)) {
                return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify staff outside your branch or team.' });
            }
        }

        targetUser.status = status;
        if (targetUser.save) {
            await targetUser.save();
        }

        // Immediate session termination in MongoDB sessions store & memory store when suspended or deactivated
        if (['SUSPENDED', 'INACTIVE', 'REJECTED'].includes(status)) {
            try {
                if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
                    const sessionsCol = mongoose.connection.db.collection('sessions');
                    const userRegex = new RegExp(targetUser._id.toString());
                    await sessionsCol.deleteMany({ session: { $regex: userRegex } });
                }
            } catch (sessErr) {
                // Non-fatal: authMiddleware requireAuth catches live database status on the very next request
            }

            try {
                if (req.sessionStore && req.sessionStore.sessions) {
                    for (const sid of Object.keys(req.sessionStore.sessions)) {
                        const sessStr = typeof req.sessionStore.sessions[sid] === 'string'
                            ? req.sessionStore.sessions[sid]
                            : JSON.stringify(req.sessionStore.sessions[sid] || {});
                        if (sessStr.includes(targetUser._id.toString())) {
                            delete req.sessionStore.sessions[sid];
                        }
                    }
                }
            } catch (memErr) {}
        }

        AuditService.log({
            action: status === 'ACTIVE' ? 'ACCOUNT_ACTIVATED' : (status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'STATUS_CHANGE'),
            user: adminUser._id,
            targetUser: targetUser._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { newStatus: status }
        });

        return res.json({
            success: true,
            message: `User status changed to ${status} for ${targetUser.name}. Any active session has been immediately invalidated.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 11. API: RESET USER PASSWORD
exports.resetUserPassword = async (req, res) => {
    const { userId, newPassword } = req.body;
    const adminUser = req.session.user;

    try {
        if (!userId || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Valid User ID and minimum 8-character password required.' });
        }

        let targetUser = null;
        if (mongoose.connection.readyState === 1) {
            targetUser = await User.findById(userId);
        } else {
            targetUser = await DataStore.getUserById(userId);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Only Primary Super Admin themselves can reset their own password
        if (targetUser.isPrimarySuperAdmin && !adminUser.isPrimarySuperAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Security Policy Violation: Only the Primary Super Admin can modify the Primary Super Admin account.'
            });
        }

        if (targetUser.save) {
            targetUser.password = newPassword;
            targetUser.failedLoginAttempts = 0;
            targetUser.lockUntil = null;
            await targetUser.save();
        }

        AuditService.log({
            action: 'PASSWORD_CHANGE',
            user: adminUser._id,
            targetUser: targetUser._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { note: 'Password reset by admin' }
        });

        return res.json({ success: true, message: `Password reset successfully for ${targetUser.name}.` });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12. API: ASSIGN MANAGER TO EMPLOYEE
exports.assignManager = async (req, res) => {
    const { employeeId, managerId } = req.body;
    const adminUser = req.session.user;

    try {
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }

        let emp = null;
        if (mongoose.connection.readyState === 1) {
            emp = await User.findById(employeeId);
        } else {
            emp = await DataStore.getUserById(employeeId);
        }

        if (!emp) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Managers and Super Admins cannot be assigned a manager
        if (['MANAGER', 'BRANCH_MANAGER', 'SUPER_ADMIN'].includes(emp.role)) {
            return res.status(400).json({
                success: false,
                message: 'A Manager or Administrator cannot be assigned a reporting Manager. Only Employees can have an assigned Manager.'
            });
        }

        emp.managerId = (managerId && mongoose.isValidObjectId(managerId)) ? managerId : null;
        if (emp.save) {
            await emp.save();
        }

        AuditService.log({
            action: 'MANAGER_ASSIGNED',
            user: adminUser._id,
            targetUser: emp._id,
            role: adminUser.role,
            ipAddress: req.ip,
            details: { assignedManagerId: managerId }
        });

        return res.json({
            success: true,
            message: `Assigned manager updated for ${emp.name}.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12.1 GET USER PERMISSIONS VIEW (PHASE 4 FBAC MANAGEMENT CONSOLE)
exports.getUserPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.session.user;

        let targetUser = null;
        if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
            targetUser = await User.findById(id)
                .populate('branchId', 'name code city')
                .populate('authorizedBranches', 'name code city')
                .populate('managerId', 'name email role employeeId')
                .populate('permissionMetadata.assignedBy', 'name email role')
                .select('-password')
                .lean();
        } else {
            targetUser = await DataStore.getUserById(id);
        }

        if (!targetUser) {
            return res.status(404).render('private/errors/403', {
                title: 'Staff Member Not Found | Shivay Energy Solutions',
                message: 'The requested staff account was not found in the personnel database.',
                user: currentUser
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

        const isTargetPrimaryAdmin = AuthorizationService.isPrimarySuperAdmin(targetUser);
        const isCallerPrimaryAdmin = AuthorizationService.isPrimarySuperAdmin(currentUser);
        const callerId = (currentUser._id?._id || currentUser._id || '').toString();
        const targetId = (targetUser._id?._id || targetUser._id || '').toString();

        // Target cannot be edited if they are Primary Super Admin, or if caller is editing their own permissions
        const isSelf = callerId && targetId && callerId === targetId;
        const canEdit = !isTargetPrimaryAdmin && !isSelf;

        const permissionTree = getFullPermissionTree();

        res.render('private/admin/user-permissions', {
            title: `Manage Permissions: ${targetUser.name} | ${data.company.name}`,
            data,
            company: data.company,
            targetUser,
            isTargetPrimaryAdmin,
            isCallerPrimaryAdmin,
            canEdit,
            isSelf,
            permissionTree,
            sensitiveFields: SENSITIVE_FIELDS,
            roleBaselines: ROLE_MIGRATION_BASELINES,
            modules: MODULES,
            branches: branchList,
            user: currentUser,
            currentUser,
            csrfToken: req.csrfToken ? req.csrfToken() : (req.session.csrfToken || ''),
            activePage: 'admin-employees',
            pageTitle: `Permissions & Security Scope: ${targetUser.name}`,
            breadcrumbs: [
                { label: 'Team', url: '/admin/employees' },
                { label: 'Personnel', url: '/admin/employees' },
                { label: `Permissions (${targetUser.name})` }
            ]
        });
    } catch (err) {
        console.error('Error fetching user permissions:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading user permission management console.',
            user: req.session.user
        });
    }
};

// 12.2 API: GET USER PERMISSIONS JSON
exports.getUserPermissionsJson = async (req, res) => {
    try {
        const { id } = req.params;
        let targetUser = null;
        if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
            targetUser = await User.findById(id).select('-password').lean();
        } else {
            targetUser = await DataStore.getUserById(id);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.json({
            success: true,
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role,
                employeeId: targetUser.employeeId,
                branchId: targetUser.branchId,
                status: targetUser.status,
                isPrimarySuperAdmin: AuthorizationService.isPrimarySuperAdmin(targetUser)
            },
            permissions: targetUser.permissions || [],
            fieldPermissions: targetUser.fieldPermissions || [],
            dataScope: targetUser.dataScope || 'BRANCH',
            authorizedBranches: targetUser.authorizedBranches || [],
            permissionVersion: targetUser.permissionVersion || 1,
            permissionMetadata: targetUser.permissionMetadata || {}
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 12.3 API: UPDATE USER PERMISSIONS & DATA SCOPE (GRANULAR FBAC ENGINE)
exports.updateUserPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const callerUser = req.session.user;

        let targetUser = null;
        if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
            targetUser = await User.findById(id);
        } else {
            targetUser = await DataStore.getUserById(id);
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Target user not found.' });
        }

        // 1. Primary Super Admin Protection: Root authority permissions cannot be altered or revoked
        if (AuthorizationService.isPrimarySuperAdmin(targetUser)) {
            return res.status(403).json({
                success: false,
                message: 'Security Violation: Primary Super Admin permissions are protected and cannot be modified or restricted.'
            });
        }

        // 2. Self-Escalation Prevention: Users cannot alter their own permissions
        const callerId = (callerUser._id?._id || callerUser._id || '').toString();
        const targetId = (targetUser._id?._id || targetUser._id || '').toString();
        if (callerId && targetId && callerId === targetId) {
            return res.status(403).json({
                success: false,
                message: 'Privilege Escalation: Users cannot modify their own permissions or security scope.'
            });
        }

        // 3. Privilege Escalation & Delegation Boundaries Check
        const requestedChanges = {
            permissions: req.body.permissions,
            fieldPermissions: req.body.fieldPermissions,
            role: targetUser.role
        };
        const escalationCheck = AuthorizationService.preventPrivilegeEscalation(callerUser, targetUser, requestedChanges);
        if (!escalationCheck.allowed) {
            return res.status(403).json({
                success: false,
                message: escalationCheck.reason || 'Privilege Escalation: Unauthorized permission assignment.'
            });
        }

        // 4. Validate Permission Strings
        const rawPermissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
        const invalidPerms = rawPermissions.filter(p => !isValidPermission(p));
        if (invalidPerms.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid permission keys detected: ${invalidPerms.slice(0, 3).join(', ')}`
            });
        }

        // 5. Validate Field Permission Strings
        const rawFieldPermissions = Array.isArray(req.body.fieldPermissions) ? req.body.fieldPermissions : [];
        const invalidFields = rawFieldPermissions.filter(f => !isValidFieldPermission(f));
        if (invalidFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid field permission keys detected: ${invalidFields.slice(0, 3).join(', ')}`
            });
        }

        const validPermissions = Array.from(new Set(filterValidPermissions(rawPermissions)));
        const validFieldPermissions = Array.from(new Set(filterValidFieldPermissions(rawFieldPermissions)));

        // 6. Validate Data Scope
        const validScopes = ['OWN', 'ASSIGNED', 'BRANCH', 'MULTI_BRANCH', 'GLOBAL'];
        let dataScope = req.body.dataScope || targetUser.dataScope || 'BRANCH';
        if (!validScopes.includes(dataScope)) {
            dataScope = 'BRANCH';
        }

        // Only Primary Super Admin can grant GLOBAL enterprise data scope
        if (dataScope === 'GLOBAL' && !AuthorizationService.isPrimarySuperAdmin(callerUser)) {
            return res.status(403).json({
                success: false,
                message: 'Security Violation: Only the Primary Super Admin can grant GLOBAL enterprise data scope.'
            });
        }

        let authorizedBranches = Array.isArray(req.body.authorizedBranches) ? req.body.authorizedBranches : [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            authorizedBranches = authorizedBranches.filter(bId => mongoose.isValidObjectId(bId));
        }

        // 7. Increment Permission Version & Update Metadata
        const newVersion = (targetUser.permissionVersion || 1) + 1;
        const metadata = {
            assignedBy: callerUser._id,
            assignedAt: new Date(),
            notes: req.body.notes ? String(req.body.notes).trim() : ''
        };

        if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
            await User.findByIdAndUpdate(id, {
                $set: {
                    permissions: validPermissions,
                    fieldPermissions: validFieldPermissions,
                    dataScope: dataScope,
                    authorizedBranches: authorizedBranches,
                    permissionVersion: newVersion,
                    permissionMetadata: metadata
                }
            }, { new: true, runValidators: true });
        } else {
            targetUser.permissions = validPermissions;
            targetUser.fieldPermissions = validFieldPermissions;
            targetUser.dataScope = dataScope;
            targetUser.authorizedBranches = authorizedBranches;
            targetUser.permissionVersion = newVersion;
            targetUser.permissionMetadata = metadata;
        }

        // 8. Audit Event Recording
        AuditService.log({
            action: 'PERMISSIONS_UPDATE',
            user: callerUser._id,
            targetUser: targetUser._id,
            role: callerUser.role,
            ipAddress: req.ip,
            details: {
                targetName: targetUser.name,
                targetEmail: targetUser.email,
                targetRole: targetUser.role,
                permissionCount: validPermissions.length,
                fieldPermissionCount: validFieldPermissions.length,
                dataScope: dataScope,
                version: newVersion,
                assignedBy: callerUser.name || callerUser.email,
                notes: metadata.notes
            }
        });

        return res.json({
            success: true,
            message: `Permissions updated successfully for ${targetUser.name}.`,
            permissionVersion: newVersion,
            permissionCount: validPermissions.length,
            fieldPermissionCount: validFieldPermissions.length,
            dataScope: dataScope
        });
    } catch (err) {
        console.error('Error updating permissions:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

// 13. API: UPDATE ENQUIRY STATUS
exports.updateEnquiryStatus = (req, res) => {
    const { id, status, note } = req.body;
    if (!id || !status) {
        return res.status(400).json({ success: false, message: 'Enquiry ID and status are required' });
    }

    const updated = DataStore.updateEnquiryStatus(id, status, note);
    if (updated) {
        return res.json({ success: true, message: `Status updated to ${status} for ${id}` });
    }
    return res.status(404).json({ success: false, message: 'Enquiry not found' });
};

// 14. API: SAVE QUOTATION
exports.saveQuotation = (req, res) => {
    const quoteData = req.body;
    if (!quoteData.customerName || !quoteData.plantCapacityKw) {
        return res.status(400).json({ success: false, message: 'Customer name and plant capacity are required' });
    }

    const user = req.session ? req.session.user : null;
    quoteData.preparedBy = user ? user._id : null;
    quoteData.branch = user ? user.branchId : null;

    const saved = DataStore.addQuotation(quoteData);

    AuditService.log({
        action: 'QUOTATION_GENERATED',
        user: user ? user._id : null,
        role: user ? user.role : 'GUEST',
        ipAddress: req.ip,
        details: { quotationNumber: saved.quotationNumber, kw: saved.plantCapacityKw }
    });

    return res.json({ success: true, quotation: saved, message: `Quotation ${saved.quotationNumber} saved successfully` });
};

// 15. API: SAVE INVOICE (SUPER ADMIN & MANAGERS ONLY)
exports.saveInvoice = async (req, res) => {
    const user = req.session ? req.session.user : null;

    if (!user || user.role === 'EMPLOYEE') {
        AuditService.log({
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            user: user ? user._id : null,
            role: user ? user.role : 'GUEST',
            ipAddress: req.ip,
            details: { reason: 'Employee or unauthenticated user attempted invoice creation' }
        });
        return res.status(403).json({
            success: false,
            message: 'HTTP 403 Forbidden: Employees are not authorized to generate or modify invoices. Contact Branch Manager.'
        });
    }

    const invData = req.body;
    if (!invData.customerName) {
        return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    // 1. Server-side Financial Calculations & Validation (Prevent trusting frontend calculations)
    let validatedItems = [];
    let calculatedSubtotal = 0;
    let calculatedCgst = 0;
    let calculatedSgst = 0;
    let calculatedGstAmount = 0;
    let calculatedTotalAmount = 0;
    const gstRate = parseFloat(invData.gstRate) || 12;

    if (Array.isArray(invData.items) && invData.items.length > 0) {
        for (const it of invData.items) {
            const qty = Math.max(0.001, parseFloat(it.qty) || 1);
            const rate = Math.max(0, parseFloat(it.rate) || 0);
            const lineAmount = Math.round(qty * rate * 100) / 100;
            calculatedSubtotal += lineAmount;
            validatedItems.push({
                description: String(it.description || 'Solar Component').trim(),
                hsnCode: String(it.hsnCode || '8541').trim(),
                qty,
                rate,
                amount: lineAmount
            });
        }
        calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
        const halfRate = gstRate / 2;
        calculatedCgst = Math.round(calculatedSubtotal * (halfRate / 100) * 100) / 100;
        calculatedSgst = Math.round(calculatedSubtotal * (halfRate / 100) * 100) / 100;
        calculatedGstAmount = calculatedCgst + calculatedSgst;
        calculatedTotalAmount = Math.round((calculatedSubtotal + calculatedGstAmount) * 100) / 100;
    } else if (invData.subtotal !== undefined && invData.subtotal !== null && parseFloat(invData.subtotal) > 0) {
        calculatedSubtotal = Math.max(0, parseFloat(invData.subtotal) || 0);
        const halfRate = gstRate / 2;
        calculatedCgst = Math.round(calculatedSubtotal * (halfRate / 100) * 100) / 100;
        calculatedSgst = Math.round(calculatedSubtotal * (halfRate / 100) * 100) / 100;
        calculatedGstAmount = calculatedCgst + calculatedSgst;
        calculatedTotalAmount = Math.round((calculatedSubtotal + calculatedGstAmount) * 100) / 100;
    } else {
        // Direct totalAmount supplied without separate subtotal or item breakdown
        calculatedTotalAmount = Math.max(0, parseFloat(invData.totalAmount) || 0);
        calculatedSubtotal = Math.round((calculatedTotalAmount / (1 + gstRate / 100)) * 100) / 100;
        calculatedGstAmount = Math.round((calculatedTotalAmount - calculatedSubtotal) * 100) / 100;
        calculatedCgst = Math.round((calculatedGstAmount / 2) * 100) / 100;
        calculatedSgst = Math.round((calculatedGstAmount - calculatedCgst) * 100) / 100;
    }

    if (calculatedTotalAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invoice amount must be greater than zero' });
    }

    // Payment Tracking & Safe Default
    const paidAmount = Math.max(0, parseFloat(invData.paidAmount) || 0);
    const balanceAmount = Math.max(0, calculatedTotalAmount - paidAmount);
    let paymentStatus = 'unpaid';

    if (invData.paymentStatus === 'cancelled') {
        paymentStatus = 'cancelled';
    } else if (paidAmount >= calculatedTotalAmount && calculatedTotalAmount > 0) {
        paymentStatus = 'paid';
    } else if (paidAmount > 0) {
        paymentStatus = 'partially_paid';
    } else if (invData.paymentStatus && ['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled'].includes(invData.paymentStatus)) {
        paymentStatus = invData.paymentStatus;
    }

    // Check if invoice already exists in DB or in-memory
    let existingInvoice = null;
    const Invoice = require('../models/Invoice');
    if (mongoose.connection.readyState === 1 && invData.invoiceNumber) {
        try {
            existingInvoice = await Invoice.findOne({ invoiceNumber: invData.invoiceNumber });
        } catch (dbFindErr) {
            console.error('Invoice DB lookup error:', dbFindErr);
            return res.status(500).json({ success: false, message: 'Database error occurred during invoice lookup.' });
        }
    }
    const memExisting = DataStore.getAllInvoices(true).find(i => i.invoiceNumber === invData.invoiceNumber);

    if (existingInvoice || memExisting) {
        // Enforce explicit edit permission for updating existing invoice records
        if (!AuthorizationService.hasPermission(user, 'invoices.records.edit')) {
            AuditService.log({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                user: user ? user._id : null,
                role: user ? user.role : 'GUEST',
                ipAddress: req.ip,
                details: { reason: 'Missing required permission: invoices.records.edit' }
            });
            return res.status(403).json({
                success: false,
                message: 'HTTP 403 Forbidden: You do not have permission to edit invoices (invoices.records.edit required).'
            });
        }

        // STRICT LOCK: Customer details CANNOT be changed during invoice update
        const lockedCustomerName = (existingInvoice && existingInvoice.customerName) || (memExisting && memExisting.customerName);
        const lockedCustomerMobile = (existingInvoice && existingInvoice.customerMobile) || (memExisting && memExisting.customerMobile);
        const lockedCustomerAddress = (existingInvoice && existingInvoice.customerAddress) || (memExisting && memExisting.customerAddress);
        const lockedCustomerGstin = (existingInvoice && existingInvoice.customerGstin) || (memExisting && memExisting.customerGstin);
        const lockedDiscomConsumer = (existingInvoice && existingInvoice.discomConsumerNo) || (memExisting && memExisting.discomConsumerNo);
        const lockedProjectId = (existingInvoice && existingInvoice.project) || (memExisting && memExisting.projectId);
        const lockedQuotationId = (existingInvoice && existingInvoice.quotation) || (memExisting && memExisting.quotationId);

        invData.customerName = lockedCustomerName;
        invData.customerMobile = lockedCustomerMobile;
        invData.customerAddress = lockedCustomerAddress;
        invData.customerGstin = lockedCustomerGstin;
        invData.discomConsumerNo = lockedDiscomConsumer;
        invData.projectId = lockedProjectId;
        invData.quotationId = lockedQuotationId;

        // If existing in MongoDB, store complete historical snapshot into previousVersions before updating
        if (existingInvoice) {
            existingInvoice.previousVersions = existingInvoice.previousVersions || [];
            existingInvoice.previousVersions.push({
                version: existingInvoice.version || 1,
                customerName: existingInvoice.customerName,
                customerMobile: existingInvoice.customerMobile,
                customerGstin: existingInvoice.customerGstin,
                customerAddress: existingInvoice.customerAddress,
                plantCapacityKw: existingInvoice.plantCapacityKw,
                items: existingInvoice.items || [],
                subtotal: existingInvoice.subtotal,
                gstRate: existingInvoice.gstRate || 12,
                cgst: existingInvoice.cgst,
                sgst: existingInvoice.sgst,
                gstAmount: existingInvoice.gstAmount,
                totalAmount: existingInvoice.totalAmount,
                paidAmount: existingInvoice.paidAmount || 0,
                balanceAmount: existingInvoice.balanceAmount || existingInvoice.totalAmount,
                paymentStatus: existingInvoice.paymentStatus,
                paymentMethod: existingInvoice.paymentMethod,
                invoiceDate: existingInvoice.invoiceDate,
                discomConsumerNo: existingInvoice.discomConsumerNo,
                project: existingInvoice.project,
                quotation: existingInvoice.quotation,
                branch: existingInvoice.branch,
                updatedByUser: user._id,
                updatedAt: new Date()
            });

            existingInvoice.version = (existingInvoice.version || 1) + 1;
            existingInvoice.plantCapacityKw = parseFloat(invData.plantCapacityKw) || existingInvoice.plantCapacityKw;
            existingInvoice.items = validatedItems.length > 0 ? validatedItems : existingInvoice.items;
            existingInvoice.subtotal = calculatedSubtotal;
            existingInvoice.cgst = calculatedCgst;
            existingInvoice.sgst = calculatedSgst;
            existingInvoice.gstAmount = calculatedGstAmount;
            existingInvoice.totalAmount = calculatedTotalAmount;
            existingInvoice.paidAmount = paidAmount;
            existingInvoice.balanceAmount = balanceAmount;
            existingInvoice.paymentStatus = paymentStatus;
            existingInvoice.paymentMethod = invData.paymentMethod || existingInvoice.paymentMethod;
            existingInvoice.invoiceDate = invData.date || existingInvoice.invoiceDate;

            try {
                await existingInvoice.save();
            } catch (dbSaveErr) {
                console.error('Error saving updated invoice to MongoDB:', dbSaveErr);
                return res.status(500).json({
                    success: false,
                    message: 'Database persistence error: Failed to update invoice.'
                });
            }
        }
    } else {
        // Enforce explicit create permission for new invoice records
        if (!AuthorizationService.hasPermission(user, 'invoices.records.create')) {
            AuditService.log({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                user: user ? user._id : null,
                role: user ? user.role : 'GUEST',
                ipAddress: req.ip,
                details: { reason: 'Missing required permission: invoices.records.create' }
            });
            return res.status(403).json({
                success: false,
                message: 'HTTP 403 Forbidden: You do not have permission to create invoices (invoices.records.create required).'
            });
        }
    }

    invData.createdByUser = user._id;
    invData.branch = user.branchId;
    invData.subtotal = calculatedSubtotal;
    invData.cgst = calculatedCgst;
    invData.sgst = calculatedSgst;
    invData.totalAmount = calculatedTotalAmount;
    invData.paidAmount = paidAmount;
    invData.balanceAmount = balanceAmount;
    invData.paymentStatus = paymentStatus;
    if (validatedItems.length > 0) {
        invData.items = validatedItems;
    }

    // If new invoice and MongoDB is ready, persist to MongoDB FIRST before updating in-memory store
    if (!existingInvoice && mongoose.connection.readyState === 1) {
        try {
            const crypto = require('crypto');
            const safeInvNum = invData.invoiceNumber || (`SES-INV-2026-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`);
            invData.invoiceNumber = safeInvNum;

            const mongoData = {
                invoiceNumber: safeInvNum,
                version: 1,
                previousVersions: [],
                isArchived: false,
                customerName: invData.customerName,
                customerMobile: invData.customerMobile,
                customerAddress: invData.customerAddress || '',
                customerGstin: invData.customerGstin || '',
                plantCapacityKw: parseFloat(invData.plantCapacityKw) || 0,
                items: validatedItems,
                subtotal: calculatedSubtotal,
                cgst: calculatedCgst,
                sgst: calculatedSgst,
                gstRate: gstRate,
                gstAmount: calculatedGstAmount,
                totalAmount: calculatedTotalAmount,
                paidAmount: paidAmount,
                balanceAmount: balanceAmount,
                paymentStatus: paymentStatus,
                paymentMethod: invData.paymentMethod || 'Bank Transfer (NEFT/RTGS/UPI)',
                invoiceDate: invData.date || new Date().toISOString().split('T')[0],
                discomConsumerNo: invData.discomConsumerNo || '',
                project: invData.projectId || null,
                quotation: invData.quotationId || null,
                branch: user.branchId || null,
                createdByUser: user._id
            };
            await Invoice.create(mongoData);
        } catch (e) {
            console.error('Invoice create DB error:', e);
            if (e.code === 11000) {
                return res.status(409).json({ success: false, message: 'An invoice with this invoice number already exists.' });
            }
            return res.status(500).json({ success: false, message: 'Database persistence error: Failed to create invoice.' });
        }
    }

    const saved = DataStore.addInvoice(invData);

    AuditService.log({
        action: existingInvoice ? 'INVOICE_UPDATED' : 'INVOICE_GENERATED',
        user: user._id,
        role: user.role,
        branchId: user.branchId,
        ipAddress: req.ip,
        details: { invoiceNumber: saved.invoiceNumber, amount: saved.totalAmount, version: existingInvoice ? existingInvoice.version : 1 }
    });

    return res.json({
        success: true,
        invoice: saved,
        message: existingInvoice 
            ? `Invoice ${saved.invoiceNumber} (v${existingInvoice.version}) updated successfully. Customer details locked.`
            : `Invoice ${saved.invoiceNumber} recorded successfully`
    });
};

// 16. API: ARCHIVE INVOICE (SUPER ADMIN & MANAGERS ONLY - SOFT-ARCHIVE ONLY)
exports.deleteInvoice = async (req, res) => {
    const user = req.session ? req.session.user : null;
    if (!user || user.role === 'EMPLOYEE') {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const { invoiceNumber } = req.body;
    if (!invoiceNumber) {
        return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }
    
    // Soft-archive in DataStore
    DataStore.archiveInvoice(invoiceNumber);

    // Soft-archive in MongoDB - strictly preserve immutable record
    if (mongoose.connection.readyState === 1) {
        try {
            const Invoice = require('../models/Invoice');
            await Invoice.findOneAndUpdate(
                { invoiceNumber },
                {
                    isArchived: true,
                    archivedAt: new Date(),
                    archivedBy: user._id,
                    paymentStatus: 'cancelled'
                }
            );
        } catch (e) {
            console.error('Invoice archive DB error:', e);
        }
    }
    AuditService.log({
        action: 'INVOICE_ARCHIVED',
        user: user._id,
        role: user.role,
        ipAddress: req.ip,
        details: { invoiceNumber, archivedAt: new Date() }
    });
    return res.json({ success: true, message: `Invoice ${invoiceNumber} archived successfully. Records are safely preserved in the database.` });
};
