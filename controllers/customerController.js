const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');
const companyData = require('../config/company');

class CustomerController {
    /**
     * Search customer by mobile number
     * Accessible by Employee, Manager, Super Admin
     */
    static async searchByMobile(req, res) {
        try {
            const { mobile } = req.query;
            if (!mobile || !mobile.trim()) {
                return res.status(400).json({ success: false, message: 'Mobile number query parameter is required.' });
            }

            const cleanMobile = mobile.replace(/[^0-9]/g, '');
            if (cleanMobile.length < 10) {
                return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
            }

            // Find customer matching 10-digit mobile (safe check if MongoDB is active)
            let customer = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                customer = await Customer.findOne({
                    mobile: { $regex: cleanMobile.slice(-10) + '$' }
                }).populate('assignedEmployee', 'name employeeId mobile email');
            }

            if (!customer) {
                return res.json({ success: true, found: false });
            }

            const currentUser = req.session.user;

            // Authorization:
            // Super Admin can see any customer
            // Manager can see customer if in same branch or assigned to an employee in their team
            // Employee can see customer if assigned to them or unassigned
            if (currentUser.role === 'EMPLOYEE') {
                if (customer.assignedEmployee && String(customer.assignedEmployee._id || customer.assignedEmployee) !== String(currentUser._id)) {
                    // Another employee owns this customer
                    return res.json({
                        success: true,
                        found: true,
                        restricted: true,
                        customer: {
                            _id: customer._id,
                            name: customer.name,
                            city: customer.city,
                            customerType: customer.customerType,
                            assignedEmployeeName: customer.assignedEmployee.name || 'Another Team Member'
                        },
                        message: `Customer is already registered and assigned to ${customer.assignedEmployee.name || 'another staff member'}.`
                    });
                }
            } else if (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'MANAGER') {
                const managerBranchStr = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId).toString() : '';
                const customerBranchStr = customer.assignedBranch ? (customer.assignedBranch._id || customer.assignedBranch).toString() : '';

                let isMyJurisdiction = false;
                if (managerBranchStr && customerBranchStr && managerBranchStr === customerBranchStr) {
                    isMyJurisdiction = true;
                }
                if (!isMyJurisdiction && customer.assignedEmployee) {
                    const empId = customer.assignedEmployee._id || customer.assignedEmployee;
                    if (String(empId) === String(currentUser._id)) {
                        isMyJurisdiction = true;
                    } else if (mongoose.connection && mongoose.connection.readyState === 1) {
                        try {
                            const emp = await User.findById(empId).select('managerId branchId');
                            if (emp && (String(emp.managerId) === String(currentUser._id) || (managerBranchStr && String(emp.branchId) === managerBranchStr))) {
                                isMyJurisdiction = true;
                            }
                        } catch (e) {}
                    }
                }

                // If customer belongs to a different branch, restrict cross-branch visibility
                if (!isMyJurisdiction && customerBranchStr) {
                    return res.json({
                        success: true,
                        found: true,
                        restricted: true,
                        message: 'Customer belongs to another branch/manager. Cross-branch access is restricted.'
                    });
                }
            }

            const hasFullCrmAccess = AuthorizationService.hasPermission(currentUser, 'crm.customers.view') || AuthorizationService.isPrimarySuperAdmin(currentUser);
            const hasCrmSearch = AuthorizationService.hasPermission(currentUser, 'crm.search.view');

            let customerData;
            if (!hasFullCrmAccess && !hasCrmSearch) {
                // Shared lookup for quotation requests: return minimal necessary fields
                customerData = {
                    _id: customer._id,
                    name: customer.name,
                    mobile: customer.mobile,
                    city: customer.city,
                    district: customer.district,
                    state: customer.state,
                    pincode: customer.pincode,
                    consumerNumber: customer.consumerNumber,
                    discom: customer.discom,
                    customerType: customer.customerType
                };
            } else {
                customerData = {
                    _id: customer._id,
                    name: customer.name,
                    mobile: customer.mobile,
                    alternateMobile: customer.alternateMobile,
                    email: customer.email,
                    address: customer.address,
                    city: customer.city,
                    district: customer.district,
                    state: customer.state,
                    pincode: customer.pincode,
                    consumerNumber: customer.consumerNumber,
                    discom: customer.discom,
                    customerType: customer.customerType,
                    status: customer.status,
                    assignedEmployee: customer.assignedEmployee
                };
            }

