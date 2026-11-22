const mongoose = require('mongoose');
const companyConfig = require('../config/company');
const WebService = require('../models/WebService');
const WebProduct = require('../models/WebProduct');
const WebProject = require('../models/WebProject');
const WebTeam = require('../models/WebTeam');
const WebTestimonial = require('../models/WebTestimonial');
const Setting = require('../models/Setting');

// In-memory cache for ultra-fast, live synchronous access across middleware
let cachedCompany = JSON.parse(JSON.stringify(companyConfig.company));
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute auto-refresh or immediate on update

// Complete Seed Datasets (All Services, Products, Projects from company catalog)
const INITIAL_SERVICES = [
    {
        serviceId: 'residential-solar',
        title: 'Residential Rooftop Solar Installation',
        icon: 'icofont-home',
        image: '/images/slider/slider1.webp',
        shortDesc: 'Complete turnkey rooftop solar solutions for bungalows, apartments, and independent houses with PM Surya Ghar subsidy support.',
        details: 'Turn your rooftop into an income-generating clean energy plant. Shivay Energy Solutions handles everything from site survey, shadow analysis, structure fabrication, DCR module mounting, inverter commissioning to DISCOM net-metering approvals.',
        highlights: ['Up to ₹78,000 Direct Govt Subsidy', 'Zero Electricity Bills', 'Custom 3D Shadow Analysis', '25 Years Performance Warranty'],
        order: 1,
        isActive: true
    },
    {
        serviceId: 'commercial-industrial',
        title: 'Commercial & Industrial (C&I) Solar Systems',
        icon: 'icofont-building-alt',
        image: '/images/slider/slider1.webp',
        shortDesc: 'High-capacity on-grid solar plants for factories, cold storages, hospitals, petrol pumps, schools, and commercial establishments.',
        details: 'Commercial and industrial tariffs in Madhya Pradesh exceed ₹8 - ₹10 per unit. Solar energy reduces your operational overheads to less than ₹2.5 per unit, giving your business an immediate competitive edge.',
        highlights: ['Accelerated Depreciation (40% Tax Benefit)', 'Drastic Operational Cost Reduction', 'CAPEX & OPEX Business Models', 'Rapid 3-Year ROI Payback'],
        order: 2,
        isActive: true
    },
    {
        serviceId: 'maintenance-amc',
        title: 'Solar System AMC & Maintenance Services',
        icon: 'icofont-tools-alt-2',
        image: '/images/slider/slider1.webp',
        shortDesc: 'Comprehensive Operations & Maintenance (O&M) contracts, panel deep cleaning, inverter diagnostics, and earthing health audits.',
        details: 'Dust and bird droppings on solar panels reduce generation by up to 25%. Our specialized O&M team in Raisen and Bhopal ensures maximum yield, routine preventive check-ups, and uninterrupted generation year-round.',
        highlights: ['Scheduled High-Pressure Dust Cleaning', 'Inverter Health & String Diagnostics', 'Prompt Breakdown Resolution (< 24 Hours)', 'Generation Enhancement Audits'],
        order: 3,
        isActive: true
    },
    {
        serviceId: 'agricultural-solar',
        title: 'Agricultural Solar Water Pumps (PM-KUSUM)',
        icon: 'icofont-water',
        image: '/images/slider/slider1.webp',
        shortDesc: 'Solar pump installations for agricultural tube-wells, borewells, and rural farms under subsidized PM-KUSUM guidelines.',
        details: 'Reliable, free irrigation powered by sunlight. No more waiting for nighttime rural electricity rosters to water your wheat, gram, and soybean fields.',
        highlights: ['Eliminate Diesel Generator Expenses', 'Daytime Reliable Irrigation for Crops', 'Submersible & Surface DC/AC Pumps', 'Rugged High-Torque Performance'],
        order: 4,
        isActive: true
    },
    {
        serviceId: 'consultation-netmetering',
        title: 'Solar Consultation & Net-Metering Liaisoning',
        icon: 'icofont-certificate-alt-1',
        image: '/images/slider/slider1.webp',
        shortDesc: 'End-to-end liaisoning with MPPKVVCL / MPMKVVCL electricity boards for net-meter sanctions, CEIG safety approvals, and load upgrades.',
        details: 'Navigating DISCOM approvals can be frustrating. Our local liaisoning team in Raisen and MP takes care of every document, site inspection, and meter replacement seamlessly.',
        highlights: ['Complete DISCOM Paperwork Handling', 'Feasibility Study & Sanction Letters', 'Bi-Directional Meter Installation', '100% Hassle-Free Approvals'],
        order: 5,
        isActive: true
    },
    {
        serviceId: 'battery-storage-solutions',
        title: 'Energy Storage & Battery Upgrades',
        icon: 'icofont-battery-full',
        image: '/images/slider/slider1.webp',
        shortDesc: 'Retrofit battery storage systems to existing on-grid plants or design off-grid backup systems for critical commercial loads.',
        details: 'Ensure zero downtime during power cuts with modular lithium battery banks capable of high surge currents for air conditioners, machinery, and lighting loads.',
        highlights: ['Lithium Iron Phosphate (LiFePO4) Packs', 'Smart Micro-Grid Configuration', 'Uninterrupted Power for Critical Machinery', 'Zero Diesel Dependency'],
        order: 6,
        isActive: true
    },
    {
        serviceId: 'ev-charging-installation',
        title: 'EV Charging Station Installation',
        icon: 'icofont-electricity',
        image: '/images/slider/slider1.webp',
        shortDesc: 'EV charger supply, site assessment, electrical work, installation, and commissioning for homes and businesses.',
        details: 'Set up a safe, convenient EV charging point with charger selection, electrical preparation, installation, and commissioning.',
        highlights: ['Home & workplace chargers', 'Load and safety assessment', 'Installation & commissioning'],
        order: 7,
        isActive: true
    },
    {
        serviceId: 'ev-charger-service',
        title: 'EV Charger Service & Maintenance',
        icon: 'icofont-tools-alt-2',
        image: '/images/slider/slider1.webp',
        shortDesc: 'Inspection, troubleshooting, and routine maintenance for residential and commercial EV charging points.',
        details: 'Keep EV charging equipment reliable with fault checks, electrical safety inspections, and scheduled maintenance.',
        highlights: ['Charger diagnostics', 'Electrical safety checks', 'Repair & preventive maintenance'],
        order: 8,
        isActive: true
    }
];

