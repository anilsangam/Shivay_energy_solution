const mongoose = require('mongoose');
const WebService = require('../models/WebService');
const WebProduct = require('../models/WebProduct');
const WebProject = require('../models/WebProject');
const WebTeam = require('../models/WebTeam');
const WebTestimonial = require('../models/WebTestimonial');
const Setting = require('../models/Setting');
const WebsiteService = require('../services/websiteService');
const UploadService = require('../services/uploadService');

function isDbConnected() {
    return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Helper to process image from upload or URL
 */
async function resolveImage(body, defaultImage) {
    if (body.imageData && body.imageName && body.imageType) {
        try {
            const uploadRes = await UploadService.processUpload({
                name: body.imageName,
                type: body.imageType,
                data: body.imageData,
                category: 'website_cms'
            });
            if (uploadRes && uploadRes.url) {
                return uploadRes.url;
            }
        } catch (err) {
            console.warn('[WebsiteCMS] Cloudinary upload skipped/failed:', err.message);
        }
    }
    if (body.image && typeof body.image === 'string' && body.image.trim()) {
        return body.image.trim();
    }
    return defaultImage;
}

/**
 * Parse string into string array (split by newline or comma)
 */
function parseStringArray(input) {
    if (Array.isArray(input)) return input.map(s => String(s).trim()).filter(Boolean);
    if (typeof input === 'string') {
        return input.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
}

// ==========================================
// 1. SERVICES MANAGEMENT
// ==========================================

exports.getServicesPage = async (req, res) => {
    try {
        let services = [];
        if (isDbConnected()) {
            await WebsiteService.ensureInitialSeedData();
            services = await WebService.find().sort({ order: 1, createdAt: 1 }).lean();
        } else {
            services = WebsiteService.getMemServices();
        }
        const company = WebsiteService.getLiveCompanyData();

        res.render('private/admin/website/services', {
            title: `Website Services Management | ${company.name}`,
            company,
            services,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-services',
            pageTitle: 'Website Services Master'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading services page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load website services console.'
        });
    }
};

exports.createService = async (req, res) => {
    try {
        const { title, shortDesc, details, icon, order, isActive } = req.body;
        if (!title || !shortDesc) {
            return res.status(400).json({ success: false, message: 'Service title and short description are required.' });
        }

        let serviceId = (req.body.serviceId || title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const image = await resolveImage(req.body, '/images/services/1.webp');
        const highlights = parseStringArray(req.body.highlights);

        let newService = null;
        if (isDbConnected()) {
            const existing = await WebService.findOne({ serviceId });
            if (existing) {
                serviceId = `${serviceId}-${Math.floor(100 + Math.random() * 900)}`;
            }

            newService = await WebService.create({
                serviceId,
                title: title.trim(),
                icon: (icon || 'icofont-home').trim(),
                image,
                shortDesc: shortDesc.trim(),
                details: (details || '').trim(),
                highlights,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            });
        } else {
            const memServices = WebsiteService.getMemServices();
            if (memServices.find(s => s.serviceId === serviceId)) {
                serviceId = `${serviceId}-${Math.floor(100 + Math.random() * 900)}`;
            }
            newService = {
                _id: new mongoose.Types.ObjectId(),
                serviceId,
                title: title.trim(),
                icon: (icon || 'icofont-home').trim(),
                image,
                shortDesc: shortDesc.trim(),
                details: (details || '').trim(),
                highlights,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            };
            memServices.push(newService);
        }

        return res.json({ success: true, message: 'Service created successfully.', service: newService });
    } catch (err) {
        console.error('[WebsiteCMS] Error creating service:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error creating service.' });
    }
};

exports.updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, shortDesc, details, icon, order, isActive } = req.body;

        if (isDbConnected()) {
            const service = await WebService.findById(id);
            if (!service) {
                return res.status(404).json({ success: false, message: 'Service record not found.' });
            }

            if (title) service.title = title.trim();
            if (shortDesc) service.shortDesc = shortDesc.trim();
            if (details !== undefined) service.details = details.trim();
            if (icon) service.icon = icon.trim();
            if (order !== undefined) service.order = parseInt(order, 10) || 0;
            if (isActive !== undefined) service.isActive = (isActive === true || isActive === 'true');
            if (req.body.highlights !== undefined) service.highlights = parseStringArray(req.body.highlights);
            if (req.body.imageData || req.body.image) service.image = await resolveImage(req.body, service.image);

            await service.save();
            return res.json({ success: true, message: 'Service updated successfully.', service });
        } else {
            const memServices = WebsiteService.getMemServices();
            const service = memServices.find(s => s._id.toString() === id.toString() || s.serviceId === id);
            if (!service) {
                return res.status(404).json({ success: false, message: 'Service record not found.' });
            }
            if (title) service.title = title.trim();
            if (shortDesc) service.shortDesc = shortDesc.trim();
            if (details !== undefined) service.details = details.trim();
            if (icon) service.icon = icon.trim();
            if (order !== undefined) service.order = parseInt(order, 10) || 0;
            if (isActive !== undefined) service.isActive = (isActive === true || isActive === 'true');
            if (req.body.highlights !== undefined) service.highlights = parseStringArray(req.body.highlights);
            if (req.body.imageData || req.body.image) service.image = await resolveImage(req.body, service.image);

            return res.json({ success: true, message: 'Service updated successfully.', service });
        }
    } catch (err) {
        console.error('[WebsiteCMS] Error updating service:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating service.' });
    }
};

