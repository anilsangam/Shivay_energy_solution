/**
 * SHIVAY ENERGY SOLUTIONS - PRIVACY POLICY & TERMS & CONDITIONS TEST SUITE
 * Validates:
 * 1. Public route /privacy-policy rendering with personalized company data
 * 2. Public route /terms-and-conditions rendering with turnkey EPC terms
 * 3. Form collection data disclosure (surveys, PM Surya Ghar KYC, complaints, dealership)
 * 4. Admin settings API persistence for custom pasted Privacy Policy and T&C
 * 5. Instant public reflection of updated legal content from admin settings
 * 6. Footer integration links
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const pageController = require('../controllers/pageController');
const adminController = require('../controllers/adminController');
const WebsiteService = require('../services/websiteService');
const DataStore = require('../services/dataStore');
const Setting = require('../models/Setting');

let passedTests = 0;
let totalTests = 0;

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
    }
}

async function runSuite() {
    console.log('\n============================================================');
    console.log('⚖️ VERIFICATION: PRIVACY POLICY & TERMS AND CONDITIONS SYSTEM');
    console.log('============================================================\n');

    // 1. Verify Default Privacy Policy Generator Content
    await runAsyncTest('Default Privacy Policy contains company-personalized and form data details', () => {
        const company = {
            name: "SHIVAY ENERGY SOLUTIONS",
            email: "shivayenergysolutions@gmail.com",
            address: { full: "Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India" },
            contact: { phone: "+91 70005 75496", alternatePhone: "+91 93997 61750" },
            website: "https://shivayenergysolutions.com"
        };

        const policy = WebsiteService.getDefaultPrivacyPolicy(company);
        assert(typeof policy === 'string' && policy.length > 500, 'Policy should be detailed string');
        assert(policy.includes('SHIVAY ENERGY SOLUTIONS'), 'Should include company name');
        assert(policy.includes('Raisen'), 'Should include headquarters Raisen');
        assert(policy.includes('Free Solar Site Survey'), 'Should cover Site Survey data collection');
        assert(policy.includes('PM Surya Ghar Muft Bijli Yojana'), 'Should cover PM Surya Ghar subsidy processing');
        assert(policy.includes('MPPKVVCL'), 'Should specify MPPKVVCL electricity board');
        assert(policy.includes('Aadhaar Card'), 'Should cover DISCOM KYC documentation');
        assert(policy.includes('Zero-Spam Policy'), 'Should explicitly mention zero-spam policy');
        assert(policy.includes('Deepak Kushwaha'), 'Should mention grievance redressal officer');
    });

    // 2. Verify Default Terms & Conditions Generator Content
    await runAsyncTest('Default Terms & Conditions contains complete solar EPC milestones and warranties', () => {
        const company = {
            name: "SHIVAY ENERGY SOLUTIONS",
            email: "shivayenergysolutions@gmail.com",
            address: { full: "Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India" },
            contact: { phone: "+91 70005 75496" },
            website: "https://shivayenergysolutions.com"
        };

        const terms = WebsiteService.getDefaultTermsConditions(company);
        assert(typeof terms === 'string' && terms.length > 500, 'Terms should be detailed string');
        assert(terms.includes('SHIVAY ENERGY SOLUTIONS'), 'Should include company name');
        assert(terms.includes('20% Advance Booking'), 'Should specify milestone payments');
        assert(terms.includes('60% Material Delivery'), 'Should specify delivery milestone');
        assert(terms.includes('25 to 30 years linear power output'), 'Should specify Tier-1 panel warranty');
        assert(terms.includes('MPPKVVCL'), 'Should specify net-metering interconnection');
        assert(terms.includes('Raisen, Madhya Pradesh'), 'Should specify jurisdiction Raisen');
    });

    // 3. Public Route: Privacy Policy Page Rendering
    await runAsyncTest('Public getPrivacyPolicy renders successfully with full view context', async () => {
        let renderedView = null;
        let renderedData = null;

        const req = {};
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            }
        };

        await pageController.getPrivacyPolicy(req, res);
        assert.strictEqual(renderedView, 'public-site/privacy-policy');
        assert(renderedData.company, 'Should provide company object');
        assert(renderedData.policyContent, 'Should provide policyContent string');
        assert(renderedData.policyContent.length > 200, 'Policy content should be substantive');
        assert.strictEqual(renderedData.activePage, 'privacy-policy');
    });

    // 4. Public Route: Terms & Conditions Page Rendering
    await runAsyncTest('Public getTermsConditions renders successfully with full view context', async () => {
        let renderedView = null;
        let renderedData = null;

        const req = {};
        const res = {
            render: (view, data) => {
                renderedView = view;
                renderedData = data;
            }
        };

        await pageController.getTermsConditions(req, res);
        assert.strictEqual(renderedView, 'public-site/terms-and-conditions');
        assert(renderedData.company, 'Should provide company object');
        assert(renderedData.termsContent, 'Should provide termsContent string');
        assert(renderedData.termsContent.length > 200, 'Terms content should be substantive');
        assert.strictEqual(renderedData.activePage, 'terms-and-conditions');
    });

    // 5. Admin Settings: Persistence of Pasted Custom Policy & T&C
    await runAsyncTest('Admin saveSettings updates custom pasted Privacy Policy and Terms in Setting and DataStore', async () => {
        const customPastedPolicy = `<h3>Custom Policy for Testing</h3><p>We tested updating custom privacy policy in one paste.</p>`;
        const customPastedTerms = `<h3>Custom Terms for Testing</h3><p>We tested updating custom terms and conditions in one paste.</p>`;

        const req = {
            body: {
                companyName: "SHIVAY ENERGY SOLUTIONS",
                privacyPolicy: customPastedPolicy,
                termsAndConditions: customPastedTerms
            },
            session: {
                user: { _id: new mongoose.Types.ObjectId(), name: "Super Admin", role: "SUPER_ADMIN" }
            },
            ip: "127.0.0.1"
        };

        let responseJson = null;
        const res = {
            json: (payload) => { responseJson = payload; },
            status: () => ({ json: (payload) => { responseJson = payload; } })
        };

        await adminController.saveSettings(req, res);
        assert(responseJson && responseJson.success, 'saveSettings should return success: true');

        // Verify DataStore holds updated settings
        const currentSettings = DataStore.getSettings();
        assert.strictEqual(currentSettings.privacyPolicy, customPastedPolicy);
        assert.strictEqual(currentSettings.termsAndConditions, customPastedTerms);

        // Verify public pages immediately reflect the custom pasted content
        const siteData = await WebsiteService.getPublicSiteData();
        const effectivePolicy = WebsiteService.getPrivacyPolicyContent(siteData.company);
        const effectiveTerms = WebsiteService.getTermsConditionsContent(siteData.company);

        assert.strictEqual(effectivePolicy, customPastedPolicy, 'Public policy should immediately reflect custom pasted policy');
        assert.strictEqual(effectiveTerms, customPastedTerms, 'Public terms should immediately reflect custom pasted terms');
    });

    // 6. Reset to Default Content Verification
    await runAsyncTest('Emptying policy in admin settings gracefully falls back to detailed default personalized policy', async () => {
        const req = {
            body: {
                privacyPolicy: "", // Cleared in admin panel
                termsAndConditions: "" // Cleared in admin panel
            },
            session: {
                user: { _id: new mongoose.Types.ObjectId(), name: "Super Admin", role: "SUPER_ADMIN" }
            },
            ip: "127.0.0.1"
        };

        const res = { json: () => {}, status: () => ({ json: () => {} }) };
        await adminController.saveSettings(req, res);

        const siteData = await WebsiteService.getPublicSiteData();
        const effectivePolicy = WebsiteService.getPrivacyPolicyContent(siteData.company);
        const effectiveTerms = WebsiteService.getTermsConditionsContent(siteData.company);

        assert(effectivePolicy.includes('Zero-Spam Policy'), 'Should fallback to default detailed policy when cleared');
        assert(effectiveTerms.includes('20% Advance Booking'), 'Should fallback to default detailed terms when cleared');
    });

    // 7. Footer Integration Check
    await runAsyncTest('Public footer template links to both /privacy-policy and /terms-and-conditions', () => {
        const footerPath = path.join(__dirname, '../views/public-site/partials/footer.ejs');
        const footerContent = fs.readFileSync(footerPath, 'utf-8');

        assert(footerContent.includes('href="/privacy-policy"'), 'Footer should link to /privacy-policy');
        assert(footerContent.includes('href="/terms-and-conditions"'), 'Footer should link to /terms-and-conditions');
    });

    console.log('\n============================================================');
    console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test suite execution error:', err);
    process.exit(1);
});