const INITIAL_PRODUCTS = [
    {
        productId: 'on-grid-inverter',
        name: 'On-Grid Solar Inverter',
        category: 'Inverters',
        capacityRange: '1 kW - 100 kW',
        efficiency: 'Up to 98.6%',
        warranty: '5 to 10 Years Manufacturer Warranty',
        description: 'High-efficiency grid-tied inverters with built-in dual MPPT trackers and Wi-Fi smart monitoring. Seamlessly export surplus electricity to MP DISCOM grid via bidirectional net meter to zero out your electricity bill.',
        features: ['MNRE & BIS Certified', 'Dual MPPT Support', 'IP65 Weatherproof', 'Real-time Mobile App Monitoring'],
        bestFor: 'Homes, Offices & Factories with reliable grid supply wanting to reduce power bills to zero.',
        startingPrice: '₹24,500',
        image: '/images/slider/slider1.webp',
        order: 1,
        isActive: true
    },
    {
        productId: 'hybrid-inverter',
        name: 'Hybrid Solar Inverter',
        category: 'Inverters',
        capacityRange: '3 kW - 15 kW',
        efficiency: 'Up to 97.8%',
        warranty: '5 Years Comprehensive Warranty',
        description: 'Combines the benefits of on-grid solar and battery backup in one unit. Powers your home during power cuts and feeds excess energy back to the grid when batteries are fully charged.',
        features: ['Lithium & Lead-Acid Battery Compatible', 'Instant Power Backup (< 10ms UPS switch)', 'Smart Load Sharing', 'Zero-Export Grid Compliance'],
        bestFor: 'Areas with occasional load-shedding wanting both 24/7 battery backup and net-metering savings.',
        startingPrice: '₹48,000',
        image: '/images/slider/slider1.webp',
        order: 2,
        isActive: true
    },
    {
        productId: 'off-grid-inverter',
        name: 'Off-Grid Solar Inverter',
        category: 'Inverters',
        capacityRange: '1 kVA - 10 kVA',
        efficiency: 'Up to 94%',
        warranty: '2 to 5 Years Warranty',
        description: 'Independent solar inverters engineered for locations with zero or highly unstable grid power. Directly converts solar power to run home appliances and stores energy into heavy-duty batteries.',
        features: ['Pure Sine Wave Output', 'High Surge Capability for Motors & Pumps', 'Auto Generator Start', 'LCD Display'],
        bestFor: 'Farmhouses, Agricultural tube-wells, Rural homes, and Remote commercial setups.',
        startingPrice: '₹18,500',
        image: '/images/slider/slider1.webp',
        order: 3,
        isActive: true
    },
    {
        productId: 'mono-perc-panels',
        name: 'Mono PERC Half-Cut Solar Panels (540W - 580W)',
        category: 'Solar Panels',
        capacityRange: '540 Watt - 580 Watt per Panel',
        efficiency: '21.5% - 22.8%',
        warranty: '12 Years Product Warranty | 25-30 Years Linear Performance Warranty',
        description: 'Tier-1 Mono crystalline PERC half-cut modules with multi-busbar technology. Outstanding low-light performance during cloudy Madhya Pradesh monsoon and peak summer days.',
        features: ['ALMM Listed & DCR Available (Eligible for PM Surya Ghar Subsidy)', 'Anti-Reflective Hydrophobic Glass', 'Withstands 5400 Pa Snow & 2400 Pa Wind Loads'],
        bestFor: 'Residential rooftops with limited space needing maximum power output per square foot.',
        startingPrice: '₹21/Watt',
        image: '/images/slider/slider1.webp',
        order: 4,
        isActive: true
    },
    {
        productId: 'solar-batteries',
        name: 'Solar Lithium-ion (LiFePO4) & Tall Tubular Batteries',
        category: 'Energy Storage',
        capacityRange: '100Ah - 200Ah / 48V Lithium Packs (5kWh - 15kWh)',
        efficiency: '95% (Lithium) / 85% (Tubular)',
        warranty: '5 Years Replacement Warranty (Lithium: 6000+ Cycles)',
        description: 'Maintenance-free Lithium Iron Phosphate (LiFePO4) solar wall batteries and heavy-duty C10 rated tall tubular lead-acid solar batteries designed for Indian tropical heat conditions.',
        features: ['Deep 90% Depth of Discharge (DoD)', 'Quick 2-Hour Fast Charging', 'High Temperature Resistance', 'Smart Battery Management System (BMS)'],
        bestFor: 'Uninterrupted 24/7 power backup for lights, fans, computers, refrigerators, and coolers.',
        startingPrice: '₹14,500 (Tubular) / ₹65,000 (Lithium Wall Pack)',
        image: '/images/slider/slider1.webp',
        order: 5,
        isActive: true
    },
    {
        productId: 'solar-accessories',
        name: 'Solar Balance of System (BOS) & Accessories',
        category: 'Accessories',
        capacityRange: 'Customized for all project sizes',
        efficiency: 'Industry Standard Protection',
        warranty: '1 to 5 Years Warranty',
        description: 'High-grade Hot-Dip Galvanized (HDG) or Aluminium rooftop mounting structures, DCDB & ACDB distribution boxes with Type-2 SPDs, UV-resistant dual-core DC solar cables, and copper earthing kits with lightning arresters.',
        features: ['Wind Speed Certified up to 150 km/h', 'IP65 Weatherproof Enclosures', 'Surge Protection Devices (SPD)', 'Chemical Earthing Electrodes'],
        bestFor: 'Safeguarding your complete solar investment against lightning, surges, and harsh weather.',
        startingPrice: 'Package based',
        image: '/images/slider/slider1.webp',
        order: 6,
        isActive: true
    },
    {
        productId: 'home-ev-charger',
        name: 'Home EV AC Charger',
        category: 'EV Chargers',
        capacityRange: '3.3 kW - 7.4 kW',
        efficiency: 'Smart AC charging',
        warranty: 'Manufacturer warranty varies by model',
        description: 'Compact AC charging equipment for compatible electric cars at homes and small workplaces.',
        features: ['Wall-mounted options', 'Site and load assessment', 'Safety protection features'],
        bestFor: 'Home parking and private charging points.',
        startingPrice: 'Ask for a quote',
        image: '/images/slider/slider1.webp',
        order: 7,
        isActive: true
    },
    {
        productId: 'commercial-ev-charger',
        name: 'Workplace & Commercial EV Charger',
        category: 'EV Chargers',
        capacityRange: '7.4 kW - 22 kW AC',
        efficiency: 'Smart AC charging',
        warranty: 'Manufacturer warranty varies by model',
        description: 'AC charging options for offices, shops, housing societies, and customer parking areas.',
        features: ['Single or three-phase options', 'Installation support', 'Electrical safety checks'],
        bestFor: 'Workplaces and commercial parking.',
        startingPrice: 'Ask for a quote',
        image: '/images/slider/slider1.webp',
        order: 8,
        isActive: true
    }
];