exports.deleteService = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const deleted = await WebService.findByIdAndDelete(id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Service not found.' });
            }
        } else {
            const memServices = WebsiteService.getMemServices();
            const idx = memServices.findIndex(s => s._id.toString() === id.toString() || s.serviceId === id);
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Service not found.' });
            }
            memServices.splice(idx, 1);
        }
        return res.json({ success: true, message: 'Service deleted successfully.' });
    } catch (err) {
        console.error('[WebsiteCMS] Error deleting service:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting service.' });
    }
};

// ==========================================
// 2. PRODUCTS MANAGEMENT
// ==========================================

exports.getProductsPage = async (req, res) => {
    try {
        let products = [];
        if (isDbConnected()) {
            await WebsiteService.ensureInitialSeedData();
            products = await WebProduct.find().sort({ order: 1, createdAt: 1 }).lean();
        } else {
            products = WebsiteService.getMemProducts();
        }
        const company = WebsiteService.getLiveCompanyData();

        res.render('private/admin/website/products', {
            title: `Website Products Management | ${company.name}`,
            company,
            products,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-products',
            pageTitle: 'Website Products & Inverters Master'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading products page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load website products console.'
        });
    }
};

exports.createProduct = async (req, res) => {
    try {
        const { name, category, capacityRange, efficiency, warranty, description, bestFor, startingPrice, order, isActive } = req.body;
        if (!name || !description) {
            return res.status(400).json({ success: false, message: 'Product name and description are required.' });
        }

        let productId = (req.body.productId || name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const image = await resolveImage(req.body, '/images/slider/4.webp');
        const features = parseStringArray(req.body.features);

        let newProduct = null;
        if (isDbConnected()) {
            const existing = await WebProduct.findOne({ productId });
            if (existing) {
                productId = `${productId}-${Math.floor(100 + Math.random() * 900)}`;
            }

            newProduct = await WebProduct.create({
                productId,
                name: name.trim(),
                category: (category || 'Solar Inverters').trim(),
                capacityRange: (capacityRange || '1 kW - 100 kW').trim(),
                efficiency: (efficiency || 'Up to 98.6%').trim(),
                warranty: (warranty || '5 to 10 Years Warranty').trim(),
                description: description.trim(),
                features,
                bestFor: (bestFor || '').trim(),
                startingPrice: (startingPrice || 'Ask for quote').trim(),
                image,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            });
        } else {
            const memProducts = WebsiteService.getMemProducts();
            if (memProducts.find(p => p.productId === productId)) {
                productId = `${productId}-${Math.floor(100 + Math.random() * 900)}`;
            }
            newProduct = {
                _id: new mongoose.Types.ObjectId(),
                productId,
                name: name.trim(),
                category: (category || 'Solar Inverters').trim(),
                capacityRange: (capacityRange || '1 kW - 100 kW').trim(),
                efficiency: (efficiency || 'Up to 98.6%').trim(),
                warranty: (warranty || '5 to 10 Years Warranty').trim(),
                description: description.trim(),
                features,
                bestFor: (bestFor || '').trim(),
                startingPrice: (startingPrice || 'Ask for quote').trim(),
                image,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            };
            memProducts.push(newProduct);
        }

        return res.json({ success: true, message: 'Product added successfully.', product: newProduct });
    } catch (err) {
        console.error('[WebsiteCMS] Error creating product:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error adding product.' });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const product = await WebProduct.findById(id);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product record not found.' });
            }

            const fields = ['name', 'category', 'capacityRange', 'efficiency', 'warranty', 'description', 'bestFor', 'startingPrice'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) product[f] = req.body[f].trim();
            });

            if (req.body.order !== undefined) product.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) product.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.features !== undefined) product.features = parseStringArray(req.body.features);
            if (req.body.imageData || req.body.image) product.image = await resolveImage(req.body, product.image);

            await product.save();
            return res.json({ success: true, message: 'Product updated successfully.', product });
        } else {
            const memProducts = WebsiteService.getMemProducts();
            const product = memProducts.find(p => p._id.toString() === id.toString() || p.productId === id);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product record not found.' });
            }

            const fields = ['name', 'category', 'capacityRange', 'efficiency', 'warranty', 'description', 'bestFor', 'startingPrice'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) product[f] = req.body[f].trim();
            });

            if (req.body.order !== undefined) product.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) product.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.features !== undefined) product.features = parseStringArray(req.body.features);
            if (req.body.imageData || req.body.image) product.image = await resolveImage(req.body, product.image);

            return res.json({ success: true, message: 'Product updated successfully.', product });
        }
    } catch (err) {
        console.error('[WebsiteCMS] Error updating product:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating product.' });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const deleted = await WebProduct.findByIdAndDelete(id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }
        } else {
            const memProducts = WebsiteService.getMemProducts();
            const idx = memProducts.findIndex(p => p._id.toString() === id.toString() || p.productId === id);
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }
            memProducts.splice(idx, 1);
        }
        return res.json({ success: true, message: 'Product deleted successfully.' });
    } catch (err) {
        console.error('[WebsiteCMS] Error deleting product:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting product.' });
    }
};

