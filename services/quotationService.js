const mongoose = require('mongoose');
const crypto = require('crypto');
const Counter = require('../models/Counter');
const Quotation = require('../models/Quotation');
const QuotationRequest = require('../models/QuotationRequest');
const QuotationStatusHistory = require('../models/QuotationStatusHistory');
const AuditService = require('./auditService');
const User = require('../models/User');

class QuotationService {
    // -------------------------------------------------------------
    // 1. CONCURRENCY-SAFE SEQUENCE GENERATION
    // -------------------------------------------------------------
    static async generateRequestNumber() {
        const year = new Date().getFullYear();
        const seq = await Counter.getNextSequence(`quotationRequest_${year}`);
        const paddedSeq = String(seq).padStart(4, '0');
        return `REQ-${year}-${paddedSeq}`;
    }

    static async generateQuotationNumber() {
        const year = new Date().getFullYear();
        const seq = await Counter.getNextSequence(`quotation_${year}`);
        const paddedSeq = String(seq).padStart(4, '0');
        return `SES-Q${year}-${paddedSeq}`;
    }

    // -------------------------------------------------------------
    // 2. AUTHORITATIVE FINANCIAL CALCULATIONS & POLICY ENGINE
    // -------------------------------------------------------------
    /**
     * Compute PM Surya Ghar Central Government Rooftop Subsidy (Madhya Pradesh / National)
     * Authoritative Scheme: PM Surya Ghar: Muft Bijli Yojana
     * Ministry: Ministry of New and Renewable Energy (MNRE), Government of India
     * Operational Guidelines: OM No. 318/17/2024-GCRT dated 16 March 2024 (pmsuryaghar.gov.in)
     * Residential Slabs:
     * - First 1 kW: ₹30,000
     * - 2 kW: ₹60,000 (₹30,000/kW)
     * - 3 kW & Above: ₹78,000 (3rd kW adds ₹18,000; capped at ₹78,000 maximum for individual residential)
     * Commercial / Industrial: Ineligible for residential DBT Central Financial Assistance (₹0)
     */
    static calculateSubsidy(capacityKw, customerType = 'RESIDENTIAL', returnDetails = false) {
        const type = (customerType || '').toUpperCase();
        const kw = Math.max(0, Number(capacityKw) || 0);

        let amount = 0;
        let isEligible = false;
        let slabDescription = 'Ineligible for residential subsidy';

        if (type === 'RESIDENTIAL') {
            isEligible = true;
            if (kw <= 0) {
                amount = 0;
                slabDescription = '0 kW (No capacity entered)';
            } else if (kw < 1.5) {
                amount = 30000;
                slabDescription = '1 kW Slab (₹30,000 Central DBT)';
            } else if (kw < 2.5) {
                amount = 60000;
                slabDescription = '2 kW Slab (₹60,000 Central DBT)';
            } else {
                amount = 78000;
                slabDescription = '3 kW & Above Capped Slab (₹78,000 Maximum Central DBT)';
            }
        } else {
            amount = 0;
            slabDescription = `${type} Category (Direct Central CFA Not Applicable)`;
        }

        if (returnDetails) {
            return {
                schemeName: 'PM Surya Ghar: Muft Bijli Yojana',
                authority: 'Ministry of New and Renewable Energy (MNRE), Government of India',
                notificationReference: 'OM No. 318/17/2024-GCRT dated 16 March 2024',
                portalUrl: 'https://pmsuryaghar.gov.in/',
                isEligible,
                amount,
                slabDescription,
                disclaimer: 'Subsidy shown is an indicative estimate subject to applicable government scheme guidelines, customer eligibility, DISCOM verification, installation requirements and final government approval. Actual subsidy may differ.'
            };
        }

        return amount;
    }