const INITIAL_PROJECTS = [
    {
        projectId: 'proj-1',
        title: '3 kW Residential Rooftop Solar',
        category: 'Residential Solar',
        location: 'Arjun Nagar, Raisen (M.P.)',
        capacity: '3 kW',
        type: 'Residential On-Grid',
        year: '2024',
        image: '/images/slider/slider2.webp',
        panels: '6x 540W Mono PERC Half-Cut',
        inverter: '3 kW Dual MPPT On-Grid',
        impact: 'Installed under PM Surya Ghar. Bill reduced from ₹3,200 to ₹0.',
        description: 'Full turnkey rooftop installation for a residential home in Arjun Nagar, Raisen. Secured ₹78,000 direct DBT subsidy with expedited DISCOM net-metering approvals from MPMKVVCL.',
        order: 1,
        isActive: true
    },
    {
        projectId: 'proj-2',
        title: '25 kW Industrial Rooftop Solar',
        category: 'Commercial & Industrial',
        location: 'Mandideep Industrial Area, Bhopal',
        capacity: '25 kW',
        type: 'Commercial C&I',
        year: '2023',
        image: '/images/slider/slider2.webp',
        panels: '46x 550W Tier-1 DCR Panels',
        inverter: '25 kW High-Efficiency Grid-Tied',
        impact: 'Saves over ₹3.5 Lakhs annually for manufacturing unit.',
        description: 'High-capacity on-grid solar plant engineered for an engineering fabrication facility in Mandideep. Powers daytime machine operations and provides 40% accelerated depreciation tax benefits.',
        order: 2,
        isActive: true
    },
    {
        projectId: 'proj-3',
        title: '5 HP Solar Water Pumping System',
        category: 'Agricultural Solar',
        location: 'Gairatganj, Raisen (M.P.)',
        capacity: '5 HP',
        type: 'PM-KUSUM Agri',
        year: '2023',
        image: '/images/slider/slider2.webp',
        panels: '10x 500W High-Torque Solar Modules',
        inverter: '5 HP VFD Solar Pump Controller',
        impact: 'Zero diesel costs for 12-acre farm irrigation.',
        description: 'Reliable daytime irrigation for 12 acres of wheat and gram cultivation. Replaced costly diesel genset operation with zero-running-cost solar water discharge of 1.5 Lakh litres per day.',
        order: 3,
        isActive: true
    },
    {
        projectId: 'proj-4',
        title: '5 kW Hybrid System with Lithium Storage',
        category: 'Hybrid & Storage',
        location: 'Sanchi Road, Vidisha (M.P.)',
        capacity: '5 kW',
        type: 'Hybrid Lithium',
        year: '2024',
        image: '/images/slider/slider2.webp',
        panels: '9x 545W Mono PERC Panels',
        inverter: '5 kW Hybrid with 5 kWh LiFePO4 Battery',
        impact: '24x7 uninterrupted power backup during grid outages.',
        description: 'High-reliability hybrid solar inverter paired with maintenance-free 48V Lithium Iron Phosphate wall battery. Ensures seamless power for medical clinic equipment and household appliances.',
        order: 4,
        isActive: true
    },
    {
        projectId: 'proj-5',
        title: '10 kW Institutional Rooftop Plant',
        category: 'Institutional Solar',
        location: 'Hoshangabad Road, Bhopal',
        capacity: '10 kW',
        type: 'Institutional',
        year: '2023',
        image: '/images/slider/slider2.webp',
        panels: '18x 550W Bifacial Solar Panels',
        inverter: '10 kW Three-Phase Inverter',
        impact: 'Powers school campus computers and lighting.',
        description: 'Educational campus rooftop installation generating ~1,200 units of clean electricity every month, drastically lowering institutional utility overheads and inspiring students about clean energy.',
        order: 5,
        isActive: true
    },
    {
        projectId: 'proj-6',
        title: '2 kW Residential Rooftop System',
        category: 'Residential Solar',
        location: 'Ward No. 15, Raisen (M.P.)',
        capacity: '2 kW',
        type: 'Residential Rooftop',
        year: '2024',
        image: '/images/slider/slider2.webp',
        panels: '4x 540W Mono PERC Panels',
        inverter: '2 kW Single-Phase On-Grid',
        impact: 'Received ₹60,000 PM Surya Ghar DBT subsidy.',
        description: 'Compact rooftop installation delivering 240 units per month for a middle-class family. Full DISCOM paperwork, meter testing, and subsidy commissioning completed in under 21 days.',
        order: 6,
        isActive: true
    },
    {
        projectId: 'proj-7',
        title: '50 kW Commercial Net-Metered Plant',
        category: 'Commercial & Industrial',
        location: 'Raisen Bypass, Madhya Pradesh',
        capacity: '50 kW',
        type: 'Commercial C&I',
        year: '2024',
        image: '/images/slider/slider1.webp',
        panels: '92x 550W Tier-1 DCR Modules',
        inverter: '50 kW Quad-MPPT Synchronized Inverter',
        impact: 'Saves ₹6.8 Lakhs annually for cold storage facility.',
        description: 'Large-scale commercial rooftop solar plant installed on cold storage warehouse. Engineered with heavy-duty HDG mounting structure capable of withstanding 150 km/h wind speeds.',
        order: 7,
        isActive: true
    },
    {
        projectId: 'proj-8',
        title: '3.3 kW Mono PERC Solar Villa',
        category: 'Residential Solar',
        location: 'Bhopal Road, Raisen',
        capacity: '3.3 kW',
        type: 'Residential On-Grid',
        year: '2024',
        image: '/images/slider/slider2.webp',
        panels: '6x 550W Mono PERC Half-Cut',
        inverter: '3.3 kW High-Efficiency Inverter',
        impact: 'Zero bill with surplus units exported every month.',
        description: 'Rooftop solar installation for a luxury villa in Raisen. High-efficiency half-cut monocrystalline modules maximize generation on limited roof footprint.',
        order: 8,
        isActive: true
    }
];

const INITIAL_TEAM = [
    {
        name: 'Deepak Kushwaha',
        designation: 'Managing Director & Technical Head',
        mobile: '+91 70005 75496',
        whatsapp: 'https://wa.me/917000575496',
        email: 'deepak@shivayenergysolutions.com',
        bio: 'Solar power engineer with deep expertise in rooftop EPC, DISCOM net-metering liaisoning, and MNRE subsidy execution.',
        isFounder: true,
        order: 1,
        isActive: true
    },
    {
        name: 'Rahul Saini',
        designation: 'Operations & Customer Support Head',
        mobile: '+91 93997 61750',
        whatsapp: 'https://wa.me/919399761750',
        email: 'rahul@shivayenergysolutions.com',
        bio: 'Oversees site feasibility audits, procurement supply chain, field technicians, and rapid post-installation warranty support.',
        isFounder: true,
        order: 2,
        isActive: true
    }
];

const INITIAL_TESTIMONIALS = [
    {
        name: 'Ramswaroop Sharma',
        location: 'Arjun Nagar, Raisen (M.P.)',
        system: '3 kW Residential On-Grid System',
        rating: 5,
        review: 'Shivay Energy Solutions ne mere ghar par 3 kW ka solar plant lagwaya. PM Surya Ghar yojana ki ₹78,000 ki subsidy direct mere bank account me aa gayi. Bijli ka bill jo pehle ₹3,200 aata tha ab zero ho gaya hai!',
        order: 1,
        isActive: true
    },
    {
        name: 'Mahesh Patel',
        location: 'Industrial Area, Mandideep, Bhopal',
        system: '25 kW Commercial Rooftop Solar',
        rating: 5,
        review: 'Hamari manufacturing unit ka bijli kharcha mahine ka ₹45,000 tha. Rahul Saini ji ne complete plant design kiya aur MP electricity board se net-meter approval karwaya. Plant se hamara 70% bill kam ho gaya hai.',
        order: 2,
        isActive: true
    },
    {
        name: 'Advocate Rajesh Tiwari',
        location: 'Vidisha Road, Raisen',
        system: '5 kW Hybrid Solar Plant with Lithium Battery',
        rating: 5,
        review: 'Light jane par inverter ka koi jhanjhat nahi. Pure din solar se AC chalta hai aur extra bijli grid me export ho jati hai. Shivay Energy Solutions ne quality material aur genuine DCR panels use kiye hain.',
        order: 3,
        isActive: true
    }
];

// Memory fallback stores (initialized with seed data)
let memServices = INITIAL_SERVICES.map(s => ({ ...s, _id: new mongoose.Types.ObjectId() }));
let memProducts = INITIAL_PRODUCTS.map(p => ({ ...p, _id: new mongoose.Types.ObjectId() }));
let memProjects = INITIAL_PROJECTS.map(pr => ({ ...pr, _id: new mongoose.Types.ObjectId() }));
let memTeam = INITIAL_TEAM.map(t => ({ ...t, _id: new mongoose.Types.ObjectId() }));
let memTestimonials = INITIAL_TESTIMONIALS.map(t => ({ ...t, _id: new mongoose.Types.ObjectId() }));
let memSetting = null;

class WebsiteService {
    static getMemServices() { return memServices; }
    static getMemProducts() { return memProducts; }
    static getMemProjects() { return memProjects; }
    static getMemTeam() { return memTeam; }
    static getMemTestimonials() { return memTestimonials; }
    static getMemSetting() { return memSetting; }
    static setMemSetting(s) { memSetting = s; }

    /**
     * Seed all products, services, recent projects, team and testimonials if missing in database
     */
    static async ensureInitialSeedData() {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return;

        try {
            // Upsert all services so none are missing
            for (const s of INITIAL_SERVICES) {
                const exists = await WebService.findOne({ serviceId: s.serviceId });
                if (!exists) {
                    await WebService.create(s);
                }
            }

            // Upsert all products so none are missing
            for (const p of INITIAL_PRODUCTS) {
                const exists = await WebProduct.findOne({ productId: p.productId });
                if (!exists) {
                    await WebProduct.create(p);
                }
            }

            // Upsert all projects so none are missing
            for (const pr of INITIAL_PROJECTS) {
                const exists = await WebProject.findOne({ projectId: pr.projectId });
                if (!exists) {
                    await WebProject.create(pr);
                }
            }

            for (const t of INITIAL_TEAM) {
                const exists = await WebTeam.findOne({ name: t.name });
                if (!exists) {
                    await WebTeam.create(t);
                }
            }

            for (const tm of INITIAL_TESTIMONIALS) {
                const exists = await WebTestimonial.findOne({ name: tm.name });
                if (!exists) {
                    await WebTestimonial.create(tm);
                }
            }
        } catch (err) {
            console.error('[WebsiteService] Error verifying seed data:', err.message);
        }
    }