// ==========================================
// 3. RECENT PROJECTS MANAGEMENT
// ==========================================

exports.getProjectsPage = async (req, res) => {
    try {
        let projects = [];
        if (isDbConnected()) {
            await WebsiteService.ensureInitialSeedData();
            projects = await WebProject.find().sort({ order: 1, createdAt: 1 }).lean();
        } else {
            projects = WebsiteService.getMemProjects();
        }
        const company = WebsiteService.getLiveCompanyData();

        res.render('private/admin/website/projects', {
            title: `Recent Projects Management | ${company.name}`,
            company,
            projects,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-projects',
            pageTitle: 'Recent Solar Installations Master'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading projects page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load recent projects console.'
        });
    }
};

exports.createProject = async (req, res) => {
    try {
        const { title, category, location, capacity, type, year, panels, inverter, impact, description, order, isActive } = req.body;
        if (!title || !location) {
            return res.status(400).json({ success: false, message: 'Project title and location are required.' });
        }

        let projectId = (req.body.projectId || title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const image = await resolveImage(req.body, '/images/projects/1.webp');

        let newProject = null;
        if (isDbConnected()) {
            const existing = await WebProject.findOne({ projectId });
            if (existing) {
                projectId = `${projectId}-${Math.floor(100 + Math.random() * 900)}`;
            }

            newProject = await WebProject.create({
                projectId,
                title: title.trim(),
                category: (category || 'Residential Solar').trim(),
                location: location.trim(),
                capacity: (capacity || '3 kW').trim(),
                type: (type || 'Residential On-Grid').trim(),
                year: (year || new Date().getFullYear().toString()).trim(),
                image,
                panels: (panels || 'Mono PERC Half-Cut').trim(),
                inverter: (inverter || 'Dual MPPT On-Grid').trim(),
                impact: (impact || 'Zero electricity bill').trim(),
                description: (description || '').trim(),
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            });
        } else {
            const memProjects = WebsiteService.getMemProjects();
            if (memProjects.find(pr => pr.projectId === projectId)) {
                projectId = `${projectId}-${Math.floor(100 + Math.random() * 900)}`;
            }
            newProject = {
                _id: new mongoose.Types.ObjectId(),
                projectId,
                title: title.trim(),
                category: (category || 'Residential Solar').trim(),
                location: location.trim(),
                capacity: (capacity || '3 kW').trim(),
                type: (type || 'Residential On-Grid').trim(),
                year: (year || new Date().getFullYear().toString()).trim(),
                image,
                panels: (panels || 'Mono PERC Half-Cut').trim(),
                inverter: (inverter || 'Dual MPPT On-Grid').trim(),
                impact: (impact || 'Zero electricity bill').trim(),
                description: (description || '').trim(),
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            };
            memProjects.push(newProject);
        }

        return res.json({ success: true, message: 'Project added successfully.', project: newProject });
    } catch (err) {
        console.error('[WebsiteCMS] Error creating project:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error creating project.' });
    }
};

