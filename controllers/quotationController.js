const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Customer = require('../models/Customer');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const QuotationStatusHistory = require('../models/QuotationStatusHistory');
const User = require('../models/User');
const QuotationService = require('../services/quotationService');
const UploadService = require('../services/uploadService');
const AuditService = require('../services/auditService');
const AuthorizationService = require('../services/authorizationService');
const companyData = require('../config/company');
const { SOLAR_PACKAGES, EXTRA_MATERIAL_PRESETS, QUOTATION_PRICING_POLICY, evaluatePackagePricing } = require('../config/solarPackages');

/**
 * Safely associates unlinked quotation requests with quotations in-memory.
 * Priority Rules:
 * 1. Exact quotationRequestId matching ALWAYS takes precedence.
 * 2. Already-claimed quotation IDs cannot be re-used (1-to-1 association).
 * 3. Mobile fallback occurs ONLY when unambiguous (exactly 1 unlinked request and 1 unclaimed quotation for that mobile number).
 * 4. Never overwrites existing explicit relationships.
 */
function safelyLinkRequestsAndQuotations(requests, quotations) {
    if (!requests || !quotations) return;
    const claimedQuoteIds = new Set();

    // Mark already-linked quotations as claimed
    for (const r of requests) {
        if (r.linkedQuotation) {
            const qId = String(r.linkedQuotation._id || r.linkedQuotation);
            claimedQuoteIds.add(qId);
        }
    }

    // Pass 1: Strict quotationRequestId match
    for (const r of requests) {
        if (!r.linkedQuotation) {
            const rIdStr = String(r._id);
            const exactQ = quotations.find(q =>
                !claimedQuoteIds.has(String(q._id)) &&
                q.quotationRequestId &&
                String(q.quotationRequestId._id || q.quotationRequestId) === rIdStr
            );
            if (exactQ) {
                r.linkedQuotation = exactQ;
                r.status = 'QUOTATION_PREPARED';
                claimedQuoteIds.add(String(exactQ._id));
            }
        }
    }

    // Pass 2: Unambiguous mobile fallback
    for (const r of requests) {
        if (!r.linkedQuotation && r.customerMobile) {
            const cleanMobile = r.customerMobile.replace(/\D/g, '').slice(-10);
            if (cleanMobile.length === 10) {
                const candidates = quotations.filter(q =>
                    !claimedQuoteIds.has(String(q._id)) &&
                    (!q.quotationRequestId || String(q.quotationRequestId._id || q.quotationRequestId) === String(r._id)) &&
                    q.customerMobile &&
                    q.customerMobile.replace(/\D/g, '').slice(-10) === cleanMobile
                );

                const unlinkedRequestsWithMobile = requests.filter(req =>
                    !req.linkedQuotation &&
                    req.customerMobile &&
                    req.customerMobile.replace(/\D/g, '').slice(-10) === cleanMobile
                );

                if (candidates.length === 1 && unlinkedRequestsWithMobile.length === 1) {
                    const matchQ = candidates[0];
                    r.linkedQuotation = matchQ;
                    r.status = 'QUOTATION_PREPARED';
                    claimedQuoteIds.add(String(matchQ._id));
                }
            }
        }
    }
}