    /**
     * Recalculate and validate all line items, tax amounts, and payment milestones.
     * All monetary arithmetic is kept on the authoritative backend with 2-decimal rounding.
     */
    static calculateFinancials(params = {}) {
        const {
            lineItems = [],
            plantCapacityKw = 3,
            customerType = 'RESIDENTIAL',
            customerState = 'Madhya Pradesh',
            specialDiscount = 0,
            advancePercentage = 20,
            paymentBasis = 'CONTRACT_VALUE', // Supported: 'CONTRACT_VALUE' | 'CUSTOMER_CONTRIBUTION'
            deliveryPercentage = 60,
            commissioningPercentage = 20
        } = params;

        let subtotal = 0;
        let itemDiscountsTotal = 0;
        let taxableValue = 0;
        let totalGstAmount = 0;

        const validatedItems = lineItems.map((item, index) => {
            const description = (item.description || `Solar Equipment Item #${index + 1}`).trim();
            const quantity = Math.max(0.01, Number(item.quantity) || 1);
            const unit = (item.unit || 'Nos').trim();
            const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
            const discount = Math.max(0, Number(item.discount) || 0);

            const itemGross = Number((quantity * unitPrice).toFixed(2));
            const itemTaxable = Math.max(0, Number((itemGross - discount).toFixed(2)));
            const gstRate = item.gstRate !== undefined ? Number(item.gstRate) : 12; // Standard 12% on solar EPC
            const lineGst = Number(((itemTaxable * gstRate) / 100).toFixed(2));
            const lineTotal = Number((itemTaxable + lineGst).toFixed(2));

            subtotal += itemGross;
            itemDiscountsTotal += discount;
            taxableValue += itemTaxable;
            totalGstAmount += lineGst;

            return {
                description,
                productRef: item.productRef || null,
                sku: item.sku || null,
                quantity,
                unit,
                unitPrice,
                discount,
                taxableAmount: itemTaxable,
                gstRate,
                lineTotal
            };
        });

        subtotal = Number(subtotal.toFixed(2));
        itemDiscountsTotal = Number(itemDiscountsTotal.toFixed(2));
        taxableValue = Number(taxableValue.toFixed(2));
        totalGstAmount = Number(totalGstAmount.toFixed(2));

        // State Tax vs Inter-State Tax (MP intra-state: CGST 6% + SGST 6%)
        const isIntraState = !customerState || customerState.toLowerCase().includes('madhya pradesh');
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;

        if (isIntraState) {
            cgstAmount = Number((totalGstAmount / 2).toFixed(2));
            sgstAmount = Number((totalGstAmount - cgstAmount).toFixed(2));
            igstAmount = 0;
        } else {
            cgstAmount = 0;
            sgstAmount = 0;
            igstAmount = totalGstAmount;
        }

        const cleanSpecialDiscount = Math.max(0, Number(specialDiscount) || 0);
        const grossTotal = Number((taxableValue + totalGstAmount).toFixed(2));
        const grandTotal = Math.max(0, Number((grossTotal - cleanSpecialDiscount).toFixed(2)));

        const estimatedSubsidy = QuotationService.calculateSubsidy(plantCapacityKw, customerType);
        const netPayableAfterSubsidy = Math.max(0, Number((grandTotal - estimatedSubsidy).toFixed(2)));

        // -------------------------------------------------------------
        // PAYMENT POLICY & MILESTONE RECONCILIATION
        // Policy A (CONTRACT_VALUE): Base = grandTotal (contract value after discount). Customer pays full contract; subsidy credited via DBT.
        // Policy B (CUSTOMER_CONTRIBUTION): Base = netPayableAfterSubsidy. Company bridges subsidy; customer pays net portion.
        // -------------------------------------------------------------
        const isCustomerContributionBasis = paymentBasis === 'CUSTOMER_CONTRIBUTION';
        const calculationBase = isCustomerContributionBasis ? netPayableAfterSubsidy : grandTotal;

        const advPct = Math.min(100, Math.max(5, Number(advancePercentage) || 20));
        const delPct = Math.min(100, Math.max(0, Number(deliveryPercentage) || 60));
        const comPct = Math.max(0, 100 - advPct - delPct);

        const advanceAmount = Number(((calculationBase * advPct) / 100).toFixed(2));
        const deliveryAmount = Number(((calculationBase * delPct) / 100).toFixed(2));
        // Ensure exact rupee reconciliation without penny/paise rounding drift
        const commissioningAmount = Math.max(0, Number((calculationBase - advanceAmount - deliveryAmount).toFixed(2)));
        const balanceAmount = Number((calculationBase - advanceAmount).toFixed(2));

        const paymentPolicy = {
            basis: paymentBasis,
            calculationBase,
            advancePercentage: advPct,
            advanceAmount,
            deliveryPercentage: delPct,
            deliveryAmount,
            commissioningPercentage: comPct,
            commissioningAmount,
            totalMilestonesAmount: Number((advanceAmount + deliveryAmount + commissioningAmount).toFixed(2))
        };

        const subsidyDetails = {
            schemeName: 'PM Surya Ghar: Muft Bijli Yojana',
            status: customerType.toUpperCase() === 'RESIDENTIAL' ? 'ESTIMATED' : 'INELIGIBLE',
            estimatedAmount: estimatedSubsidy,
            disclaimer: 'Subsidy shown is an indicative estimate subject to applicable government scheme guidelines, customer eligibility, DISCOM verification, installation requirements and final government approval. Actual subsidy may differ.',
            applicationNumber: null,
            verifiedAt: null
        };

        const taxSnapshot = {
            isIntraState,
            gstRate: 12,
            cgstRate: isIntraState ? 6 : 0,
            sgstRate: isIntraState ? 6 : 0,
            igstRate: isIntraState ? 0 : 12,
            taxMethod: 'STANDARD_SOLAR_GST',
            caVerificationStatus: 'PENDING_CA_REVIEW'
        };

        return {
            lineItems: validatedItems,
            subtotal,
            itemDiscountsTotal,
            specialDiscount: cleanSpecialDiscount,
            taxableValue,
            gstRate: 12,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalGstAmount,
            grossTotal,
            estimatedSubsidy,
            grandTotal,
            netPayableAfterSubsidy,
            advanceAmount,
            balanceAmount,
            deliveryAmount,
            commissioningAmount,
            paymentPolicy,
            subsidyDetails,
            taxSnapshot
        };
    }