exports.updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const project = await WebProject.findById(id);
            if (!project) {
                return res.status(404).json({ success: false, message: 'Project record not found.' });
            }

            const fields = ['title', 'category', 'location', 'capacity', 'type', 'year', 'panels', 'inverter', 'impact', 'description'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) project[f] = req.body[f].trim();
            });

            if (req.body.order !== undefined) project.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) project.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) project.image = await resolveImage(req.body, project.image);

            await project.save();
            return res.json({ success: true, message: 'Project updated successfully.', project });
        } else {
            const memProjects = WebsiteService.getMemProjects();
            const project = memProjects.find(pr => pr._id.toString() === id.toString() || pr.projectId === id);
            if (!project) {
                return res.status(404).json({ success: false, message: 'Project record not found.' });
            }

            const fields = ['title', 'category', 'location', 'capacity', 'type', 'year', 'panels', 'inverter', 'impact', 'description'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) project[f] = req.body[f].trim();
            });

            if (req.body.order !== undefined) project.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) project.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) project.image = await resolveImage(req.body, project.image);

            return res.json({ success: true, message: 'Project updated successfully.', project });
        }
    } catch (err) {
        console.error('[WebsiteCMS] Error updating project:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating project.' });
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const deleted = await WebProject.findByIdAndDelete(id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Project not found.' });
            }
        } else {
            const memProjects = WebsiteService.getMemProjects();
            const idx = memProjects.findIndex(pr => pr._id.toString() === id.toString() || pr.projectId === id);
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Project not found.' });
            }
            memProjects.splice(idx, 1);
        }
        return res.json({ success: true, message: 'Project deleted successfully.' });
    } catch (err) {
        console.error('[WebsiteCMS] Error deleting project:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting project.' });
    }
};

// ==========================================
// 4. FOUNDER & TEAM MANAGEMENT
// ==========================================

exports.getTeamPage = async (req, res) => {
    try {
        let team = [];
        if (isDbConnected()) {
            await WebsiteService.ensureInitialSeedData();
            team = await WebTeam.find().sort({ order: 1, createdAt: 1 }).lean();
        } else {
            team = WebsiteService.getMemTeam();
        }
        const company = WebsiteService.getLiveCompanyData();

        res.render('private/admin/website/team', {
            title: `Founders & Team Management | ${company.name}`,
            company,
            team,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-team',
            pageTitle: 'About Page Founders & Team'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading team page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load team management console.'
        });
    }
};

