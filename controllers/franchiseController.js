const data = require('../config/company');

exports.getFranchisePage = (req, res) => {
    res.render('franchise', {
        title: `Franchise & Dealership Partnership | ${data.company.name}`,
        metaDescription: `Become an authorized solar dealer or franchise partner of ${data.company.name} in Madhya Pradesh. High margin solar business opportunity.`,
        data,
        activePage: 'franchise'
    });
};

exports.submitFranchise = (req, res) => {
    const { applicantName, mobile, email, state, district, city, investmentCapacity, message } = req.body;
    const cleanMobile = (mobile || '').replace(/\D/g, '').slice(-10);

    console.log(`[FRANCHISE APPLICATION] ${applicantName}, Mobile: ${cleanMobile}, District: ${district}, Investment: ${investmentCapacity}`);

    return res.json({
        success: true,
        message: `Dhanyawad ${applicantName}! Aapka franchise aavedan prapt hua hai. Hamare business development team Deepak Kushwaha (+91 70005 75496) aapse jald sampark karenge.`,
        whatsappRedirect: `https://wa.me/917000575496?text=Namaste%20Deepak%20ji,%20I%20have%20submitted%20Franchise%20Application%20for%20${encodeURIComponent(district || 'MP')}.%20Applicant:%20${encodeURIComponent(applicantName)}`
    });
};
