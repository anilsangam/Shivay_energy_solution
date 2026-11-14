const data = require('../config/company');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');

// Employee Dashboard
exports.getDashboard = async (req, res) => {
    try {
        const sessionUser = req.session.user;
        const freshUser = await DataStore.getUserById(sessionUser._id) || sessionUser;
        const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        const userAttendance = DataStore.getTodayAttendance().filter(a => a.employeeId === sessionUser.employeeId);
        const assignedManager = freshUser.managerId || freshUser.manager || null;

        res.render('employee/dashboard', {
            title: `Employee Workspace | ${data.company.name}`,
            data,
            company: data.company,
            profileUser: freshUser,
            manager: assignedManager,
            user: sessionUser,
            currentUser: sessionUser,
            today,
            userAttendance,
            activePage: 'emp-dashboard',
            pageTitle: `Welcome, ${freshUser.name || 'Staff Member'}`,
            breadcrumbs: [{ label: 'Workspace' }]
        });
    } catch (err) {
        console.error('Employee Dashboard Error:', err);
        res.status(500).render('errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Error loading employee workspace.'
        });
    }
};

// Employee Field GPS Attendance Page
exports.getAttendancePage = (req, res) => {
    const user = req.session.user;
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const userPunches = DataStore.getTodayAttendance().filter(a => a.employeeId === (user ? user.employeeId : ''));

    res.render('employee/attendance', {
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

// Secure Attendance Submission (Session-derived identity)
exports.submitAttendance = (req, res) => {
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

    // 3. Verify duplicate check-in or invalid check-out
    const todayPunches = DataStore.getTodayAttendance().filter(a => a.employeeId === sessionUser.employeeId);
    const hasCheckIn = todayPunches.some(a => a.type === 'check_in');
    const hasCheckOut = todayPunches.some(a => a.type === 'check_out');

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

    // 4. Record attendance using authenticated session identity
    const record = DataStore.addAttendance({
        employeeId: sessionUser.employeeId,
        employeeName: sessionUser.name,
        role: sessionUser.role,
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
};

// Employee Quotations (Allowed - Existing proposals engine + Phase 2 placeholder notice)
exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('admin/quotations', {
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

    res.render('admin/placeholder', {
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

    res.render('admin/profile', {
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
