const mongoose = require('mongoose');
const data = require('../config/company');
const DataStore = require('./dataStore');

const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_LAT = 23.3315;
const DEFAULT_LNG = 77.7807;
const DEFAULT_RADIUS_METERS = 500;
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '17:00';
const DEFAULT_CHECKIN_EARLY_MINUTES = 10;
const DEFAULT_CHECKOUT_EARLY_MINUTES = 5;

function clampGraceMinutes(val, fallback) {
    if (val === undefined || val === null || val === '') return fallback;
    const num = parseInt(val, 10);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(num, 180);
}

function minutesToHHMM(totalMins) {
    const wrapped = ((Math.round(totalMins) % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeTimeHHMM(val, fallback = DEFAULT_START_TIME) {
    if (typeof val !== 'string') return fallback;
    const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatTime12Hr(hhmm) {
    const clean = normalizeTimeHHMM(hhmm, DEFAULT_START_TIME);
    const [hStr, mStr] = clean.split(':');
    const h = parseInt(hStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : (h % 12);
    return `${String(h12).padStart(2, '0')}:${mStr} ${period}`;
}

function timeToMinutes(hhmm) {
    const clean = normalizeTimeHHMM(hhmm, DEFAULT_START_TIME);
    const [h, m] = clean.split(':').map(n => parseInt(n, 10));
    return h * 60 + m;
}

function getCurrentIstHHMM(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
    const [hRaw, mRaw] = parts.split(':');
    const h = parseInt(hRaw, 10) % 24;
    const m = parseInt(mRaw, 10);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseFiniteCoord(val, min, max) {
    if (val === undefined || val === null || val === '') return null;
    const num = Number(val);
    if (!Number.isFinite(num) || num < min || num > max) return null;
    return num;
}

function clampRadiusMeters(val, fallback = DEFAULT_RADIUS_METERS) {
    const num = parseInt(val, 10);
    if (!Number.isFinite(num) || num < 50) return fallback;
    return Math.min(num, 50000);
}

/**
 * Great-circle Haversine distance in meters between two WGS84 coordinates
 */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

/**
 * Resolve global geofence defaults from Setting model or DataStore
 */
async function getGlobalGeofenceSetting() {
    let setting = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
            const Setting = require('../models/Setting');
            setting = await Setting.findOne({}).select('hqLatitude hqLongitude defaultGeofenceRadiusMeters enforceGeofence').lean();
        } catch (_) {}
    }
    if (!setting && DataStore.getSettings) {
        setting = DataStore.getSettings();
    }

    const hqLat = parseFiniteCoord(setting && setting.hqLatitude, -90, 90) ?? DEFAULT_LAT;
    const hqLng = parseFiniteCoord(setting && setting.hqLongitude, -180, 180) ?? DEFAULT_LNG;
    const defaultRadius = clampRadiusMeters(setting && setting.defaultGeofenceRadiusMeters, DEFAULT_RADIUS_METERS);
    const enforceGeofence = setting && typeof setting.enforceGeofence === 'boolean' ? setting.enforceGeofence : true;

    return {
        hqLat,
        hqLng,
        defaultRadius,
        enforceGeofence
    };
}

/**
 * Resolve effective branch + geofence zone for any authenticated staff member (Employee, Manager, Admin)
 */
async function resolveEffectiveGeofenceForUser(sessionUser) {
    const globalSetting = await getGlobalGeofenceSetting();

    let liveUser = null;
    let branchDoc = null;

    if (mongoose.connection && mongoose.connection.readyState === 1 && sessionUser && sessionUser._id && mongoose.isValidObjectId(sessionUser._id)) {
        try {
            const User = require('../models/User');
            const Branch = require('../models/Branch');

            liveUser = await User.findById(sessionUser._id).select('branchId role name employeeId').lean();
            const resolvedBranchId = (liveUser && liveUser.branchId) ? liveUser.branchId : sessionUser.branchId;

            if (resolvedBranchId && mongoose.isValidObjectId(resolvedBranchId)) {
                branchDoc = await Branch.findById(resolvedBranchId)
                    .select('name code address city state coordinates geofenceRadiusMeters geofenceEnabled attendanceTimeEnabled attendanceStartTime attendanceEndTime checkInEarlyMinutes checkOutEarlyMinutes allowLateCheckOut isActive')
                    .lean();
            }

            // Fallback lookup: if user is a manager assigned directly on Branch.manager
            if (!branchDoc) {
                branchDoc = await Branch.findOne({ manager: sessionUser._id, isActive: true })
                    .select('name code address city state coordinates geofenceRadiusMeters geofenceEnabled attendanceTimeEnabled attendanceStartTime attendanceEndTime checkInEarlyMinutes checkOutEarlyMinutes allowLateCheckOut isActive')
                    .lean();
            }
        } catch (err) {
            console.error('[GeofenceService] Error resolving branch policy:', err.message);
        }
    }

    const branchLat = parseFiniteCoord(branchDoc && branchDoc.coordinates && branchDoc.coordinates.latitude, -90, 90);
    const branchLng = parseFiniteCoord(branchDoc && branchDoc.coordinates && branchDoc.coordinates.longitude, -180, 180);
    const hasBranchCoords = branchLat !== null && branchLng !== null;

    const branchGeofenceEnabled = branchDoc ? (branchDoc.geofenceEnabled !== false) : true;
    const enforceGeofence = Boolean(globalSetting.enforceGeofence && branchGeofenceEnabled);
    const localSettings = DataStore.getSettings ? DataStore.getSettings() : null;
    const attendanceTimeEnabled = branchDoc
        ? (branchDoc.attendanceTimeEnabled !== false)
        : (localSettings && typeof localSettings.attendanceTimeEnabled === 'boolean' ? localSettings.attendanceTimeEnabled : true);
    const attendanceStartTime = normalizeTimeHHMM(
        (branchDoc && branchDoc.attendanceStartTime) || (localSettings && localSettings.attendanceStartTime),
        DEFAULT_START_TIME
    );
    const attendanceEndTime = normalizeTimeHHMM(
        (branchDoc && branchDoc.attendanceEndTime) || (localSettings && localSettings.attendanceEndTime),
        DEFAULT_END_TIME
    );
    const checkInEarlyMinutes = clampGraceMinutes(
        branchDoc && branchDoc.checkInEarlyMinutes !== undefined ? branchDoc.checkInEarlyMinutes : (localSettings && localSettings.checkInEarlyMinutes),
        DEFAULT_CHECKIN_EARLY_MINUTES
    );
    const checkOutEarlyMinutes = clampGraceMinutes(
        branchDoc && branchDoc.checkOutEarlyMinutes !== undefined ? branchDoc.checkOutEarlyMinutes : (localSettings && localSettings.checkOutEarlyMinutes),
        DEFAULT_CHECKOUT_EARLY_MINUTES
    );
    const allowLateCheckOut = branchDoc
        ? (branchDoc.allowLateCheckOut !== false)
        : (localSettings && typeof localSettings.allowLateCheckOut === 'boolean' ? localSettings.allowLateCheckOut : true);

    const startMins = timeToMinutes(attendanceStartTime);
    const endMins = timeToMinutes(attendanceEndTime);
    const checkInOpenHHMM = minutesToHHMM(Math.max(0, startMins - checkInEarlyMinutes));
    const checkOutOpenHHMM = minutesToHHMM(startMins <= endMins ? Math.max(startMins, endMins - checkOutEarlyMinutes) : (endMins - checkOutEarlyMinutes));

    return {
        enforceGeofence,
        globalEnforceGeofence: globalSetting.enforceGeofence,
        branchGeofenceEnabled,
        attendanceTimeEnabled,
        attendanceStartTime,
        attendanceEndTime,
        checkInEarlyMinutes,
        checkOutEarlyMinutes,
        allowLateCheckOut,
        attendanceStartDisplay: formatTime12Hr(attendanceStartTime),
        attendanceEndDisplay: formatTime12Hr(attendanceEndTime),
        checkInOpenHHMM,
        checkOutOpenHHMM,
        checkInOpenDisplay: formatTime12Hr(checkInOpenHHMM),
        checkOutOpenDisplay: formatTime12Hr(checkOutOpenHHMM),
        source: (branchDoc && hasBranchCoords) ? 'branch' : 'hq_fallback',
        branchId: branchDoc ? branchDoc._id : ((liveUser && liveUser.branchId) || (sessionUser && sessionUser.branchId) || null),
        branchName: branchDoc ? branchDoc.name : `${(data.company && data.company.shortName) || 'HQ'} Central Office`,
        branchCode: branchDoc ? (branchDoc.code || '') : 'HQ',
        branchAddress: branchDoc ? [branchDoc.address, branchDoc.city, branchDoc.state].filter(Boolean).join(', ') : ((data.company && data.company.address && data.company.address.full) || 'Raisen, Madhya Pradesh'),
        latitude: hasBranchCoords ? branchLat : globalSetting.hqLat,
        longitude: hasBranchCoords ? branchLng : globalSetting.hqLng,
        radiusMeters: branchDoc
            ? clampRadiusMeters(branchDoc.geofenceRadiusMeters, globalSetting.defaultRadius)
            : globalSetting.defaultRadius
    };
}

/**
 * Evaluate current IST time against branch's Check-In / Check-Out time windows & grace settings
 */
function evaluateAttendanceTimeWindow(policy, now = new Date(), punchType = null) {
    const startTime = normalizeTimeHHMM(policy && policy.attendanceStartTime, DEFAULT_START_TIME);
    const endTime = normalizeTimeHHMM(policy && policy.attendanceEndTime, DEFAULT_END_TIME);
    const checkInEarlyMinutes = clampGraceMinutes(policy && policy.checkInEarlyMinutes, DEFAULT_CHECKIN_EARLY_MINUTES);
    const checkOutEarlyMinutes = clampGraceMinutes(policy && policy.checkOutEarlyMinutes, DEFAULT_CHECKOUT_EARLY_MINUTES);
    const allowLateCheckOut = policy ? (policy.allowLateCheckOut !== false) : true;
    const timeWindowEnforced = policy ? (policy.attendanceTimeEnabled !== false) : true;

    const currentIstHHMM = getCurrentIstHHMM(now);
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const nowMins = timeToMinutes(currentIstHHMM);

    const checkInOpenMins = startMins <= endMins
        ? Math.max(0, startMins - checkInEarlyMinutes)
        : ((startMins - checkInEarlyMinutes + 1440) % 1440);
    const checkOutOpenMins = startMins <= endMins
        ? Math.max(startMins, endMins - checkOutEarlyMinutes)
        : ((endMins - checkOutEarlyMinutes + 1440) % 1440);

    let checkInAllowed = true;
    let checkOutAllowed = true;

    if (timeWindowEnforced) {
        if (startMins <= endMins) {
            checkInAllowed = nowMins >= checkInOpenMins && nowMins <= endMins;
            checkOutAllowed = allowLateCheckOut
                ? (nowMins >= checkOutOpenMins)
                : (nowMins >= checkOutOpenMins && nowMins <= endMins);
        } else {
            checkInAllowed = (nowMins >= checkInOpenMins || nowMins <= endMins);
            checkOutAllowed = allowLateCheckOut
                ? true
                : (nowMins >= checkOutOpenMins && nowMins <= endMins);
        }
    }

    const isWithinTimeWindow = punchType === 'check_in'
        ? checkInAllowed
        : (punchType === 'check_out' ? checkOutAllowed : (checkInAllowed || checkOutAllowed));

    const checkInOpenHHMM = minutesToHHMM(checkInOpenMins);
    const checkOutOpenHHMM = minutesToHHMM(checkOutOpenMins);

    return {
        timeWindowEnforced,
        isWithinTimeWindow,
        checkInAllowed,
        checkOutAllowed,
        allowedByTime: timeWindowEnforced ? isWithinTimeWindow : true,
        currentIstHHMM,
        currentDisplay: formatTime12Hr(currentIstHHMM),
        startTime,
        endTime,
        startDisplay: formatTime12Hr(startTime),
        endDisplay: formatTime12Hr(endTime),
        checkInEarlyMinutes,
        checkOutEarlyMinutes,
        allowLateCheckOut,
        checkInOpenDisplay: formatTime12Hr(checkInOpenHHMM),
        checkOutOpenDisplay: formatTime12Hr(checkOutOpenHHMM)
    };
}

/**
 * Evaluate device GPS coordinates against resolved geofence policy
 */
function evaluateLocationAgainstPolicy(userLat, userLng, policy) {
    const distanceMeters = Math.round(haversineDistanceMeters(userLat, userLng, policy.latitude, policy.longitude));
    const allowedRadiusMeters = clampRadiusMeters(policy.radiusMeters, DEFAULT_RADIUS_METERS);
    const isWithinGeofence = distanceMeters <= allowedRadiusMeters;
    const allowedToPunch = policy.enforceGeofence ? isWithinGeofence : true;

    return {
        distanceMeters,
        allowedRadiusMeters,
        isWithinGeofence,
        allowedToPunch
    };
}

module.exports = {
    DEFAULT_LAT,
    DEFAULT_LNG,
    DEFAULT_RADIUS_METERS,
    DEFAULT_START_TIME,
    DEFAULT_END_TIME,
    DEFAULT_CHECKIN_EARLY_MINUTES,
    DEFAULT_CHECKOUT_EARLY_MINUTES,
    clampGraceMinutes,
    normalizeTimeHHMM,
    formatTime12Hr,
    getCurrentIstHHMM,
    parseFiniteCoord,
    clampRadiusMeters,
    haversineDistanceMeters,
    getGlobalGeofenceSetting,
    resolveEffectiveGeofenceForUser,
    evaluateLocationAgainstPolicy,
    evaluateAttendanceTimeWindow
};