exports.createTeamMember = async (req, res) => {
    try {
        const { name, designation, mobile, whatsapp, email, bio, isFounder, order, isActive } = req.body;
        if (!name || !designation || !mobile) {
            return res.status(400).json({ success: false, message: 'Name, designation, and mobile number are required.' });
        }

        const image = await resolveImage(req.body, '');
        const cleanMobile = mobile.replace(/[^0-9]/g, '');

        let member = null;
        if (isDbConnected()) {
            member = await WebTeam.create({
                name: name.trim(),
                designation: designation.trim(),
                mobile: mobile.trim(),
                whatsapp: (whatsapp || `https://wa.me/${cleanMobile}`).trim(),
                email: (email || '').trim(),
                bio: (bio || 'Available for technical consultation and rooftop feasibility checks.').trim(),
                image,
                isFounder: isFounder === true || isFounder === 'true',
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            });
        } else {
            const memTeam = WebsiteService.getMemTeam();
            member = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                designation: designation.trim(),
                mobile: mobile.trim(),
                whatsapp: (whatsapp || `https://wa.me/${cleanMobile}`).trim(),
                email: (email || '').trim(),
                bio: (bio || 'Available for technical consultation and rooftop feasibility checks.').trim(),
                image,
                isFounder: isFounder === true || isFounder === 'true',
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            };
            memTeam.push(member);
        }

        // Auto refresh live company object
        await WebsiteService.refreshCompanyCache();

        return res.json({ success: true, message: 'Team member added successfully.', member });
    } catch (err) {
        console.error('[WebsiteCMS] Error adding team member:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error adding team member.' });
    }
};

exports.updateTeamMember = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const member = await WebTeam.findById(id);
            if (!member) {
                return res.status(404).json({ success: false, message: 'Team member record not found.' });
            }

            const fields = ['name', 'designation', 'mobile', 'whatsapp', 'email', 'bio'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) member[f] = req.body[f].trim();
            });

            if (req.body.isFounder !== undefined) member.isFounder = (req.body.isFounder === true || req.body.isFounder === 'true');
            if (req.body.order !== undefined) member.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) member.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) member.image = await resolveImage(req.body, member.image);

            await member.save();
            await WebsiteService.refreshCompanyCache();

            return res.json({ success: true, message: 'Team member updated successfully.', member });
        } else {
            const memTeam = WebsiteService.getMemTeam();
            const member = memTeam.find(m => m._id.toString() === id.toString());
            if (!member) {
                return res.status(404).json({ success: false, message: 'Team member record not found.' });
            }

            const fields = ['name', 'designation', 'mobile', 'whatsapp', 'email', 'bio'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) member[f] = req.body[f].trim();
            });

            if (req.body.isFounder !== undefined) member.isFounder = (req.body.isFounder === true || req.body.isFounder === 'true');
            if (req.body.order !== undefined) member.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) member.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) member.image = await resolveImage(req.body, member.image);

            await WebsiteService.refreshCompanyCache();
            return res.json({ success: true, message: 'Team member updated successfully.', member });
        }
    } catch (err) {
        console.error('[WebsiteCMS] Error updating team member:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating team member.' });
    }
};

exports.deleteTeamMember = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const deleted = await WebTeam.findByIdAndDelete(id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Team member not found.' });
            }
        } else {
            const memTeam = WebsiteService.getMemTeam();
            const idx = memTeam.findIndex(m => m._id.toString() === id.toString());
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Team member not found.' });
            }
            memTeam.splice(idx, 1);
        }
        await WebsiteService.refreshCompanyCache();
        return res.json({ success: true, message: 'Team member deleted successfully.' });
    } catch (err) {
        console.error('[WebsiteCMS] Error deleting team member:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting team member.' });
    }
};

// ==========================================
// 5. TESTIMONIALS MANAGEMENT
// ==========================================

exports.getTestimonialsPage = async (req, res) => {
    try {
        let testimonials = [];
        if (isDbConnected()) {
            await WebsiteService.ensureInitialSeedData();
            testimonials = await WebTestimonial.find().sort({ order: 1, createdAt: 1 }).lean();
        } else {
            testimonials = WebsiteService.getMemTestimonials();
        }
        const company = WebsiteService.getLiveCompanyData();

        res.render('private/admin/website/testimonials', {
            title: `Customer Testimonials Management | ${company.name}`,
            company,
            testimonials,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-testimonials',
            pageTitle: 'Customer Testimonials & Reviews'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading testimonials page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load testimonials console.'
        });
    }
};

