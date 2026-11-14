/**
 * Page Controller - Handles dynamic rendering of all pages using centralized data
 */
const data = require('../config/company');
const DataStore = require('../services/dataStore');

exports.getHome = (req, res) => {
    res.render('index', {
        title: `${data.company.name} | ${data.company.tagline}`,
        metaDescription: `Official website of ${data.company.name}, Raisen (M.P.). Rooftop Solar, Inverters, Panels & PM Surya Ghar Muft Bijli Yojana subsidy assistance.`,
        data,
        activePage: 'home'
    });
};

exports.getAbout = (req, res) => {
    res.render('about', {
        title: `About Us | ${data.company.name} - Solar Energy Experts in Raisen, MP`,
        metaDescription: `Know more about ${data.company.name}, founded by Deepak Kushwaha & Rahul Saini in Raisen, Madhya Pradesh. Turnkey solar rooftop solutions across Central India.`,
        data,
        activePage: 'about'
    });
};

exports.getServices = (req, res) => {
    res.render('services', {
        title: `Solar & EV Services | ${data.company.name}`,
        metaDescription: `Residential and commercial solar, agricultural pumps, EV charger installation, and maintenance services across Raisen and Madhya Pradesh.`,
        data,
        activePage: 'services'
    });
};

exports.getProducts = (req, res) => {
    res.render('products', {
        title: `Solar Products & Inverters | ${data.company.name}`,
        metaDescription: `Explore On-Grid, Off-Grid, and Hybrid Solar Inverters, Mono PERC Solar Panels, and Lithium Batteries available at ${data.company.name}.`,
        data,
        activePage: 'products'
    });
};

exports.getCareers = (req, res) => {
    res.render('careers', {
        title: `Careers & Opportunities | ${data.company.name}`,
        metaDescription: `Explore job, tender, and freelance opportunities with ${data.company.name} in solar energy and EV charging across Madhya Pradesh.`,
        data,
        activePage: 'careers'
    });
};

exports.getProjects = (req, res) => {
    res.render('projects', {
        title: `Completed Solar Projects | ${data.company.name} - Portfolio`,
        metaDescription: `View residential, commercial, and agricultural solar rooftop installations completed by ${data.company.name} in Madhya Pradesh.`,
        data,
        activePage: 'projects'
    });
};

exports.getCalculator = (req, res) => {
    res.render('calculator', {
        title: `India Solar Savings Calculator | ${data.company.name}`,
        metaDescription: `Calculate your rooftop solar capacity, estimated monthly units generation, savings in â‚¹ and PM Surya Ghar subsidy eligibility.`,
        data,
        calculatorConfig: data.calculator,
        activePage: 'calculator'
    });
};

exports.getContact = (req, res) => {
    res.render('contact', {
        title: `Contact Us | ${data.company.name} - Raisen (M.P.)`,
        metaDescription: `Contact Deepak Kushwaha (+91 70005 75496) and Rahul Saini (+91 93997 61750) at ${data.company.name}, Ward No. 15, PHE Office, Arjun Nagar, Raisen.`,
        data,
        activePage: 'contact'
    });
};

// Handle Customer Enquiry submission
exports.submitEnquiry = (req, res) => {
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

    console.log(`[ENQUIRY SAVED] ID: ${savedEnquiry.id}, Name: ${savedEnquiry.name}, Mobile: ${savedEnquiry.mobile}, District: ${savedEnquiry.district}, Req: ${savedEnquiry.requirement}`);

    return res.json({
        success: true,
        enquiryId: savedEnquiry.id,
        message: `Dhanyawad ${savedEnquiry.name}! Aapki enquiry (#${savedEnquiry.id}) Shivay Energy Solutions me darj ho gayi hai. Hamare expert jald hi aapse ${savedEnquiry.mobile} par sampark karenge.`,
        whatsappRedirect: `https://wa.me/917000575496?text=Namaste%20Shivay%20Energy,%20I%20have%20submitted%20enquiry%20(${savedEnquiry.id})%20for%20${encodeURIComponent(savedEnquiry.requirement)}.%20My%20contact:%20${cleanMobile}`
    });
};