    // -------------------------------------------------------------
    // 3. QUOTATION REQUEST WORKFLOW
    // -------------------------------------------------------------
    /**
     * Submit a new Quotation Request
     */
    static async createQuotationRequest(data, creatorUser) {
        const requestNumber = await QuotationService.generateRequestNumber();

        const isManagerOrAdmin = creatorUser.role === 'SUPER_ADMIN' || creatorUser.role === 'BRANCH_MANAGER' || creatorUser.role === 'MANAGER';

        const request = new QuotationRequest({
            ...data,
            requestNumber,
            assignedEmployee: creatorUser._id,
            assignedManager: isManagerOrAdmin ? creatorUser._id : (creatorUser.managerId || null),
            branch: creatorUser.branchId || null,
            status: 'SUBMITTED'
        });

        if (mongoose.connection.readyState === 1) {
            await request.save();

            // Record Initial History
            await QuotationStatusHistory.create({
                recordType: 'QUOTATION_REQUEST',
                quotationRequest: request._id,
                documentNumber: requestNumber,
                previousStatus: 'NEW',
                newStatus: 'SUBMITTED',
                changedBy: creatorUser._id,
                role: creatorUser.role,
                comments: `Initial quotation request submitted by ${creatorUser.role.toLowerCase().replace('_', ' ')}.`
            });
        }

        return request;
    }