exports.createTestimonial = async (req, res) => {
    try {
        const { name, location, system, rating, review, order, isActive } = req.body;
        if (!name || !location || !review) {
            return res.status(400).json({ success: false, message: 'Customer name, location, and review are required.' });
        }

        const image = await resolveImage(req.body, '');

        let testimonial = null;
        if (isDbConnected()) {
            testimonial = await WebTestimonial.create({
                name: name.trim(),
                location: location.trim(),
                system: (system || 'Residential Rooftop Solar').trim(),
                rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
                review: review.trim(),
                image,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            });
        } else {
            const memTestimonials = WebsiteService.getMemTestimonials();
            testimonial = {
                _id: new mongoose.Types.ObjectId(),
                name: name.trim(),
                location: location.trim(),
                system: (system || 'Residential Rooftop Solar').trim(),
                rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
                review: review.trim(),
                image,
                order: parseInt(order, 10) || 0,
                isActive: isActive !== false && isActive !== 'false'
            };
            memTestimonials.push(testimonial);
        }

        return res.json({ success: true, message: 'Testimonial added successfully.', testimonial });
    } catch (err) {
        console.error('[WebsiteCMS] Error creating testimonial:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error creating testimonial.' });
    }
};

exports.updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const testimonial = await WebTestimonial.findById(id);
            if (!testimonial) {
                return res.status(404).json({ success: false, message: 'Testimonial record not found.' });
            }

            const fields = ['name', 'location', 'system', 'review'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) testimonial[f] = req.body[f].trim();
            });

            if (req.body.rating !== undefined) testimonial.rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 5));
            if (req.body.order !== undefined) testimonial.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) testimonial.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) testimonial.image = await resolveImage(req.body, testimonial.image);

            await testimonial.save();
            return res.json({ success: true, message: 'Testimonial updated successfully.', testimonial });
        } else {
            const memTestimonials = WebsiteService.getMemTestimonials();
            const testimonial = memTestimonials.find(t => t._id.toString() === id.toString());
            if (!testimonial) {
                return res.status(404).json({ success: false, message: 'Testimonial record not found.' });
            }

            const fields = ['name', 'location', 'system', 'review'];
            fields.forEach(f => {
                if (req.body[f] !== undefined) testimonial[f] = req.body[f].trim();
            });

            if (req.body.rating !== undefined) testimonial.rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 5));
            if (req.body.order !== undefined) testimonial.order = parseInt(req.body.order, 10) || 0;
            if (req.body.isActive !== undefined) testimonial.isActive = (req.body.isActive === true || req.body.isActive === 'true');
            if (req.body.imageData || req.body.image) testimonial.image = await resolveImage(req.body, testimonial.image);

            return res.json({ success: true, message: 'Testimonial updated successfully.', testimonial });
        }
    } catch (err) {
        console.error('[WebsiteCMS] Error updating testimonial:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating testimonial.' });
    }
};

exports.deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        if (isDbConnected()) {
            const deleted = await WebTestimonial.findByIdAndDelete(id);
            if (!deleted) {
                return res.status(404).json({ success: false, message: 'Testimonial not found.' });
            }
        } else {
            const memTestimonials = WebsiteService.getMemTestimonials();
            const idx = memTestimonials.findIndex(t => t._id.toString() === id.toString());
            if (idx === -1) {
                return res.status(404).json({ success: false, message: 'Testimonial not found.' });
            }
            memTestimonials.splice(idx, 1);
        }
        return res.json({ success: true, message: 'Testimonial deleted successfully.' });
    } catch (err) {
        console.error('[WebsiteCMS] Error deleting testimonial:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error deleting testimonial.' });
    }
};

// ==========================================
// 6. CONTACT & COMPANY INFO MANAGEMENT
// ==========================================

