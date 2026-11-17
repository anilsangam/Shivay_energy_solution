/**
 * Page Controller - Handles dynamic rendering of all pages using centralized data & database CMS
 */
const mongoose = require('mongoose');
const data = require('../config/company');
const DataStore = require('../services/dataStore');
const WebsiteService = require('../services/websiteService');
const Enquiry = require('../models/Enquiry');

exports.getHome = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/index', {
        title: `${siteData.company.name} | ${siteData.company.tagline}`,
        metaDescription: `Official website of ${siteData.company.name}, Raisen (M.P.). Rooftop Solar, Inverters, Panels & PM Surya Ghar Muft Bijli Yojana subsidy assistance.`,
        data: siteData,
        company: siteData.company,
        activePage: 'home'
    });
};

exports.getAbout = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/about', {
        title: `About Us | ${siteData.company.name} - Solar Energy Experts in Raisen, MP`,
        metaDescription: `Know more about ${siteData.company.name}, founded by Deepak Kushwaha & Rahul Saini in Raisen, Madhya Pradesh. Turnkey solar rooftop solutions across Central India.`,
        data: siteData,
        company: siteData.company,
        activePage: 'about'
    });
};

exports.getServices = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/services', {
        title: `Solar & EV Services | ${siteData.company.name}`,
        metaDescription: `Residential and commercial solar, agricultural pumps, EV charger installation, and maintenance services across Raisen and Madhya Pradesh.`,
        data: siteData,
        company: siteData.company,
        activePage: 'services'
    });
};

exports.getProducts = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/products', {
        title: `Solar Products & Inverters | ${siteData.company.name}`,
        metaDescription: `Explore On-Grid, Off-Grid, and Hybrid Solar Inverters, Mono PERC Solar Panels, and Lithium Batteries available at ${siteData.company.name}.`,
        data: siteData,
        company: siteData.company,
        activePage: 'products'
    });
};

exports.getCareers = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/careers', {
        title: `Careers & Opportunities | ${siteData.company.name}`,
        metaDescription: `Explore job, tender, and freelance opportunities with ${siteData.company.name} in solar energy and EV charging across Madhya Pradesh.`,
        data: siteData,
        company: siteData.company,
        activePage: 'careers'
    });
};

exports.getProjects = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/projects', {
        title: `Completed Solar Projects | ${siteData.company.name} - Portfolio`,
        metaDescription: `View residential, commercial, and agricultural solar rooftop installations completed by ${siteData.company.name} in Madhya Pradesh.`,
        data: siteData,
        company: siteData.company,
        activePage: 'projects'
    });
};

exports.getCalculator = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/calculator', {
        title: `India Solar Savings Calculator | ${siteData.company.name}`,
        metaDescription: `Calculate your rooftop solar capacity, estimated monthly units generation, savings in ₹ and PM Surya Ghar subsidy eligibility.`,
        data: siteData,
        company: siteData.company,
        calculatorConfig: siteData.calculator,
        activePage: 'calculator'
    });
};

exports.getContact = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    res.render('public-site/contact', {
        title: `Contact Us | ${siteData.company.name} - Raisen (M.P.)`,
        metaDescription: `Contact ${siteData.company.name}, Ward No. 15, PHE Office, Arjun Nagar, Raisen.`,
        data: siteData,
        company: siteData.company,
        activePage: 'contact'
    });
};

exports.getPrivacyPolicy = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    const policyContent = WebsiteService.getPrivacyPolicyContent(siteData.company);
    res.render('public-site/privacy-policy', {
        title: `Privacy Policy | ${siteData.company.name}`,
        metaDescription: `Official Privacy Policy of ${siteData.company.name}, Raisen (M.P.). Transparent details on solar site survey data, PM Surya Ghar subsidy KYC, and consumer rights.`,
        data: siteData,
        company: siteData.company,
        policyContent,
        lastUpdated: siteData.company.privacyPolicyUpdatedAt || new Date(),
        activePage: 'privacy-policy'
    });
};

exports.getTermsConditions = async (req, res) => {
    const siteData = await WebsiteService.getPublicSiteData();
    const termsContent = WebsiteService.getTermsConditionsContent(siteData.company);
    res.render('public-site/terms-and-conditions', {
        title: `Terms & Conditions | ${siteData.company.name}`,
        metaDescription: `Terms and conditions for turnkey rooftop solar installation, PM Surya Ghar subsidy facilitation, equipment warranties, and DISCOM net-metering with ${siteData.company.name}.`,
        data: siteData,
        company: siteData.company,
        termsContent,
        lastUpdated: siteData.company.termsAndConditionsUpdatedAt || new Date(),
        activePage: 'terms-and-conditions'
    });
};

// Handle Customer Enquiry submission
exports.submitEnquiry = async (req, res) => {
    const { name, mobile, email, state, district, pincode, solarRequirement, monthlyBill, message } = req.body;
    
    // Validate Indian 10-digit mobile number
    const cleanMobile = (mobile || '').replace(/\D/g, '').slice(-10);
    if (!cleanMobile || cleanMobile.length !== 10) {
        return res.status(400).json({ success: false, message: "Please provide a valid 10-digit Indian mobile number." });
    }

    const savedEnquiry = DataStore.addEnquiry({
        name: name || 'Interested Customer',
        mobile: cleanMobile,
        email: email || '',
        state: state || 'Madhya Pradesh',
        district: district || 'Raisen',
        pincode: pincode || '464551',
        solarRequirement: solarRequirement || 'Residential Rooftop (PM Surya Ghar)',
        monthlyBill: monthlyBill || 0,
        message: message || ''
    });

    if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
            await Enquiry.create({
                enquiryId: savedEnquiry.id,
                name: savedEnquiry.name,
                mobile: savedEnquiry.mobile,
                email: savedEnquiry.email,
                state: savedEnquiry.state,
                district: savedEnquiry.district,
                pincode: savedEnquiry.pincode,
                solarRequirement: savedEnquiry.solarRequirement,
                monthlyBill: savedEnquiry.monthlyBill,
                message: savedEnquiry.message,
                status: 'new'
            });
        } catch (dbErr) {
            console.error('Error saving enquiry to MongoDB:', dbErr.message);
        }
    }

    console.log(`[ENQUIRY SAVED] ID: ${savedEnquiry.id}, Name: ${savedEnquiry.name}, Mobile: ${savedEnquiry.mobile}, District: ${savedEnquiry.district}, Req: ${savedEnquiry.requirement}`);

    return res.json({
        success: true,
        enquiryId: savedEnquiry.id,
        message: `Dhanyawad ${savedEnquiry.name}! Aapki enquiry (#${savedEnquiry.id}) Shivay Energy Solutions me darj ho gayi hai. Hamare expert jald hi aapse ${savedEnquiry.mobile} par sampark karenge.`,
        whatsappRedirect: `https://wa.me/917000575496?text=Namaste%20Shivay%20Energy,%20I%20have%20submitted%20enquiry%20(${savedEnquiry.id})%20for%20${encodeURIComponent(savedEnquiry.requirement)}.%20My%20contact:%20${cleanMobile}`
    });
};
