const data = require('../config/company');
const DataStore = require('../services/dataStore');
const AuditService = require('../services/auditService');

// Employee Dashboard
exports.getDashboard = (req, res) => {
    const user = req.session.user;
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const userAttendance = DataStore.getTodayAttendance().filter(a => a.employeeId === user.employeeId);

    res.render('employee/dashboard', {
        title: `Employee Workspace | ${data.company.name}`,
        data,
        user,
        today,
        userAttendance,
        activePage: 'emp-dashboard'
    });
};

// Employee Field GPS Attendance Page
exports.getAttendancePage = (req, res) => {
    const user = req.session.user;
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const userPunches = DataStore.getTodayAttendance().filter(a => a.employeeId === (user ? user.employeeId : ''));

    res.render('employee/attendance', {
        title: `Employee Field GPS Attendance | ${data.company.name}`,
        data,
        user,
        today,
        userPunches,
        activePage: 'employee'
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

// Employee Quotations (Allowed)
exports.getQuotations = (req, res) => {
    const quotations = DataStore.getAllQuotations();
    res.render('admin/quotations', {
        title: `Create Quotation | ${data.company.name}`,
        data,
        quotations,
        user: req.session.user,
        activePage: 'employee-quotations'
    });
};

// Employee Profile
exports.getProfile = (req, res) => {
    res.render('employee/profile', {
        title: `My Profile | ${data.company.name}`,
        data,
        user: req.session.user,
        activePage: 'employee-profile'
    });
};