exports.getContactInfoPage = async (req, res) => {
    try {
        let setting = null;
        if (isDbConnected()) {
            setting = await Setting.findOne().lean();
            if (!setting) {
                setting = await Setting.create({
                    companyName: 'Shivay Energy Solutions',
                    shortName: 'Shivay Energy',
                    tagline: 'Leading Solar EPC & Rooftop Solution Provider',
                    officialEmail: 'info@shivayenergysolutions.com',
                    primaryPhone: '+91 70005 75496',
                    alternatePhone: '+91 93997 61750',
                    whatsappNumber: '+91 70005 75496',
                    addressLine: 'Ward 15, Arjun Nagar',
                    city: 'Raisen',
                    district: 'Raisen',
                    state: 'Madhya Pradesh',
                    pincode: '464551',
                    workingDays: 'Monday - Saturday',
                    workingTime: '9:00 AM - 7:00 PM',
                    founder1Name: 'Deepak Kushwaha',
                    founder1Designation: 'Managing Director & Technical Head',
                    founder1Mobile: '+91 70005 75496',
                    founder2Name: 'Rahul Saini',
                    founder2Designation: 'Operations & Customer Support Head',
                    founder2Mobile: '+91 93997 61750'
                });
                setting = setting.toObject();
            }
        } else {
            setting = WebsiteService.getMemSetting() || {
                companyName: 'Shivay Energy Solutions',
                shortName: 'Shivay Energy',
                tagline: 'Leading Solar EPC & Rooftop Solution Provider',
                officialEmail: 'info@shivayenergysolutions.com',
                primaryPhone: '+91 70005 75496',
                alternatePhone: '+91 93997 61750',
                whatsappNumber: '+91 70005 75496',
                addressLine: 'Ward 15, Arjun Nagar',
                city: 'Raisen',
                district: 'Raisen',
                state: 'Madhya Pradesh',
                pincode: '464551',
                workingDays: 'Monday - Saturday',
                workingTime: '9:00 AM - 7:00 PM',
                founder1Name: 'Deepak Kushwaha',
                founder1Designation: 'Managing Director & Technical Head',
                founder1Mobile: '+91 70005 75496',
                founder2Name: 'Rahul Saini',
                founder2Designation: 'Operations & Customer Support Head',
                founder2Mobile: '+91 93997 61750'
            };
        }

        const liveCompany = await WebsiteService.refreshCompanyCache();

        res.render('private/admin/website/contact', {
            title: `Website Contact & Company Info | ${liveCompany.name}`,
            company: liveCompany,
            setting,
            user: req.session.user,
            currentUser: req.session.user,
            csrfToken: req.session ? req.session.csrfToken : '',
            activePage: 'cms-contact',
            pageTitle: 'Website Contact & Company Profile'
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error loading contact info page:', err);
        res.status(500).render('private/errors/403', {
            title: 'Error | Shivay Energy Solutions',
            message: 'Failed to load contact info editor.'
        });
    }
};

exports.updateContactInfo = async (req, res) => {
    try {
        const textFields = [
            'companyName', 'shortName', 'tagline', 'gstin', 'officialEmail',
            'primaryPhone', 'alternatePhone', 'whatsappNumber', 'website',
            'addressLine', 'city', 'district', 'state', 'pincode',
            'workingDays', 'workingTime',
            'facebookUrl', 'instagramUrl', 'youtubeUrl', 'whatsappUrl',
            'founder1Name', 'founder1Designation', 'founder1Mobile',
            'founder2Name', 'founder2Designation', 'founder2Mobile'
        ];

        if (isDbConnected()) {
            let setting = await Setting.findOne();
            if (!setting) {
                setting = new Setting();
            }

            textFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    setting[field] = req.body[field].trim();
                }
            });

            await setting.save();
        } else {
            let memSetting = WebsiteService.getMemSetting() || {};
            textFields.forEach(field => {
                if (req.body[field] !== undefined) {
                    memSetting[field] = req.body[field].trim();
                }
            });
            WebsiteService.setMemSetting(memSetting);
        }

        // Immediately refresh the company cache so navbar, footer, headers across ALL pages reflect new contact info!
        const updatedCompany = await WebsiteService.refreshCompanyCache();

        return res.json({
            success: true,
            message: 'Contact and company profile updated successfully across all website pages.',
            company: updatedCompany
        });
    } catch (err) {
        console.error('[WebsiteCMS] Error updating contact info:', err);
        return res.status(500).json({ success: false, message: err.message || 'Error updating company contact profile.' });
    }
};