    /**
     * Build dynamic company object from database Setting record
     */
    static buildDynamicCompanyObject(settingDoc) {
        const base = JSON.parse(JSON.stringify(companyConfig.company));
        if (!settingDoc) return base;

        const name = settingDoc.companyName || base.name;
        const shortName = settingDoc.shortName || base.shortName;
        const tagline = settingDoc.tagline || base.tagline;
        const gstin = settingDoc.gstin || base.gstin;
        const email = settingDoc.officialEmail || base.email;
        const phone = settingDoc.primaryPhone || base.contact.phone;
        const alternatePhone = settingDoc.alternatePhone || base.contact.alternatePhone;
        const whatsappNumber = settingDoc.whatsappNumber || phone;
        const website = settingDoc.website || base.website;

        const line1 = settingDoc.addressLine || base.address.line1;
        const city = settingDoc.city || base.address.city;
        const district = settingDoc.district || base.address.district;
        const state = settingDoc.state || base.address.state;
        const pincode = settingDoc.pincode || base.address.pincode;
        const fullAddress = `${line1}, ${city}, ${state} – ${pincode}, India.`;

        const workingDays = settingDoc.workingDays || base.workingHours.days;
        const workingTime = settingDoc.workingTime || base.workingHours.time;

        const whatsappUrl = settingDoc.whatsappUrl || `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`;
        const facebookUrl = settingDoc.facebookUrl || base.social.facebook;
        const instagramUrl = settingDoc.instagramUrl || base.social.instagram;
        const youtubeUrl = settingDoc.youtubeUrl || base.social.youtube;

        const privacyPolicy = settingDoc.privacyPolicy || "";
        const termsAndConditions = settingDoc.termsAndConditions || "";
        const privacyPolicyUpdatedAt = settingDoc.privacyPolicyUpdatedAt || settingDoc.updatedAt || new Date();
        const termsAndConditionsUpdatedAt = settingDoc.termsAndConditionsUpdatedAt || settingDoc.updatedAt || new Date();

        const contacts = [];
        if (settingDoc.founder1Name) {
            contacts.push({
                name: settingDoc.founder1Name,
                designation: settingDoc.founder1Designation || 'Managing Director',
                mobile: settingDoc.founder1Mobile || phone,
                rawMobile: (settingDoc.founder1Mobile || phone).replace(/[^0-9]/g, ''),
                whatsapp: `https://wa.me/${(settingDoc.founder1Mobile || phone).replace(/[^0-9]/g, '')}`
            });
        }
        if (settingDoc.founder2Name) {
            contacts.push({
                name: settingDoc.founder2Name,
                designation: settingDoc.founder2Designation || 'Operations Head',
                mobile: settingDoc.founder2Mobile || alternatePhone,
                rawMobile: (settingDoc.founder2Mobile || alternatePhone).replace(/[^0-9]/g, ''),
                whatsapp: `https://wa.me/${(settingDoc.founder2Mobile || alternatePhone).replace(/[^0-9]/g, '')}`
            });
        }
        if (contacts.length === 0) {
            contacts.push(...base.contacts);
        }

        return {
            ...base,
            name,
            shortName,
            tagline,
            gstin,
            email,
            website,
            address: {
                line1,
                city,
                district,
                state,
                pincode,
                country: 'India',
                full: fullAddress
            },
            location: {
                address: line1,
                city,
                district,
                state,
                pincode,
                country: 'India'
            },
            contact: {
                phone,
                alternatePhone,
                email,
                whatsapp: whatsappNumber
            },
            contacts,
            workingHours: {
                days: workingDays,
                time: workingTime,
                emergency: base.workingHours.emergency || '24/7 Breakdown & Support Available'
            },
            social: {
                whatsapp: whatsappUrl,
                facebook: facebookUrl,
                instagram: instagramUrl,
                youtube: youtubeUrl
            },
            privacyPolicy,
            termsAndConditions,
            privacyPolicyUpdatedAt,
            termsAndConditionsUpdatedAt
        };
    }

