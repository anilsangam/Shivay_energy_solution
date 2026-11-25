const data = require('../config/company');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');
const dateUtils = require('../services/dateUtils');
const mongoose = require('mongoose');

// Employee Portal Entry (Redirect to GPS Attendance)
exports.getDashboard = async (req, res) => {
    return res.redirect('/employee/attendance');
};

// Employee Field GPS Attendance Page
exports.getAttendancePage = async (req, res) => {
    try {
        await DataStore.syncAttendanceFromDb();
    } catch (_) {}
    const user = req.session.user;
    const today = dateUtils.getIstDisplayDate();
    const todayStr = dateUtils.getIstDate();
    const userPunches = DataStore.getTodayAttendance().filter(a => a.employeeId === (user ? user.employeeId : '') && (a.date === todayStr || !a.date));

    res.render('private/employee/attendance', {
        title: `Employee Field GPS Attendance | ${data.company.name}`,
        data,
        company: data.company,
        user,
        currentUser: user,
        today,
        userPunches,
        activePage: 'employee',
        pageTitle: 'Geo-Tagged Field Attendance',
        breadcrumbs: [{ label: 'Field Portal' }, { label: 'Attendance' }]
    });
};

// Secure Attendance Submission (Session-derived identity, confirmed persistence)
exports.submitAttendance = async (req, res) => {
    // 1. Enforce session-derived identity
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Session missing. Please sign in to punch attendance.'
        });
    }

    const sessionUser = req.session.user;
    const { type, latitude, longitude, accuracy } = req.body;

    const punchType = (type === 'check_out') ? 'check_out' : 'check_in';
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const acc = parseFloat(accuracy) || 15;

    // 2. Validate GPS coordinates
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
            success: false,
            message: 'Invalid GPS coordinates received from device.'
        });
    }

    // 3. Verify duplicate check-in or invalid check-out using IST business date
    const todayStr = dateUtils.getIstDate();
    let hasCheckIn = false;
    let hasCheckOut = false;

    if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
            const Attendance = require('../models/Attendance');
            const dbPunches = await Attendance.find({ employeeId: sessionUser.employeeId, date: todayStr }).lean();
            hasCheckIn = dbPunches.some(a => a.type === 'check_in');
            hasCheckOut = dbPunches.some(a => a.type === 'check_out');
        } catch (queryErr) {
            console.error('[Attendance Pre-check Error]:', queryErr);
        }
    }

    // Also verify against in-memory punches
    const memPunches = DataStore.getTodayAttendance().filter(a => a.employeeId === sessionUser.employeeId && (a.date === todayStr || !a.date));
    if (!hasCheckIn) hasCheckIn = memPunches.some(a => a.type === 'check_in');
    if (!hasCheckOut) hasCheckOut = memPunches.some(a => a.type === 'check_out');

    if (punchType === 'check_in' && hasCheckIn) {
        return res.status(400).json({
            success: false,
            message: 'You have already punched Check-In for today.'
        });
    }

    if (punchType === 'check_out') {
        if (!hasCheckIn) {
            return res.status(400).json({
                success: false,
                message: 'Check-In record required before Check-Out can be submitted.'
            });
        }
        if (hasCheckOut) {
            return res.status(400).json({
                success: false,
                message: 'You have already punched Check-Out for today.'
            });
        }
    }

    // 4. Record attendance awaiting confirmed persistence
    try {
        const record = await DataStore.addAttendance({
            employee: sessionUser._id,
            employeeId: sessionUser.employeeId,
            employeeName: sessionUser.name,
            role: sessionUser.role,
            branchId: sessionUser.branchId,
            type: punchType,
            latitude: lat,
            longitude: lng,
            accuracy: acc
        });

        // 5. Audit log
        AuditService.log({
            action: 'ATTENDANCE_SUBMITTED',
            user: sessionUser._id,
            role: sessionUser.role,
            branchId: sessionUser.branchId,
            ipAddress: req.ip,
            details: { type: punchType, lat, lng, acc }
        });

        console.log(`[SECURE ATTENDANCE] ${record.type.toUpperCase()}: ${record.employeeName} (${record.employeeId}) from Session. Lat: ${lat}, Lng: ${lng}`);

        return res.json({
            success: true,
            record,
            message: `${punchType === 'check_in' ? 'Check-In' : 'Check-Out'} successfully recorded for ${sessionUser.name} at ${record.timestamp} (IST). GPS Geo-tagged.`
        });
    } catch (persistErr) {
        console.error('[Attendance Submission Persistence Failed]:', persistErr);
        // Handle MongoDB duplicate key error code 11000
        if (persistErr.code === 11000) {
            return res.status(400).json({
                success: false,
                message: `You have already punched ${punchType === 'check_in' ? 'Check-In' : 'Check-Out'} for today.`
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Database persistence failed while recording attendance. Please try again.'
        });
    }
};

