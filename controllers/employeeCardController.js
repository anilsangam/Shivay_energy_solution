const mongoose = require('mongoose');
const crypto = require('crypto');
const QRCode = require('qrcode');
const User = require('../models/User');
const Branch = require('../models/Branch');
const DataStore = require('../services/dataStore');
const companyData = require('../config/company');
const AuditService = require('../services/auditService');

/**
 * Generate HMAC token for secure employee card sharing
 */
function generateCardToken(employeeId, empCode) {
    const secret = process.env.SESSION_SECRET || 'shivay-energy-card-secure-token-2026';
    return crypto.createHmac('sha256', secret)
        .update(String(employeeId) + ':' + String(empCode || ''))
        .digest('hex').substring(0, 32);
}

/**
 * Resolve employee branch dynamically
 * Different branches show different address and contact numbers
 */
async function resolveEmployeeBranch(employee) {
    if (!employee) return null;

    // 1. If branchId or branch is already populated with branch details
    const populated = (employee.branchId && typeof employee.branchId === 'object' && employee.branchId.name) ? employee.branchId
                    : ((employee.branch && typeof employee.branch === 'object' && employee.branch.name) ? employee.branch : null);
    
    if (populated) {
        const isBhopal = (populated.name && populated.name.includes('Bhopal')) || (populated.city && populated.city.includes('Bhopal'));
        const isVidisha = (populated.name && populated.name.includes('Vidisha')) || (populated.city && populated.city.includes('Vidisha'));

        return {
            name: populated.name,
            code: populated.code || (isBhopal ? 'MP-BPL-02' : (isVidisha ? 'MP-VDS-03' : 'MP-RSN-01')),
            city: populated.city || (isBhopal ? 'Bhopal' : (isVidisha ? 'Vidisha' : 'Raisen')),
            district: populated.district || populated.city || (isBhopal ? 'Bhopal' : (isVidisha ? 'Vidisha' : 'Raisen')),
            state: populated.state || 'Madhya Pradesh',
            address: populated.address || (isBhopal ? 'F3 Plot No 8 Enclave Indpuri, Bhopal (M.P.) 462022' : (isVidisha ? 'Station Road, Near Circuit House, Vidisha (M.P.) 464001' : 'In Front Of P.H.E. Office Arjun Nagar, Raisen (M.P.) 464551')),
            contactNumber: populated.contactNumber || (isBhopal ? '+91 93997 61750' : (isVidisha ? '+91 98260 12345' : '+91 70005 75496')),
            email: populated.email || (isBhopal ? 'bhopal@shivayenergysolutions.in' : (isVidisha ? 'vidisha@shivayenergysolutions.in' : 'sesraisen@gmail.com'))
        };
    }

    const rawBranchId = employee.branchId?._id || employee.branchId || employee.branch;
    let branch = null;

    if (rawBranchId && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(rawBranchId)) {
        try {
            branch = await Branch.findById(rawBranchId).lean();
        } catch (e) {}
    }

    // Fallback based on ID or string identifier for in-memory or unlinked branches
    if (!branch && rawBranchId) {
        const idStr = String(rawBranchId);
        const deptStr = String(employee.department || '');
        const desigStr = String(employee.designation || '');

        if (idStr.includes('bhopal') || idStr.includes('BPL') || idStr === 'br-bhopal-1' || idStr.endsWith('20') || deptStr.includes('Bhopal') || desigStr.includes('Bhopal')) {
            branch = {
                name: 'Bhopal Regional Hub',
                code: 'MP-BPL-02',
                city: 'Bhopal',
                district: 'Bhopal',
                state: 'Madhya Pradesh',
                address: 'F3 Plot No 8 Enclave Indpuri, Bhopal (M.P.) 462022',
                contactNumber: '+91 93997 61750',
                email: 'bhopal@shivayenergysolutions.in'
            };
        } else if (idStr.includes('vidisha') || idStr.includes('VDS') || idStr === 'br-vidisha-1' || idStr.endsWith('30') || deptStr.includes('Vidisha')) {
            branch = {
                name: 'Vidisha Operational Center',
                code: 'MP-VDS-03',
                city: 'Vidisha',
                district: 'Vidisha',
                state: 'Madhya Pradesh',
                address: 'Station Road, Near Circuit House, Vidisha (M.P.) 464001',
                contactNumber: '+91 98260 12345',
                email: 'vidisha@shivayenergysolutions.in'
            };
        } else {
            branch = {
                name: 'Raisen Central Branch',
                code: 'MP-RSN-01',
                city: 'Raisen',
                district: 'Raisen',
                state: 'Madhya Pradesh',
                address: 'In Front Of P.H.E. Office Arjun Nagar, Raisen (M.P.) 464551',
                contactNumber: '+91 70005 75496',
                email: 'sesraisen@gmail.com'
            };
        }
    }

    if (!branch) {
        branch = {
            name: 'Raisen Central Branch',
            code: 'MP-RSN-01',
            city: 'Raisen',
            district: 'Raisen',
            state: 'Madhya Pradesh',
            address: 'In Front Of P.H.E. Office Arjun Nagar, Raisen (M.P.) 464551',
            contactNumber: '+91 70005 75496',
            email: 'Official@shivayenergysolutions.in'
        };
    }

    return branch;
}

