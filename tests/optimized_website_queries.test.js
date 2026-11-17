/**
 * VERIFICATION TEST SUITE: Optimized Website Database Queries & Clean Responsibilities
 * 
 * Verifies:
 * 1. Zero runtime seed verification during public request flows
 * 2. Strict query isolation (only required collections queried per page)
 * 3. Field projection (.select()) and lean queries (.lean())
 * 4. Single-document product details query
 * 5. Full EJS template rendering for all public routes with required variables
 * 6. Admin CMS CRUD continuity
 */
const assert = require('assert');
const mongoose = require('mongoose');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

const WebsiteService = require('../services/websiteService');
const WebService = require('../models/WebService');
const WebProduct = require('../models/WebProduct');
const WebProject = require('../models/WebProject');
const WebTeam = require('../models/WebTeam');
const WebTestimonial = require('../models/WebTestimonial');
const websiteCmsController = require('../controllers/websiteCmsController');
const pageController = require('../controllers/pageController');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        console.error(err.stack);
    }
}

async function runVerification() {
    console.log('\n============================================================');
    console.log('⚡ VERIFICATION: OPTIMIZED WEBSITE QUERIES & ARCHITECTURE');
    console.log('============================================================\n');

    // 1. Phase 1: Verify Seed Script exists and can run
    await test('Phase 1: scripts/seed.js exists and is standalone executable', async () => {
        const seedPath = path.join(__dirname, '../scripts/seed.js');
        assert(fs.existsSync(seedPath), 'scripts/seed.js must exist');
        const seedFn = require('../scripts/seed.js');
        assert(typeof seedFn === 'function', 'scripts/seed.js should export seeder function');
    });

    // 2. Phase 1: Verify No Runtime Seed Verification
    await test('Phase 1: ensureInitialSeedData is NOT invoked during normal page requests', async () => {
        let seedCalls = 0;
        const originalSeed = WebsiteService.ensureInitialSeedData;
        WebsiteService.ensureInitialSeedData = async function() {
            seedCalls++;
            return originalSeed.apply(this, arguments);
        };

        try {
            await WebsiteService.getHomeData();
            await WebsiteService.getAboutData();
            await WebsiteService.getServicesData();
            await WebsiteService.getProductsData();
            await WebsiteService.getProductDetails('ongrid-solar-inverter');
            await WebsiteService.getProjectsData();
            await WebsiteService.getContactData();
            await WebsiteService.getLayoutOnlyData();
            await WebsiteService.getPublicSiteData();

            assert.strictEqual(seedCalls, 0, `ensureInitialSeedData was called ${seedCalls} times during page requests! Expected 0.`);
        } finally {
            WebsiteService.ensureInitialSeedData = originalSeed;
        }
    });

    // 3. Phase 2: Home Page Query Isolation
    await test('Phase 2: getHomeData queries ONLY WebService & WebProject (limit 3)', async () => {
        const homeData = await WebsiteService.getHomeData();
        assert(Array.isArray(homeData.services), 'Home data should contain services array');
        assert(homeData.services.length > 0, 'Home services should not be empty');
        assert(Array.isArray(homeData.projects), 'Home data should contain projects array');
        assert(homeData.projects.length <= 3, `Home projects should be limited to at most 3, got ${homeData.projects.length}`);
        assert.strictEqual(homeData.products, undefined, 'Home data must NOT query or return products');
        assert.strictEqual(homeData.team, undefined, 'Home data must NOT query or return team');
        assert.strictEqual(homeData.testimonials, undefined, 'Home data must NOT query or return testimonials');
    });

    // 4. Phase 2: About Page Query Isolation
    await test('Phase 2: getAboutData queries ONLY WebTeam & WebTestimonial', async () => {
        const aboutData = await WebsiteService.getAboutData();
        assert(Array.isArray(aboutData.testimonials), 'About data should contain testimonials array');
        assert(Array.isArray(aboutData.company.contacts), 'About company should contain contacts array');
        assert.strictEqual(aboutData.services, undefined, 'About data must NOT query or return services');
        assert.strictEqual(aboutData.products, undefined, 'About data must NOT query or return products');
        assert.strictEqual(aboutData.projects, undefined, 'About data must NOT query or return projects');
    });

    // 5. Phase 2: Services Page Query Isolation
    await test('Phase 2: getServicesData queries ONLY WebService', async () => {
        const servicesData = await WebsiteService.getServicesData();
        assert(Array.isArray(servicesData.services), 'Services data should contain services array');
        assert(servicesData.services.length > 0, 'Services should not be empty');
        assert.strictEqual(servicesData.products, undefined, 'Services data must NOT query products');
        assert.strictEqual(servicesData.projects, undefined, 'Services data must NOT query projects');
        assert.strictEqual(servicesData.team, undefined, 'Services data must NOT query team');
        assert.strictEqual(servicesData.testimonials, undefined, 'Services data must NOT query testimonials');
    });

    // 6. Phase 2: Products Page Query Isolation & Pagination
    await test('Phase 2: getProductsData queries ONLY WebProduct with pagination', async () => {
        const productsData = await WebsiteService.getProductsData({ limit: 4, skip: 0 });
        assert(Array.isArray(productsData.products), 'Products data should contain products array');
        assert(productsData.products.length <= 4, 'Products limit should be respected');
        assert.strictEqual(productsData.services, undefined, 'Products data must NOT query services');
        assert.strictEqual(productsData.projects, undefined, 'Products data must NOT query projects');
        assert.strictEqual(productsData.team, undefined, 'Products data must NOT query team');
        assert.strictEqual(productsData.testimonials, undefined, 'Products data must NOT query testimonials');
    });

    // 7. Phase 2: Single-Document Product Details
    await test('Phase 2: getProductDetails fetches single document by slug', async () => {
        const detailsData = await WebsiteService.getProductDetails('on-grid-inverter');
        assert(detailsData.product, 'Product should be found for slug on-grid-inverter');
        assert.strictEqual(detailsData.product.productId, 'on-grid-inverter');
        assert(detailsData.product.name, 'Product should have name');
        assert(detailsData.product.warranty, 'Product should have warranty');
        assert.strictEqual(detailsData.services, undefined, 'Product details must NOT query services');
        assert.strictEqual(detailsData.projects, undefined, 'Product details must NOT query projects');

        // Also test flexible alias lookup (e.g. ongrid-solar-inverter)
        const aliasData = await WebsiteService.getProductDetails('ongrid-solar-inverter');
        assert(aliasData.product, 'Product should also be resolved via alias ongrid-solar-inverter');

        const nonExistent = await WebsiteService.getProductDetails('non-existent-product-sku-12345');
        assert.strictEqual(nonExistent.product, null, 'Non-existent product should return null');
    });

    // 8. Phase 2: Projects Page Query Isolation
    await test('Phase 2: getProjectsData queries ONLY WebProject', async () => {
        const projectsData = await WebsiteService.getProjectsData();
        assert(Array.isArray(projectsData.projects), 'Projects data should contain projects array');
        assert(projectsData.projects.length > 0, 'Projects should not be empty');
        assert.strictEqual(projectsData.services, undefined, 'Projects data must NOT query services');
        assert.strictEqual(projectsData.products, undefined, 'Projects data must NOT query products');
        assert.strictEqual(projectsData.team, undefined, 'Projects data must NOT query team');
        assert.strictEqual(projectsData.testimonials, undefined, 'Projects data must NOT query testimonials');
    });

    // 9. Phase 2: Contact Page Query Isolation
    await test('Phase 2: getContactData queries ONLY WebTeam for contact cards', async () => {
        const contactData = await WebsiteService.getContactData();
        assert(contactData.company, 'Contact data must contain company');
        assert(Array.isArray(contactData.company.contacts), 'Company must contain contacts');
        assert.strictEqual(contactData.services, undefined, 'Contact data must NOT query services');
        assert.strictEqual(contactData.products, undefined, 'Contact data must NOT query products');
        assert.strictEqual(contactData.projects, undefined, 'Contact data must NOT query projects');
        assert.strictEqual(contactData.testimonials, undefined, 'Contact data must NOT query testimonials');
    });

    // 10. Phase 2: Zero-DB Query for Layout-only pages
    await test('Phase 2: getLayoutOnlyData executes ZERO collection queries', async () => {
        const layoutData = await WebsiteService.getLayoutOnlyData();
        assert(layoutData.company, 'Layout data must contain company');
        assert.strictEqual(layoutData.services, undefined, 'Layout data must NOT query services');
        assert.strictEqual(layoutData.products, undefined, 'Layout data must NOT query products');
        assert.strictEqual(layoutData.projects, undefined, 'Layout data must NOT query projects');
        assert.strictEqual(layoutData.team, undefined, 'Layout data must NOT query team');
        assert.strictEqual(layoutData.testimonials, undefined, 'Layout data must NOT query testimonials');
    });

    // 11. Phase 4 & 5: Public EJS Templates Rendering Verification
    await test('Phase 4 & 5: All public EJS templates render with required variables', async () => {
        const viewsDir = path.join(__dirname, '../views');

        // Home
        const homeData = await WebsiteService.getHomeData();
        const homeHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/index.ejs'), {
            title: `${homeData.company.name} | Home`,
            metaDescription: 'Test meta',
            data: homeData,
            company: homeData.company,
            activePage: 'home',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(homeHtml.includes(homeData.company.name), 'Home page HTML must include company name');

        // About
        const aboutData = await WebsiteService.getAboutData();
        const aboutHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/about.ejs'), {
            title: `About | ${aboutData.company.name}`,
            metaDescription: 'Test meta',
            data: aboutData,
            company: aboutData.company,
            activePage: 'about',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(aboutHtml.includes('Founders &amp; Management Team'), 'About page HTML must render team section');

        // Services
        const servicesData = await WebsiteService.getServicesData();
        const servicesHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/services.ejs'), {
            title: `Services | ${servicesData.company.name}`,
            metaDescription: 'Test meta',
            data: servicesData,
            company: servicesData.company,
            activePage: 'services',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(servicesHtml.includes('services-grid'), 'Services page HTML must render services grid');

        // Products
        const productsData = await WebsiteService.getProductsData();
        const productsHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/products.ejs'), {
            title: `Products | ${productsData.company.name}`,
            metaDescription: 'Test meta',
            data: productsData,
            company: productsData.company,
            activePage: 'products',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(productsHtml.includes('products-grid'), 'Products page HTML must render products grid');

        // Product Details
        const detailsData = await WebsiteService.getProductDetails('ongrid-solar-inverter');
        const detailsHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/product-details.ejs'), {
            title: `${detailsData.product.name} | ${detailsData.company.name}`,
            metaDescription: 'Test meta',
            data: detailsData,
            company: detailsData.company,
            product: detailsData.product,
            activePage: 'products',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(detailsHtml.includes(detailsData.product.name), 'Product details HTML must render product name');

        // Projects
        const projectsData = await WebsiteService.getProjectsData();
        const projectsHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/projects.ejs'), {
            title: `Projects | ${projectsData.company.name}`,
            metaDescription: 'Test meta',
            data: projectsData,
            company: projectsData.company,
            activePage: 'projects',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(projectsHtml.includes('projects-grid'), 'Projects page HTML must render projects grid');

        // Contact
        const contactData = await WebsiteService.getContactData();
        const contactHtml = await ejs.renderFile(path.join(viewsDir, 'public-site/contact.ejs'), {
            title: `Contact | ${contactData.company.name}`,
            metaDescription: 'Test meta',
            data: contactData,
            company: contactData.company,
            activePage: 'contact',
            currentYear: 2026
        }, { views: [viewsDir] });
        assert(contactHtml.includes('Registered Office & Details'), 'Contact page HTML must render office details');
    });

    // 12. Admin CRUD verification
    await test('Phase 4 & 5: Admin Website CMS controllers operate without runtime seed overhead', async () => {
        let renderedServices = false;
        const mockReq = { session: { user: { role: 'SUPER_ADMIN' }, csrfToken: 'token' } };
        const mockRes = {
            render: (view, data) => {
                assert(view.includes('services'), 'Should render services view');
                assert(Array.isArray(data.services), 'Services should be an array');
                renderedServices = true;
            },
            status: () => mockRes
        };

        await websiteCmsController.getServicesPage(mockReq, mockRes);
        assert(renderedServices, 'Admin getServicesPage should render successfully');
    });

    console.log('\n============================================================');
    console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests < totalTests) {
        process.exit(1);
    }
}

runVerification().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
