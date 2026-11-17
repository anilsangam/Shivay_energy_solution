const express = require('express');
const router = express.Router();

const pageController = require('../../controllers/pageController');
const complaintController = require('../../controllers/complaintController');
const franchiseController = require('../../controllers/franchiseController');
const quotationController = require('../../controllers/quotationController');

const { enquiryLimiter } = require('../../middleware/rateLimiters');

// ==========================================
// 1. PUBLIC WEBSITE PAGES (Free Access)
// ==========================================
router.get(['/', '/index.html'], pageController.getHome);
router.get(['/about', '/about.html'], pageController.getAbout);
router.get(['/services', '/services.html'], pageController.getServices);
router.get(['/products', '/products.html'], pageController.getProducts);
router.get('/products/:slug', pageController.getProductDetails);
router.get(['/careers', '/careers.html'], pageController.getCareers);
router.get(['/projects', '/projects.html'], pageController.getProjects);
router.get(['/calculator', '/calculator.html'], pageController.getCalculator);
router.get(['/schemes', '/schemes.html'], (req, res) => res.redirect(301, '/#govt-scheme-section'));
router.get(['/contact', '/contact.html'], pageController.getContact);
router.get(['/complaints', '/complaints.html'], complaintController.getComplaintPage);
router.get(['/franchise', '/franchise.html'], franchiseController.getFranchisePage);
router.get(['/privacy-policy', '/privacy', '/privacy.html'], pageController.getPrivacyPolicy);
router.get(['/terms-and-conditions', '/terms', '/terms.html'], pageController.getTermsConditions);

// ==========================================
// 2. PUBLIC CUSTOMER ACCEPTANCE (Crypto Token Gated)
// ==========================================
router.get('/quotation/accept/:token', quotationController.getPublicAcceptancePage);
router.post('/quotation/accept/:token', quotationController.postPublicAcceptance);

// ==========================================
// 3. PUBLIC APIs (Rate-limited, Input Validated)
// ==========================================
router.post('/api/enquiry', enquiryLimiter, pageController.submitEnquiry);
router.post('/api/complaints', complaintController.submitComplaint);
router.get('/api/complaints/track', complaintController.trackComplaint);
router.post('/api/franchise', franchiseController.submitFranchise);

module.exports = router;