    /**
     * Refresh in-memory cached company data directly from Setting model
     */
    static async refreshCompanyCache() {
        try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const setting = await Setting.findOne().lean();
                if (setting) {
                    cachedCompany = this.buildDynamicCompanyObject(setting);
                    cacheTimestamp = Date.now();
                }
            } else {
                const DataStore = require('./dataStore');
                const dsSetting = memSetting || (DataStore && DataStore.getSettings ? DataStore.getSettings() : null);
                if (dsSetting) {
                    cachedCompany = this.buildDynamicCompanyObject(dsSetting);
                    cacheTimestamp = Date.now();
                }
            }
        } catch (e) {
            console.error('[WebsiteService] Error refreshing company cache:', e.message);
        }
        cacheTimestamp = Date.now();
        return cachedCompany;
    }

    /**
     * Get live company data asynchronously with TTL caching
     */
    static async getCompany() {
        if (!cacheTimestamp || (Date.now() - cacheTimestamp > CACHE_TTL_MS)) {
            await this.refreshCompanyCache();
        }
        return cachedCompany;
    }

    /**
     * Get live company data synchronously (from cache)
     */
    static getLiveCompanyData() {
        // Trigger background refresh if TTL expired
        if (Date.now() - cacheTimestamp > CACHE_TTL_MS) {
            this.refreshCompanyCache().catch(() => {});
        }
        return cachedCompany;
    }

    /**
     * Helper to map raw WebService doc to template representation
     */
    static mapServiceItem(s) {
        return {
            id: s.serviceId,
            serviceId: s.serviceId,
            title: s.title,
            icon: s.icon || 'icofont-home',
            image: s.image,
            shortDesc: s.shortDesc,
            details: s.details,
            highlights: s.highlights || [],
            order: s.order
        };
    }

    /**
     * Helper to map raw WebProduct doc to template representation
     */
    static mapProductItem(p) {
        return {
            id: p.productId,
            productId: p.productId,
            name: p.name,
            category: p.category,
            capacityRange: p.capacityRange,
            efficiency: p.efficiency,
            warranty: p.warranty,
            description: p.description,
            features: p.features || [],
            bestFor: p.bestFor,
            startingPrice: p.startingPrice,
            image: p.image,
            order: p.order
        };
    }

    /**
     * Helper to map raw WebProject doc to template representation
     */
    static mapProjectItem(pr) {
        return {
            id: pr.projectId,
            projectId: pr.projectId,
            title: pr.title,
            category: pr.category,
            location: pr.location,
            capacity: pr.capacity,
            type: pr.type,
            year: pr.year,
            image: pr.image,
            panels: pr.panels,
            inverter: pr.inverter,
            impact: pr.impact,
            description: pr.description,
            order: pr.order
        };
    }

    /**
     * Helper to get common layout and business configuration
     * Excludes collection arrays (services, products, projects, team, testimonials)
     * so that each page only carries what it specifically queries.
     */
    static getBaseLayoutData(liveCompany) {
        return {
            company: liveCompany,
            schemes: companyConfig.schemes,
            taxPolicy: companyConfig.taxPolicy,
            paymentPolicyOptions: companyConfig.paymentPolicyOptions,
            calculator: companyConfig.calculator,
            regions: companyConfig.regions
        };
    }

    /**
     * Helper to map raw WebTestimonial doc to template representation
     */
    static mapTestimonialItem(t) {
        return {
            name: t.name,
            location: t.location,
            system: t.system,
            rating: t.rating || 5,
            review: t.review,
            image: t.image,
            order: t.order
        };
    }

    /**
     * PAGE-SPECIFIC QUERY: Home Page (/)
     * Queries ONLY active services and top 3 recent projects.
     * Does NOT query products, team, or testimonials.
     */
    static async getHomeData() {
        const liveCompany = await this.getCompany();
        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            services: [],
            projects: []
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const [dbServices, dbProjects] = await Promise.all([
                    WebService.find({ isActive: true })
                        .select('serviceId title icon image shortDesc highlights order')
                        .sort({ order: 1, createdAt: 1 })
                        .lean(),
                    WebProject.find({ isActive: true })
                        .select('projectId title category location capacity type year image panels inverter impact description order')
                        .sort({ order: 1, createdAt: 1 })
                        .limit(3)
                        .lean()
                ]);

                if (dbServices && dbServices.length > 0) {
                    baseData.services = dbServices.map(this.mapServiceItem);
                }
                if (dbProjects && dbProjects.length > 0) {
                    baseData.projects = dbProjects.map(this.mapProjectItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getHomeData:', err.message);
            }
        } else {
            baseData.services = memServices.filter(s => s.isActive).map(this.mapServiceItem);
            baseData.projects = memProjects.filter(pr => pr.isActive).slice(0, 3).map(this.mapProjectItem);
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: About Us Page (/about)
     * Queries ONLY active team members and customer testimonials.
     * Does NOT query services, products, or projects.
     */
    static async getAboutData() {
        const liveCompany = await this.getCompany();
        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            company: { ...liveCompany },
            team: [],
            testimonials: []
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const [dbTeam, dbTestimonials] = await Promise.all([
                    WebTeam.find({ isActive: true })
                        .select('name designation mobile whatsapp email bio image isFounder order')
                        .sort({ order: 1, createdAt: 1 })
                        .lean(),
                    WebTestimonial.find({ isActive: true })
                        .select('name location system rating review image order')
                        .sort({ order: 1, createdAt: 1 })
                        .lean()
                ]);

                if (dbTeam && dbTeam.length > 0) {
                    baseData.team = dbTeam;
                    baseData.company.contacts = dbTeam.map(t => ({
                        name: t.name,
                        designation: t.designation,
                        mobile: t.mobile,
                        rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                        whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                        image: t.image,
                        bio: t.bio,
                        isFounder: t.isFounder
                    }));
                }
                if (dbTestimonials && dbTestimonials.length > 0) {
                    baseData.testimonials = dbTestimonials.map(this.mapTestimonialItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getAboutData:', err.message);
            }
        } else {
            const activeTeam = memTeam.filter(t => t.isActive);
            baseData.team = activeTeam;
            if (activeTeam.length > 0) {
                baseData.company.contacts = activeTeam.map(t => ({
                    name: t.name,
                    designation: t.designation,
                    mobile: t.mobile,
                    rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                    whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                    image: t.image,
                    bio: t.bio,
                    isFounder: t.isFounder
                }));
            }
            baseData.testimonials = memTestimonials.filter(t => t.isActive).map(this.mapTestimonialItem);
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Services Catalog Page (/services)
     * Queries ONLY active services.
     * Does NOT query products, projects, team, or testimonials.
     */
    static async getServicesData() {
        const liveCompany = await this.getCompany();
        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            services: []
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const dbServices = await WebService.find({ isActive: true })
                    .select('serviceId title icon image shortDesc details highlights order')
                    .sort({ order: 1, createdAt: 1 })
                    .lean();

                if (dbServices && dbServices.length > 0) {
                    baseData.services = dbServices.map(this.mapServiceItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getServicesData:', err.message);
            }
        } else {
            baseData.services = memServices.filter(s => s.isActive).map(this.mapServiceItem);
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Products Catalog Page (/products)
     * Queries ONLY active products with pagination support.
     * Does NOT query services, projects, team, or testimonials.
     */
    static async getProductsData(options = {}) {
        const liveCompany = await this.getCompany();
        const limit = Number(options.limit) > 0 ? Number(options.limit) : 50;
        const skip = Number(options.skip) >= 0 ? Number(options.skip) : 0;
        const categoryFilter = options.category ? { category: options.category } : {};

        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            products: []
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const dbProducts = await WebProduct.find({ isActive: true, ...categoryFilter })
                    .select('productId name category capacityRange efficiency warranty description features bestFor startingPrice image order')
                    .sort({ order: 1, createdAt: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();

                if (dbProducts && dbProducts.length > 0) {
                    baseData.products = dbProducts.map(this.mapProductItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getProductsData:', err.message);
            }
        } else {
            let filtered = memProducts.filter(p => p.isActive);
            if (options.category) {
                filtered = filtered.filter(p => p.category === options.category);
            }
            baseData.products = filtered.slice(skip, skip + limit).map(this.mapProductItem);
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Single Product Details (/products/:slug)
     * Uses a single-document query matching productId (slug) or _id.
     * Does NOT query any other collections.
     */
    static async getProductDetails(slug) {
        const liveCompany = await this.getCompany();
        const cleanSlug = String(slug || '').toLowerCase().trim();

        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            product: null
        };

        if (!cleanSlug) return baseData;

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const candidates = [cleanSlug];
                if (cleanSlug.includes('ongrid') || cleanSlug.includes('on-grid')) candidates.push('on-grid-inverter', 'ongrid-solar-inverter');
                if (cleanSlug.includes('offgrid') || cleanSlug.includes('off-grid')) candidates.push('off-grid-inverter', 'offgrid-solar-inverter');
                if (cleanSlug.includes('hybrid')) candidates.push('hybrid-inverter', 'hybrid-solar-inverter');
                if (cleanSlug.includes('panel') || cleanSlug.includes('mono')) candidates.push('mono-perc-panels');
                if (cleanSlug.includes('batter')) candidates.push('solar-batteries');
                if (cleanSlug.includes('accessor') || cleanSlug.includes('bos')) candidates.push('solar-accessories');
                if (cleanSlug.includes('home-ev') || cleanSlug.includes('home_ev')) candidates.push('home-ev-charger');
                if (cleanSlug.includes('commercial-ev') || cleanSlug.includes('commercial_ev')) candidates.push('commercial-ev-charger');

                let dbProduct = await WebProduct.findOne({
                    $or: [
                        { productId: { $in: candidates } },
                        { productId: cleanSlug }
                    ],
                    isActive: true
                })
                .select('productId name category capacityRange efficiency warranty description features bestFor startingPrice image order')
                .lean();

                if (!dbProduct && mongoose.Types.ObjectId.isValid(cleanSlug)) {
                    dbProduct = await WebProduct.findOne({ _id: cleanSlug, isActive: true })
                        .select('productId name category capacityRange efficiency warranty description features bestFor startingPrice image order')
                        .lean();
                }

                if (dbProduct) {
                    baseData.product = this.mapProductItem(dbProduct);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getProductDetails:', err.message);
            }
        } else {
            const normalized = cleanSlug.replace(/[^a-z0-9]/g, '');
            const found = memProducts.find(p => p.isActive && (
                p.productId === cleanSlug ||
                p.productId.replace(/[^a-z0-9]/g, '') === normalized ||
                (normalized.includes('ongrid') && p.productId.includes('on-grid')) ||
                (normalized.includes('offgrid') && p.productId.includes('off-grid')) ||
                (normalized.includes('hybrid') && p.productId.includes('hybrid')) ||
                String(p._id) === cleanSlug
            ));
            if (found) {
                baseData.product = this.mapProductItem(found);
            }
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Recent Projects Portfolio (/projects)
     * Queries ONLY active projects with pagination/limit support.
     * Does NOT query services, products, team, or testimonials.
     */
    static async getProjectsData(options = {}) {
        const liveCompany = await this.getCompany();
        const limit = Number(options.limit) > 0 ? Number(options.limit) : 50;
        const skip = Number(options.skip) >= 0 ? Number(options.skip) : 0;
        const categoryFilter = options.category ? { category: options.category } : {};

        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            projects: []
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const dbProjects = await WebProject.find({ isActive: true, ...categoryFilter })
                    .select('projectId title category location capacity type year image panels inverter impact description order')
                    .sort({ order: 1, createdAt: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();

                if (dbProjects && dbProjects.length > 0) {
                    baseData.projects = dbProjects.map(this.mapProjectItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getProjectsData:', err.message);
            }
        } else {
            let filtered = memProjects.filter(pr => pr.isActive);
            if (options.category) {
                filtered = filtered.filter(pr => pr.category === options.category);
            }
            baseData.projects = filtered.slice(skip, skip + limit).map(this.mapProjectItem);
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Contact & Enquiry Page (/contact)
     * Queries ONLY active team contacts for direct person contact cards.
     * Does NOT query services, products, projects, or testimonials.
     */
    static async getContactData() {
        const liveCompany = await this.getCompany();
        const baseData = {
            ...this.getBaseLayoutData(liveCompany),
            company: { ...liveCompany }
        };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const dbTeam = await WebTeam.find({ isActive: true })
                    .select('name designation mobile whatsapp email image isFounder order')
                    .sort({ order: 1, createdAt: 1 })
                    .lean();

                if (dbTeam && dbTeam.length > 0) {
                    baseData.company.contacts = dbTeam.map(t => ({
                        name: t.name,
                        designation: t.designation,
                        mobile: t.mobile,
                        rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                        whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                        image: t.image,
                        isFounder: t.isFounder
                    }));
                }
            } catch (err) {
                console.error('[WebsiteService] Error in getContactData:', err.message);
            }
        } else {
            const activeTeam = memTeam.filter(t => t.isActive);
            if (activeTeam.length > 0) {
                baseData.company.contacts = activeTeam.map(t => ({
                    name: t.name,
                    designation: t.designation,
                    mobile: t.mobile,
                    rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                    whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                    image: t.image,
                    isFounder: t.isFounder
                }));
            }
        }

        return baseData;
    }

    /**
     * PAGE-SPECIFIC QUERY: Static / Layout-only pages (Careers, Calculator, Privacy, Terms)
     * Executes 0 collection queries. Uses fast cached company configuration.
     */
    static async getLayoutOnlyData() {
        const liveCompany = await this.getCompany();
        return this.getBaseLayoutData(liveCompany);
    }

    /**
     * Legacy / Aggregate Public Site Data method
     * Note: Runtime seed verification removed in Phase 1 for maximum request performance.
     */
    static async getPublicSiteData() {
        const liveCompany = await this.getCompany();
        const baseData = { ...companyConfig, company: liveCompany };

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                // Fetch dynamic collections concurrently without automatic seed insertion
                const [dbServices, dbProducts, dbProjects, dbTeam, dbTestimonials] = await Promise.all([
                    WebService.find({ isActive: true }).select('serviceId title icon image shortDesc details highlights order').sort({ order: 1, createdAt: 1 }).lean(),
                    WebProduct.find({ isActive: true }).select('productId name category capacityRange efficiency warranty description features bestFor startingPrice image order').sort({ order: 1, createdAt: 1 }).lean(),
                    WebProject.find({ isActive: true }).select('projectId title category location capacity type year image panels inverter impact description order').sort({ order: 1, createdAt: 1 }).lean(),
                    WebTeam.find({ isActive: true }).select('name designation mobile whatsapp email bio image isFounder order').sort({ order: 1, createdAt: 1 }).lean(),
                    WebTestimonial.find({ isActive: true }).select('name location system rating review image order').sort({ order: 1, createdAt: 1 }).lean()
                ]);

                if (dbServices && dbServices.length > 0) {
                    baseData.services = dbServices.map(this.mapServiceItem);
                }

                if (dbProducts && dbProducts.length > 0) {
                    baseData.products = dbProducts.map(this.mapProductItem);
                }

                if (dbProjects && dbProjects.length > 0) {
                    baseData.projects = dbProjects.map(this.mapProjectItem);
                }

                if (dbTeam && dbTeam.length > 0) {
                    baseData.team = dbTeam;
                    baseData.company.contacts = dbTeam.map(t => ({
                        name: t.name,
                        designation: t.designation,
                        mobile: t.mobile,
                        rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                        whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                        image: t.image,
                        bio: t.bio,
                        isFounder: t.isFounder
                    }));
                }

                if (dbTestimonials && dbTestimonials.length > 0) {
                    baseData.testimonials = dbTestimonials.map(this.mapTestimonialItem);
                }
            } catch (err) {
                console.error('[WebsiteService] Error fetching dynamic site data:', err.message);
            }
        } else {
            // When Mongoose is not connected (e.g. offline dev, tests), use in-memory stores
            baseData.services = memServices.filter(s => s.isActive).map(this.mapServiceItem);
            baseData.products = memProducts.filter(p => p.isActive).map(this.mapProductItem);
            baseData.projects = memProjects.filter(pr => pr.isActive).map(this.mapProjectItem);
            baseData.team = memTeam.filter(t => t.isActive);
            baseData.company.contacts = memTeam.filter(t => t.isActive).map(t => ({
                name: t.name,
                designation: t.designation,
                mobile: t.mobile,
                rawMobile: t.mobile.replace(/[^0-9]/g, ''),
                whatsapp: t.whatsapp || `https://wa.me/${t.mobile.replace(/[^0-9]/g, '')}`,
                image: t.image,
                bio: t.bio,
                isFounder: t.isFounder
            }));
            baseData.testimonials = memTestimonials.filter(t => t.isActive).map(this.mapTestimonialItem);
        }

        return baseData;
    }

    /**
     * Generate comprehensive personalized default Privacy Policy for Shivay Energy Solutions
     */
    static getDefaultPrivacyPolicy(company = {}) {
        const name = company.name || "SHIVAY ENERGY SOLUTIONS";
        const email = company.email || "shivayenergysolutions@gmail.com";
        const phone = (company.contact && company.contact.phone) || "+91 70005 75496";
        const altPhone = (company.contact && company.contact.alternatePhone) || "+91 93997 61750";
        const address = (company.address && company.address.full) || "Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India";
        const website = company.website || "https://shivayenergysolutions.com";

        return `<h3>1. Introduction & Overview</h3>
<p>Welcome to <strong>${name}</strong> ("we", "our", or "us"). We are committed to safeguarding the privacy of our website visitors, customers, franchise partners, and solar energy consumers across Madhya Pradesh and Central India. This Privacy Policy outlines our transparent practices regarding the collection, handling, processing, and protection of personal and technical data collected through our official website (<strong>${website}</strong>), site survey intake forms, solar savings calculators, complaint registration consoles, and dealership applications.</p>
<p>By using our services or submitting any enquiry on our portal, you acknowledge and agree to the data collection and usage practices described in this policy.</p>

<h3>2. Personal & Technical Information We Collect</h3>
<p>We only collect personal information that is reasonably necessary to design, engineer, install, commission, and maintain your solar energy systems, and to process statutory net-metering and government subsidies. The information collected across our portals includes:</p>

<h4>A. Free Solar Site Survey & Estimate Requests</h4>
<ul>
    <li><strong>Identity & Contact Details:</strong> Full Name, Mobile Number, WhatsApp Number, and Email Address.</li>
    <li><strong>Installation Site Location:</strong> Complete residential, commercial, or agricultural site address, landmark, village/town, Tehsil, District (Raisen, Bhopal, Vidisha, Sehore, Hoshangabad, etc.), and PIN Code.</li>
    <li><strong>Electricity Connection Parameters:</strong> Electricity Consumer Number / IVRS Account ID, Current Sanctioned Load (kW), Monthly Electricity Consumption (Units / kWh), Average Monthly Electricity Bill (₹), and Connection Type (Single-phase or Three-phase).</li>
    <li><strong>Rooftop & Structural Details:</strong> Roof Construction Type (Concrete RCC, Industrial Tin/GI Shed, Curved Metal Sheet, Tile, or Ground Mount), Estimated Shadow-Free Rooftop Area (in sq. ft.), Building Height, and Rooftop Accessibility.</li>
</ul>

<h4>B. PM Surya Ghar Muft Bijli Yojana & DISCOM Net-Metering KYC</h4>
<ul>
    <li><strong>Identity & Address Proofs:</strong> Copy of Aadhaar Card, PAN Card, or Voter ID as required by MPPKVVCL / MPMKVVCL and Electrical Safety Directorate (CEIG) for bidirectional net-meter sanctions.</li>
    <li><strong>Electricity Bill Copy:</strong> Recent paid electricity bill verifying consumer ownership and sanctioned connection capacity.</li>
    <li><strong>Bank Details for Direct DBT Subsidy:</strong> Bank Account Number and IFSC Code (Bank Passbook or Cancelled Cheque copy). <em>This information is strictly utilized to register the consumer on the National Portal for Rooftop Solar (pmsuryaghar.gov.in) so that the Central Government DBT subsidy (up to ₹78,000/-) is credited directly into the consumer's bank account.</em></li>
</ul>

<h4>C. Customer Grievance & Complaint Tickets</h4>
<ul>
    <li><strong>Complaint Details:</strong> Registered Mobile Number, Complaint Ticket ID (<code>SHIVAY-XXXXX</code>), Inverter Serial Number, Solar Panel Make, Inverter Display Fault Codes, Site Photographs of generation meters or distribution boxes, and description of equipment failure.</li>
</ul>

<h4>D. Franchise & Dealership Applications</h4>
<ul>
    <li><strong>Business & Financial Details:</strong> Business/Proprietor Name, Trade Name, GSTIN (if registered), Business Address, Existing Electrical/Solar Experience, Showroom/Warehouse Dimensions, and Proposed Investment Capacity.</li>
</ul>

<h4>E. Field Staff Attendance Verification</h4>
<ul>
    <li><strong>GPS Coordinates:</strong> Device latitude, longitude, and accuracy radius recorded strictly at the moment of attendance check-in and check-out to verify presence within official branch geofences.</li>
</ul>

<h3>3. How We Use Your Information</h3>
<p>We process your data strictly for legitimate operational, engineering, and statutory compliance purposes, including:</p>
<ul>
    <li>Conducting structural shadow analysis, solar generation modelling, and preparing customized commercial quotations.</li>
    <li>Filing and liaisoning grid interconnection and net-meter applications with MPPKVVCL / MPMKVVCL electricity distribution companies.</li>
    <li>Registering eligible rooftop solar systems on the National Portal for Rooftop Solar for central subsidy disbursal.</li>
    <li>Staging, delivering, and installing solar photovoltaic modules, inverters, elevated HDG mounting structures, and electrical Balance of System (BOS).</li>
    <li>Commissioning solar inverters, configuring mobile Wi-Fi generation tracking applications, and scheduling preventive AMC maintenance.</li>
    <li>Diagnosing technical breakdown tickets and facilitating OEM manufacturer warranty claims.</li>
    <li>Communicating critical milestone updates, DISCOM inspection notices, and safety announcements via SMS, WhatsApp, and phone calls.</li>
</ul>

<h3>4. Data Sharing & Third-Party Disclosure Policy</h3>
<p><strong>We have a strict Zero-Spam Policy. We DO NOT sell, rent, lease, or trade your personal information to third-party telemarketers, brokers, or data aggregators.</strong></p>
<p>Your data is shared strictly on a need-to-know basis with authorized entities as required to execute your solar installation:</p>
<ul>
    <li><strong>Electricity Distribution Companies (DISCOMs):</strong> MPPKVVCL / MPMKVVCL for feasibility approvals, meter testing, and bidirectional net-meter commissioning.</li>
    <li><strong>Government Solar Portals:</strong> Ministry of New and Renewable Energy (MNRE) and National Portal for Rooftop Solar for subsidy processing.</li>
    <li><strong>Original Equipment Manufacturers (OEMs):</strong> Tier-1 solar panel and inverter manufacturers strictly for product warranty activation and replacement logistics.</li>
    <li><strong>Statutory Authorities:</strong> If compelled by lawful court order, regulatory mandate, or applicable electrical inspection regulations.</li>
</ul>

<h3>5. Data Security & Storage Standards</h3>
<p>We implement multi-layered physical, administrative, and technological security controls to safeguard your data:</p>
<ul>
    <li><strong>Encrypted Connections:</strong> All web traffic and form submissions are protected via standard HTTPS SSL/TLS encryption.</li>
    <li><strong>Magic-Byte Attachment Validation:</strong> All uploaded electricity bills, KYC documents, and site photos pass binary file-signature inspection to prevent malicious uploads.</li>
    <li><strong>Role-Based Access Control (RBAC):</strong> Access to customer KYC and bank records is restricted exclusively to vetted administrative and liaison officers.</li>
    <li><strong>Secure Cloud Storage:</strong> Documents are stored in secure cloud infrastructure with direct CDN access tokens.</li>
</ul>

<h3>6. Data Retention Period</h3>
<p>We retain your personal contact details and technical solar plant records for the duration of your solar system's operational warranty lifecycle (up to 25 to 30 years) to support routine panel cleaning, inverter diagnostics, component replacements, and regulatory net-meter audits. You may request review or updates to your contact records at any time.</p>

<h3>7. Your Privacy Rights</h3>
<p>As a consumer, you have the right to:</p>
<ul>
    <li>Request confirmation of the personal data we hold about your solar connection.</li>
    <li>Request correction of inaccurate, outdated, or incomplete contact information.</li>
    <li>Opt-out of non-essential promotional communications (essential project milestone and safety alerts will continue).</li>
</ul>

<h3>8. Grievance Redressal & Contact Officer</h3>
<p>If you have any questions, concerns, or requests regarding this Privacy Policy or the handling of your data, please contact our designated Grievance Officer:</p>
<p>
    <strong>Deepak Kushwaha</strong> (Managing Director)<br>
    <strong>${name}</strong><br>
    📍 Address: ${address}<br>
    📞 Direct Phone: <a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a> | <a href="tel:${altPhone.replace(/[^0-9+]/g, '')}">${altPhone}</a><br>
    📧 Email: <a href="mailto:${email}">${email}</a><br>
    🌐 Official Website: <a href="${website}" target="_blank">${website}</a>
</p>`;
    }

    /**
     * Generate comprehensive personalized default Terms & Conditions for Shivay Energy Solutions
     */
    static getDefaultTermsConditions(company = {}) {
        const name = company.name || "SHIVAY ENERGY SOLUTIONS";
        const email = company.email || "shivayenergysolutions@gmail.com";
        const phone = (company.contact && company.contact.phone) || "+91 70005 75496";
        const altPhone = (company.contact && company.contact.alternatePhone) || "+91 93997 61750";
        const address = (company.address && company.address.full) || "Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India";
        const website = company.website || "https://shivayenergysolutions.com";

        return `<h3>1. Scope of Agreement & Turnkey EPC Services</h3>
<p>These Terms and Conditions ("Agreement") govern all site surveys, engineering feasibility assessments, commercial quotations, equipment supplies, turnkey solar rooftop installations, agricultural solar water pumping systems, and after-sales maintenance executed by <strong>${name}</strong> ("Company", "Contractor", "we", or "us").</p>
<p>By approving a quotation, submitting a booking advance, or accepting an equipment dispatch from the Company, the Customer ("Client", "Buyer", "Consumer") agrees to be bound by the terms detailed herein.</p>

<h3>2. Feasibility, Site Survey & Engineering Design</h3>
<ul>
    <li><strong>Preliminary Estimates:</strong> Online calculator estimates and preliminary quotes are based on indicative user inputs. Final project sizing, equipment bill of materials, and financial pricing are strictly subject to physical site inspection and structural shadow analysis.</li>
    <li><strong>Rooftop Structural Integrity:</strong> The Customer is responsible for the structural adequacy of the roof, slab, or shed to bear dead weight and dynamic wind loads (standard structures engineered up to 150 km/h). Any masonry or civil structural reinforcement recommended by Company engineers must be completed prior to module installation.</li>
    <li><strong>Right of Ingress & Egress:</strong> The Customer grants authorized technical personnel of the Company safe and reasonable access to the site premises, rooftop, electrical distribution boards, and incoming service lines during standard working hours.</li>
</ul>

<h3>3. Quotation Pricing, Validity & Payment Milestones</h3>
<ul>
    <li><strong>Validity:</strong> Formal commercial quotations issued by the Company remain valid for <strong>15 calendar days</strong> from the date of generation, owing to rapid fluctuations in crystalline silicon wafer, aluminium structure, and copper cable commodity indices.</li>
    <li><strong>Standard Milestone Payment Schedule:</strong>
        <ol>
            <li><strong>20% Advance Booking:</strong> Payable upon formal acceptance of the quotation to initiate engineering drawings, DISCOM application filing, and equipment allocation.</li>
            <li><strong>60% Material Delivery:</strong> Payable immediately upon site delivery of Tier-1 solar modules, inverter, mounting structures, and balance-of-system electrical supplies.</li>
            <li><strong>20% Commissioning & Handover:</strong> Payable post physical installation, DISCOM bidirectional meter synchronization, and generation testing.</li>
        </ol>
    </li>
    <li><strong>Taxes & Statutory Levies:</strong> Prices quoted are inclusive or exclusive of Goods and Services Tax (GST) as explicitly stated in the formal quotation breakdown (standard 12% solar supply or 70:30 EPC deemed civil supply).</li>
</ul>

<h3>4. Central Government Subsidy (PM Surya Ghar Muft Bijli Yojana)</h3>
<ul>
    <li><strong>Direct Benefit Transfer (DBT):</strong> Under current Ministry of New and Renewable Energy (MNRE) guidelines for residential rooftop solar, government subsidies (up to <strong>₹78,000/-</strong> for 3 kW and above) are disbursed directly into the consumer's Aadhaar-linked bank account through the National Portal for Rooftop Solar.</li>
    <li><strong>Company Role as Facilitator:</strong> The Company assists with end-to-end documentation, vendor portal registration, feasibility submission, work completion reporting, and CEIG inspection liaisoning with MPPKVVCL.</li>
    <li><strong>Disbursal Timeline:</strong> Final subsidy disbursement into the consumer's bank account is subject to central government treasury processing schedules. The Company is not financially liable for delays arising from national portal verification queues or bank account Aadhaar-linking discrepancies.</li>
</ul>

<h3>5. Equipment Warranties & Performance Guarantees</h3>
<ul>
    <li><strong>Solar PV Modules:</strong> Supplied with <strong>10 to 12 years product manufacturing warranty</strong> and <strong>25 to 30 years linear power output performance warranty</strong> (typically guaranteeing ≥ 80% output at year 25) backed directly by Tier-1 OEM manufacturers (ALMM & DCR certified).</li>
    <li><strong>Solar Inverters:</strong> Grid-tied and hybrid inverters carry a <strong>5 to 10 years manufacturer warranty</strong> against internal electronic failure.</li>
    <li><strong>Energy Storage (Batteries):</strong> Tall tubular lead-acid and lithium-ion (LiFePO4) battery packs carry manufacturer replacement warranties as specified in the warranty card.</li>
    <li><strong>Workmanship & Installation Warranty:</strong> The Company provides <strong>1 full year comprehensive workmanship warranty</strong> covering structural mounts, DC/AC cabling integrity, and junction box connections installed by Company technicians.</li>
    <li><strong>Warranty Exclusions:</strong> Warranties do not cover physical damage caused by external debris impacts, civil building collapses, monkey/rodent chewing of cables, customer tampering with inverter settings, or unauthorized third-party electrical modifications.</li>
</ul>

<h3>6. Customer Obligations & Site Preparedness</h3>
<p>To ensure smooth project completion and optimal solar generation, the Customer agrees to:</p>
<ul>
    <li>Provide temporary single-phase 230V electricity supply and clean water at site for drilling, structure erection, and testing.</li>
    <li>Provide permanent, safe ladder or staircase access to the rooftop for routine maintenance and panel cleaning.</li>
    <li>Regularly clean solar panels with clean water (ideally once every 10 to 15 days in dry rural/industrial areas) to prevent soiling losses.</li>
    <li>Trim trees or branches that cast shading over the solar array as trees grow over the system's operational lifespan.</li>
</ul>

<h3>7. DISCOM Liaisoning, Net-Metering & Grid Synchronisation</h3>
<ul>
    <li>Grid-tied and hybrid solar plants operate synchronously with the MPPKVVCL / MPMKVVCL electricity grid. Grid interconnection requires meter testing, safety inspection, and installation of a bidirectional net-meter by the electricity board.</li>
    <li>Energy banking, export tariffs, and monthly bill credits are regulated exclusively by the Madhya Pradesh Electricity Regulatory Commission (MPERC).</li>
    <li>During grid power outages, grid-tied inverters automatically disconnect within milliseconds (anti-islanding protection) to safeguard DISCOM linesmen. Continuous backup during outages requires a hybrid inverter paired with battery storage.</li>
</ul>

<h3>8. Cancellations, Variations & Refunds</h3>
<ul>
    <li><strong>Pre-Procurement:</strong> In the event the Customer cancels an order before equipment procurement or structural fabrication has commenced, the advance booking amount shall be refunded after deducting a nominal administrative and site survey fee of ₹2,500/-.</li>
    <li><strong>Post-Procurement:</strong> Once custom-height elevated HDG structures have been fabricated or solar modules and inverters have been dispatched from distribution hubs, the advance payment is non-refundable.</li>
</ul>

<h3>9. Force Majeure & Limitation of Liability</h3>
<ul>
    <li>Neither party shall be held liable for failure or delay in performance caused by events beyond reasonable control ("Force Majeure"), including extreme cyclones, earthquakes, acts of war, civil disturbances, nationwide grid collapse, or government lockdowns.</li>
    <li>In no event shall the Company's cumulative liability exceed the total contractual fee received from the Customer for the specific project work order.</li>
</ul>

<h3>10. Dispute Resolution & Governing Law</h3>
<p>This Agreement shall be interpreted and governed in accordance with the laws of India. Any controversy, claim, or legal dispute arising out of or relating to this Agreement or the turnkey solar installation shall be subject to the exclusive jurisdiction of the competent courts of law located in <strong>Raisen, Madhya Pradesh, India</strong>.</p>
<p>
    <strong>${name}</strong><br>
    📍 Address: ${address}<br>
    📞 Executive Helpline: <a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a> | <a href="tel:${altPhone.replace(/[^0-9+]/g, '')}">${altPhone}</a><br>
    📧 Email: <a href="mailto:${email}">${email}</a><br>
    🌐 Portal: <a href="${website}" target="_blank">${website}</a>
</p>`;
    }

    /**
     * Get effective Privacy Policy content (custom from DB or personalized default)
     */
    static getPrivacyPolicyContent(company) {
        if (company && company.privacyPolicy && company.privacyPolicy.trim().length > 50) {
            return company.privacyPolicy.trim();
        }
        return this.getDefaultPrivacyPolicy(company);
    }

    /**
     * Get effective Terms & Conditions content (custom from DB or personalized default)
     */
    static getTermsConditionsContent(company) {
        if (company && company.termsAndConditions && company.termsAndConditions.trim().length > 50) {
            return company.termsAndConditions.trim();
        }
        return this.getDefaultTermsConditions(company);
    }
}

module.exports = WebsiteService;