/**
 * Access control check: Only Manager (of that branch/subordinate) or Super Admin can view/generate
 */
function canAccessEmployeeCards(caller, targetEmployee, token) {
    if (!targetEmployee) return false;

    // Check share token (allows the employee to view their own card when shared)
    if (token) {
        const expectedToken = generateCardToken(targetEmployee._id, targetEmployee.employeeId);
        if (token === expectedToken) return true;
    }

    if (!caller) return false;

    // Super Admin has universal access
    if (caller.isPrimarySuperAdmin || caller.role === 'SUPER_ADMIN') {
        return true;
    }

    // Managers / Branch Managers can view employees in their branch or reporting line
    if (caller.role === 'MANAGER' || caller.role === 'BRANCH_MANAGER') {
        const callerBranch = caller.branchId ? (caller.branchId._id || caller.branchId).toString() : '';
        const targetBranch = targetEmployee.branchId ? (targetEmployee.branchId._id || targetEmployee.branchId).toString() : '';
        const callerId = (caller._id?._id || caller._id || '').toString();
        const targetManagerId = targetEmployee.managerId ? (targetEmployee.managerId._id || targetEmployee.managerId).toString() : '';

        if (callerBranch && targetBranch && callerBranch === targetBranch) {
            return true;
        }
        if (callerId && targetManagerId && callerId === targetManagerId) {
            return true;
        }
    }

    return false;
}

