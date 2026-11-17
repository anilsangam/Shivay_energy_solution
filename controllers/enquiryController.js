const mongoose = require('mongoose');
const Enquiry = require('../models/Enquiry');
const FranchiseApplication = require('../models/FranchiseApplication');
const DataStore = require('../services/dataStore');
const WebsiteService = require('../services/websiteService');

// ==========================================
// 1. FREE SOLAR SITE SURVEY ENQUIRIES
// ==========================================

exports.getSurveysPage = async (req, res) => {
    try {
        const company = WebsiteService.getLiveCompanyData();
        const statusFilter = (req.query.status || '').trim();
        const search = (req.query.search || '').trim().toLowerCase();

        let dbSurveys = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                let query = {};
                if (statusFilter) query.status = statusFilter;
                dbSurveys = await Enquiry.find(query).sort({ createdAt: -1 }).lean();
            } catch (dbErr) {
                console.error('[EnquiryController] DB Error fetching surveys:', dbErr);
            }
        }

        // Merge with memory DataStore enquiries if available
        const memSurveys = DataStore.getAllEnquiries ? DataStore.getAllEnquiries() : [];
        const seenIds = new Set(dbSurveys.map(s => (s.enquiryId || '').toUpperCase()));

        let surveys = [...dbSurveys];
        memSurveys.forEach(m => {
            const mId = m.enquiryId || m.id;
            if (mId && !seenIds.has(mId.toUpperCase())) {
                if (!statusFilter || m.status === statusFilter) {
                    surveys.push({ ...m, enquiryId: mId });
                }
            }
        });

        // Filter by search query
        if (search) {
            surveys = surveys.filter(s => {
                const sMobile = (s.mobile || '').replace(/[^0-9]/g, '');
                const cleanSearch = search.replace(/[^0-9]/g, '');
                const mobileMatches = cleanSearch ? sMobile.includes(cleanSearch) : (s.mobile && s.mobile.toLowerCase().includes(search));
                return (
                    (s.enquiryId && s.enquiryId.toLowerCase().includes(search)) ||
                    (s.name && s.name.toLowerCase().includes(search)) ||
                    mobileMatches ||
                    (s.district && s.district.toLowerCase().includes(search)) ||
                    (s.solarRequirement && s.solarRequirement.toLowerCase().includes(search))
                );
            });
        }

        // Calculate counts
        const allSurveys = dbSurveys.concat(memSurveys.filter(m => !seenIds.has((m.enquiryId || m.id || '').toUpperCase())));
        const counts = {
            total: allSurveys.length,
            new: allSurveys.filter(s => s.status === 'new').length,
            contacted: allSurveys.filter(s => s.status === 'contacted').length,
            survey_scheduled: allSurveys.filter(s => s.status === 'survey_scheduled').length,
            converted: allSurveys.filter(s => s.status === 'converted').length,
            closed: allSurveys.filter(s => s.status === 'closed' || s.status === 'cancelled').length
        };

        res.render('private/admin/enquiries/surveys', {
            title: `Solar Site Survey Leads | ${company.name}`,
            company,
            surveys,
            counts,
            currentStatus: statusFilter,
            search,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'admin-surveys',
            pageTitle: 'Free Solar Site Survey Enquiries'
        });
    } catch (err) {
        console.error('[EnquiryController] Error in getSurveysPage:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load solar site surveys.'
        });
    }
};

exports.updateSurveyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note, followUpDate } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required.' });
        }

        let survey = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            // Find by _id or enquiryId
            if (mongoose.Types.ObjectId.isValid(id)) {
                survey = await Enquiry.findById(id);
            }
            if (!survey) {
                survey = await Enquiry.findOne({ enquiryId: id });
            }

            if (survey) {
                survey.status = status;
                if (followUpDate) survey.followUpDate = new Date(followUpDate);
                if (note && note.trim()) {
                    survey.notes.push({
                        author: req.session.user ? req.session.user.name : 'Super Admin',
                        note: note.trim(),
                        date: new Date()
                    });
                }
                await survey.save();
            }
        }

        // Also update in DataStore if present
        if (DataStore.updateEnquiryStatus) {
            DataStore.updateEnquiryStatus(id, status, note);
        }

        return res.json({ success: true, message: 'Survey enquiry status updated successfully.', survey });
    } catch (err) {
        console.error('[EnquiryController] Error updating survey status:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating status.' });
    }
};