class QuotationController {
    // -------------------------------------------------------------
    // 1. EMPLOYEE: QUOTATION REQUESTS
    // -------------------------------------------------------------
    /**
     * Render Self-Service Solar Grid Package Quotation Generator (Employee / Manager / Admin)
     */
    static async getGeneratePackageQuotationPage(req, res) {
        try {
            const sessionUser = req.session.user;
            const isSuperAdmin = sessionUser.role === 'SUPER_ADMIN';
            const isManager = sessionUser.role === 'MANAGER' || sessionUser.role === 'BRANCH_MANAGER';
            const parentUrl = isSuperAdmin ? '/admin/quotations' : (isManager ? '/manager/quotations' : '/employee/quotations');
            const parentLabel = isSuperAdmin ? 'Quotations' : (isManager ? 'Quotation Requests' : 'My Quotations');

            res.render('private/employee/quotation-generate', {
                title: `Generate Solar Grid Quotation | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                packages: SOLAR_PACKAGES,
                extraPresets: EXTRA_MATERIAL_PRESETS,
                pricingPolicy: QUOTATION_PRICING_POLICY,
                parentUrl,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'employee-quotations-generate',
                pageTitle: 'Generate Client Quotation',
                breadcrumbs: [{ label: parentLabel, url: parentUrl }, { label: 'Generate Quotation' }]
            });
        } catch (err) {
            console.error('Error rendering package quotation generator:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load quotation generator.'
            });
        }
    }

    /**
     * Live Package Pricing, Tax-Included Split & Threshold Preview API
     */
    static previewPackageQuotation(req, res) {
        try {
            const evalResult = evaluatePackagePricing(req.body || {});
            return res.json({ success: true, evaluation: evalResult });
        } catch (err) {
            console.error('Preview Package Quotation Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Unable to evaluate package pricing.' });
        }
    }

    /**
     * Create & Save Package Quotation from Employee / Staff Generator
     * - Auto-approves when price >= minThreshold AND discount <= 3% & <= ₹10,000
     * - Routes to Manager Approval when discount exceeds threshold
     */
    static async postGenerateEmployeeQuotation(req, res) {
        try {
            const sessionUser = req.session.user;
            const body = req.body || {};

            if (!body.customerName || !body.customerName.trim()) {
                return res.status(400).json({ success: false, message: 'Customer full name is required.' });
            }
            if (!body.customerMobile || !body.customerMobile.trim()) {
                return res.status(400).json({ success: false, message: 'Customer mobile number is required.' });
            }

            const cleanMobile = body.customerMobile.replace(/[^0-9]/g, '').slice(-10);
            if (cleanMobile.length !== 10) {
                return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
            }

            let customer = null;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                customer = await Customer.findOne({ mobile: { $regex: cleanMobile + '$' } });
                if (!customer) {
                    const evalTmp = evaluatePackagePricing(body);
                    customer = new Customer({
                        name: body.customerName.trim(),
                        mobile: `+91 ${cleanMobile}`,
                        email: body.customerEmail ? body.customerEmail.trim().toLowerCase() : '',
                        address: body.customerAddress ? body.customerAddress.trim() : '',
                        city: body.city ? body.city.trim() : 'Raisen',
                        district: body.district ? body.district.trim() : 'Raisen',
                        state: body.state ? body.state.trim() : 'Madhya Pradesh',
                        pincode: body.pincode ? body.pincode.trim() : '',
                        consumerNumber: body.consumerNumber ? body.consumerNumber.trim() : '',
                        discom: body.discom ? body.discom.trim() : 'MPPKVVCL',
                        customerType: evalTmp.customerType,
                        status: 'ACTIVE',
                        assignedEmployee: sessionUser._id,
                        assignedBranch: sessionUser.branchId || null,
                        createdBy: sessionUser._id
                    });
                    await customer.save();
                }
            }

            const { quotation, evaluation, autoApproved } = await QuotationService.createEmployeePackageQuotation({
                ...body,
                customerId: customer ? customer._id : null,
                customerMobile: `+91 ${cleanMobile}`
            }, sessionUser);

            const redirectUrl = sessionUser.role === 'SUPER_ADMIN'
                ? '/admin/quotations'
                : (['MANAGER', 'BRANCH_MANAGER'].includes(sessionUser.role) ? '/manager/quotations' : '/employee/quotations');

            return res.json({
                success: true,
                quotationId: quotation._id,
                quotationNumber: quotation.quotationNumber,
                status: quotation.status,
                autoApproved,
                acceptanceToken: quotation.customerResponse ? quotation.customerResponse.acceptanceToken : '',
                quotation: {
                    id: quotation._id,
                    quotationNumber: quotation.quotationNumber,
                    customerName: quotation.customerName,
                    customerMobile: quotation.customerMobile,
                    capacity: quotation.plantCapacityKw,
                    systemType: quotation.systemType,
                    grandTotal: quotation.grandTotal,
                    subsidy: quotation.estimatedSubsidy,
                    netPayable: quotation.netPayableAfterSubsidy,
                    discountPercent: quotation.discountPercent,
                    discountAmount: evaluation.discountAmount,
                    minimumThresholdPrice: quotation.minimumThresholdPrice,
                    requiresManagerApproval: quotation.requiresManagerApproval,
                    approvalTriggerReason: quotation.approvalTriggerReason,
                    token: quotation.customerResponse ? quotation.customerResponse.acceptanceToken : ''
                },
                redirectUrl,
                message: autoApproved
                    ? `Quotation ${quotation.quotationNumber} generated & AUTO-APPROVED! Ready to download PDF and share with the client.`
                    : `Quotation ${quotation.quotationNumber} created and sent for MANAGER APPROVAL because discount exceeds the self-approval threshold.`
            });
        } catch (err) {
            console.error('Generate Employee Quotation Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error generating quotation.' });
        }
    }

    /**
     * Render "New Quotation Request" Form
     */
    static async getNewRequestPage(req, res) {
        try {
            const sessionUser = req.session.user;
            const isSuperAdmin = sessionUser.role === 'SUPER_ADMIN';
            const isManager = sessionUser.role === 'MANAGER' || sessionUser.role === 'BRANCH_MANAGER';

            const activePage = isSuperAdmin ? 'admin-quotations-new' : (isManager ? 'manager-quotations-new' : 'employee-quotations-new');
            const parentUrl = isSuperAdmin ? '/admin/quotations' : (isManager ? '/manager/quotations' : '/employee/quotations');
            const parentLabel = isSuperAdmin ? 'Quotations' : (isManager ? 'Quotation Requests' : 'My Quotations');

            res.render('private/employee/quotation-request-new', {
                title: `New Solar Quotation Request | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                activePage,
                parentUrl,
                csrfToken: req.session ? req.session.csrfToken : '',
                pageTitle: 'New Solar Quotation Request',
                breadcrumbs: [{ label: parentLabel, url: parentUrl }, { label: 'New Request' }]
            });
        } catch (err) {
            console.error('Error rendering new request page:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to load quotation request form.'
            });
        }
    }

    /**
     * Submit Quotation Request
     */
    static async postCreateRequest(req, res) {
        try {
            const sessionUser = req.session.user;
            const body = req.body;

            // Validate Mandatory Fields
            if (!body.customerName || !body.customerName.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer full name is required.'
                });
            }

            if (!body.customerMobile || !body.customerMobile.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer primary mobile number is required.'
                });
            }

            const cleanMobile = body.customerMobile.replace(/[^0-9]/g, '').slice(-10);
            if (cleanMobile.length !== 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid 10-digit mobile number (e.g. 9826012345).'
                });
            }

            if (!body.proposedCapacityKw || parseFloat(body.proposedCapacityKw) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please specify a valid solar capacity in kW (minimum 0.5 kW).'
                });
            }

            // Customer Deduplication: Find or Create Customer
            let customer = null;
            if (mongoose.connection.readyState === 1) {
                customer = await Customer.findOne({ mobile: { $regex: cleanMobile + '$' } });
            }
            if (!customer) {
                customer = new Customer({
                    name: body.customerName.trim(),
                    mobile: `+91 ${cleanMobile}`,
                    alternateMobile: body.customerAlternateMobile ? body.customerAlternateMobile.trim() : '',
                    email: body.customerEmail ? body.customerEmail.trim().toLowerCase() : '',
                    address: body.siteAddress ? body.siteAddress.trim() : '',
                    city: body.city ? body.city.trim() : 'Raisen',
                    district: body.district ? body.district.trim() : 'Raisen',
                    state: body.state ? body.state.trim() : 'Madhya Pradesh',
                    pincode: body.pincode ? body.pincode.trim() : '',
                    consumerNumber: body.consumerNumber ? body.consumerNumber.trim() : '',
                    discom: body.discom ? body.discom.trim() : 'MPPKVVCL',
                    customerType: body.customerType || 'RESIDENTIAL',
                    status: 'ACTIVE',
                    assignedEmployee: sessionUser._id,
                    assignedBranch: sessionUser.branchId || null,
                    createdBy: sessionUser._id
                });
                if (mongoose.connection.readyState === 1) {
                    await customer.save();
                }
            } else {
                // Update optional fields if previously missing
                if (!customer.consumerNumber && body.consumerNumber) customer.consumerNumber = body.consumerNumber.trim();
                if (!customer.address && body.siteAddress) customer.address = body.siteAddress.trim();
                if (!customer.pincode && body.pincode) customer.pincode = body.pincode.trim();
                if (mongoose.connection.readyState === 1) {
                    await customer.save();
                }
            }

            // Secure File Attachments Processing (Cloudinary shivay_energy folder)
            let processedAttachments = [];
            if (body.attachments && Array.isArray(body.attachments)) {
                processedAttachments = await UploadService.processUploads(body.attachments);
            }

            // Parse Equipment rows
            let equipment = [];
            if (Array.isArray(body.equipment)) {
                equipment = body.equipment
                    .filter(e => e && e.itemName && e.itemName.trim())
                    .map(e => ({
                        itemName: e.itemName.trim(),
                        productRef: e.productRef ? e.productRef.trim() : '',
                        quantity: Math.max(1, Number(e.quantity) || 1),
                        specs: e.specs ? e.specs.trim() : '',
                        remarks: e.remarks ? e.remarks.trim() : ''
                    }));
            }

            // If no equipment provided, provide standard default equipment line
            if (equipment.length === 0) {
                const kw = Number(body.proposedCapacityKw) || 3;
                const panelCount = Math.ceil((kw * 1000) / 540);
                equipment.push({
                    itemName: 'Solar PV Modules (Tier-1 Mono PERC)',
                    quantity: panelCount,
                    specs: '540W DCR ALMM Compliant Mono PERC Half-Cut',
                    remarks: 'Central Subsidy Compliant'
                });
                equipment.push({
                    itemName: 'Solar On-Grid Inverter',
                    quantity: 1,
                    specs: `${kw} kW Dual MPPT High Efficiency Inverter`,
                    remarks: 'MPPKVVCL Net-Meter Approved'
                });
                equipment.push({
                    itemName: 'Module Mounting Structure & Balance of System',
                    quantity: 1,
                    specs: 'Hot Dip Galvanized HDG Structure + ACDB/DCDB + Lightning Arrestor',
                    remarks: 'Standard Installation'
                });
            }

            // Create Quotation Request
            const request = await QuotationService.createQuotationRequest({
                customer: customer._id,
                customerName: customer.name,
                customerMobile: customer.mobile,
                customerAlternateMobile: body.customerAlternateMobile || customer.alternateMobile,
                customerEmail: body.customerEmail || customer.email,
                siteAddress: body.siteAddress || customer.address,
                city: body.city || customer.city,
                district: body.district || customer.district,
                state: body.state || customer.state,
                pincode: body.pincode || customer.pincode,
                consumerNumber: body.consumerNumber || customer.consumerNumber,
                discom: body.discom || customer.discom,
                customerType: body.customerType || customer.customerType,
                proposedCapacityKw: Number(body.proposedCapacityKw),
                systemType: body.systemType || 'ON_GRID',
                roofType: body.roofType || 'RCC_FLAT',
                roofAreaSqFt: Number(body.roofAreaSqFt) || 0,
                monthlyElectricityBill: Number(body.monthlyElectricityBill) || 0,
                monthlyUnitsKwh: Number(body.monthlyUnitsKwh) || 0,
                existingSolar: body.existingSolar === true || body.existingSolar === 'true',
                expectedBudget: Number(body.expectedBudget) || 0,
                installationLocation: body.installationLocation || body.siteAddress,
                equipment,
                additionalRequirements: body.additionalRequirements || '',
                employeeNotes: body.employeeNotes || '',
                customerInstructions: body.customerInstructions || '',
                attachments: processedAttachments
            }, sessionUser);

            const redirectUrl = sessionUser.role === 'SUPER_ADMIN'
                ? '/admin/quotations'
                : ((sessionUser.role === 'MANAGER' || sessionUser.role === 'BRANCH_MANAGER')
                    ? '/manager/quotations'
                    : '/employee/quotations');

            return res.json({
                success: true,
                requestNumber: request.requestNumber,
                requestId: request._id,
                redirectUrl,
                message: `Quotation request ${request.requestNumber} submitted successfully!`
            });
        } catch (err) {
            console.error('Create Request Error:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error submitting quotation request.' });
        }
    }

    /**
     * Employee Quotations & Requests Workspace
     */
    static async getEmployeeQuotations(req, res) {
        try {
            const sessionUser = req.session.user;
            const VALID_REQUEST_STATUSES = new Set([
                'ALL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
                'QUOTATION_PREPARED', 'REVISION_REQUESTED', 'RESUBMITTED', 'DRAFT'
            ]);
            const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
            const statusFilter = VALID_REQUEST_STATUSES.has(rawStatus) ? rawStatus : 'ALL';

            const requestQuery = { assignedEmployee: sessionUser._id };
            if (statusFilter !== 'ALL') {
                requestQuery.status = statusFilter;
            }

            const requests = await QuotationRequest.find(requestQuery)
                .populate('customer', 'name mobile city')
                .populate('linkedQuotation')
                .sort({ createdAt: -1 });

            // Calculate Employee KPI metrics
            const allEmpRequests = await QuotationRequest.find({ assignedEmployee: sessionUser._id });
            const empRequestIds = allEmpRequests.map(r => r._id);

            const quotations = await Quotation.find({
                isArchived: { $ne: true },
                $or: [
                    { preparedBy: sessionUser._id },
                    { assignedEmployee: sessionUser._id },
                    { quotationRequestId: { $in: empRequestIds } }
                ]
            })
                .populate('quotationRequestId', 'requestNumber proposedCapacityKw')
                .sort({ createdAt: -1 });

            // Safe in-memory association (exact match priority, claimed ID tracking, unambiguous fallback)
            safelyLinkRequestsAndQuotations(requests, quotations);

            const stats = {
                totalRequests: allEmpRequests.length,
                pendingRequests: allEmpRequests.filter(r => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(r.status)).length,
                revisionRequested: allEmpRequests.filter(r => r.status === 'REVISION_REQUESTED').length,
                approvedQuotations: quotations.filter(q => q.status === 'APPROVED' || q.status === 'SHARED').length,
                acceptedQuotations: quotations.filter(q => q.status === 'CUSTOMER_ACCEPTED').length,
                rejectedQuotations: quotations.filter(q => q.status === 'CUSTOMER_REJECTED').length
            };

            res.render('private/employee/quotations', {
                title: `My Quotation Requests & Proposals | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                requests,
                quotations,
                stats,
                statusFilter,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: 'employee-quotations',
                pageTitle: 'My Solar Quotations & Requests',
                breadcrumbs: [{ label: 'Work Orders' }, { label: 'My Quotations' }]
            });
        } catch (err) {
            console.error('Employee Quotations Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading quotations list.'
            });
        }
    }

    /**
     * View Quotation Request Details
     */
    static async getRequestDetails(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session.user;

            const request = await QuotationRequest.findById(id)
                .populate('customer')
                .populate('assignedEmployee', 'name email mobile employeeId')
                .populate('assignedManager', 'name email mobile')
                .populate('linkedQuotation');

            if (!request) {
                return res.status(404).render('private/errors/403', {
                    title: 'Not Found | Shivay Energy Solutions',
                    message: 'Quotation request not found.'
                });
            }

            // Authorization: Employee can only view their own request
            if (sessionUser.role === 'EMPLOYEE' && String(request.assignedEmployee._id) !== String(sessionUser._id)) {
                return res.status(403).render('private/errors/403', {
                    title: 'Access Denied | Shivay Energy Solutions',
                    message: 'You are not authorized to view this quotation request.'
                });
            }

            // Fetch Status History
            const history = await QuotationStatusHistory.find({ quotationRequest: request._id })
                .populate('changedBy', 'name role')
                .sort({ createdAt: -1 });

            res.render('private/employee/quotation-request-view', {
                title: `Quotation Request ${request.requestNumber} | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                request,
                history,
                csrfToken: req.session ? req.session.csrfToken : '',
                activePage: sessionUser.role === 'EMPLOYEE' ? 'employee-quotations' : (sessionUser.role === 'SUPER_ADMIN' ? 'quotations' : 'manager-quotations'),
                pageTitle: `Request Details: ${request.requestNumber}`,
                breadcrumbs: [{ label: 'Quotations', url: sessionUser.role === 'EMPLOYEE' ? '/employee/quotations' : '/manager/quotations' }, { label: request.requestNumber }]
            });
        } catch (err) {
            console.error('Request Details Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading request details.'
            });
        }
    }

    /**
     * Resubmit Revised Request
     */
    static async postResubmitRequest(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session.user;
            const { proposedCapacityKw, monthlyElectricityBill, additionalRequirements, employeeNotes } = req.body;

            const request = await QuotationRequest.findById(id);
            if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

            if (String(request.assignedEmployee) !== String(sessionUser._id) && sessionUser.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, message: 'Unauthorized to modify this request.' });
            }

            if (request.status !== 'REVISION_REQUESTED' && request.status !== 'DRAFT') {
                return res.status(400).json({ success: false, message: `Cannot resubmit request currently in status "${request.status}".` });
            }

            const updated = await QuotationService.resubmitRequest(
                request,
                {
                    proposedCapacityKw: proposedCapacityKw ? Number(proposedCapacityKw) : undefined,
                    monthlyElectricityBill: monthlyElectricityBill ? Number(monthlyElectricityBill) : undefined,
                    additionalRequirements: additionalRequirements ? additionalRequirements.trim() : undefined,
                    employeeNotes: employeeNotes ? employeeNotes.trim() : 'Employee updated technical parameters and resubmitted for manager review.'
                },
                sessionUser
            );

            return res.json({
                success: true,
                message: `Request ${request.requestNumber} resubmitted successfully!`,
                request: updated
            });
        } catch (err) {
            console.error('Resubmit Request Error:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error resubmitting request.' });
        }
    }

    // -------------------------------------------------------------
    // 2. MANAGER: REQUEST REVIEW & QUOTATION PREPARATION
    // -------------------------------------------------------------
    /**
     * Manager Quotation Requests Dashboard
     */
    static async getManagerQuotations(req, res) {
        try {
            const sessionUser = req.session.user;
            const VALID_REQUEST_STATUSES = new Set([
                'ALL', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
                'QUOTATION_PREPARED', 'REVISION_REQUESTED', 'RESUBMITTED', 'DRAFT'
            ]);
            const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
            const statusFilter = VALID_REQUEST_STATUSES.has(rawStatus) ? rawStatus : 'ALL';

            const rawEmployee = typeof req.query.employee === 'string' ? req.query.employee.trim() : '';
            const employeeFilter = (rawEmployee !== 'ALL' && mongoose.isValidObjectId(rawEmployee)) ? rawEmployee : 'ALL';

            const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
            const cleanSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
            const limit = 15;
            const skip = (page - 1) * limit;

            // Strict Branch isolation for managers (Super Admin sees all)
            const queryConditions = [];
            if (sessionUser.role !== 'SUPER_ADMIN') {
                queryConditions.push({
                    $or: [
                        { assignedManager: sessionUser._id },
                        { branch: sessionUser.branchId ? (sessionUser.branchId._id || sessionUser.branchId) : null }
                    ]
                });
            }

            if (statusFilter !== 'ALL') {
                queryConditions.push({ status: statusFilter });
            }

            if (employeeFilter !== 'ALL') {
                queryConditions.push({ assignedEmployee: employeeFilter });
            }

            if (cleanSearch) {
                queryConditions.push({
                    $or: [
                        { requestNumber: { $regex: cleanSearch, $options: 'i' } },
                        { customerName: { $regex: cleanSearch, $options: 'i' } },
                        { customerMobile: { $regex: cleanSearch, $options: 'i' } }
                    ]
                });
            }

            const query = queryConditions.length > 1
                ? { $and: queryConditions }
                : (queryConditions[0] || {});

            const total = await QuotationRequest.countDocuments(query);
            const requests = await QuotationRequest.find(query)
                .populate('customer', 'name mobile city')
                .populate('assignedEmployee', 'name employeeId mobile')
                .populate('linkedQuotation', 'quotationNumber status grandTotal')
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit);

            // Fetch team employees for the filter dropdown
            const teamEmployees = sessionUser.role === 'SUPER_ADMIN'
                ? await User.find({ role: 'EMPLOYEE', status: 'ACTIVE' }, 'name employeeId')
                : await User.find({ managerId: sessionUser._id, status: 'ACTIVE' }, 'name employeeId');

            // Calculate Manager KPI metrics strictly scoped to branch
            const allBranchRequests = await QuotationRequest.find(sessionUser.role === 'SUPER_ADMIN' ? {} : {
                $or: [{ assignedManager: sessionUser._id }, { branch: sessionUser.branchId }]
            });

            const allBranchQuotes = await Quotation.find(sessionUser.role === 'SUPER_ADMIN' ? { isArchived: { $ne: true } } : {
                branch: sessionUser.branchId,
                isArchived: { $ne: true }
            })
                .populate('preparedBy', 'name employeeId role')
                .populate('approvedBy', 'name role')
                .populate('assignedEmployee', 'name employeeId role')
                .populate({ path: 'quotationRequestId', select: 'requestNumber assignedEmployee', populate: { path: 'assignedEmployee', select: 'name employeeId' } })
                .sort({ createdAt: -1 });

            // Safe in-memory association (exact match priority, claimed ID tracking, unambiguous fallback)
            safelyLinkRequestsAndQuotations(requests, allBranchQuotes);

            const stats = {
                totalRequests: allBranchRequests.length,
                pendingReviews: allBranchRequests.filter(r => ['SUBMITTED', 'RESUBMITTED'].includes(r.status)).length,
                inRevision: allBranchRequests.filter(r => r.status === 'REVISION_REQUESTED').length,
                pendingApprovals: allBranchQuotes.filter(q => q.status === 'PENDING_APPROVAL').length,
                approvedCount: allBranchQuotes.filter(q => q.status === 'APPROVED' || q.status === 'SHARED' || q.status === 'CUSTOMER_ACCEPTED').length,
                approvedValue: allBranchQuotes
                    .filter(q => q.status === 'APPROVED' || q.status === 'SHARED' || q.status === 'CUSTOMER_ACCEPTED')
                    .reduce((sum, q) => sum + (q.grandTotal || 0), 0)
            };

            res.render('private/manager/quotations', {
                title: `Team Quotation Requests & Approvals | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                requests,
                quotations: allBranchQuotes,
                teamEmployees,
                stats,
                statusFilter,
                employeeFilter,
                search,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1
                },
                activePage: 'manager-quotations',
                pageTitle: 'Team Quotation Requests',
                breadcrumbs: [{ label: 'Operations' }, { label: 'Quotation Requests' }]
            });
        } catch (err) {
            console.error('Manager Quotations Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading team quotation requests.'
            });
        }
    }

    /**
     * Update Request Status (Review, Revision, Reject)
     */
    static async postUpdateRequestStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, reason } = req.body;
            const sessionUser = req.session ? req.session.user : null;

            if (!sessionUser) {
                return res.status(401).json({ success: false, message: 'Authentication required.' });
            }

            const normalized = (status || '').toUpperCase();
            if (normalized === 'APPROVED' || normalized === 'APPROVE') {
                if (!AuthorizationService.isPrimarySuperAdmin(sessionUser) && !AuthorizationService.hasPermission(sessionUser, 'quotations.approval.approve')) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden: Missing permission to approve quotations (quotations.approval.approve).'
                    });
                }
            } else if (normalized === 'REJECTED') {
                if (!AuthorizationService.isPrimarySuperAdmin(sessionUser) && !AuthorizationService.hasPermission(sessionUser, 'quotations.requests.reject')) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden: Missing permission to reject quotation requests (quotations.requests.reject).'
                    });
                }
            } else {
                if (!AuthorizationService.isPrimarySuperAdmin(sessionUser) && 
                    !AuthorizationService.hasPermission(sessionUser, 'quotations.requests.edit') &&
                    !AuthorizationService.hasPermission(sessionUser, 'quotations.requests.reject')) {
                    return res.status(403).json({
                        success: false,
                        message: 'Forbidden: Missing permission to update quotation request status.'
                    });
                }
            }

            const updated = await QuotationService.updateRequestStatus(id, status, reason, sessionUser);

            return res.json({
                success: true,
                message: `Quotation request updated to "${status.replace('_', ' ')}".`,
                request: updated
            });
        } catch (err) {
            console.error('Update Request Status Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error updating request status.' });
        }
    }

    /**
     * Render Quotation Preparation Engine
     */
    static async getPrepareQuotationPage(req, res) {
        try {
            const { requestId } = req.params;
            const sessionUser = req.session.user;

            const request = await QuotationRequest.findById(requestId).populate('customer');
            if (!request) {
                return res.status(404).render('private/errors/403', {
                    title: 'Not Found | Shivay Energy Solutions',
                    message: 'Quotation request not found.'
                });
            }

            // Check if revising an existing quotation (by quotationId query or linkedQuotation)
            let existingQuotation = null;
            const quoteId = req.query.quotationId || (request.linkedQuotation ? (request.linkedQuotation._id || request.linkedQuotation) : null);
            if (quoteId && mongoose.isValidObjectId(quoteId)) {
                existingQuotation = await Quotation.findById(quoteId).lean();
            }

            // If existing quotation exists and has line items, load them for revision!
            const kw = (existingQuotation && existingQuotation.plantCapacityKw) || request.proposedCapacityKw || 3;
            let initialLineItems = [];
            if (existingQuotation && existingQuotation.lineItems && existingQuotation.lineItems.length > 0) {
                initialLineItems = existingQuotation.lineItems;
            } else {
                const panelCount = Math.ceil((kw * 1000) / 540);
                initialLineItems = [
                    {
                        description: `Tier-1 Mono PERC DCR Solar PV Modules (${panelCount} x 540W)`,
                        sku: 'SES-MOD-540W',
                        quantity: panelCount,
                        unit: 'Nos',
                        unitPrice: 11000,
                        discount: 0,
                        taxableAmount: panelCount * 11000,
                        gstRate: 12,
                        lineTotal: Number((panelCount * 11000 * 1.12).toFixed(2))
                    },
                    {
                        description: `${kw} kW On-Grid Dual MPPT Solar Inverter (IP65)`,
                        sku: 'SES-INV-GRID',
                        quantity: 1,
                        unit: 'Set',
                        unitPrice: kw <= 3 ? 28000 : 42000,
                        discount: 0,
                        taxableAmount: kw <= 3 ? 28000 : 42000,
                        gstRate: 12,
                        lineTotal: Number(((kw <= 3 ? 28000 : 42000) * 1.12).toFixed(2))
                    },
                    {
                        description: `HDG Elevated Module Mounting Structure & Electrical BoS Kit`,
                        sku: 'SES-BOS-STR',
                        quantity: 1,
                        unit: 'Set',
                        unitPrice: kw * 5000,
                        discount: 0,
                        taxableAmount: kw * 5000,
                        gstRate: 12,
                        lineTotal: Number((kw * 5000 * 1.12).toFixed(2))
                    },
                    {
                        description: `Turnkey Installation, Testing, Commissioning & Net Metering Liaison`,
                        sku: 'SES-SRV-EPC',
                        quantity: 1,
                        unit: 'Job',
                        unitPrice: kw * 4000,
                        discount: 0,
                        taxableAmount: kw * 4000,
                        gstRate: 12,
                        lineTotal: Number((kw * 4000 * 1.12).toFixed(2))
                    }
                ];
            }

            const previewFinancials = QuotationService.calculateFinancials({
                lineItems: initialLineItems,
                plantCapacityKw: kw,
                customerType: request.customerType,
                customerState: request.state,
                specialDiscount: (existingQuotation && existingQuotation.specialDiscount) || 0
            });

            res.render('private/manager/quotation-prepare', {
                title: `${existingQuotation ? 'Revise' : 'Prepare'} Quotation for ${request.customerName} | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                request,
                existingQuotation,
                initialLineItems,
                previewFinancials,
                activePage: 'manager-quotations',
                pageTitle: existingQuotation ? `Revise Quotation (v${(existingQuotation.version || 1) + 1})` : 'Quotation Engine & Pricing',
                breadcrumbs: [
                    { label: 'Requests', url: '/manager/quotations' },
                    { label: request.requestNumber, url: `/manager/quotations/${request._id}` },
                    { label: existingQuotation ? 'Revise Quotation' : 'Prepare Quotation' }
                ]
            });
        } catch (err) {
            console.error('Prepare Quotation Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error opening quotation preparation builder.'
            });
        }
    }

    /**
     * Edit / Revise an existing quotation directly
     */
    static async getEditQuotationPage(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session.user;

            const quotation = await Quotation.findById(id).lean();
            if (!quotation || quotation.isArchived) {
                return res.status(404).render('private/errors/403', {
                    title: 'Not Found | Shivay Energy Solutions',
                    message: 'Quotation not found or has been archived.'
                });
            }

            if (quotation.status === 'CUSTOMER_ACCEPTED') {
                return res.status(400).render('private/errors/403', {
                    title: 'Locked Proposal | Shivay Energy Solutions',
                    message: 'This quotation has already been accepted by the client and cannot be revised. Phase 3 project execution is active.'
                });
            }

            // Check Branch Isolation for Managers
            if (sessionUser.role !== 'SUPER_ADMIN' && quotation.branch && sessionUser.branchId) {
                if (String(quotation.branch) !== String(sessionUser.branchId._id || sessionUser.branchId)) {
                    return res.status(403).render('private/errors/403', {
                        title: 'Forbidden | Shivay Energy Solutions',
                        message: 'You can only revise quotations belonging to your branch.'
                    });
                }
            }

            // If linked to a QuotationRequest, redirect to prepare page with quotationId param
            if (quotation.quotationRequestId) {
                const base = sessionUser.role === 'SUPER_ADMIN' ? '/admin/quotations/prepare/' : '/manager/quotations/prepare/';
                return res.redirect(`${base}${quotation.quotationRequestId}?quotationId=${quotation._id}`);
            }

            // Standalone quotation mock request for the prepare builder
            const mockRequest = {
                _id: null,
                requestNumber: quotation.quotationNumber,
                customerName: quotation.customerName,
                customerMobile: quotation.customerMobile,
                siteAddress: quotation.customerAddress,
                city: quotation.city || 'Raisen',
                district: quotation.district || 'Raisen',
                state: quotation.state || 'Madhya Pradesh',
                pincode: quotation.pincode || '',
                consumerNumber: quotation.consumerNumber || '',
                discom: quotation.discom || 'MPPKVVCL',
                customerType: 'RESIDENTIAL',
                proposedCapacityKw: quotation.plantCapacityKw,
                systemType: quotation.systemType || 'ON_GRID',
                linkedQuotation: quotation._id
            };

            const previewFinancials = QuotationService.calculateFinancials({
                lineItems: quotation.lineItems,
                plantCapacityKw: quotation.plantCapacityKw,
                customerType: 'RESIDENTIAL',
                customerState: quotation.state || 'Madhya Pradesh',
                specialDiscount: quotation.specialDiscount || 0
            });

            res.render('private/manager/quotation-prepare', {
                title: `Revise Quotation ${quotation.quotationNumber} | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                request: mockRequest,
                existingQuotation: quotation,
                initialLineItems: quotation.lineItems,
                previewFinancials,
                activePage: sessionUser.role === 'SUPER_ADMIN' ? 'quotations' : 'manager-quotations',
                pageTitle: `Revise Quotation ${quotation.quotationNumber} (v${(quotation.version || 1) + 1})`,
                breadcrumbs: [
                    { label: 'Quotations', url: sessionUser.role === 'SUPER_ADMIN' ? '/admin/quotations' : '/manager/quotations' },
                    { label: quotation.quotationNumber, url: `${sessionUser.role === 'SUPER_ADMIN' ? '/admin/quotations/' : '/manager/quotations/'}${quotation._id}` },
                    { label: 'Revise' }
                ]
            });
        } catch (err) {
            console.error('Edit quotation page error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Unable to open quotation revision page.'
            });
        }
    }

    /**
     * Archive a quotation (Soft-archive only - strict deletion prohibition)
     */
    static async postArchiveQuotation(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session.user;
            const archived = await QuotationService.archiveQuotation(id, sessionUser);
            return res.json({
                success: true,
                message: `Quotation ${archived.quotationNumber} archived successfully. Records are safely preserved in the database.`,
                quotation: archived
            });
        } catch (err) {
            console.error('Archive Quotation Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error archiving quotation.' });
        }
    }

    /**
     * Live Preview Pricing API (Calculates Authoritative Financials via Ajax)
     */
    static previewFinancials(req, res) {
        try {
            let financials = QuotationService.calculateFinancials(req.body);
            if (req.session && req.session.user) {
                financials = AuthorizationService.filterSensitiveFields(req.session.user, financials);
            }
            return res.json({ success: true, financials });
        } catch (err) {
            console.error('Preview Financials Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Save Prepared Quotation (Status: PENDING_APPROVAL)
     */
    static async postSavePreparedQuotation(req, res) {
        try {
            const sessionUser = req.session.user;
            const body = req.body;

            if (!body.customerName || !body.plantCapacityKw || !body.lineItems || body.lineItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer name, kW capacity, and at least one line item are required.'
                });
            }

            const quotation = await QuotationService.prepareQuotation(body, sessionUser);

            return res.json({
                success: true,
                quotationNumber: quotation.quotationNumber,
                quotationId: quotation._id,
                message: `Quotation ${quotation.quotationNumber} prepared successfully and routed for authorization!`
            });
        } catch (err) {
            console.error('Save Prepared Quotation Error:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error saving quotation.' });
        }
    }

    /**
     * Approve Quotation (Enforces Maker-Checker separation)
     */
    static async postApproveQuotation(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;
            const sessionUser = req.session.user;

            const approved = await QuotationService.approveQuotation(id, sessionUser, comments);

            return res.json({
                success: true,
                message: `Quotation ${approved.quotationNumber} has been APPROVED! Official PDF is now available.`,
                quotation: approved
            });
        } catch (err) {
            console.error('Approve Quotation Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error approving quotation.' });
        }
    }

    /**
     * Reject Quotation
     */
    static async postRejectQuotation(req, res) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const sessionUser = req.session.user;

            const rejected = await QuotationService.rejectQuotation(id, sessionUser, reason);

            return res.json({
                success: true,
                message: `Quotation ${rejected.quotationNumber} has been rejected.`,
                quotation: rejected
            });
        } catch (err) {
            console.error('Reject Quotation Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error rejecting quotation.' });
        }
    }

    /**
     * Quotation Details View (with Versioning, Itemized Table, Customer Response)
     */
    static async getQuotationDetails(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session.user;

            const quotation = await Quotation.findById(id)
                .populate('customerId')
                .populate('quotationRequestId')
                .populate('preparedBy', 'name email mobile employeeId role')
                .populate('approvedBy', 'name email mobile role')
                .populate('previousVersion');

            if (!quotation) {
                return res.status(404).render('private/errors/403', {
                    title: 'Not Found | Shivay Energy Solutions',
                    message: 'Quotation not found.'
                });
            }

            // Authorization
            if (sessionUser.role === 'EMPLOYEE') {
                const isPreparer = quotation.preparedBy && String(quotation.preparedBy._id || quotation.preparedBy) === String(sessionUser._id);
                const isAssignedEmp = quotation.assignedEmployee && String(quotation.assignedEmployee._id || quotation.assignedEmployee) === String(sessionUser._id);
                if (!isPreparer && !isAssignedEmp) {
                    return res.status(403).render('private/errors/403', {
                        title: 'Access Denied | Shivay Energy Solutions',
                        message: 'You are not authorized to view this quotation.'
                    });
                }
            }

            // Fetch History Trail
            const history = await QuotationStatusHistory.find({ quotation: quotation._id })
                .populate('changedBy', 'name role')
                .sort({ createdAt: -1 });

            if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) || req.isJson) {
                const quoteObj = quotation.toObject ? quotation.toObject() : quotation;
                const sanitizedQuotation = AuthorizationService.filterSensitiveFields(sessionUser, quoteObj);
                return res.json({ success: true, quotation: sanitizedQuotation, history });
            }

            // Generate WhatsApp Sharing Text
            const acceptUrl = `${req.protocol}://${req.get('host')}/quotation/accept/${quotation.customerResponse.acceptanceToken}`;
            const whatsappText = encodeURIComponent(
                `Namaste ${quotation.customerName} ji! Greetings from Shivay Energy Solutions.\n\n` +
                `Your official rooftop solar quotation *${quotation.quotationNumber}* (${quotation.plantCapacityKw} kW) is ready!\n\n` +
                `⚡ Gross Cost: ₹${quotation.grandTotal.toLocaleString('en-IN')}\n` +
                `🎁 PM Surya Ghar Subsidy: ₹${quotation.estimatedSubsidy.toLocaleString('en-IN')}\n` +
                `✅ Net Investment: *₹${quotation.netPayableAfterSubsidy.toLocaleString('en-IN')}*\n\n` +
                `View proposal details & confirm your approval online here:\n${acceptUrl}\n\n` +
                `For any queries, please call us at ${companyData.company.contact.phone}.`
            );

            res.render('private/admin/quotation-view', {
                title: `Quotation ${quotation.quotationNumber} | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                quotation,
                history,
                whatsappText,
                acceptUrl,
                activePage: sessionUser.role === 'EMPLOYEE' ? 'employee-quotations' : (sessionUser.role === 'SUPER_ADMIN' ? 'quotations' : 'manager-quotations'),
                pageTitle: `Quotation: ${quotation.quotationNumber}`,
                breadcrumbs: [
                    { label: 'Quotations', url: sessionUser.role === 'EMPLOYEE' ? '/employee/quotations' : '/manager/quotations' },
                    { label: quotation.quotationNumber }
                ]
            });
        } catch (err) {
            console.error('Quotation Details Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading quotation details.'
            });
        }
    }

    /**
     * Print-Ready High Resolution Quotation Document (A4 Letterhead)
     */
    static async getQuotationDocument(req, res) {
        try {
            const { id } = req.params;
            const sessionUser = req.session ? req.session.user : null;

            const quotation = await Quotation.findById(id)
                .populate('customerId')
                .populate('preparedBy', 'name email mobile employeeId')
                .populate('approvedBy', 'name email mobile role');

            if (!quotation) {
                return res.status(404).render('private/errors/403', {
                    title: 'Document Not Found | Shivay Energy Solutions',
                    message: 'Requested quotation document was not found.'
                });
            }

            // Authorization: If accessed via internal app, verify session role
            if (sessionUser) {
                if (sessionUser.role === 'EMPLOYEE') {
                    const isPreparer = quotation.preparedBy && String(quotation.preparedBy._id || quotation.preparedBy) === String(sessionUser._id);
                    const isAssigned = quotation.assignedEmployee && String(quotation.assignedEmployee._id || quotation.assignedEmployee) === String(sessionUser._id);
                    const isApprovedState = ['APPROVED', 'SHARED', 'CUSTOMER_ACCEPTED'].includes(quotation.status);
                    if (!isPreparer && !isAssigned && !isApprovedState) {
                        return res.status(403).render('private/errors/403', {
                            title: 'Access Denied',
                            message: 'Unauthorized access to quotation document.'
                        });
                    }
                }
            }

            const isUnapprovedPreview = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED', 'ARCHIVED'].includes(quotation.status);

            res.render('private/admin/quotation-document', {
                title: `Quotation Document - ${quotation.quotationNumber}`,
                company: companyData.company,
                quotation,
                isUnapprovedPreview,
                autoPrint: req.query.print === 'true'
            });
        } catch (err) {
            console.error('Quotation Document Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Document Error',
                message: 'Error rendering quotation document.'
            });
        }
    }

    /**
     * Record Customer Response (Accepted / Rejected)
     */
    static async postCustomerResponse(req, res) {
        try {
            const { id } = req.params;
            const { status, remarks } = req.body;
            const sessionUser = req.session.user;

            const updated = await QuotationService.recordCustomerResponse(id, status, remarks, sessionUser);

            return res.json({
                success: true,
                message: `Customer response recorded as "${status}". Ready for Phase 3 Project creation.`,
                quotation: updated
            });
        } catch (err) {
            console.error('Customer Response Error:', err);
            return res.status(400).json({ success: false, message: err.message || 'Error recording customer response.' });
        }
    }

    /**
     * Secure File Attachment Serving with Object-Level Authorization & Signed URLs
     */
    static async serveAttachment(req, res) {
        try {
            const sessionUser = req.session ? req.session.user : null;
            if (!sessionUser) {
                return res.status(401).render('private/errors/403', {
                    title: 'Authentication Required',
                    message: 'Please sign in to access confidential attachment documents.'
                });
            }

            const { filename } = req.params;
            const fileId = filename || req.params.fileId;
            const cleanFileId = typeof fileId === 'string' ? fileId.trim() : '';

            if (!cleanFileId) {
                return res.status(400).send('Attachment identifier is required.');
            }

            // Path Traversal & Safe Filename Validation: reject traversal patterns and non-whitelisted characters
            if (cleanFileId.includes('..') || cleanFileId.includes('/') || cleanFileId.includes('\\') || /[\0\r\n]/.test(cleanFileId) || !/^[a-zA-Z0-9_\-\.]+$/.test(cleanFileId)) {
                return res.status(400).render('private/errors/403', {
                    title: 'Invalid Request',
                    message: 'Security Violation: Path traversal or invalid characters detected in document identifier.',
                    currentUser: sessionUser
                });
            }

            let reqDoc = null;
            const QuotationRequest = require('../models/QuotationRequest');

            if (mongoose.connection.readyState === 1) {
                reqDoc = await QuotationRequest.findOne({
                    $or: [
                        { 'attachments.fileId': cleanFileId },
                        { 'attachments.filename': cleanFileId },
                        { 'attachments.path': new RegExp(cleanFileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
                    ]
                });
            } else if (QuotationRequest && typeof QuotationRequest.findOne === 'function') {
                reqDoc = await QuotationRequest.findOne({
                    $or: [
                        { 'attachments.fileId': cleanFileId },
                        { 'attachments.filename': cleanFileId }
                    ]
                });
            }

            if (reqDoc) {
                // Object-Level Authorization Check for Employees
                if (sessionUser.role === 'EMPLOYEE') {
                    const isAssigned = reqDoc.assignedEmployee && String(reqDoc.assignedEmployee._id || reqDoc.assignedEmployee) === String(sessionUser._id);
                    const isCreator = reqDoc.createdBy && String(reqDoc.createdBy._id || reqDoc.createdBy) === String(sessionUser._id);

                    if (!isAssigned && !isCreator && !AuthorizationService.isPrimarySuperAdmin(sessionUser)) {
                        AuditService.log({
                            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                            user: sessionUser._id,
                            role: sessionUser.role,
                            targetResource: `/attachments/${cleanFileId}`,
                            details: { reason: 'Employee attempted to download attachment of another staff member\'s request', requestId: reqDoc._id }
                        });
                        return res.status(403).render('private/errors/403', {
                            title: 'Access Denied | Shivay Energy Solutions',
                            message: 'HTTP 403 Forbidden: You do not possess permission to access attachments from another staff member\'s quotation request.',
                            currentUser: sessionUser
                        });
                    }
                } else if (sessionUser.role === 'BRANCH_MANAGER' || sessionUser.role === 'MANAGER') {
                    // Branch Isolation Check for Branch Managers
                    if (reqDoc.branch && !AuthorizationService.canAccessBranch(sessionUser, reqDoc.branch)) {
                        AuditService.log({
                            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                            user: sessionUser._id,
                            role: sessionUser.role,
                            targetResource: `/attachments/${cleanFileId}`,
                            details: { reason: 'Cross-branch quotation attachment access prohibited', requestId: reqDoc._id }
                        });
                        return res.status(403).render('private/errors/403', {
                            title: 'Access Denied | Shivay Energy Solutions',
                            message: 'HTTP 403 Forbidden: You cannot access quotation attachments belonging to another branch.',
                            currentUser: sessionUser
                        });
                    }
                }

                    const att = reqDoc.attachments.find(a =>
                        a.fileId === cleanFileId ||
                        a.filename === cleanFileId ||
                        (a.path && a.path.includes(cleanFileId))
                    );

                    if (att) {
                        const { generateSignedAssetUrl } = require('../config/cloudinary');
                        const isImage = att.mimeType && att.mimeType.startsWith('image/');
                        const signedUrl = att.cloudinaryPublicId
                            ? generateSignedAssetUrl(att.cloudinaryPublicId, { resourceType: isImage ? 'image' : 'raw' })
                            : (att.cloudinaryUrl || att.path);

                        if (signedUrl) {
                            return res.redirect(signedUrl);
                        }
                    }
                }

            return res.status(404).render('public-site/404', {
                title: 'Attachment Not Found',
                message: 'The requested document attachment could not be located in secure cloud storage.',
                company: companyData.company
            });
        } catch (err) {
            console.error('Serve Attachment Error:', err);
            return res.status(500).send('Error serving file.');
        }
    }

    // -------------------------------------------------------------
    // 3. PUBLIC CUSTOMER ACCEPTANCE PORTAL (CRYPTO TOKEN GATED)
    // -------------------------------------------------------------
    /**
     * Public Quotation Acceptance View
     */
    static async getPublicAcceptancePage(req, res) {
        try {
            const { token } = req.params;
            if (!token || token.length < 20) {
                return res.status(400).render('public-site/404', {
                    title: 'Invalid Link | Shivay Energy Solutions',
                    data: companyData
                });
            }

            const quotation = await Quotation.findOne({ 'customerResponse.acceptanceToken': token })
                .populate('preparedBy', 'name mobile email');

            if (!quotation) {
                return res.status(404).render('public-site/404', {
                    title: 'Quotation Link Expired | Shivay Energy Solutions',
                    data: companyData
                });
            }

            if (['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED', 'ARCHIVED'].includes(quotation.status)) {
                return res.status(403).render('public-site/404', {
                    title: 'Quotation Awaiting Approval | Shivay Energy Solutions',
                    data: companyData,
                    message: 'This quotation is pending internal approval and is not yet active for client sharing.'
                });
            }

            const isExpired = quotation.customerResponse.tokenExpiresAt && quotation.customerResponse.tokenExpiresAt < new Date();

            res.render('public-site/quotation-accept', {
                title: `Solar Proposal ${quotation.quotationNumber} | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                quotation,
                isExpired,
                token
            });
        } catch (err) {
            console.error('Public Acceptance View Error:', err);
            res.status(500).send('Error loading quotation proposal.');
        }
    }

    /**
     * Process Public Customer Acceptance Submission
     */
    static async postPublicAcceptance(req, res) {
        try {
            const { token } = req.params;
            const { response, remarks } = req.body;

            if (response !== 'ACCEPTED' && response !== 'REJECTED') {
                return res.status(400).json({ success: false, message: 'Response must be ACCEPTED or REJECTED.' });
            }

            const quotation = await Quotation.findOne({ 'customerResponse.acceptanceToken': token });
            if (!quotation) {
                return res.status(404).json({ success: false, message: 'Invalid or expired acceptance token.' });
            }

            if (['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED', 'ARCHIVED'].includes(quotation.status)) {
                return res.status(403).json({ success: false, message: 'This quotation is awaiting management approval and cannot be accepted yet.' });
            }

            if (quotation.customerResponse.tokenExpiresAt && quotation.customerResponse.tokenExpiresAt < new Date()) {
                return res.status(400).json({ success: false, message: 'This proposal link has expired. Contact Shivay Energy.' });
            }

            await QuotationService.recordCustomerResponse(quotation._id, response, remarks || 'Submitted via online portal link.');

            return res.json({
                success: true,
                status: response,
                message: response === 'ACCEPTED'
                    ? 'Thank you! Your quotation acceptance has been recorded. Our team will contact you for Phase 3 installation scheduling.'
                    : 'Your response has been noted. A representative will contact you to discuss any adjustments.'
            });
        } catch (err) {
            console.error('Public Acceptance Submit Error:', err);
            return res.status(500).json({ success: false, message: err.message || 'Error submitting response.' });
        }
    }

    // -------------------------------------------------------------
    // 4. SUPER ADMIN: ALL QUOTATIONS & APPROVALS
    // -------------------------------------------------------------
    static async getAdminQuotations(req, res) {
        try {
            const sessionUser = req.session.user;
            const VALID_QUOTATION_STATUSES = new Set([
                'ALL', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
                'SHARED', 'CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED', 'EXPIRED', 'SUPERSEDED'
            ]);
            const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
            const statusFilter = VALID_QUOTATION_STATUSES.has(rawStatus) ? rawStatus : 'ALL';

            const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
            const cleanSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
            const limit = 20;
            const skip = (page - 1) * limit;

            const conditions = [{ isArchived: { $ne: true } }];
            if (['MANAGER', 'BRANCH_MANAGER'].includes(sessionUser.role)) {
                if (sessionUser.branchId) {
                    conditions.push({
                        $or: [
                            { branch: sessionUser.branchId },
                            { preparedBy: sessionUser._id }
                        ]
                    });
                } else {
                    conditions.push({ preparedBy: sessionUser._id });
                }
            }

            if (statusFilter !== 'ALL') {
                conditions.push({ status: statusFilter });
            }
            if (cleanSearch) {
                conditions.push({
                    $or: [
                        { quotationNumber: { $regex: cleanSearch, $options: 'i' } },
                        { customerName: { $regex: cleanSearch, $options: 'i' } },
                        { customerMobile: { $regex: cleanSearch, $options: 'i' } }
                    ]
                });
            }

            const query = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

            const total = await Quotation.countDocuments(query);
            const quotations = await Quotation.find(query)
                .populate('preparedBy', 'name employeeId role')
                .populate('approvedBy', 'name role')
                .populate('assignedEmployee', 'name employeeId role')
                .populate({ path: 'quotationRequestId', select: 'requestNumber assignedEmployee', populate: { path: 'assignedEmployee', select: 'name employeeId' } })
                .populate('branch', 'name code')
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit);

            const allQuotesConditions = [{ isArchived: { $ne: true } }];
            if (['MANAGER', 'BRANCH_MANAGER'].includes(sessionUser.role)) {
                if (sessionUser.branchId) {
                    allQuotesConditions.push({
                        $or: [
                            { branch: sessionUser.branchId },
                            { preparedBy: sessionUser._id }
                        ]
                    });
                } else {
                    allQuotesConditions.push({ preparedBy: sessionUser._id });
                }
            }
            const allQuotesQuery = allQuotesConditions.length > 1 ? { $and: allQuotesConditions } : allQuotesConditions[0];

            const allQuotes = await Quotation.find(allQuotesQuery)
                .select('_id quotationNumber customerMobile quotationRequestId assignedEmployee status grandTotal isArchived branch preparedBy approvedBy')
                .populate('preparedBy', 'name employeeId role')
                .populate('approvedBy', 'name role')
                .populate('assignedEmployee', 'name employeeId role')
                .populate({ path: 'quotationRequestId', select: 'requestNumber assignedEmployee', populate: { path: 'assignedEmployee', select: 'name employeeId' } })
                .lean();

            const reqConditions = [];
            if (['MANAGER', 'BRANCH_MANAGER'].includes(sessionUser.role)) {
                if (sessionUser.branchId) {
                    reqConditions.push({
                        $or: [
                            { branch: sessionUser.branchId },
                            { assignedManager: sessionUser._id }
                        ]
                    });
                } else {
                    reqConditions.push({ assignedManager: sessionUser._id });
                }
            }
            const reqQuery = reqConditions.length > 0 ? (reqConditions.length > 1 ? { $and: reqConditions } : reqConditions[0]) : {};

            const allRequests = await QuotationRequest.find(reqQuery)
                .select('requestNumber customer customerName customerMobile proposedCapacityKw systemType status assignedEmployee linkedQuotation attachments createdAt')
                .populate('customer', 'name mobile city')
                .populate('assignedEmployee', 'name employeeId mobile')
                .populate('linkedQuotation', '_id quotationNumber')
                .sort({ createdAt: -1 });

            // Safe in-memory association (exact match priority, claimed ID tracking, unambiguous fallback)
            safelyLinkRequestsAndQuotations(allRequests, allQuotes);

            const stats = {
                totalRequests: allRequests.length,
                pendingApprovals: allQuotes.filter(q => q.status === 'PENDING_APPROVAL').length,
                approvedCount: allQuotes.filter(q => ['APPROVED', 'SHARED', 'CUSTOMER_ACCEPTED'].includes(q.status)).length,
                acceptedCount: allQuotes.filter(q => q.status === 'CUSTOMER_ACCEPTED').length,
                totalQuotationValue: allQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0),
                approvedQuotationValue: allQuotes
                    .filter(q => ['APPROVED', 'SHARED', 'CUSTOMER_ACCEPTED'].includes(q.status))
                    .reduce((sum, q) => sum + (q.grandTotal || 0), 0)
            };

            res.render('private/admin/quotations', {
                title: `Company-Wide Quotation Management | ${companyData.company.name}`,
                company: companyData.company,
                data: companyData,
                user: sessionUser,
                currentUser: sessionUser,
                quotations,
                requests: allRequests.slice(0, 20),
                stats,
                statusFilter,
                search,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1
                },
                activePage: 'quotations',
                pageTitle: 'Quotation Management & Approvals',
                breadcrumbs: [{ label: 'Executive' }, { label: 'Quotations' }]
            });
        } catch (err) {
            console.error('Admin Quotations Error:', err);
            res.status(500).render('private/errors/403', {
                title: 'Error | Shivay Energy Solutions',
                message: 'Error loading company quotations.'
            });
        }
    }

    /**
     * Maintenance / Migration utility to persist unlinked quotation pairs (callable on demand)
     */
    static async syncLegacyUnlinkedPairs() {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return { synced: 0 };
        const Quotation = require('../models/Quotation');
        const QuotationRequest = require('../models/QuotationRequest');

        const [requests, quotes] = await Promise.all([
            QuotationRequest.find({ linkedQuotation: { $in: [null, undefined] } }).select('_id customerMobile status'),
            Quotation.find({ isArchived: { $ne: true } }).select('_id quotationRequestId customerMobile assignedEmployee')
        ]);

        let synced = 0;
        const claimedQuoteIds = new Set();
        const existingLinked = await QuotationRequest.find({ linkedQuotation: { $ne: null } }).select('linkedQuotation').lean();
        for (const el of existingLinked) {
            if (el.linkedQuotation) claimedQuoteIds.add(String(el.linkedQuotation));
        }

        // Pass 1: Strict quotationRequestId match
        for (const r of requests) {
            const rIdStr = String(r._id);
            const exactQ = quotes.find(q =>
                !claimedQuoteIds.has(String(q._id)) &&
                q.quotationRequestId &&
                String(q.quotationRequestId._id || q.quotationRequestId) === rIdStr
            );
            if (exactQ) {
                await QuotationRequest.findByIdAndUpdate(r._id, {
                    linkedQuotation: exactQ._id,
                    status: 'QUOTATION_PREPARED'
                });
                claimedQuoteIds.add(String(exactQ._id));
                synced++;
            }
        }

        // Pass 2: Unambiguous mobile fallback
        for (const r of requests) {
            const rIdStr = String(r._id);
            const isAlreadyClaimed = quotes.some(q => claimedQuoteIds.has(String(q._id)) && String(q.quotationRequestId) === rIdStr);
            if (!isAlreadyClaimed && r.customerMobile) {
                const cleanMobile = r.customerMobile.replace(/\D/g, '').slice(-10);
                if (cleanMobile.length === 10) {
                    const candidates = quotes.filter(q =>
                        !claimedQuoteIds.has(String(q._id)) &&
                        !q.quotationRequestId &&
                        q.customerMobile &&
                        q.customerMobile.replace(/\D/g, '').slice(-10) === cleanMobile
                    );

                    const unlinkedRequestsWithMobile = requests.filter(req =>
                        req.customerMobile &&
                        req.customerMobile.replace(/\D/g, '').slice(-10) === cleanMobile
                    );

                    if (candidates.length === 1 && unlinkedRequestsWithMobile.length === 1) {
                        const matchQ = candidates[0];
                        await QuotationRequest.findByIdAndUpdate(r._id, {
                            linkedQuotation: matchQ._id,
                            status: 'QUOTATION_PREPARED'
                        });
                        await Quotation.findByIdAndUpdate(matchQ._id, {
                            quotationRequestId: r._id,
                            assignedEmployee: matchQ.assignedEmployee
                        });
                        claimedQuoteIds.add(String(matchQ._id));
                        synced++;
                    }
                }
            }
        }
        return { synced };
    }
}

module.exports = QuotationController;