            customerData = AuthorizationService.filterSensitiveFields(currentUser, customerData);

            return res.json({
                success: true,
                found: true,
                restricted: false,
                customer: customerData
            });
        } catch (err) {
            console.error('Customer Search Error:', err);
            return res.status(500).json({ success: false, message: 'Server error while searching customer.' });
        }
    }

    /**
     * Create or Get Existing Customer
     */
    static async createCustomer(req, res) {
        try {
            const currentUser = req.session.user;

            // Authorization: Explicit permission required to onboard/create customers
            if (currentUser && Array.isArray(currentUser.permissions) && !AuthorizationService.isPrimarySuperAdmin(currentUser) && !AuthorizationService.hasPermission(currentUser, 'crm.customers.create')) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: Missing permission to onboard or create customer profiles (crm.customers.create).'
                });
            }

            const {
                name,
                mobile,
                alternateMobile,
                email,
                address,
                city,
                district,
                state,
                pincode,
                consumerNumber,
                discom,
                customerType
            } = req.body;

            if (!name || !name.trim() || !mobile || !mobile.trim()) {
                return res.status(400).json({ success: false, message: 'Customer name and primary mobile number are required.' });
            }

            const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);
            if (cleanMobile.length !== 10) {
                return res.status(400).json({ success: false, message: 'Primary mobile must be a valid 10-digit number.' });
            }

            // Check if customer already exists
            let customer = await Customer.findOne({
                mobile: { $regex: cleanMobile + '$' }
            }).populate('assignedEmployee', 'name employeeId mobile email');

            if (customer) {
                // Check requesting user's authorization to access/modify this customer
                if (currentUser.role === 'EMPLOYEE') {
                    const isOwner = customer.assignedEmployee && String(customer.assignedEmployee._id || customer.assignedEmployee) === String(currentUser._id);
                    const isCreator = customer.createdBy && String(customer.createdBy._id || customer.createdBy) === String(currentUser._id);
                    const isUnassigned = !customer.assignedEmployee;

                    if (!isOwner && !isCreator && !isUnassigned) {
                        return res.status(403).json({
                            success: false,
                            restricted: true,
                            message: `Customer is already registered and assigned to another staff member. Access restricted.`,
                            customer: {
                                _id: customer._id,
                                name: customer.name,
                                city: customer.city,
                                customerType: customer.customerType
                            }
                        });
                    }
                } else if (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'MANAGER') {
                    const managerBranchStr = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId).toString() : '';
                    const customerBranchStr = customer.assignedBranch ? (customer.assignedBranch._id || customer.assignedBranch).toString() : '';
                    if (managerBranchStr && customerBranchStr && managerBranchStr !== customerBranchStr) {
                        return res.status(403).json({
                            success: false,
                            restricted: true,
                            message: `Customer belongs to a different branch. Cross-branch customer modification is restricted.`,
                            customer: {
                                _id: customer._id,
                                name: customer.name,
                                city: customer.city,
                                customerType: customer.customerType
                            }
                        });
                    }
                }

                // Authorized update of non-destructive profile fields if blank
                if (!customer.consumerNumber && consumerNumber) customer.consumerNumber = consumerNumber.trim();
                if (!customer.email && email) customer.email = email.trim().toLowerCase();
                if (!customer.address && address) customer.address = address.trim();
                if (!customer.alternateMobile && alternateMobile) customer.alternateMobile = alternateMobile.trim();
                await customer.save();

                const isOwner = customer.assignedEmployee && String(customer.assignedEmployee._id || customer.assignedEmployee) === String(currentUser._id);
                const isCreator = customer.createdBy && String(customer.createdBy._id || customer.createdBy) === String(currentUser._id);

                let existingData = {
                    _id: customer._id,
                    name: customer.name,
                    mobile: customer.mobile,
                    alternateMobile: customer.alternateMobile || '',
                    email: customer.email || '',
                    address: customer.address || '',
                    city: customer.city || 'Raisen',
                    district: customer.district || 'Raisen',
                    state: customer.state || 'Madhya Pradesh',
                    pincode: customer.pincode || '',
                    consumerNumber: customer.consumerNumber || '',
                    discom: customer.discom || 'MPPKVVCL',
                    customerType: customer.customerType || 'RESIDENTIAL',
                    status: customer.status || 'ACTIVE'
                };

                if (!isOwner && !isCreator) {
                    existingData = AuthorizationService.filterSensitiveFields(currentUser, existingData);
                }

                return res.json({
                    success: true,
                    existing: true,
                    customer: existingData,
                    message: 'Existing customer record found and verified.'
                });
            }

            // Create new customer
            customer = new Customer({
                name: name.trim(),
                mobile: `+91 ${cleanMobile}`,
                alternateMobile: alternateMobile ? alternateMobile.trim() : '',
                email: email ? email.trim().toLowerCase() : '',
                address: address ? address.trim() : '',
                city: city ? city.trim() : 'Raisen',
                district: district ? district.trim() : 'Raisen',
                state: state ? state.trim() : 'Madhya Pradesh',
                pincode: pincode ? pincode.trim() : '',
                consumerNumber: consumerNumber ? consumerNumber.trim() : '',
                discom: discom ? discom.trim() : 'MPPKVVCL',
                customerType: customerType || 'RESIDENTIAL',
                status: 'ACTIVE',
                assignedEmployee: currentUser._id,
                assignedBranch: currentUser.branchId || null,
                createdBy: currentUser._id
            });

            await customer.save();

            AuditService.log({
                action: 'CUSTOMER_CREATED',
                user: currentUser._id,
                role: currentUser.role,
                details: { customerId: customer._id, name: customer.name, mobile: customer.mobile }
            });

            const newCustomerData = AuthorizationService.filterSensitiveFields(currentUser, {
                _id: customer._id,
                name: customer.name,
                mobile: customer.mobile,
                alternateMobile: customer.alternateMobile || '',
                email: customer.email || '',
                address: customer.address || '',
                city: customer.city || 'Raisen',
                district: customer.district || 'Raisen',
                state: customer.state || 'Madhya Pradesh',
                pincode: customer.pincode || '',
                consumerNumber: customer.consumerNumber || '',
                discom: customer.discom || 'MPPKVVCL',
                customerType: customer.customerType || 'RESIDENTIAL',
                status: customer.status || 'ACTIVE'
            });

            return res.json({
                success: true,
                existing: false,
                customer: newCustomerData,
                message: 'New customer profile registered successfully.'
            });
        } catch (err) {
            console.error('Create Customer Error:', err);
            return res.status(500).json({ success: false, message: 'Server error while saving customer.' });
        }
    }

    /**
     * Admin Customers Directory View
     */
    static async getCustomersList(req, res) {
        try {
            const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
            const limit = 15;
            const skip = (page - 1) * limit;
            const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
            const cleanSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const conditions = [];
            if (req.session && req.session.user && req.session.user.role !== 'SUPER_ADMIN') {
                if (req.session.user.branchId) {
                    conditions.push({ assignedBranch: req.session.user.branchId });
                }
            }
            if (cleanSearch) {
                conditions.push({
                    $or: [
                        { name: { $regex: cleanSearch, $options: 'i' } },
                        { mobile: { $regex: cleanSearch, $options: 'i' } },
                        { city: { $regex: cleanSearch, $options: 'i' } },
                        { consumerNumber: { $regex: cleanSearch, $options: 'i' } }
                    ]
                });
            }

            const filter = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

            let total = 0;
            let customers = [];
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                total = await Customer.countDocuments(filter);
                customers = await Customer.find(filter)
                    .populate('assignedEmployee', 'name employeeId mobile')
                    .populate('assignedBranch', 'name code')
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();
            }

            res.render('private/admin/customers', {
                title: `Customer Management (CRM) | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: req.session.user,
                currentUser: req.session.user,
                customers,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1
                },
                search,
                activePage: 'admin-customers',
                pageTitle: 'Customer Accounts (CRM)',
                breadcrumbs: [{ label: 'Operations' }, { label: 'Customers' }]
            });
        } catch (err) {
            console.error('Get Customers Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading customers directory.'
            });
        }
    }
}

module.exports = CustomerController;