class EmployeeCardController {
    /**
     * View & Generate Official Employee Identity Card
     */
    static async getIdCard(req, res) {
        try {
            const { id } = req.params;
            const caller = req.session ? req.session.user : null;
            const token = req.query.token;

            let employee = null;
            if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                employee = await User.findById(id).populate('branchId').populate('managerId', 'name email mobile employeeId').lean();
            } else {
                employee = await DataStore.getUserById(id);
            }

            if (!employee) {
                return res.status(404).render('private/errors/403', {
                    title: 'Employee Not Found | Shivay Energy Solutions',
                    message: 'The requested employee profile was not found.',
                    user: caller
                });
            }

            if (!canAccessEmployeeCards(caller, employee, token)) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Restricted | Shivay Energy Solutions',
                    message: 'Access Restricted: Only authorized Branch Managers and Super Administrators can generate or view official Employee Identity Cards.',
                    user: caller
                });
            }

            const branch = await resolveEmployeeBranch(employee);
            const shareToken = generateCardToken(employee._id, employee.employeeId);
            const isManagerOrAdmin = caller && (caller.role === 'SUPER_ADMIN' || caller.role === 'MANAGER' || caller.role === 'BRANCH_MANAGER');

            const formatCardDate = (d) => {
                if (!d) return 'N/A';
                const dt = new Date(d);
                if (isNaN(dt.getTime())) return 'N/A';
                return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
            };

            const empCode = employee.employeeId || employee.idCardNumber || 'N/A';
            const joinDateVal = employee.joiningDate || employee.createdAt;
            const expDateVal = employee.expiryDate || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000);
            const idQrPayload = [
                'SHIVAY ENERGY SOLUTIONS - EMPLOYEE ID',
                `Name: ${employee.name || ''}`,
                `Role: ${employee.designation || ''}`,
                `ID No: ${empCode}`,
                `Phone: ${employee.mobile || ''}`,
                `Alt No: ${employee.alternateMobile || 'N/A'}`,
                `Email: ${employee.email || ''}`,
                `Blood Gr: ${employee.bloodGroup || 'B+'}`,
                `Join: ${formatCardDate(joinDateVal)}`,
                `Expire: ${formatCardDate(expDateVal)}`,
                `Branch: ${branch ? branch.name : 'Raisen Central Branch'} (${branch ? branch.code : 'MP-RSN-01'})`,
                'Website: https://www.shivayenergysolutions.com'
            ].join('\n');

            const idQrSvg = await QRCode.toString(idQrPayload, {
                type: 'svg',
                margin: 1,
                color: { dark: '#111827', light: '#ffffff' }
            });

            res.render('private/admin/employee-id-card', {
                title: `Employee ID Card - ${employee.name} | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                employee,
                branch,
                shareToken,
                idQrSvg,
                isManagerOrAdmin,
                user: caller,
                currentUser: caller
            });
        } catch (err) {
            console.error('Error generating Employee ID Card:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Failed to generate Employee ID Card.',
                user: req.session.user
            });
        }
    }

    /**
     * View & Generate Official Employee Visiting Card (Business Card)
     */
    static async getVisitingCard(req, res) {
        try {
            const { id } = req.params;
            const caller = req.session ? req.session.user : null;
            const token = req.query.token;

            let employee = null;
            if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                employee = await User.findById(id).populate('branchId').populate('managerId', 'name email mobile employeeId').lean();
            } else {
                employee = await DataStore.getUserById(id);
            }

            if (!employee) {
                return res.status(404).render('private/errors/403', {
                    title: 'Employee Not Found | Shivay Energy Solutions',
                    message: 'The requested employee profile was not found.',
                    user: caller
                });
            }

            if (!canAccessEmployeeCards(caller, employee, token)) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Restricted | Shivay Energy Solutions',
                    message: 'Access Restricted: Only authorized Branch Managers and Super Administrators can generate or view official Visiting Cards.',
                    user: caller
                });
            }

            const branch = await resolveEmployeeBranch(employee);
            const shareToken = generateCardToken(employee._id, employee.employeeId);
            const isManagerOrAdmin = caller && (caller.role === 'SUPER_ADMIN' || caller.role === 'MANAGER' || caller.role === 'BRANCH_MANAGER');

            res.render('private/admin/employee-visiting-card', {
                title: `Visiting Card - ${employee.name} | ${companyData.company.name}`,
                data: companyData,
                company: companyData.company,
                employee,
                branch,
                shareToken,
                isManagerOrAdmin,
                user: caller,
                currentUser: caller
            });
        } catch (err) {
            console.error('Error generating Visiting Card:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Failed to generate Visiting Card.',
                user: req.session.user
            });
        }
    }

    /**
     * API: Get share link & details for employee card
     */
    static async getSharePayload(req, res) {
        try {
            const { id, type } = req.params;
            const caller = req.session ? req.session.user : null;

            let employee = null;
            if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
                employee = await User.findById(id).populate('branchId').lean();
            } else {
                employee = await DataStore.getUserById(id);
            }

            if (!employee || !canAccessEmployeeCards(caller, employee)) {
                return res.status(403).json({ success: false, message: 'Unauthorized access.' });
            }

            const branch = await resolveEmployeeBranch(employee);
            const token = generateCardToken(employee._id, employee.employeeId);
            const host = req.get('host') || 'localhost:3000';
            const protocol = req.protocol || 'http';
            const basePath = type === 'visiting' ? 'visiting-card' : 'id-card';
            const shareUrl = `${protocol}://${host}/cards/view/${basePath}/${employee._id}?token=${token}`;

            const cardTypeLabel = type === 'visiting' ? 'Official Visiting Card' : 'Official Employee ID Card';
            const shareText = `Namaste ${employee.name},\nHere is your official ${cardTypeLabel} from Shivay Energy Solutions (${branch.name}):\n${shareUrl}\n\nEmployee ID: ${employee.employeeId || 'N/A'}\nValid across all branches.`;

            return res.json({
                success: true,
                shareUrl,
                shareText,
                whatsappUrl: `https://wa.me/${(employee.mobile || '').replace(/\D/g, '')}?text=${encodeURIComponent(shareText)}`,
                employee: {
                    name: employee.name,
                    employeeId: employee.employeeId,
                    designation: employee.designation,
                    branch: branch.name
                }
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    }
}

module.exports = {
    EmployeeCardController,
    resolveEmployeeBranch,
    canAccessEmployeeCards,
    generateCardToken
};