// Employee Quotations (Allowed - Existing proposals engine + Phase 2 placeholder notice)
exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('private/admin/quotations', {
        title: `My Solar Quotations | ${data.company.name}`,
        data,
        company: data.company,
        quotations,
        user: req.session.user,
        currentUser: req.session.user,
        activePage: 'employee-quotations',
        pageTitle: 'My Solar Proposals & Quotations',
        breadcrumbs: [{ label: 'Proposals' }, { label: 'My Quotations' }]
    });
};

// Employee Projects (Phase 3 placeholder)
exports.getProjects = (req, res) => {
    const mod = {
        title: 'My Solar Rooftop Projects',
        pageTitle: 'Assigned Solar Projects',
        desc: 'Your on-site installation work orders, site survey assignments, customer verification checklists, and DISCOM MPPKVVCL net-meter inspection logs will be tracked here in Phase 3.',
        phase: 'Phase 3 Architecture',
        icon: 'icofont-solar-panel',
        activePage: 'employee-projects',
        plannedFeatures: [
            'My assigned rooftop sites across Raisen & neighboring districts',
            'GPS check-in at client site during installation',
            'ALMM Tier-1 Mono PERC panel barcode scan and serial validation',
            'Final completion certificate sign-off for DBT subsidy release'
        ]
    };

    res.render('private/admin/placeholder', {
        title: `${mod.title} | ${data.company.name}`,
        data,
        company: data.company,
        module: mod,
        user: req.session.user,
        currentUser: req.session.user,
        activePage: 'employee-projects',
        pageTitle: mod.pageTitle,
        breadcrumbs: [{ label: 'Work Orders' }, { label: 'My Projects' }]
    });
};

// Employee Profile
exports.getProfile = async (req, res) => {
    const sessionUser = req.session.user;
    const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;

    res.render('private/admin/profile', {
        title: `My Profile | ${data.company.name}`,
        data,
        company: data.company,
        profileUser: freshUser,
        user: sessionUser,
        currentUser: sessionUser,
        activePage: 'employee-profile',
        pageTitle: 'My Employee Profile & Security',
        breadcrumbs: [{ label: 'Account' }, { label: 'My Profile' }]
    });
};

// Employee Assigned Complaints & Service Tasks (Phase 4)
exports.getAssignedComplaints = async (req, res) => {
    try {
        const user = req.session.user;
        let complaints = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const Complaint = require('../models/Complaint');
            complaints = await Complaint.find({
                $or: [
                    { assignedTechnician: user._id },
                    { assignedEngineer: user._id }
                ]
            })
            .populate('branch', 'name code city')
            .populate('customer', 'name mobile')
            .populate('project', 'projectNumber title capacityKw')
            .sort({ createdAt: -1 })
            .lean();
        } else if (DataStore && DataStore.getAllComplaints) {
            complaints = DataStore.getAllComplaints().filter(c =>
                (c.assignedTechnician && c.assignedTechnician.toString() === user._id.toString()) ||
                (c.assignedEngineer && c.assignedEngineer.toString() === user._id.toString())
            );
        }

        res.render('private/employee/complaints', {
            title: `My Assigned Complaints | ${data.company.name}`,
            data,
            company: data.company,
            user,
            currentUser: user,
            complaints,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'employee-complaints',
            pageTitle: 'My Assigned Complaints',
            breadcrumbs: [{ label: 'Field Portal' }, { label: 'Service Complaints' }]
        });
    } catch (err) {
        console.error('[Error fetching employee assigned complaints]:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error',
            message: 'Error loading assigned complaints.'
        });
    }
};
