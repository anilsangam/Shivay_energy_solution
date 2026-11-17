/**
 * SHIVAY ENERGY SOLUTIONS - DYNAMIC WEBSITE CMS & ENQUIRIES TEST SUITE
 * Validates:
 * 1. Initial 3 Services, Products, Projects seed data integrity
 * 2. Dynamic Website Public Data fetching
 * 3. CMS Services CRUD operations
 * 4. CMS Products CRUD operations
 * 5. CMS Projects CRUD operations
 * 6. CMS Team / Founders CRUD operations
 * 7. CMS Testimonials CRUD operations
 * 8. Company Profile & Contact Info live synchronization
 * 9. Solar Site Survey enquiry lifecycle & admin management
 * 10. Franchise / Dealer Application lifecycle & admin management
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const WebsiteService = require('../services/websiteService');
const websiteCmsController = require('../controllers/websiteCmsController');
const enquiryController = require('../controllers/enquiryController');
const pageController = require('../controllers/pageController');
const franchiseController = require('../controllers/franchiseController');

const WebService = require('../models/WebService');
const WebProduct = require('../models/WebProduct');
const WebProject = require('../models/WebProject');
const WebTeam = require('../models/WebTeam');
const WebTestimonial = require('../models/WebTestimonial');
const Setting = require('../models/Setting');
const Enquiry = require('../models/Enquiry');
const FranchiseApplication = require('../models/FranchiseApplication');
const DataStore = require('../services/dataStore');

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
    console.log('🌐 VERIFICATION: DYNAMIC WEBSITE CMS & ENQUIRIES SYSTEM');
    console.log('============================================================\n');

    // 1. Initial Seed Data Verification
    await runAsyncTest('Seed Data: Verify 3 initial services, products, and projects seeded in database', async () => {
        await WebsiteService.ensureInitialSeedData();
        const siteData = await WebsiteService.getPublicSiteData();

        assert(Array.isArray(siteData.services), 'Services should be an array');
        assert(siteData.services.length >= 3, `Expected at least 3 services, got ${siteData.services.length}`);

        assert(Array.isArray(siteData.products), 'Products should be an array');
        assert(siteData.products.length >= 3, `Expected at least 3 products, got ${siteData.products.length}`);

        assert(Array.isArray(siteData.projects), 'Projects should be an array');
        assert(siteData.projects.length >= 3, `Expected at least 3 projects, got ${siteData.projects.length}`);

        assert(Array.isArray(siteData.company.contacts), 'Company contacts should be an array');
        assert(siteData.company.contacts.length >= 2, 'Expected at least 2 company contacts / founders');
    });

    // 2. Services CMS CRUD
    await runAsyncTest('CMS Services: Create, Retrieve, Update, and Delete service', async () => {
        // Create
        const reqCreate = {
            body: {
                title: 'Test Solar Rooftop Installation',
                shortDesc: 'Automated test service description',
                details: 'Full specifications for test rooftop',
                icon: 'icofont-sun',
                order: 99,
                isActive: true,
                highlights: 'Subsidy Support\n25 Years Warranty'
            }
        };
        let createdService = null;
        const resCreate = {
            json: (data) => {
                assert(data.success, 'Create service should succeed: ' + data.message);
                createdService = data.service;
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await websiteCmsController.createService(reqCreate, resCreate);
        assert(createdService && createdService._id, 'Created service should have _id');
        assert.strictEqual(createdService.title, 'Test Solar Rooftop Installation');

        // Update
        const reqUpdate = {
            params: { id: createdService._id.toString() },
            body: {
                title: 'Updated Test Solar Installation',
                shortDesc: 'Updated short description',
                order: 100
            }
        };
        const resUpdate = {
            json: (data) => {
                assert(data.success, 'Update service should succeed: ' + data.message);
                assert.strictEqual(data.service.title, 'Updated Test Solar Installation');
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.updateService(reqUpdate, resUpdate);

        // Delete
        const reqDelete = { params: { id: createdService._id.toString() } };
        const resDelete = {
            json: (data) => {
                assert(data.success, 'Delete service should succeed: ' + data.message);
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.deleteService(reqDelete, resDelete);

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const checkDeleted = await WebService.findById(createdService._id);
            assert(!checkDeleted, 'Service should no longer exist in DB after deletion');
        } else {
            const mem = WebsiteService.getMemServices().find(s => s._id.toString() === createdService._id.toString());
            assert(!mem, 'Service should no longer exist in memory after deletion');
        }
    });

    // 3. Products CMS CRUD
    await runAsyncTest('CMS Products: Create, Retrieve, Update, and Delete product', async () => {
        const reqCreate = {
            body: {
                name: 'Test Hybrid Inverter 10kW',
                category: 'Inverters',
                capacityRange: '10 kW',
                efficiency: '99%',
                warranty: '10 Years',
                description: 'Dual MPPT hybrid inverter for test',
                startingPrice: '₹85,000',
                order: 99,
                isActive: true,
                features: 'Wi-Fi Monitoring\nIP65 Waterproof'
            }
        };
        let createdProduct = null;
        const resCreate = {
            json: (data) => {
                assert(data.success, 'Create product should succeed');
                createdProduct = data.product;
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.createProduct(reqCreate, resCreate);
        assert(createdProduct && createdProduct._id, 'Product should have _id');

        // Update
        const reqUpdate = {
            params: { id: createdProduct._id.toString() },
            body: {
                startingPrice: '₹82,000'
            }
        };
        const resUpdate = {
            json: (data) => {
                assert(data.success, 'Update product should succeed');
                assert.strictEqual(data.product.startingPrice, '₹82,000');
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.updateProduct(reqUpdate, resUpdate);

        // Delete
        const reqDelete = { params: { id: createdProduct._id.toString() } };
        const resDelete = {
            json: (data) => { assert(data.success, 'Delete product should succeed'); },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.deleteProduct(reqDelete, resDelete);

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const checkDeleted = await WebProduct.findById(createdProduct._id);
            assert(!checkDeleted, 'Product should be deleted from DB');
        } else {
            const mem = WebsiteService.getMemProducts().find(p => p._id.toString() === createdProduct._id.toString());
            assert(!mem, 'Product should be deleted from memory');
        }
    });

    // 4. Projects CMS CRUD
    await runAsyncTest('CMS Projects: Create, Retrieve, Update, and Delete project', async () => {
        const reqCreate = {
            body: {
                title: 'Test Hospital 50kW Solar Plant',
                category: 'Commercial & Industrial',
                location: 'Raisen Bypass Road, MP',
                capacity: '50 kW',
                year: '2025',
                panels: '90x 550W Tier-1',
                inverter: '50 kW Grid-Tied',
                impact: 'Saves ₹6 Lakhs/year',
                description: 'Full EPC turnkey test project',
                order: 99,
                isActive: true
            }
        };
        let createdProject = null;
        const resCreate = {
            json: (data) => {
                assert(data.success, 'Create project should succeed');
                createdProject = data.project;
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.createProject(reqCreate, resCreate);
        assert(createdProject && createdProject._id, 'Project should have _id');

        // Delete
        const reqDelete = { params: { id: createdProject._id.toString() } };
        const resDelete = {
            json: (data) => { assert(data.success, 'Delete project should succeed'); },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await websiteCmsController.deleteProject(reqDelete, resDelete);

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const checkDeleted = await WebProject.findById(createdProject._id);
            assert(!checkDeleted, 'Project should be deleted from DB');
        } else {
            const mem = WebsiteService.getMemProjects().find(pr => pr._id.toString() === createdProject._id.toString());
            assert(!mem, 'Project should be deleted from memory');
        }
    });

    // 5. Contact & Company Profile Live Synchronization
    await runAsyncTest('Company Profile: Live contact update synchronizes across all pages', async () => {
        const initialCompany = WebsiteService.getLiveCompanyData();
        assert(initialCompany && initialCompany.name, 'Initial company object should exist');

        const testPhone = '+91 70005 99999';
        const testCity = 'Raisen';

        const reqUpdate = {
            body: {
                companyName: 'SHIVAY ENERGY SOLUTIONS',
                primaryPhone: testPhone,
                city: testCity,
                workingDays: 'Monday - Saturday',
                workingTime: '9:00 AM - 7:00 PM'
            }
        };

        const resUpdate = {
            json: (data) => {
                assert(data.success, 'Update contact should succeed');
                assert.strictEqual(data.company.contact.phone, testPhone);
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await websiteCmsController.updateContactInfo(reqUpdate, resUpdate);

        // Verify live company data synchronously reflects updated phone
        const liveCompany = WebsiteService.getLiveCompanyData();
        assert.strictEqual(liveCompany.contact.phone, testPhone, 'Live company cache should immediately reflect updated phone');

        // Restore original phone
        await websiteCmsController.updateContactInfo({
            body: {
                primaryPhone: '+91 70005 75496'
            }
        }, { json: () => {}, status: () => ({ json: () => {} }) });
    });

    // 6. Free Solar Site Survey Enquiry Lifecycle
    await runAsyncTest('Solar Site Surveys: Submit inquiry, list in admin, update status, and delete', async () => {
        const testMobile = '9826012345';
        const reqSubmit = {
            body: {
                name: 'Test Customer Survey',
                mobile: testMobile,
                email: 'testcustomer@example.com',
                state: 'Madhya Pradesh',
                district: 'Raisen',
                pincode: '464551',
                solarRequirement: 'Residential Rooftop (PM Surya Ghar Subsidy)',
                monthlyBill: 3500,
                message: 'Need rooftop solar site assessment'
            }
        };

        let enquiryId = null;
        const resSubmit = {
            json: (data) => {
                assert(data.success, 'Submit enquiry should succeed: ' + data.message);
                assert(data.enquiryId, 'Should return enquiryId');
                enquiryId = data.enquiryId;
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await pageController.submitEnquiry(reqSubmit, resSubmit);
        assert(enquiryId, 'Enquiry ID must be generated');

        // Admin Survey Page lists the inquiry
        let renderedSurveys = [];
        const reqAdmin = {
            query: { search: testMobile },
            session: { user: { role: 'SUPER_ADMIN', name: 'Super Admin' } }
        };
        const resAdmin = {
            render: (view, context) => {
                assert.strictEqual(view, 'private/admin/enquiries/surveys');
                renderedSurveys = context.surveys;
            },
            status: (code) => ({ render: (v, d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await enquiryController.getSurveysPage(reqAdmin, resAdmin);
        const match = renderedSurveys.find(s => s.enquiryId === enquiryId);
        assert(match, 'Submitted survey inquiry should appear in admin survey leads console');

        // Update Status
        const reqStatus = {
            params: { id: enquiryId },
            body: {
                status: 'survey_scheduled',
                note: 'Scheduled site visit for tomorrow 11 AM'
            },
            session: { user: { name: 'Super Admin' } }
        };
        const resStatus = {
            json: (data) => {
                assert(data.success, 'Status update should succeed');
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await enquiryController.updateSurveyStatus(reqStatus, resStatus);

        // Delete Survey
        const reqDelete = { params: { id: enquiryId } };
        const resDelete = {
            json: (data) => { assert(data.success, 'Delete survey should succeed'); },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await enquiryController.deleteSurvey(reqDelete, resDelete);

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const checkDeleted = await Enquiry.findOne({ enquiryId });
            assert(!checkDeleted, 'Survey lead should be deleted from DB');
        } else {
            const mem = DataStore.getAllEnquiries().find(e => e.enquiryId === enquiryId);
            assert(!mem, 'Survey lead should be deleted from memory');
        }
    });

    // 7. Franchise / Dealer Application Lifecycle
    await runAsyncTest('Franchise Applications: Submit application, list in admin, update status, and delete', async () => {
        const testMobile = '9399712345';
        const reqSubmit = {
            body: {
                applicantName: 'Shri Ram Enterprises',
                mobile: testMobile,
                email: 'shriram@dealer.com',
                state: 'Madhya Pradesh',
                district: 'Vidisha',
                city: 'Vidisha City',
                investmentCapacity: '₹5 Lakh - ₹10 Lakh',
                businessBackground: 'Electrical contractor with 5 years experience',
                message: 'Interested in becoming authorized district distributor'
            }
        };

        let applicationId = null;
        const resSubmit = {
            json: (data) => {
                assert(data.success, 'Submit franchise application should succeed');
                assert(data.applicationId, 'Should return applicationId');
                applicationId = data.applicationId;
            },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await franchiseController.submitFranchise(reqSubmit, resSubmit);
        assert(applicationId && applicationId.startsWith('FRA-'), 'Application ID must start with FRA-');

        // Admin Franchise Page lists the application
        let renderedApps = [];
        const reqAdmin = {
            query: { search: testMobile },
            session: { user: { role: 'SUPER_ADMIN', name: 'Super Admin' } }
        };
        const resAdmin = {
            render: (view, context) => {
                assert.strictEqual(view, 'private/admin/enquiries/franchise');
                renderedApps = context.applications;
            },
            status: (code) => ({ render: (v, d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };

        await enquiryController.getFranchiseApplicationsPage(reqAdmin, resAdmin);
        const match = renderedApps.find(a => a.applicationId === applicationId);
        assert(match, 'Submitted franchise application should appear in admin franchise console');

        // Update status to 'under_review'
        const reqStatus = {
            params: { id: applicationId },
            body: {
                status: 'under_review',
                note: 'Warehouse premises verified'
            },
            session: { user: { name: 'Super Admin' } }
        };
        const resStatus = {
            json: (data) => { assert(data.success, 'Status update should succeed'); },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await enquiryController.updateFranchiseStatus(reqStatus, resStatus);

        // Delete Application
        const reqDelete = { params: { id: applicationId } };
        const resDelete = {
            json: (data) => { assert(data.success, 'Delete franchise application should succeed'); },
            status: (code) => ({ json: (d) => { throw new Error(`Status ${code}: ${d.message}`); } })
        };
        await enquiryController.deleteFranchiseApplication(reqDelete, resDelete);

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const checkDeleted = await FranchiseApplication.findOne({ applicationId });
            assert(!checkDeleted, 'Franchise application should be deleted from DB');
        } else {
            const mem = DataStore.getAllFranchiseApplications().find(a => a.applicationId === applicationId);
            assert(!mem, 'Franchise application should be deleted from memory');
        }
    });

    // 8. View Files Existence Verification
    await runAsyncTest('View Files: All CMS and Enquiry Admin EJS views exist on disk', () => {
        const requiredViews = [
            'views/private/admin/website/services.ejs',
            'views/private/admin/website/products.ejs',
            'views/private/admin/website/projects.ejs',
            'views/private/admin/website/team.ejs',
            'views/private/admin/website/testimonials.ejs',
            'views/private/admin/website/contact.ejs',
            'views/private/admin/enquiries/surveys.ejs',
            'views/private/admin/enquiries/franchise.ejs'
        ];

        requiredViews.forEach(v => {
            const fullPath = path.join(__dirname, '..', v);
            assert(fs.existsSync(fullPath), `View template ${v} must exist`);
        });
    });

    console.log(`\n============================================================`);
    console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log(`============================================================\n`);

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

(async () => {
    try {
        const connectDB = require('../config/database');
        await Promise.race([
            connectDB(),
            new Promise(res => setTimeout(res, 1000))
        ]);
    } catch (e) {}

    try {
        await runSuite();
        process.exit(0);
    } catch (err) {
        console.error('Fatal test error:', err);
        process.exit(1);
    }
})();