exports.deleteSurvey = async (req, res) => {
    try {
        const { id } = req.params;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                await Enquiry.findByIdAndDelete(id);
            } else {
                await Enquiry.findOneAndDelete({ enquiryId: id });
            }
        }
        if (DataStore.deleteEnquiry) {
            DataStore.deleteEnquiry(id);
        }
        return res.json({ success: true, message: 'Survey lead deleted successfully.' });
    } catch (err) {
        console.error('[EnquiryController] Error deleting survey:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting survey lead.' });
    }
};

// ==========================================
// 2. FRANCHISE / DEALER APPLICATIONS
// ==========================================

exports.getFranchiseApplicationsPage = async (req, res) => {
    try {
        const company = WebsiteService.getLiveCompanyData();
        const statusFilter = (req.query.status || '').trim();
        const search = (req.query.search || '').trim().toLowerCase();

        let dbApps = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                let query = {};
                if (statusFilter) query.status = statusFilter;
                dbApps = await FranchiseApplication.find(query).sort({ createdAt: -1 }).lean();
            } catch (dbErr) {
                console.error('[EnquiryController] DB Error fetching franchise applications:', dbErr);
            }
        }

        // Merge with memory DataStore franchise applications if any
        const memApps = DataStore.getAllFranchiseApplications ? DataStore.getAllFranchiseApplications() : [];
        const seenIds = new Set(dbApps.map(a => (a.applicationId || '').toUpperCase()));

        let applications = [...dbApps];
        memApps.forEach(m => {
            if (m.applicationId && !seenIds.has(m.applicationId.toUpperCase())) {
                if (!statusFilter || m.status === statusFilter) {
                    applications.push(m);
                }
            }
        });

        // Filter by search query
        if (search) {
            applications = applications.filter(a => {
                return (
                    (a.applicationId && a.applicationId.toLowerCase().includes(search)) ||
                    (a.applicantName && a.applicantName.toLowerCase().includes(search)) ||
                    (a.mobile && a.mobile.includes(search)) ||
                    (a.district && a.district.toLowerCase().includes(search)) ||
                    (a.city && a.city.toLowerCase().includes(search)) ||
                    (a.investmentCapacity && a.investmentCapacity.toLowerCase().includes(search))
                );
            });
        }

        // Calculate counts
        const allApps = dbApps.concat(memApps.filter(m => !seenIds.has((m.applicationId || '').toUpperCase())));
        const counts = {
            total: allApps.length,
            new: allApps.filter(a => a.status === 'new').length,
            contacted: allApps.filter(a => a.status === 'contacted').length,
            under_review: allApps.filter(a => a.status === 'under_review').length,
            approved: allApps.filter(a => a.status === 'approved').length,
            rejected: allApps.filter(a => a.status === 'rejected').length
        };

        res.render('private/admin/enquiries/franchise', {
            title: `Franchise & Dealer Applications | ${company.name}`,
            company,
            applications,
            counts,
            currentStatus: statusFilter,
            search,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'admin-franchise',
            pageTitle: 'Franchise & Channel Partner Applications'
        });
    } catch (err) {
        console.error('[EnquiryController] Error in getFranchiseApplicationsPage:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load franchise applications.'
        });
    }
};

exports.updateFranchiseStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required.' });
        }

        let appDoc = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                appDoc = await FranchiseApplication.findById(id);
            }
            if (!appDoc) {
                appDoc = await FranchiseApplication.findOne({ applicationId: id });
            }

            if (appDoc) {
                appDoc.status = status;
                if (note && note.trim()) {
                    appDoc.notes.push({
                        author: req.session.user ? req.session.user.name : 'Super Admin',
                        note: note.trim(),
                        date: new Date()
                    });
                }
                await appDoc.save();
            }
        }

        if (DataStore.updateFranchiseStatus) {
            DataStore.updateFranchiseStatus(id, status, note);
        }

        return res.json({ success: true, message: 'Franchise application status updated successfully.', application: appDoc });
    } catch (err) {
        console.error('[EnquiryController] Error updating franchise status:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating status.' });
    }
};

exports.deleteFranchiseApplication = async (req, res) => {
    try {
        const { id } = req.params;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                await FranchiseApplication.findByIdAndDelete(id);
            } else {
                await FranchiseApplication.findOneAndDelete({ applicationId: id });
            }
        }
        if (DataStore.deleteFranchiseApplication) {
            DataStore.deleteFranchiseApplication(id);
        }
        return res.json({ success: true, message: 'Franchise application deleted successfully.' });
    } catch (err) {
        console.error('[EnquiryController] Error deleting franchise application:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting application.' });
    }
};
