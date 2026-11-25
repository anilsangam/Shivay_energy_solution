const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const SiteInspection = require('../models/SiteInspection');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Quotation = require('../models/Quotation');
const Project = require('../models/Project');
const PaymentRecord = require('../models/PaymentRecord');
const CustomerDocument = require('../models/CustomerDocument');
const PaymentPolicy = require('../models/PaymentPolicy');
const User = require('../models/User');
const AuditService = require('./auditService');
const AuthorizationService = require('./authorizationService');
const UploadService = require('./uploadService');

class FieldEngineerService {
    /**
     * Generate unique collision-safe Inspection ID (e.g. INSP-2611-AB12)
     */
    static generateInspectionId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `INSP-${dateStr}-${randomHex}`;
    }

    /**
     * Generate unique collision-safe Payment ID (e.g. PAY-2611-AB12)
     */
    static generatePaymentId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `PAY-${dateStr}-${randomHex}`;
    }

    /**
     * Generate unique collision-safe Document ID (e.g. DOC-2611-AB12)
     */
    static generateDocumentId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `DOC-${dateStr}-${randomHex}`;
    }

    /**
     * Generate unique collision-safe Project ID (e.g. PRJ-2611-AB12)
     */
    static generateProjectId() {
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `PRJ-${dateStr}-${randomHex}`;
    }

    // =========================================================================
    // STEP 1: FIELD ENGINEER WORKSPACE DATA
    // =========================================================================

    /**
     * Get aggregated workspace metrics and task list for Field Engineer
     */
    static async getEngineerWorkspaceData(engineerUser) {
        if (!engineerUser) throw new Error('User context required.');
        const isSuperAdmin = engineerUser.role === 'SUPER_ADMIN';
        const engineerId = engineerUser._id;
        const branchId = engineerUser.branchId ? (engineerUser.branchId._id || engineerUser.branchId) : null;

        // Base criteria enforcing assignment and branch isolation
        const leadQuery = isSuperAdmin
            ? {}
            : {
                $or: [
                    { assignedFieldEngineer: engineerId },
                    { branch: branchId, leadStatus: { $in: ['Qualified', 'Follow-up Required'] } }
                ]
            };

        const inspectionQuery = isSuperAdmin
            ? {}
            : {
                $or: [
                    { assignedFieldEngineer: engineerId },
                    { branch: branchId }
                ]
            };

        const projectQuery = isSuperAdmin
            ? {}
            : {
                branch: branchId
            };

        let assignedLeads = [];
        let inspections = [];
        let projects = [];

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            assignedLeads = await Lead.find(leadQuery)
                .populate('branch', 'name code')
                .sort({ updatedAt: -1 })
                .limit(50)
                .lean();

            inspections = await SiteInspection.find(inspectionQuery)
                .populate('branch', 'name code')
                .populate('leadId', 'name mobile leadId')
                .sort({ updatedAt: -1 })
                .limit(50)
                .lean();

            projects = await Project.find(projectQuery)
                .populate('customer', 'name mobile')
                .sort({ updatedAt: -1 })
                .limit(50)
                .lean();
        }

        const pendingVisits = inspections.filter(i => i.status === 'DRAFT');
        const completedVisits = inspections.filter(i => i.status === 'SUBMITTED' || i.status === 'VERIFIED');

        return {
            assignedLeads,
            inspections,
            pendingVisits,
            completedVisits,
            projects,
            stats: {
                totalAssignedLeads: assignedLeads.length,
                pendingInspectionsCount: pendingVisits.length,
                completedInspectionsCount: completedVisits.length,
                activeProjectsCount: projects.length
            }
        };
    }

    // =========================================================================
    // STEP 2: SITE INSPECTION & GPS PHOTOGRAPHS
    // =========================================================================

    /**
     * Create or update a site inspection record (Draft or Submitted)
     */
    static async saveInspection({
        inspectionId = null,
        leadId = null,
        customerId = null,
        engineerUser,
        customerName,
        customerMobile,
        siteAddress = '',
        city = 'Raisen',
        district = 'Raisen',
        state = 'Madhya Pradesh',
        pincode = '',
        coordinates = {},
        roofType = 'RCC_FLAT',
        totalRoofAreaSqFt = 0,
        shadowFreeAreaSqFt = 0,
        sanctionedLoadKw = 0,
        monthlyBillAmount = 0,
        monthlyUnitsKwh = 0,
        discomConsumerNo = '',
        discom = 'MPPKVVCL',
        connectionPhase = 'SINGLE_PHASE',
        recommendedCapacityKw = 0,
        dcCableLengthMeters = 0,
        acCableLengthMeters = 0,
        inverterLocation = '',
        earthingPitLocation = '',
        structureHeightFt = 0,
        technicalObservations = '',
        measurementsNotes = '',
        remarks = '',
        isSubmit = false
    }) {
        if (!engineerUser) throw new Error('Field Engineer identity required.');
        if (!customerName || !customerName.trim()) throw new Error('Customer name is required.');
        if (!customerMobile || !customerMobile.trim()) throw new Error('Customer mobile is required.');

        let inspection;
        if (inspectionId) {
            inspection = await SiteInspection.findOne({ inspectionId });
            if (!inspection) throw new Error('Inspection record not found.');
        } else {
            const newId = this.generateInspectionId();
            const branch = engineerUser.branchId || null;
            inspection = new SiteInspection({
                inspectionId: newId,
                assignedFieldEngineer: engineerUser._id,
                branch,
                createdBy: engineerUser._id
            });
        }

        // Branch Isolation Check: non-super admin cannot edit across branches
        if (engineerUser.role !== 'SUPER_ADMIN') {
            const userBranch = engineerUser.branchId ? (engineerUser.branchId._id || engineerUser.branchId).toString() : '';
            const inspBranch = inspection.branch ? (inspection.branch._id || inspection.branch).toString() : '';
            if (userBranch && inspBranch && userBranch !== inspBranch) {
                throw new Error('Branch isolation violation: Cannot access or modify inspection for another branch.');
            }
        }

        // Link Lead and Customer if available
        if (leadId && mongoose.isValidObjectId(leadId)) inspection.leadId = leadId;
        if (customerId && mongoose.isValidObjectId(customerId)) inspection.customerId = customerId;

        inspection.customerName = customerName.trim();
        inspection.customerMobile = customerMobile.trim();
        inspection.siteAddress = siteAddress.trim();
        inspection.city = city.trim();
        inspection.district = district.trim();
        inspection.state = state.trim();
        inspection.pincode = pincode.trim();

        // Process Geolocation Coordinates
        const hasLatLong = coordinates && typeof coordinates.latitude === 'number' && typeof coordinates.longitude === 'number';
        inspection.coordinates = {
            latitude: hasLatLong ? coordinates.latitude : null,
            longitude: hasLatLong ? coordinates.longitude : null,
            accuracyMeters: hasLatLong ? (coordinates.accuracyMeters || 10) : null,
            isGpsVerified: !!hasLatLong,
            gpsUnavailableReason: hasLatLong ? '' : (coordinates.gpsUnavailableReason || 'Geolocation unavailable or device permission denied')
        };

        inspection.roofType = roofType;
        inspection.totalRoofAreaSqFt = Number(totalRoofAreaSqFt) || 0;
        inspection.shadowFreeAreaSqFt = Number(shadowFreeAreaSqFt) || 0;
        inspection.sanctionedLoadKw = Number(sanctionedLoadKw) || 0;
        inspection.monthlyBillAmount = Number(monthlyBillAmount) || 0;
        inspection.monthlyUnitsKwh = Number(monthlyUnitsKwh) || 0;
        inspection.discomConsumerNo = discomConsumerNo.trim();
        inspection.discom = discom.trim();
        inspection.connectionPhase = connectionPhase;
        inspection.recommendedCapacityKw = Number(recommendedCapacityKw) || 0;
        inspection.dcCableLengthMeters = Number(dcCableLengthMeters) || 0;
        inspection.acCableLengthMeters = Number(acCableLengthMeters) || 0;
        inspection.inverterLocation = inverterLocation.trim();
        inspection.earthingPitLocation = earthingPitLocation.trim();
        inspection.structureHeightFt = Number(structureHeightFt) || 0;
        inspection.technicalObservations = technicalObservations.trim();
        inspection.measurementsNotes = measurementsNotes.trim();
        inspection.remarks = remarks.trim();
        inspection.updatedBy = engineerUser._id;

        if (isSubmit) {
            inspection.status = 'SUBMITTED';
            inspection.submittedAt = new Date();
        }

        await inspection.save();

        // If linked to lead, update lead status
        if (inspection.leadId && mongoose.connection && mongoose.connection.readyState === 1) {
            await Lead.findByIdAndUpdate(inspection.leadId, {
                inspectionId: inspection._id,
                inspectionStatus: isSubmit ? 'COMPLETED' : 'SCHEDULED',
                leadStatus: 'Qualified'
            });
        }

        AuditService.log({
            action: isSubmit ? 'INSPECTION_SUBMITTED' : 'INSPECTION_CREATED',
            user: engineerUser._id,
            role: engineerUser.role,
            branchId: inspection.branch,
            details: {
                inspectionId: inspection.inspectionId,
                customerName: inspection.customerName,
                isGpsVerified: inspection.coordinates.isGpsVerified,
                status: inspection.status
            }
        });

        return inspection;
    }

    /**
     * Upload photographs with GPS metadata to a site inspection
     */
    static async addInspectionPhoto(inspectionId, fileObj, gpsMetadata = {}, uploaderUser) {
        if (!inspectionId) throw new Error('Inspection ID is required.');
        if (!fileObj) throw new Error('Photo file payload is required.');

        let inspection = await SiteInspection.findOne({ inspectionId });
        if (!inspection) {
            if (mongoose.isValidObjectId(inspectionId)) {
                inspection = await SiteInspection.findById(inspectionId);
            }
        }
        if (!inspection) throw new Error('Site inspection record not found.');

        // Validate file through UploadService specifications
        const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const mimeType = (fileObj.type || fileObj.mimeType || '').toLowerCase().trim();
        if (!allowedMime.has(mimeType)) {
            throw new Error(`Security validation failed: File type "${mimeType}" is not allowed. Only JPEG, PNG, and WEBP images are permitted.`);
        }

        // Validate buffer size (5 MB limit)
        let buffer;
        if (Buffer.isBuffer(fileObj.data)) {
            buffer = fileObj.data;
        } else if (typeof fileObj.data === 'string') {
            const base64Clean = fileObj.data.replace(/^data:.*?;base64,/, '');
            buffer = Buffer.from(base64Clean, 'base64');
        } else {
            throw new Error('Invalid photo file buffer.');
        }

        if (buffer.length > 5 * 1024 * 1024) {
            throw new Error('Photo file exceeds the 5 MB maximum size limit.');
        }

        // Validate Magic Bytes
        const isMagicValid = UploadService.validateMagicBytes(buffer, mimeType);
        if (!isMagicValid) {
            throw new Error('Security check failed: Image content does not match declared image format.');
        }

        const photoId = crypto.randomUUID();
        const hasGps = gpsMetadata && typeof gpsMetadata.latitude === 'number' && typeof gpsMetadata.longitude === 'number';

        const photoRecord = {
            photoId,
            url: fileObj.url || `/uploads/inspections/${photoId}.jpg`,
            originalName: fileObj.name || fileObj.originalName || 'inspection_photo.jpg',
            category: fileObj.category || 'ROOF_TOP',
            latitude: hasGps ? gpsMetadata.latitude : null,
            longitude: hasGps ? gpsMetadata.longitude : null,
            accuracyMeters: hasGps ? (gpsMetadata.accuracyMeters || 10) : null,
            isGpsVerified: !!hasGps,
            gpsUnavailableReason: hasGps ? '' : (gpsMetadata.gpsUnavailableReason || 'GPS unavailable or permission denied by client device'),
            uploadedBy: uploaderUser ? uploaderUser._id : null,
            uploadedAt: new Date()
        };

        inspection.photos.push(photoRecord);
        await inspection.save();

        if (uploaderUser) {
            AuditService.log({
                action: 'INSPECTION_PHOTO_UPLOADED',
                user: uploaderUser._id,
                role: uploaderUser.role,
                branchId: inspection.branch,
                details: {
                    inspectionId: inspection.inspectionId,
                    photoId,
                    category: photoRecord.category,
                    isGpsVerified: photoRecord.isGpsVerified
                }
            });
        }

        return photoRecord;
    }

    /**
     * Manager verification of submitted inspection
     */
    static async verifyInspection(inspectionId, managerUser, { isApproved = true, notes = '' } = {}) {
        const inspection = await SiteInspection.findOne({ inspectionId });
        if (!inspection) throw new Error('Site inspection record not found.');

        // Enforce branch isolation
        if (managerUser.role !== 'SUPER_ADMIN') {
            const userBranch = managerUser.branchId ? (managerUser.branchId._id || managerUser.branchId).toString() : '';
            const inspBranch = inspection.branch ? (inspection.branch._id || inspection.branch).toString() : '';
            if (userBranch && inspBranch && userBranch !== inspBranch) {
                throw new Error('Branch isolation violation: Cannot verify inspection from another branch.');
            }
        }

        inspection.status = isApproved ? 'VERIFIED' : 'REVISION_REQUESTED';
        inspection.verifiedAt = new Date();
        inspection.verifiedBy = managerUser._id;
        inspection.verificationNotes = notes.trim();

        await inspection.save();

        AuditService.log({
            action: 'INSPECTION_VERIFIED',
            user: managerUser._id,
            role: managerUser.role,
            branchId: inspection.branch,
            details: {
                inspectionId: inspection.inspectionId,
                status: inspection.status,
                notes
            }
        });

        return inspection;
    }

    // =========================================================================
    // STEP 3: ONSITE QUOTATION INTEGRATION
    // =========================================================================

    /**
     * Create Onsite Quotation linked to Site Inspection and Lead
     * Reuses existing Quotation engine formulas and structure
     */
    static async createOnsiteQuotation(inspectionId, engineerUser, quotationInput = {}) {
        if (!engineerUser) throw new Error('Field Engineer identity required.');

        let inspection = null;
        if (inspectionId) {
            inspection = await SiteInspection.findOne({ inspectionId });
        }

        const capacityKw = Number(quotationInput.plantCapacityKw) || (inspection ? inspection.recommendedCapacityKw : 3) || 3;
        const baseRatePerKw = 45000; // Base market rate per kW in Madhya Pradesh
        const subtotal = capacityKw * baseRatePerKw;
        const gstRate = 12; // 12% solar concessional GST
        const gstAmount = Math.round(subtotal * (gstRate / 100));
        const grossTotal = subtotal + gstAmount;

        // PM Surya Ghar Subsidy formula (1 kW: 30,000, 2 kW: 60,000, 3+ kW: 78,000)
        let estimatedSubsidy = 0;
        if (capacityKw >= 3) estimatedSubsidy = 78000;
        else if (capacityKw >= 2) estimatedSubsidy = 60000;
        else if (capacityKw >= 1) estimatedSubsidy = 30000;

        const netPayable = Math.max(0, grossTotal - estimatedSubsidy);

        const yearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        const quotationNumber = `QT-${yearMonth}-${randomHex}`;

        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30); // 30-day validity

        const lineItems = [
            {
                description: `${capacityKw} kW Rooftop Solar PV System (Mono PERC DCR Panels + Dual MPPT Inverter)`,
                quantity: capacityKw,
                unit: 'kW',
                unitPrice: baseRatePerKw,
                taxableAmount: subtotal,
                gstRate: 12,
                lineTotal: subtotal
            }
        ];

        const quotation = new Quotation({
            quotationNumber,
            version: 1,
            customerName: quotationInput.customerName || (inspection ? inspection.customerName : 'Solar Client'),
            customerMobile: quotationInput.customerMobile || (inspection ? inspection.customerMobile : '9876543210'),
            customerAddress: quotationInput.customerAddress || (inspection ? inspection.siteAddress : ''),
            city: quotationInput.city || (inspection ? inspection.city : 'Raisen'),
            district: quotationInput.district || (inspection ? inspection.district : 'Raisen'),
            state: quotationInput.state || (inspection ? inspection.state : 'Madhya Pradesh'),
            pincode: quotationInput.pincode || (inspection ? inspection.pincode : ''),
            plantCapacityKw: capacityKw,
            systemType: quotationInput.systemType || 'ON_GRID',
            lineItems,
            subtotal,
            taxableValue: subtotal,
            gstRate: 12,
            totalGstAmount: gstAmount,
            grossTotal,
            grandTotal: grossTotal,
            estimatedSubsidy,
            netPayableAfterSubsidy: netPayable,
            advanceAmount: Math.round(grossTotal * 0.20),
            balanceAmount: Math.round(grossTotal * 0.80),
            validUntil,
            status: 'PENDING_APPROVAL',
            preparedBy: engineerUser._id,
            branch: engineerUser.branchId || (inspection ? inspection.branch : null)
        });

        await quotation.save();

        // Back-link to inspection and lead
        if (inspection) {
            inspection.quotationId = quotation._id;
            await inspection.save();
            if (inspection.leadId && mongoose.connection && mongoose.connection.readyState === 1) {
                await Lead.findByIdAndUpdate(inspection.leadId, { quotationId: quotation._id });
            }
        }

        return quotation;
    }

    // =========================================================================
    // STEP 4: CUSTOMER ACCEPTANCE & CUSTOMER DOCUMENTS
    // =========================================================================

    /**
     * Record customer quotation acceptance, rejection, or revision request
     */
    static async recordCustomerAcceptance(quotationId, user, { status, remarks = '' }) {
        if (!quotationId) throw new Error('Quotation ID is required.');
        const validStatuses = ['ACCEPTED', 'REJECTED', 'REVISION_REQUESTED'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid acceptance status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        if (status === 'ACCEPTED') {
            quotation.status = 'CUSTOMER_ACCEPTED';
            quotation.customerResponse = {
                status: 'ACCEPTED',
                responseDate: new Date(),
                recordedBy: user ? user._id : null,
                remarks: remarks.trim()
            };
        } else if (status === 'REJECTED') {
            quotation.status = 'CUSTOMER_REJECTED';
            quotation.customerResponse = {
                status: 'REJECTED',
                responseDate: new Date(),
                recordedBy: user ? user._id : null,
                remarks: remarks.trim()
            };
        } else {
            quotation.status = 'DRAFT'; // Revision requested moves back to draft
            quotation.customerResponse = {
                status: 'REVISION_REQUESTED',
                responseDate: new Date(),
                recordedBy: user ? user._id : null,
                remarks: remarks.trim()
            };
        }

        await quotation.save();

        if (user) {
            AuditService.log({
                action: status === 'ACCEPTED' ? 'CUSTOMER_ACCEPTED_QUOTATION' : 'CUSTOMER_REJECTED_QUOTATION',
                user: user._id,
                role: user.role,
                branchId: quotation.branch,
                details: {
                    quotationNumber: quotation.quotationNumber,
                    status,
                    remarks
                }
            });
        }

        return quotation;
    }

    /**
     * Upload customer compliance and onboarding documents
     */
    static async uploadCustomerDocument({
        customerId = null,
        leadId = null,
        quotationId = null,
        category = 'OTHER',
        title,
        fileObj,
        user
    }) {
        if (!title || !title.trim()) throw new Error('Document title is required.');
        if (!fileObj) throw new Error('File payload is required.');

        const validCategories = [
            'IDENTITY_PROOF',
            'ADDRESS_PROOF',
            'ELECTRICITY_BILL',
            'SITE_PHOTOGRAPHS',
            'PROPERTY_DOCUMENTS',
            'BANK_PAYMENT_DOCUMENTS',
            'OTHER'
        ];
        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }

        const documentId = this.generateDocumentId();
        const doc = new CustomerDocument({
            documentId,
            customerId,
            leadId,
            quotationId,
            branch: user ? user.branchId : null,
            category,
            title: title.trim(),
            originalFilename: fileObj.name || fileObj.originalName || 'document.pdf',
            fileUrl: fileObj.url || `/uploads/documents/${documentId}.pdf`,
            mimeType: fileObj.type || fileObj.mimeType || 'application/pdf',
            fileSizeBytes: fileObj.size || (fileObj.data ? fileObj.data.length : 0),
            uploadedBy: user ? user._id : null,
            uploadedAt: new Date()
        });

        await doc.save();

        if (user) {
            AuditService.log({
                action: 'CUSTOMER_DOCUMENT_UPLOADED',
                user: user._id,
                role: user.role,
                branchId: doc.branch,
                details: {
                    documentId,
                    category,
                    title: doc.title
                }
            });
        }

        return doc;
    }

    // =========================================================================
    // STEP 5: FINANCE PAYMENT VERIFICATION (MAKER-CHECKER SEPARATION)
    // =========================================================================

    /**
     * Record a new customer payment entry (Maker step)
     */
    static async recordPayment({
        customerId = null,
        leadId = null,
        quotationId = null,
        projectId = null,
        amount,
        paymentMode = 'BANK_TRANSFER',
        transactionRef = '',
        receiptUrl = '',
        receiptFilename = '',
        remarks = '',
        user
    }) {
        if (!user) throw new Error('User identity required.');
        const parsedAmount = Number(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new Error('Payment amount must be greater than zero.');
        }

        const validModes = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI_ONLINE', 'OTHER'];
        if (!validModes.includes(paymentMode)) {
            throw new Error(`Invalid payment mode. Must be one of: ${validModes.join(', ')}`);
        }

        const paymentId = this.generatePaymentId();
        const branch = user.branchId || null;

        const payment = new PaymentRecord({
            paymentId,
            customerId,
            leadId,
            quotationId,
            projectId,
            branch,
            amount: parsedAmount,
            paymentMode,
            transactionRef: transactionRef.trim(),
            receiptUrl: receiptUrl.trim(),
            receiptFilename: receiptFilename.trim(),
            remarks: remarks.trim(),
            status: 'PENDING',
            enteredBy: user._id
        });

        await payment.save();

        AuditService.log({
            action: 'PAYMENT_RECORDED',
            user: user._id,
            role: user.role,
            branchId: payment.branch,
            details: {
                paymentId,
                amount: parsedAmount,
                paymentMode,
                transactionRef
            }
        });

        return payment;
    }

    /**
     * Verify or reject a payment (Checker step with strict Maker-Checker separation)
     */
    static async verifyPayment(paymentId, verifierUser, { action = 'VERIFY', rejectionReason = '', remarks = '' } = {}) {
        if (!verifierUser) throw new Error('Verifier identity required.');

        let payment = await PaymentRecord.findOne({ paymentId });
        if (!payment && mongoose.isValidObjectId(paymentId)) {
            payment = await PaymentRecord.findById(paymentId);
        }
        if (!payment) throw new Error('Payment record not found.');

        if (payment.status === 'VERIFIED') {
            throw new Error('This payment is already verified.');
        }

        // STRICT MAKER-CHECKER ENFORCEMENT:
        // The user who entered/recorded the payment CANNOT verify it, unless they are the Primary Super Admin.
        if (payment.enteredBy && String(payment.enteredBy) === String(verifierUser._id)) {
            if (!AuthorizationService.isPrimarySuperAdmin(verifierUser)) {
                throw new Error('Maker-Checker Violation: You cannot verify a payment that you recorded. An authorized manager or finance officer must verify.');
            }
        }

        // Branch Isolation Check: non-super admin must verify in own branch
        if (verifierUser.role !== 'SUPER_ADMIN') {
            const userBranch = verifierUser.branchId ? (verifierUser.branchId._id || verifierUser.branchId).toString() : '';
            const paymentBranch = payment.branch ? (payment.branch._id || payment.branch).toString() : '';
            if (userBranch && paymentBranch && userBranch !== paymentBranch) {
                throw new Error('Branch isolation violation: Cannot verify payments for another branch.');
            }
        }

        if (action === 'VERIFY') {
            payment.status = 'VERIFIED';
            payment.verifiedBy = verifierUser._id;
            payment.verifiedAt = new Date();
            payment.remarks = remarks ? remarks.trim() : payment.remarks;
        } else {
            payment.status = 'REJECTED';
            payment.verifiedBy = verifierUser._id;
            payment.verifiedAt = new Date();
            payment.rejectionReason = rejectionReason.trim() || 'Payment details rejected during audit';
        }

        await payment.save();

        AuditService.log({
            action: action === 'VERIFY' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
            user: verifierUser._id,
            role: verifierUser.role,
            branchId: payment.branch,
            details: {
                paymentId: payment.paymentId,
                amount: payment.amount,
                status: payment.status
            }
        });

        return payment;
    }

    // =========================================================================
    // STEP 6: CONFIGURABLE PAYMENT ACTIVATION POLICY & EXCEPTIONS
    // =========================================================================

    /**
     * Get or initialize active payment policy
     */
    static async getPaymentPolicy(branchId = null) {
        let policy = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            policy = await PaymentPolicy.findOne({ policyKey: 'GLOBAL_PAYMENT_POLICY' }).lean();
        }

        if (!policy) {
            return {
                policyType: 'PARTIAL_ADVANCE_PERCENTAGE',
                defaultAdvancePercentage: 20,
                allowExceptionApproval: true,
                exceptions: []
            };
        }

        // Check branch override
        if (branchId && policy.branchOverrides && policy.branchOverrides.length > 0) {
            const override = policy.branchOverrides.find(b => String(b.branch) === String(branchId));
            if (override) {
                return {
                    policyType: override.policyType,
                    defaultAdvancePercentage: override.minAdvancePercentage,
                    allowExceptionApproval: policy.allowExceptionApproval,
                    exceptions: policy.exceptions || []
                };
            }
        }

        return policy;
    }

    /**
     * Request an exceptional payment policy waiver
     */
    static async requestPaymentException(quotationId, requesterUser, { reason, waivedPercentage = 100 }) {
        if (!quotationId) throw new Error('Quotation ID is required.');
        if (!reason || !reason.trim()) throw new Error('Justification reason is required for exception request.');

        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation record not found.');

        let policy = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            policy = await PaymentPolicy.findOne({ policyKey: 'GLOBAL_PAYMENT_POLICY' });
        }
        if (!policy) {
            policy = this._lastPolicyMock || new PaymentPolicy({ policyKey: 'GLOBAL_PAYMENT_POLICY', exceptions: [] });
        }

        const exceptionId = `EXC-${Date.now().toString(36).toUpperCase()}`;
        const newException = {
            exceptionId,
            quotationId: quotation._id,
            requestedBy: requesterUser._id,
            requestedByName: requesterUser.name,
            reason: reason.trim(),
            waivedPercentage: Number(waivedPercentage) || 0,
            status: 'REQUESTED'
        };

        if (!policy.exceptions) policy.exceptions = [];
        policy.exceptions.push(newException);
        this._lastPolicyMock = policy;
        await policy.save();

        return newException;
    }

    /**
     * Approve or reject a payment exception (Manager / Super Admin)
     */
    static async approvePaymentException(exceptionId, approverUser, isApproved = true) {
        if (!approverUser) throw new Error('Approver context required.');
        if (!['SUPER_ADMIN', 'MANAGER'].includes(approverUser.role)) {
            throw new Error('Only Super Admin or Manager can approve payment policy exceptions.');
        }

        let policy = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            policy = await PaymentPolicy.findOne({ policyKey: 'GLOBAL_PAYMENT_POLICY' });
        }
        if (!policy) {
            policy = this._lastPolicyMock || new PaymentPolicy({ policyKey: 'GLOBAL_PAYMENT_POLICY', exceptions: [] });
        }

        if (!policy || !policy.exceptions) throw new Error('Payment policy not found.');

        const exc = policy.exceptions.find(e => e.exceptionId === exceptionId);
        if (!exc) throw new Error('Exception request not found.');

        exc.status = isApproved ? 'APPROVED' : 'REJECTED';
        exc.approvedBy = approverUser._id;
        exc.approvedByName = approverUser.name;
        exc.approvedAt = new Date();

        this._lastPolicyMock = policy;
        await policy.save();

        AuditService.log({
            action: 'PAYMENT_EXCEPTION_APPROVED',
            user: approverUser._id,
            role: approverUser.role,
            details: {
                exceptionId,
                quotationId: exc.quotationId,
                status: exc.status
            }
        });

        return exc;
    }

    /**
     * Evaluate whether a quotation satisfies project activation conditions
     */
    static async checkProjectActivationEligibility(quotationId, branchId = null) {
        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        const missingRequirements = [];

        // Condition 1: Customer Quotation Acceptance
        if (quotation.status !== 'CUSTOMER_ACCEPTED') {
            missingRequirements.push('Customer has not formally accepted the quotation proposal.');
        }

        // Condition 2: Customer Documents
        let docsCount = 0;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            docsCount = await CustomerDocument.countDocuments({
                $or: [
                    { quotationId: quotation._id },
                    { customerId: quotation.customerId }
                ]
            });
        }
        if (docsCount === 0) {
            missingRequirements.push('Required customer onboarding documents have not been uploaded.');
        }

        // Condition 3: Finance Payment Verification
        let verifiedPaymentsTotal = 0;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const verifiedRecords = await PaymentRecord.find({
                $or: [
                    { quotationId: quotation._id },
                    { customerId: quotation.customerId }
                ],
                status: 'VERIFIED' // ONLY VERIFIED payments count!
            }).lean();

            verifiedPaymentsTotal = verifiedRecords.reduce((sum, p) => sum + (p.amount || 0), 0);
        }

        const policy = await this.getPaymentPolicy(branchId || quotation.branch);
        const grandTotal = quotation.grandTotal || 0;
        let requiredPaymentAmount = 0;

        if (policy.policyType === 'FULL_PAYMENT_100') {
            requiredPaymentAmount = grandTotal;
        } else {
            // Partial Advance Percentage
            const pct = policy.defaultAdvancePercentage || 20;
            requiredPaymentAmount = Math.round(grandTotal * (pct / 100));
        }

        // Check if an approved exception exists
        let hasApprovedException = false;
        if (policy.exceptions && policy.exceptions.length > 0) {
            hasApprovedException = policy.exceptions.some(
                e => String(e.quotationId) === String(quotation._id) && e.status === 'APPROVED'
            );
        }

        const paymentSatisfied = verifiedPaymentsTotal >= requiredPaymentAmount || hasApprovedException;
        if (!paymentSatisfied) {
            missingRequirements.push(`Verified payments (₹${verifiedPaymentsTotal.toLocaleString('en-IN')}) do not meet required threshold (₹${requiredPaymentAmount.toLocaleString('en-IN')}).`);
        }

        return {
            isEligible: missingRequirements.length === 0,
            verifiedPaymentsTotal,
            requiredPaymentAmount,
            policyType: policy.policyType,
            hasApprovedException,
            missingRequirements
        };
    }

    // =========================================================================
    // STEP 7: PROJECT ACTIVATION
    // =========================================================================

    /**
     * Activate a new Project from an accepted & cleared Quotation
     * Prevents duplicate project creation
     */
    static async activateProject(quotationId, activatingUser) {
        if (!activatingUser) throw new Error('User context required.');
        const quotation = await Quotation.findById(quotationId);
        if (!quotation) throw new Error('Quotation not found.');

        // Prevent Duplicate Project Creation
        const existingProject = await Project.findOne({ quotation: quotation._id });
        if (existingProject) {
            return {
                project: existingProject,
                alreadyActivated: true,
                message: `Project ${existingProject.projectNumber} is already active for this quotation.`
            };
        }

        // Verify Eligibility
        const eligibility = await this.checkProjectActivationEligibility(quotation._id, quotation.branch);
        if (!eligibility.isEligible) {
            throw new Error(`Project Activation Blocked: ${eligibility.missingRequirements.join(' ')}`);
        }

        const projectNumber = this.generateProjectId();
        const project = new Project({
            projectNumber,
            title: `${quotation.plantCapacityKw} kW Solar Rooftop — ${quotation.customerName}`,
            customer: quotation.customerId || quotation.customer,
            quotation: quotation._id,
            branch: quotation.branch,
            capacityKw: quotation.plantCapacityKw,
            status: 'PLANNING',
            stage: 'SITE_READY',
            assignedManager: activatingUser._id,
            createdBy: activatingUser._id
        });

        await project.save();

        // Update Lead if linked
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await Lead.updateMany(
                { quotationId: quotation._id },
                { projectId: project._id, leadStatus: 'Converted' }
            );
        }

        AuditService.log({
            action: 'PROJECT_ACTIVATED',
            user: activatingUser._id,
            role: activatingUser.role,
            branchId: quotation.branch,
            details: {
                projectNumber,
                quotationNumber: quotation.quotationNumber,
                customerName: quotation.customerName,
                capacityKw: quotation.plantCapacityKw
            }
        });

        return {
            project,
            alreadyActivated: false,
            message: `Project ${projectNumber} successfully activated.`
        };
    }
}

module.exports = FieldEngineerService;