    /**
     * Update request status (Review, Revision Requested, Reject)
     */
    static async updateRequestStatus(requestId, newStatus, arg3, arg4) {
        let request = null;
        if (requestId && typeof requestId === 'object' && requestId.status) {
            request = requestId;
        } else if (mongoose.connection && mongoose.connection.readyState === 1) {
            request = await QuotationRequest.findById(requestId);
        }
        if (!request) throw new Error('Quotation request not found.');

        // Normalize status names (e.g. REQUEST_REVISION -> REVISION_REQUESTED)
        let normalizedStatus = newStatus;
        if (newStatus === 'REQUEST_REVISION') {
            normalizedStatus = 'REVISION_REQUESTED';
        }

        // Support flexible arguments: (req, status, comments, user) OR (req, status, user, comments)
        let reasonOrComments = '';
        let modifierUser = null;
        if (typeof arg3 === 'object' && arg3 !== null && arg3.role) {
            modifierUser = arg3;
            reasonOrComments = typeof arg4 === 'string' ? arg4 : '';
        } else {
            reasonOrComments = typeof arg3 === 'string' ? arg3 : '';
            modifierUser = typeof arg4 === 'object' && arg4 !== null ? arg4 : { _id: null, role: 'SYSTEM' };
        }

        const prevStatus = request.status;
        const validTransitions = {
            'SUBMITTED': ['UNDER_REVIEW', 'REVISION_REQUESTED', 'REJECTED'],
            'UNDER_REVIEW': ['REVISION_REQUESTED', 'REJECTED', 'QUOTATION_PREPARED'],
            'REVISION_REQUESTED': ['RESUBMITTED', 'REJECTED'],
            'RESUBMITTED': ['UNDER_REVIEW', 'REVISION_REQUESTED', 'REJECTED', 'QUOTATION_PREPARED'],
            'QUOTATION_PREPARED': ['REVISION_REQUESTED'],
            'REJECTED': []
        };

        const allowed = validTransitions[prevStatus] || [];
        if (!allowed.includes(normalizedStatus)) {
            throw new Error(`Invalid request status transition from "${prevStatus}" to "${normalizedStatus}".`);
        }

        // Validate reasons for rejection or revision
        if ((normalizedStatus === 'REVISION_REQUESTED' || normalizedStatus === 'REJECTED') && (!reasonOrComments || !reasonOrComments.trim())) {
            throw new Error(`A specific reason or comment is required for ${normalizedStatus.replace('_', ' ').toLowerCase()}.`);
        }

        request.status = normalizedStatus;
        if (normalizedStatus === 'REVISION_REQUESTED') {
            request.revisionComments = reasonOrComments.trim();
        } else if (normalizedStatus === 'REJECTED') {
            request.rejectionReason = reasonOrComments.trim();
        }

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await request.save();

            // History
            await QuotationStatusHistory.create({
                recordType: 'QUOTATION_REQUEST',
                quotationRequest: request._id,
                documentNumber: request.requestNumber,
                previousStatus: prevStatus,
                newStatus: normalizedStatus,
                changedBy: modifierUser._id,
                role: modifierUser.role,
                comments: reasonOrComments ? reasonOrComments.trim() : null
            });

            // Audit
            AuditService.log({
                action: `QUOTATION_REQUEST_${normalizedStatus}`,
                user: modifierUser._id,
                role: modifierUser.role,
                details: { requestNumber: request.requestNumber, previousStatus: prevStatus, newStatus: normalizedStatus }
            });
        }

