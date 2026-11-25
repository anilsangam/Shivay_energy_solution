const mongoose = require('mongoose');
const FieldEngineerService = require('../services/fieldEngineerService');
const SiteInspection = require('../models/SiteInspection');
const Lead = require('../models/Lead');
const Quotation = require('../models/Quotation');
const Project = require('../models/Project');
const PaymentRecord = require('../models/PaymentRecord');
const CustomerDocument = require('../models/CustomerDocument');
const companyData = require('../config/company');

class FieldInspectionController {
    /**
     * Field Engineer Workspace View
     */
    static async getWorkspace(req, res) {
        try {
            const currentUser = req.session.user;
            const workspaceData = await FieldEngineerService.getEngineerWorkspaceData(currentUser);

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json({ success: true, ...workspaceData });
            }

            return res.render('private/field-engineer/workspace', {
                company: companyData.company,
                user: currentUser,
                currentUser,
                ...workspaceData,
                activePage: 'field-engineer-workspace',
                pageTitle: 'Field Engineer Workspace & Site Inspections'
            });
        } catch (err) {
            console.error('[FieldInspectionController.getWorkspace] Error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Get inspection details
     */
    static async getInspection(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;

            let inspection = await SiteInspection.findOne({ inspectionId: id })
                .populate('assignedFieldEngineer', 'name employeeId mobile email')
                .populate('branch', 'name code city state')
                .populate('leadId', 'name mobile leadId')
                .populate('quotationId', 'quotationNumber grandTotal status')
                .lean();

            if (!inspection && mongoose.isValidObjectId(id)) {
                inspection = await SiteInspection.findById(id)
                    .populate('assignedFieldEngineer', 'name employeeId mobile email')
                    .populate('branch', 'name code city state')
                    .populate('leadId', 'name mobile leadId')
                    .populate('quotationId', 'quotationNumber grandTotal status')
                    .lean();
            }

            if (!inspection) {
                return res.status(404).json({ success: false, message: 'Site inspection not found.' });
            }

            // Branch Isolation Check
            if (currentUser.role !== 'SUPER_ADMIN') {
                const userBranch = currentUser.branchId ? (currentUser.branchId._id || currentUser.branchId).toString() : '';
                const inspBranch = inspection.branch ? (inspection.branch._id || inspection.branch).toString() : '';
                if (userBranch && inspBranch && userBranch !== inspBranch) {
                    return res.status(403).json({ success: false, message: 'Access denied: Inspection belongs to another branch.' });
                }
            }

            return res.json({ success: true, inspection });
        } catch (err) {
            console.error('[FieldInspectionController.getInspection] Error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Save draft or submit site inspection
     */
    static async postSaveInspection(req, res) {
        try {
            const currentUser = req.session.user;
            const inspection = await FieldEngineerService.saveInspection({
                ...req.body,
                engineerUser: currentUser
            });

            return res.json({
                success: true,
                message: inspection.status === 'SUBMITTED' ? 'Site inspection submitted successfully.' : 'Inspection draft saved.',
                inspection
            });
        } catch (err) {
            console.error('[FieldInspectionController.postSaveInspection] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Upload site photo with GPS coordinates
     */
    static async postUploadPhoto(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;
            const { fileObj, latitude, longitude, accuracyMeters, category, gpsUnavailableReason } = req.body;

            const gpsMetadata = {
                latitude: typeof latitude === 'number' ? latitude : (latitude ? parseFloat(latitude) : null),
                longitude: typeof longitude === 'number' ? longitude : (longitude ? parseFloat(longitude) : null),
                accuracyMeters: typeof accuracyMeters === 'number' ? accuracyMeters : (accuracyMeters ? parseFloat(accuracyMeters) : null),
                gpsUnavailableReason
            };

            const photo = await FieldEngineerService.addInspectionPhoto(
                id,
                fileObj,
                gpsMetadata,
                currentUser
            );

            return res.json({
                success: true,
                message: photo.isGpsVerified ? 'GPS verified photo attached.' : 'Photo attached (GPS unavailable).',
                photo
            });
        } catch (err) {
            console.error('[FieldInspectionController.postUploadPhoto] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Manager verification of submitted inspection
     */
    static async postVerifyInspection(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;
            const { isApproved, notes } = req.body;

            const inspection = await FieldEngineerService.verifyInspection(id, currentUser, {
                isApproved: isApproved !== false,
                notes
            });

            return res.json({
                success: true,
                message: inspection.status === 'VERIFIED' ? 'Inspection verified.' : 'Revision requested.',
                inspection
            });
        } catch (err) {
            console.error('[FieldInspectionController.postVerifyInspection] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Create onsite quotation
     */
    static async postCreateOnsiteQuotation(req, res) {
        try {
            const { id } = req.params;
            const currentUser = req.session.user;

            const quotation = await FieldEngineerService.createOnsiteQuotation(id, currentUser, req.body);

            return res.json({
                success: true,
                message: `Quotation ${quotation.quotationNumber} generated and submitted for approval.`,
                quotation
            });
        } catch (err) {
            console.error('[FieldInspectionController.postCreateOnsiteQuotation] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Record customer acceptance / rejection
     */
    static async postRecordCustomerAcceptance(req, res) {
        try {
            const { quotationId } = req.params;
            const currentUser = req.session.user;
            const { status, remarks } = req.body;

            const quotation = await FieldEngineerService.recordCustomerAcceptance(quotationId, currentUser, {
                status,
                remarks
            });

            return res.json({
                success: true,
                message: `Quotation status updated to ${quotation.status}.`,
                quotation
            });
        } catch (err) {
            console.error('[FieldInspectionController.postRecordCustomerAcceptance] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Upload customer onboarding document
     */
    static async postUploadCustomerDocument(req, res) {
        try {
            const currentUser = req.session.user;
            const { customerId, leadId, quotationId, category, title, fileObj } = req.body;

            const doc = await FieldEngineerService.uploadCustomerDocument({
                customerId,
                leadId,
                quotationId,
                category,
                title,
                fileObj,
                user: currentUser
            });

            return res.json({
                success: true,
                message: 'Customer document uploaded successfully.',
                document: doc
            });
        } catch (err) {
            console.error('[FieldInspectionController.postUploadCustomerDocument] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Record payment entry (Maker)
     */
    static async postRecordPayment(req, res) {
        try {
            const currentUser = req.session.user;
            const payment = await FieldEngineerService.recordPayment({
                ...req.body,
                user: currentUser
            });

            return res.json({
                success: true,
                message: `Payment entry ${payment.paymentId} for ₹${payment.amount} recorded (Pending Verification).`,
                payment
            });
        } catch (err) {
            console.error('[FieldInspectionController.postRecordPayment] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Verify payment entry (Checker)
     */
    static async postVerifyPayment(req, res) {
        try {
            const { paymentId } = req.params;
            const currentUser = req.session.user;
            const { action, rejectionReason, remarks } = req.body;

            const payment = await FieldEngineerService.verifyPayment(paymentId, currentUser, {
                action: action || 'VERIFY',
                rejectionReason,
                remarks
            });

            return res.json({
                success: true,
                message: payment.status === 'VERIFIED' ? `Payment ${payment.paymentId} verified.` : `Payment ${payment.paymentId} rejected.`,
                payment
            });
        } catch (err) {
            console.error('[FieldInspectionController.postVerifyPayment] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Check project activation clearance status
     */
    static async getPaymentClearanceStatus(req, res) {
        try {
            const { quotationId } = req.params;
            const eligibility = await FieldEngineerService.checkProjectActivationEligibility(quotationId);

            return res.json({
                success: true,
                eligibility
            });
        } catch (err) {
            console.error('[FieldInspectionController.getPaymentClearanceStatus] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Activate project
     */
    static async postActivateProject(req, res) {
        try {
            const { quotationId } = req.params;
            const currentUser = req.session.user;

            const result = await FieldEngineerService.activateProject(quotationId, currentUser);

            return res.json({
                success: true,
                message: result.message,
                project: result.project,
                alreadyActivated: result.alreadyActivated
            });
        } catch (err) {
            console.error('[FieldInspectionController.postActivateProject] Error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
    }
}

module.exports = FieldInspectionController;
