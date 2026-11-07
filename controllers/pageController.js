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
        title: `Our Solar Services | ${data.company.name} - Rooftop, Commercial & AMC`,
        metaDescription: `Residential rooftop solar, commercial plants, agricultural solar pumps, and maintenance services across Raisen and Madhya Pradesh.`,
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
        metaDescription: `Calculate your rooftop solar capacity, estimated monthly units generation, savings in ₹ and PM Surya Ghar subsidy eligibility.`,
        data,
        activePage: 'calculator'
    });
};

exports.getSchemes = (req, res) => {
    res.render('schemes', {
        title: `PM Surya Ghar: Muft Bijli Yojana Subsidy Details | ${data.company.name}`,
        metaDescription: `Get up to ₹78,000 subsidy under PM Surya Ghar Yojana for residential solar in Raisen & MP. Eligibility, documents & application guide.`,
        data,
        activePage: 'schemes'
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

// API endpoint for dynamic Solar Calculator
exports.calculateSolar = (req, res) => {
    try {
        const monthlyBill = parseFloat(req.body.monthlyBill) || 0;
        const tariff = parseFloat(req.body.tariff) || data.calculator.avgTariffPerUnit;
        
        let monthlyUnits = parseFloat(req.body.monthlyUnits) || 0;
        if (!monthlyUnits && monthlyBill > 0) {
            monthlyUnits = monthlyBill / tariff;
        }

        const unitsPerKwPerMonth = data.calculator.unitsPerKwPerMonth;
        let recommendedKw = Math.ceil((monthlyUnits / unitsPerKwPerMonth) * 10) / 10;
        if (recommendedKw < 1) recommendedKw = 1;

        const estMonthlyGeneration = Math.round(recommendedKw * unitsPerKwPerMonth);
        const estAnnualGeneration = estMonthlyGeneration * 12;
        const estMonthlySavings = Math.round(estMonthlyGeneration * tariff);
        const estAnnualSavings = estMonthlySavings * 12;

        const estGrossCost = Math.round(recommendedKw * data.calculator.costPerKwApprox);
        
        // PM Surya Ghar Subsidy calculation
        let subsidy = 0;
        if (recommendedKw <= 1) {
            subsidy = 30000;
        } else if (recommendedKw <= 2) {
            subsidy = 60000;
        } else {
            subsidy = 78000; // max cap
        }

        const netCost = Math.max(estGrossCost - subsidy, 0);
        const paybackYears = (netCost / estAnnualSavings).toFixed(1);
        const rooftopAreaSqFt = Math.round(recommendedKw * data.calculator.sqFtPerKw);
        const co2SavedTonnes = ((recommendedKw * data.calculator.co2SavedPerKwYearKg) / 1000).toFixed(1);

        return res.json({
            success: true,
            recommendedKw,
            rooftopAreaSqFt,
            estMonthlyGeneration,
            estAnnualGeneration,
            estMonthlySavings,
            estAnnualSavings,
            estGrossCost,
            subsidy,
            netCost,
            paybackYears,
            co2SavedTonnes,
            disclaimer: data.calculator.disclaimer
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Error in calculation" });
    }
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