        return request;
    }

    /**
     * Resubmit an updated Quotation Request after revision
     */
    static async resubmitRequest(requestOrId, updates = {}, submittingUser) {
        let request = null;
        if (requestOrId && typeof requestOrId === 'object' && requestOrId.status) {
            request = requestOrId;
        } else if (mongoose.connection && mongoose.connection.readyState === 1) {
            request = await QuotationRequest.findById(requestOrId);
        }
        if (!request) throw new Error('Quotation request not found.');

        request.status = 'RESUBMITTED';
        if (updates.proposedCapacityKw) {
            request.proposedCapacityKw = updates.proposedCapacityKw;
            if (request.solarRequirements) {
                request.solarRequirements.proposedCapacityKw = updates.proposedCapacityKw;
            }
        }
        if (updates.monthlyElectricityBill) {
            request.monthlyElectricityBill = updates.monthlyElectricityBill;
            if (request.solarRequirements) {
                request.solarRequirements.monthlyElectricityBill = updates.monthlyElectricityBill;
            }
        }
        if (updates.employeeNotes) {
            request.employeeNotes = updates.employeeNotes;
        }

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await request.save();

            await QuotationStatusHistory.create({
                recordType: 'QUOTATION_REQUEST',
                quotationRequest: request._id,
                documentNumber: request.requestNumber,
                previousStatus: 'REVISION_REQUESTED',
                newStatus: 'RESUBMITTED',
                changedBy: submittingUser ? submittingUser._id : request.assignedEmployee,
                role: submittingUser ? submittingUser.role : 'EMPLOYEE',
                comments: updates.employeeNotes || 'Quotation request resubmitted with revisions.'
            });
        }

        return request;
    }

    // -------------------------------------------------------------
    // 4. QUOTATION CREATION & APPROVAL WORKFLOW
    // -------------------------------------------------------------
    /**
     * Prepare a Quotation (Draft / Pending Approval or Direct Approved)
     */
    static async prepareQuotation(quotationData, preparerUser) {
        // Enforce Server-Side Financial Calculations
        const financials = QuotationService.calculateFinancials({
            lineItems: quotationData.lineItems,
            plantCapacityKw: quotationData.plantCapacityKw,
            customerType: quotationData.customerType,
            customerState: quotationData.state,
            specialDiscount: quotationData.specialDiscount,
            advancePercentage: quotationData.advancePercentage
        });

        const quotationNumber = await QuotationService.generateQuotationNumber();
        const acceptanceToken = crypto.randomBytes(24).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days

        const reqId = quotationData.quotationRequestId || quotationData.requestId || null;
        let origRequest = null;
        if (reqId && typeof reqId === 'object' && reqId._id && reqId.status) {
            origRequest = reqId;
        } else if (reqId && mongoose.connection && mongoose.connection.readyState === 1) {
            origRequest = await QuotationRequest.findById(reqId);
        }

        const isDirectApprove = quotationData.directApprove === true || quotationData.directApprove === 'true' || quotationData.action === 'APPROVE';
        const initialStatus = isDirectApprove ? 'APPROVED' : 'PENDING_APPROVAL';

        const assignedEmp = origRequest ? origRequest.assignedEmployee : (quotationData.assignedEmployee || null);

        const quotation = new Quotation({
            ...quotationData,
            ...financials,
            quotationNumber,
            quotationRequestId: origRequest ? origRequest._id : (reqId || null),
            assignedEmployee: assignedEmp,
            customerId: origRequest ? (origRequest.customer || quotationData.customerId) : quotationData.customerId,
            customerAddress: quotationData.customerAddress || quotationData.address || (origRequest ? origRequest.siteAddress : ''),
            version: 1,
            previousVersion: null,
            status: initialStatus,
            preparedBy: preparerUser._id,
            approvedBy: isDirectApprove ? preparerUser._id : null,
            approvedAt: isDirectApprove ? new Date() : null,
            branch: origRequest ? (origRequest.branch || preparerUser.branchId) : (preparerUser.branchId || null),
            validUntil: quotationData.validUntil || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 Days
            customerResponse: {
                status: 'PENDING',
                acceptanceToken,
                tokenExpiresAt
            }
        });

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await quotation.save();

            // Update linked QuotationRequest status and link reference
            if (origRequest) {
                origRequest.status = 'QUOTATION_PREPARED';
                origRequest.linkedQuotation = quotation._id;
                await origRequest.save();

                await QuotationStatusHistory.create({
                    recordType: 'QUOTATION_REQUEST',
                    quotationRequest: origRequest._id,
                    documentNumber: origRequest.requestNumber,
                    previousStatus: 'SUBMITTED',
                    newStatus: 'QUOTATION_PREPARED',
                    changedBy: preparerUser._id,
                    role: preparerUser.role,
                    comments: `Quotation ${quotationNumber} prepared and linked to field request ${origRequest.requestNumber}.`
                });
            }

            // Status History
            await QuotationStatusHistory.create({
                recordType: 'QUOTATION',
                quotation: quotation._id,
                documentNumber: quotationNumber,
                previousStatus: 'NEW',
                newStatus: initialStatus,
                changedBy: preparerUser._id,
                role: preparerUser.role,
                comments: isDirectApprove
                    ? 'Quotation prepared and directly approved for client issuance.'
                    : 'Quotation prepared and submitted for authorization.'
            });

            // Audit
            AuditService.log({
                action: isDirectApprove ? 'QUOTATION_APPROVED' : 'QUOTATION_PREPARED',
                user: preparerUser._id,
                role: preparerUser.role,
                details: { quotationNumber, grandTotal: quotation.grandTotal, kw: quotation.plantCapacityKw, requestId: origRequest ? origRequest.requestNumber : null }
            });
        } else if (origRequest) {
            origRequest.status = 'QUOTATION_PREPARED';
            origRequest.linkedQuotation = quotation._id;
        }

        return quotation;
    }

    /**
     * Approve a Quotation (Enforces Maker-Checker & Role Boundaries)
     */
    static async approveQuotation(quotationId, approverUser, comments = '') {
        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        if (quotation.status !== 'PENDING_APPROVAL' && quotation.status !== 'DRAFT') {
            throw new Error(`Quotation is already in status "${quotation.status}" and cannot be approved.`);
        }

        // Maker-Checker Separation: Creator cannot approve their own quotation (unless Super Admin)
        if (String(quotation.preparedBy) === String(approverUser._id) && approverUser.role !== 'SUPER_ADMIN') {
            throw new Error('Maker-Checker Violation: You cannot approve a quotation that you prepared. Another manager or Super Admin must review it.');
        }

        // Branch Isolation Check for Managers
        if (approverUser.role === 'MANAGER' || approverUser.role === 'BRANCH_MANAGER') {
            if (quotation.branch && approverUser.branchId && String(quotation.branch) !== String(approverUser.branchId._id || approverUser.branchId)) {
                throw new Error('Unauthorized: You can only approve quotations belonging to your branch.');
            }
        }

        quotation.status = 'APPROVED';
        quotation.approvedBy = approverUser._id;
        quotation.approvedAt = new Date();
        quotation.approvalComments = (comments || 'Approved by branch management').trim();

        await quotation.save();

        // Status History
        await QuotationStatusHistory.create({
            recordType: 'QUOTATION',
            quotation: quotation._id,
            documentNumber: quotation.quotationNumber,
            previousStatus: 'PENDING_APPROVAL',
            newStatus: 'APPROVED',
            changedBy: approverUser._id,
            role: approverUser.role,
            comments: quotation.approvalComments
        });

        // Audit
        AuditService.log({
            action: 'QUOTATION_APPROVED',
            user: approverUser._id,
            role: approverUser.role,
            details: { quotationNumber: quotation.quotationNumber, approver: approverUser.name }
        });

        return quotation;
    }

    /**
     * Reject a Quotation
     */
    static async rejectQuotation(quotationId, rejectorUser, reason) {
        if (!reason || !reason.trim()) {
            throw new Error('A specific rejection reason is required.');
        }

        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        if (quotation.status === 'APPROVED' || quotation.status === 'CUSTOMER_ACCEPTED') {
            throw new Error(`Cannot reject quotation in status "${quotation.status}".`);
        }

        const prevStatus = quotation.status;
        quotation.status = 'CANCELLED';
        quotation.rejectionReason = reason.trim();
        await quotation.save();

        // Status History
        await QuotationStatusHistory.create({
            recordType: 'QUOTATION',
            quotation: quotation._id,
            documentNumber: quotation.quotationNumber,
            previousStatus: prevStatus,
            newStatus: 'CANCELLED',
            changedBy: rejectorUser._id,
            role: rejectorUser.role,
            comments: reason.trim()
        });

        // Audit
        AuditService.log({
            action: 'QUOTATION_REJECTED',
            user: rejectorUser._id,
            role: rejectorUser.role,
            details: { quotationNumber: quotation.quotationNumber, reason: reason.trim() }
        });

        return quotation;
    }

    /**
     * Create a new revised version of an existing Quotation (Version 2, 3...)
     */
    static async createQuotationRevision(originalQuotationId, newQuotationData, reviserUser) {
        const original = await Quotation.findById(originalQuotationId);
        if (!original) throw new Error('Original quotation not found.');

        // Authoritative Financial Recalculation
        const financials = QuotationService.calculateFinancials({
            lineItems: newQuotationData.lineItems || original.lineItems,
            plantCapacityKw: newQuotationData.plantCapacityKw || original.plantCapacityKw,
            customerType: newQuotationData.customerType || original.customerType,
            customerState: newQuotationData.state || original.state,
            specialDiscount: newQuotationData.specialDiscount !== undefined ? newQuotationData.specialDiscount : original.specialDiscount,
            advancePercentage: newQuotationData.advancePercentage || 20
        });

        const newVersionNumber = (original.version || 1) + 1;
        const acceptanceToken = crypto.randomBytes(24).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const revised = new Quotation({
            ...original.toObject(),
            ...newQuotationData,
            ...financials,
            _id: undefined,
            version: newVersionNumber,
            previousVersion: original._id,
            status: 'PENDING_APPROVAL',
            preparedBy: reviserUser._id,
            approvedBy: null,
            approvedAt: null,
            approvalComments: null,
            rejectionReason: null,
            customerResponse: {
                status: 'PENDING',
                acceptanceToken,
                tokenExpiresAt
            }
        });

        await revised.save();

        // History
        await QuotationStatusHistory.create({
            recordType: 'QUOTATION',
            quotation: revised._id,
            documentNumber: `${revised.quotationNumber} (v${newVersionNumber})`,
            previousStatus: `v${original.version}`,
            newStatus: 'PENDING_APPROVAL',
            changedBy: reviserUser._id,
            role: reviserUser.role,
            comments: `Created revised version ${newVersionNumber}.`
        });

        return revised;
    }

    // -------------------------------------------------------------
    // 5. CUSTOMER RESPONSE & ACCEPTANCE
    // -------------------------------------------------------------
    /**
     * Record customer response (Acceptance / Rejection)
     */
    static async recordCustomerResponse(quotationId, responseStatus, remarks = '', recordedByUser = null) {
        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        if (quotation.status !== 'APPROVED' && quotation.status !== 'SHARED') {
            throw new Error(`Customer response can only be recorded on approved or shared quotations (Current: ${quotation.status}).`);
        }

        const validResponses = ['ACCEPTED', 'REJECTED'];
        if (!validResponses.includes(responseStatus)) {
            throw new Error('Invalid customer response status. Must be ACCEPTED or REJECTED.');
        }

        const newQuotationStatus = responseStatus === 'ACCEPTED' ? 'CUSTOMER_ACCEPTED' : 'CUSTOMER_REJECTED';
        quotation.status = newQuotationStatus;
        quotation.customerResponse.status = responseStatus;
        quotation.customerResponse.responseDate = new Date();
        quotation.customerResponse.remarks = (remarks || '').trim();
        if (recordedByUser) {
            quotation.customerResponse.recordedBy = recordedByUser._id;
        }

        await quotation.save();

        // Record History
        await QuotationStatusHistory.create({
            recordType: 'QUOTATION',
            quotation: quotation._id,
            documentNumber: quotation.quotationNumber,
            previousStatus: 'APPROVED',
            newStatus: newQuotationStatus,
            changedBy: recordedByUser ? recordedByUser._id : quotation.preparedBy,
            role: recordedByUser ? recordedByUser.role : 'CUSTOMER_PORTAL',
            comments: `Customer response recorded: ${responseStatus}. Remarks: "${remarks}"`
        });

        // Audit
        AuditService.log({
            action: `QUOTATION_${newQuotationStatus}`,
            user: recordedByUser ? recordedByUser._id : null,
            details: { quotationNumber: quotation.quotationNumber, responseStatus, remarks }
        });

        // Phase 3: Automatically initialize Project upon confirmed customer acceptance
        if (responseStatus === 'ACCEPTED') {
            try {
                const ProjectService = require('./projectService');
                await ProjectService.createProjectFromQuotation(quotation, recordedByUser);
            } catch (projErr) {
                console.error('Project creation hook error upon acceptance:', projErr);
            }
        }

        return quotation;
    }

    /**
     * Process Direct Customer Acceptance via Secure Token
     */
    static async acceptViaToken(token, customerRemarks = '') {
        if (!token || typeof token !== 'string') {
            throw new Error('Invalid acceptance token.');
        }

        const quotation = await Quotation.findOne({ 'customerResponse.acceptanceToken': token });
        if (!quotation) {
            throw new Error('Invalid or expired quotation acceptance link.');
        }

        if (quotation.customerResponse.tokenExpiresAt && quotation.customerResponse.tokenExpiresAt < new Date()) {
            throw new Error('This quotation acceptance link has expired. Please contact your Shivay Energy consultant for an updated proposal.');
        }

        if (quotation.status === 'CUSTOMER_ACCEPTED') {
            return { quotation, alreadyAccepted: true };
        }

        return QuotationService.recordCustomerResponse(quotation._id, 'ACCEPTED', customerRemarks || 'Accepted via online portal link.');
    }
}

module.exports = QuotationService;

