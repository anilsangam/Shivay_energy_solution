const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditService = require('../services/auditService');
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
            }

            return res.json({
                success: true,
                found: true,
                restricted: false,
                customer: {
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
                }
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

            const currentUser = req.session.user;

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
            });

            if (customer) {
                // Update non-destructive profile fields if blank
                if (!customer.consumerNumber && consumerNumber) customer.consumerNumber = consumerNumber.trim();
                if (!customer.email && email) customer.email = email.trim().toLowerCase();
                if (!customer.address && address) customer.address = address.trim();
                if (!customer.alternateMobile && alternateMobile) customer.alternateMobile = alternateMobile.trim();
                await customer.save();

                return res.json({
                    success: true,
                    existing: true,
                    customer,
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

            return res.json({
                success: true,
                existing: false,
                customer,
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
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = 15;
            const skip = (page - 1) * limit;
            const search = req.query.search ? req.query.search.trim() : '';

            const filter = {};
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { mobile: { $regex: search, $options: 'i' } },
                    { city: { $regex: search, $options: 'i' } },
                    { consumerNumber: { $regex: search, $options: 'i' } }
                ];
            }

            const total = await Customer.countDocuments(filter);
            const customers = await Customer.find(filter)
                .populate('assignedEmployee', 'name employeeId mobile')
                .populate('assignedBranch', 'name code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

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

