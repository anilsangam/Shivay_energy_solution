const mongoose = require('mongoose');
const data = require('../config/company');
const WebsiteService = require('../services/websiteService');
const FranchiseApplication = require('../models/FranchiseApplication');

// In-memory fallback
let memFranchise = [];

exports.getMemFranchise = () => memFranchise;

exports.getFranchisePage = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/franchise', {
        title: `Franchise & Dealership Partnership | ${siteData.company.name}`,
        metaDescription: `Become an authorized solar dealer or franchise partner of ${siteData.company.name} in Madhya Pradesh. High margin solar business opportunity.`,
        data: siteData,
        company: siteData.company,
        activePage: 'franchise'
    });
};

exports.submitFranchise = async (req, res) => {
    try {
        const { applicantName, mobile, email, state, district, city, investmentCapacity, businessBackground, message } = req.body;
        const cleanMobile = (mobile || '').replace(/\D/g, '').slice(-10);

        if (!applicantName || !applicantName.trim()) {
            return res.status(400).json({ success: false, message: 'Applicant or business name is required.' });
        }
        if (!cleanMobile || cleanMobile.length !== 10) {
            return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit Indian mobile number.' });
        }
        if (!district || !district.trim()) {
            return res.status(400).json({ success: false, message: 'Target district is required.' });
        }

        const appData = {
            applicationId: 'FRA-' + Math.floor(100000 + Math.random() * 900000),
            applicantName: applicantName.trim(),
            mobile: cleanMobile,
            email: (email || '').trim().toLowerCase(),
            state: (state || 'Madhya Pradesh').trim(),
            district: district.trim(),
            city: (city || '').trim(),
            investmentCapacity: (investmentCapacity || '₹2 Lakh - ₹5 Lakh').trim(),
            businessBackground: (businessBackground || '').trim(),
            message: (message || '').trim(),
            status: 'new'
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const saved = await FranchiseApplication.create(appData);
            appData._id = saved._id;
            appData.applicationId = saved.applicationId;
        } else {
            appData._id = new mongoose.Types.ObjectId();
            memFranchise.unshift(appData);
        }

        console.log(`[FRANCHISE APPLICATION] ${appData.applicationId}: ${appData.applicantName}, Mobile: ${appData.mobile}, District: ${appData.district}`);

        return res.json({
            success: true,
            applicationId: appData.applicationId,
            message: `Dhanyawad ${appData.applicantName}! Aapka franchise aavedan (#${appData.applicationId}) prapt hua hai. Hamare business development team Deepak Kushwaha (+91 70005 75496) aapse jald sampark karenge.`,
            whatsappRedirect: `https://wa.me/917000575496?text=Namaste%20Deepak%20ji,%20I%20have%20submitted%20Franchise%20Application%20(${appData.applicationId})%20for%20${encodeURIComponent(appData.district || 'MP')}.%20Applicant:%20${encodeURIComponent(appData.applicantName)}`
        });
    } catch (err) {
        console.error('Error submitting franchise application:', err);
        return res.status(500).json({ success: false, message: 'Server error while submitting application.' });
    }
};
