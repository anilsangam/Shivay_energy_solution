/**
 * SHIVAY ENERGY SOLUTIONS - Centralized Business Configuration
 * Indian Market Localization & Company Master Data
 */

module.exports = {
    company: {
        name: "SHIVAY ENERGY SOLUTIONS",
        shortName: "Shivay Energy",
        tagline: "Save Green Energy To Build A Better Future",
        establishedYear: 2021,
        gstin: "23AXXXX0000X1Z5", // Indian GST state code 23 for Madhya Pradesh
        email: "shivayenergysolutions@gmail.com",
        website: "https://shivayenergysolutions.com",
        address: {
            line1: "Ward No. 15, In front of PHE Office, Arjun Nagar",
            city: "Raisen",
            district: "Raisen",
            state: "Madhya Pradesh",
            pincode: "464551",
            country: "India",
            full: "Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen, Madhya Pradesh – 464551, India."
        },
        contacts: [
            {
                name: "Deepak Kushwaha",
                designation: "Managing Director & Technical Head",
                mobile: "+91 70005 75496",
                rawMobile: "917000575496",
                whatsapp: "https://wa.me/917000575496?text=Namaste%20Deepak%20ji,%20I%20am%20interested%20in%20solar%20rooftop%20installation%20from%20Shivay%20Energy%20Solutions."
            },
            {
                name: "Rahul Saini",
                designation: "Operations & Customer Support Head",
                mobile: "+91 93997 61750",
                rawMobile: "919399761750",
                whatsapp: "https://wa.me/919399761750?text=Namaste%20Rahul%20ji,%20I%20want%20to%20get%20a%20solar%20quote%20from%20Shivay%20Energy%20Solutions."
            }
        ],
        workingHours: {
            days: "Monday - Saturday",
            time: "09:00 AM - 07:00 PM (IST)",
            emergency: "24/7 Breakdown & Support Available"
        },
        social: {
            whatsapp: "https://wa.me/917000575496",
            facebook: "https://facebook.com/shivayenergysolutions",
            instagram: "https://instagram.com/shivayenergysolutions",
            youtube: "https://youtube.com/@shivayenergysolutions"
        }
    },

    // Indian Solar Government Schemes (PM Surya Ghar: Muft Bijli Yojana)
    schemes: {
        pmSuryaGhar: {
            title: "PM Surya Ghar: Muft Bijli Yojana",
            subtitle: "Government of India Rooftop Solar Subsidy Scheme",
            portalUrl: "https://pmsuryaghar.gov.in/",
            description: "Under the PM Surya Ghar Muft Bijli Yojana initiated by the Ministry of New and Renewable Energy (MNRE), residential households can get direct DBT subsidy of up to ₹78,000 for installing solar panels on their rooftop.",
            subsidySlabs: [
                {
                    capacity: "1 kW System",
                    subsidy: "₹30,000",
                    suitableFor: "Small Homes (1-2 BHK), Monthly units < 150",
                    estCost: "₹55,000 - ₹65,000",
                    netCost: "₹25,000 - ₹35,000"
                },
                {
                    capacity: "2 kW System",
                    subsidy: "₹60,000",
                    suitableFor: "Medium Homes (2-3 BHK), Monthly units 150-300",
                    estCost: "₹1,10,000 - ₹1,25,000",
                    netCost: "₹50,000 - ₹65,000"
                },
                {
                    capacity: "3 kW & Above",
                    subsidy: "₹78,000 (Maximum)",
                    suitableFor: "Large Homes / Villas, Monthly units 300+",
                    estCost: "₹1,65,000 - ₹1,85,000",
                    netCost: "₹87,000 - ₹1,07,000"
                }
            ],
            eligibility: [
                "Must be an Indian citizen with a valid residential electricity connection (DISCOM / MPPKVVCL).",
                "Must have shadow-free rooftop space owned by the applicant (approx. 100 sq ft per kW).",
                "Solar modules and inverters must be DCR compliant (Domestic Content Requirement) from approved manufacturers.",
                "Subsidy is credited directly to customer's Aadhaar-linked bank account through DBT (Direct Benefit Transfer)."
            ],
            requiredDocuments: [
                "Latest Electricity Bill (with consumer number / IVRS)",
                "Aadhaar Card of the electricity consumer",
                "Rooftop ownership proof / property tax receipt",
                "Bank Account Passbook / Cancelled Cheque (Aadhaar linked)",
                "Passport size photograph"
            ],
            applicationSteps: [
                { step: 1, title: "Registration", desc: "Register on pmsuryaghar.gov.in selecting MP State and your DISCOM (e.g. MPMKVVCL / MPPKVVCL)." },
                { step: 2, title: "Feasibility Approval", desc: "Submit application and obtain technical feasibility approval from your DISCOM." },
                { step: 3, title: "Installation by Shivay Energy", desc: "Certified installation of DCR compliant solar panels and inverters by Shivay Energy Solutions." },
                { step: 4, title: "Net Meter & Inspection", desc: "DISCOM inspection and bidirectional net meter installation." },
                { step: 5, title: "Direct Subsidy Credit", desc: "Submit commissioning report and receive up to ₹78,000 subsidy directly in your bank account." }
            ],
            disclaimer: "Note: Subsidy amounts, DISCOM rules, and guidelines are subject to MNRE Government of India updates. Shivay Energy Solutions assists you with 100% paperwork, DISCOM liaisoning, and net-metering approvals."
        }
    },

    // Localized Indian Products
    products: [
        {
            id: "on-grid-inverter",
            name: "On-Grid Solar Inverter",
            image: "/images/services/3.webp",
            category: "Inverters",
            capacityRange: "1 kW - 100 kW",
            efficiency: "Up to 98.6%",
            warranty: "5 to 10 Years Manufacturer Warranty",
            description: "High-efficiency grid-tied inverters with built-in dual MPPT trackers and Wi-Fi smart monitoring. Seamlessly export surplus electricity to MP DISCOM grid via bidirectional net meter to zero out your electricity bill.",
            features: ["MNRE & BIS Certified", "Dual MPPT Support", "IP65 Weatherproof", "Real-time Mobile App Monitoring", "Export Limiting Support"],
            bestFor: "Homes, Offices & Factories with reliable grid supply wanting to reduce power bills to zero.",
            startingPrice: "₹24,500"
        },
        {
            id: "hybrid-inverter",
            name: "Hybrid Solar Inverter",
            image: "/images/services/3.webp",
            category: "Inverters",
            capacityRange: "3 kW - 15 kW",
            efficiency: "Up to 97.8%",
            warranty: "5 Years Comprehensive Warranty",
            description: "Combines the benefits of on-grid solar and battery backup in one unit. Powers your home during power cuts and feeds excess energy back to the grid when batteries are fully charged.",
            features: ["Lithium & Lead-Acid Battery Compatible", "Instant Power Backup (< 10ms UPS switch)", "Smart Load Sharing", "Zero-Export Grid Compliance"],
            bestFor: "Areas with occasional load-shedding wanting both 24/7 battery backup and net-metering savings.",
            startingPrice: "₹48,000"
        },
        {
            id: "off-grid-inverter",
            name: "Off-Grid Solar Inverter",
            image: "/images/services/3.webp",
            category: "Inverters",
            capacityRange: "1 kVA - 10 kVA",
            efficiency: "Up to 94%",
            warranty: "2 to 5 Years Warranty",
            description: "Independent solar inverters engineered for locations with zero or highly unstable grid power. Directly converts solar power to run home appliances and stores energy into heavy-duty batteries.",
            features: ["Pure Sine Wave Output", "High Surge Capability for Motors & Pumps", "Auto Generator Start", "LCD Display"],
            bestFor: "Farmhouses, Agricultural tube-wells, Rural homes, and Remote commercial setups.",
            startingPrice: "₹18,500"
        },
        {
            id: "mono-perc-panels",
            name: "Mono PERC Half-Cut Solar Panels (540W - 580W)",
            image: "/images/slider/4.webp",
            category: "Solar Panels",
            capacityRange: "540 Watt - 580 Watt per Panel",
            efficiency: "21.5% - 22.8%",
            warranty: "12 Years Product Warranty | 25-30 Years Linear Performance Warranty",
            description: "Tier-1 Mono crystalline PERC half-cut modules with multi-busbar technology. Outstanding low-light performance during cloudy Madhya Pradesh monsoon and peak summer days.",
            features: ["ALMM Listed & DCR Available (Eligible for PM Surya Ghar Subsidy)", "Anti-Reflective Hydrophobic Glass", "Withstands 5400 Pa Snow & 2400 Pa Wind Loads"],
            bestFor: "Residential rooftops with limited space needing maximum power output per square foot.",
            startingPrice: "₹21/Watt"
        },
        {
            id: "solar-batteries",
            name: "Solar Lithium-ion (LiFePO4) & Tall Tubular Batteries",
            image: "/images/services/4.webp",
            category: "Energy Storage",
            capacityRange: "100Ah - 200Ah / 48V Lithium Packs (5kWh - 15kWh)",
            efficiency: "95% (Lithium) / 85% (Tubular)",
            warranty: "5 Years Replacement Warranty (Lithium: 6000+ Cycles)",
            description: "Maintenance-free Lithium Iron Phosphate (LiFePO4) solar wall batteries and heavy-duty C10 rated tall tubular lead-acid solar batteries designed for Indian tropical heat conditions.",
            features: ["Deep 90% Depth of Discharge (DoD)", "Quick 2-Hour Fast Charging", "High Temperature Resistance", "Smart Battery Management System (BMS)"],
            bestFor: "Uninterrupted 24/7 power backup for lights, fans, computers, refrigerators, and coolers.",
            startingPrice: "₹14,500 (Tubular) / ₹65,000 (Lithium Wall Pack)"
        },
        {
            id: "solar-accessories",
            name: "Solar Balance of System (BOS) & Accessories",
            image: "/images/services/6.webp",
            category: "Accessories",
            capacityRange: "Customized for all project sizes",
            efficiency: "Industry Standard Protection",
            warranty: "1 to 5 Years Warranty",
            description: "High-grade Hot-Dip Galvanized (HDG) or Aluminium rooftop mounting structures, DCDB & ACDB distribution boxes with Type-2 SPDs, UV-resistant dual-core DC solar cables, and copper earthing kits with lightning arresters.",
            features: ["Wind Speed Certified up to 150 km/h", "IP65 Weatherproof Enclosures", "Surge Protection Devices (SPD)", "Chemical Earthing Electrodes"],
            bestFor: "Safeguarding your complete solar investment against lightning, surges, and harsh weather.",
            startingPrice: "Package based"
        },
        {
            id: "home-ev-charger",
            name: "Home EV AC Charger",
            image: "/images/services/5.webp",
            category: "EV Chargers",
            capacityRange: "3.3 kW - 7.4 kW",
            efficiency: "Smart AC charging",
            warranty: "Manufacturer warranty varies by model",
            description: "Compact AC charging equipment for compatible electric cars at homes and small workplaces.",
            features: ["Wall-mounted options", "Site and load assessment", "Safety protection features"],
            bestFor: "Home parking and private charging points.",
            startingPrice: "Ask for a quote"
        },
        {
            id: "commercial-ev-charger",
            name: "Workplace & Commercial EV Charger",
            image: "/images/services/6.webp",
            category: "EV Chargers",
            capacityRange: "7.4 kW - 22 kW AC",
            efficiency: "Smart AC charging",
            warranty: "Manufacturer warranty varies by model",
            description: "AC charging options for offices, shops, housing societies, and customer parking areas.",
            features: ["Single or three-phase options", "Installation support", "Electrical safety checks"],
            bestFor: "Workplaces and commercial parking.",
            startingPrice: "Ask for a quote"
        }
    ],

    // Localized Indian Solar Services
    services: [
        {
            id: "residential-solar",
            title: "Residential Rooftop Solar Installation",
            icon: "icofont-home",
            image: "images/services/1.webp",
            shortDesc: "Complete turnkey rooftop solar solutions for bungalows, apartments, and independent houses with PM Surya Ghar subsidy support.",
            highlights: ["Up to ₹78,000 Direct Govt Subsidy", "Zero Electricity Bills", "Custom 3D Shadow Analysis", "25 Years Performance Warranty"],
            details: "Turn your rooftop into an income-generating clean energy plant. Shivay Energy Solutions handles everything from site survey, shadow analysis, structure fabrication, DCR module mounting, inverter commissioning to DISCOM net-metering approvals."
        },
        {
            id: "commercial-industrial",
            title: "Commercial & Industrial (C&I) Solar Systems",
            icon: "icofont-building-alt",
            image: "images/services/2.webp",
            shortDesc: "High-capacity on-grid solar plants for factories, cold storages, hospitals, petrol pumps, schools, and commercial establishments.",
            highlights: ["Accelerated Depreciation (40% Tax Benefit)", "Drastic Operational Cost Reduction", "CAPEX & OPEX Business Models", "Rapid 3-Year ROI Payback"],
            details: "Commercial and industrial tariffs in Madhya Pradesh exceed ₹8 - ₹10 per unit. Solar energy reduces your operational overheads to less than ₹2.5 per unit, giving your business an immediate competitive edge."
        },
        {
            id: "maintenance-amc",
            title: "Solar System AMC & Maintenance Services",
            icon: "icofont-tools-alt-2",
            image: "images/services/3.webp",
            shortDesc: "Comprehensive Operations & Maintenance (O&M) contracts, panel deep cleaning, inverter diagnostics, and earthing health audits.",
            highlights: ["Scheduled High-Pressure Dust Cleaning", "Inverter Health & String Diagnostics", "Prompt Breakdown Resolution (< 24 Hours)", "Generation Enhancement Audits"],
            details: "Dust and bird droppings on solar panels reduce generation by up to 25%. Our specialized O&M team in Raisen and Bhopal ensures maximum yield, routine preventive check-ups, and uninterrupted generation year-round."
        },
        {
            id: "agricultural-solar",
            title: "Agricultural Solar Water Pumps (PM-KUSUM)",
            icon: "icofont-water",
            image: "images/services/4.webp",
            shortDesc: "Solar pump installations for agricultural tube-wells, borewells, and rural farms under subsidized PM-KUSUM guidelines.",
            highlights: ["Eliminate Diesel Generator Expenses", "Daytime Reliable Irrigation for Crops", "Submersible & Surface DC/AC Pumps", "Rugged High-Torque Performance"],
            details: "Reliable, free irrigation powered by sunlight. No more waiting for nighttime rural electricity rosters to water your wheat, gram, and soybean fields."
        },
        {
            id: "consultation-netmetering",
            title: "Solar Consultation & Net-Metering Liaisoning",
            icon: "icofont-certificate-alt-1",
            image: "images/services/5.webp",
            shortDesc: "End-to-end liaisoning with MPPKVVCL / MPMKVVCL electricity boards for net-meter sanctions, CEIG safety approvals, and load upgrades.",
            highlights: ["Complete DISCOM Paperwork Handling", "Feasibility Study & Sanction Letters", "Bi-Directional Meter Installation", "100% Hassle-Free Approvals"],
            details: "Navigating DISCOM approvals can be frustrating. Our local liaisoning team in Raisen and MP takes care of every document, site inspection, and meter replacement seamlessly."
        },
        {
            id: "battery-storage-solutions",
            title: "Energy Storage & Battery Upgrades",
            icon: "icofont-battery-full",
            image: "images/services/6.webp",
            shortDesc: "Retrofit battery storage systems to existing on-grid plants or design off-grid backup systems for critical commercial loads.",
            highlights: ["Lithium Iron Phosphate (LiFePO4) Packs", "Smart Micro-Grid Configuration", "Uninterrupted Power for Critical Machinery", "Zero Diesel Dependency"],
            details: "Ensure zero downtime during power cuts with modular lithium battery banks capable of high surge currents for air conditioners, machinery, and lighting loads."
        },
        {
            id: "ev-charging-installation",
            title: "EV Charging Station Installation",
            icon: "icofont-electricity",
            image: "images/services/5.webp",
            shortDesc: "EV charger supply, site assessment, electrical work, installation, and commissioning for homes and businesses.",
            highlights: ["Home & workplace chargers", "Load and safety assessment", "Installation & commissioning"],
            details: "Set up a safe, convenient EV charging point with charger selection, electrical preparation, installation, and commissioning."
        },
        {
            id: "ev-charger-service",
            title: "EV Charger Service & Maintenance",
            icon: "icofont-tools-alt-2",
            image: "images/services/6.webp",
            shortDesc: "Inspection, troubleshooting, and routine maintenance for residential and commercial EV charging points.",
            highlights: ["Charger diagnostics", "Electrical safety checks", "Repair & preventive maintenance"],
            details: "Keep EV charging equipment reliable with fault checks, electrical safety inspections, and scheduled maintenance."
        }
    ],

    // Indian Solar Calculator Configuration
    calculator: {
        avgTariffPerUnit: 7.5, // Indian residential average tariff ₹7.50 / unit
        unitsPerKwPerMonth: 120, // Approx 4 units/kW/day * 30 days = 120 units/month in MP
        sqFtPerKw: 100, // Approx 100 sq ft shadow-free area per 1 kW
        costPerKwApprox: 58000, // Average cost in ₹ per kW before subsidy
        co2SavedPerKwYearKg: 1300, // ~1.3 tonnes CO2 offset per kW annually
        disclaimer: "Calculations are indicative estimates based on typical Central Indian solar irradiance (Madhya Pradesh). Actual savings and generation depend on rooftop orientation, shade, equipment efficiency, and applicable DISCOM tariff slabs."
    },

    // Completed Projects in Madhya Pradesh (Shivay Energy Installations)
    projects: [
        {
            id: "proj-1",
            title: "3 kW Residential Rooftop Solar",
            category: "Residential Solar",
            location: "Arjun Nagar, Raisen (M.P.)",
            capacity: "3 kW",
            type: "Residential On-Grid",
            year: "2024",
            image: "/images/projects/1.webp",
            panels: "6x 540W Mono PERC Half-Cut",
            inverter: "3 kW Dual MPPT On-Grid",
            impact: "Installed under PM Surya Ghar. Bill reduced from ₹3,200 to ₹0.",
            description: "Full turnkey rooftop installation for a residential home in Arjun Nagar, Raisen. Secured ₹78,000 direct DBT subsidy with expedited DISCOM net-metering approvals from MPMKVVCL."
        },
        {
            id: "proj-2",
            title: "25 kW Industrial Rooftop Solar",
            category: "Commercial & Industrial",
            location: "Mandideep Industrial Area, Bhopal",
            capacity: "25 kW",
            type: "Commercial C&I",
            year: "2023",
            image: "/images/projects/2.webp",
            panels: "46x 550W Tier-1 DCR Panels",
            inverter: "25 kW High-Efficiency Grid-Tied",
            impact: "Saves over ₹3.5 Lakhs annually for manufacturing unit.",
            description: "High-capacity on-grid solar plant engineered for an engineering fabrication facility in Mandideep. Powers daytime machine operations and provides 40% accelerated depreciation tax benefits."
        },
        {
            id: "proj-3",
            title: "5 HP Solar Water Pumping System",
            category: "Agricultural Solar",
            location: "Gairatganj, Raisen (M.P.)",
            capacity: "5 HP",
            type: "PM-KUSUM Agri",
            year: "2023",
            image: "/images/projects/3.webp",
            panels: "10x 500W High-Torque Solar Modules",
            inverter: "5 HP VFD Solar Pump Controller",
            impact: "Zero diesel costs for 12-acre farm irrigation.",
            description: "Reliable daytime irrigation for 12 acres of wheat and gram cultivation. Replaced costly diesel genset operation with zero-running-cost solar water discharge of 1.5 Lakh litres per day."
        },
        {
            id: "proj-4",
            title: "5 kW Hybrid System with Lithium Storage",
            category: "Hybrid & Storage",
            location: "Sanchi Road, Vidisha (M.P.)",
            capacity: "5 kW",
            type: "Hybrid Lithium",
            year: "2024",
            image: "/images/projects/4.webp",
            panels: "9x 545W Mono PERC Panels",
            inverter: "5 kW Hybrid with 5 kWh LiFePO4 Battery",
            impact: "24x7 uninterrupted power backup during grid outages.",
            description: "High-reliability hybrid solar inverter paired with maintenance-free 48V Lithium Iron Phosphate wall battery. Ensures seamless power for medical clinic equipment and household appliances."
        },
        {
            id: "proj-5",
            title: "10 kW Institutional Rooftop Plant",
            category: "Institutional Solar",
            location: "Hoshangabad Road, Bhopal",
            capacity: "10 kW",
            type: "Institutional",
            year: "2023",
            image: "/images/projects/5.webp",
            panels: "18x 550W Bifacial Solar Panels",
            inverter: "10 kW Three-Phase Inverter",
            impact: "Powers school campus computers and lighting.",
            description: "Educational campus rooftop installation generating ~1,200 units of clean electricity every month, drastically lowering institutional utility overheads and inspiring students about clean energy."
        },
        {
            id: "proj-6",
            title: "2 kW Residential Rooftop System",
            category: "Residential Solar",
            location: "Ward No. 15, Raisen (M.P.)",
            capacity: "2 kW",
            type: "Residential Rooftop",
            year: "2024",
            image: "/images/projects/6.webp",
            panels: "4x 540W Mono PERC Panels",
            inverter: "2 kW Single-Phase On-Grid",
            impact: "Received ₹60,000 PM Surya Ghar DBT subsidy.",
            description: "Compact rooftop installation delivering 240 units per month for a middle-class family. Full DISCOM paperwork, meter testing, and subsidy commissioning completed in under 21 days."
        },
        {
            id: "proj-7",
            title: "50 kW Commercial Net-Metered Plant",
            category: "Commercial & Industrial",
            location: "Raisen Bypass, Madhya Pradesh",
            capacity: "50 kW",
            type: "Commercial C&I",
            year: "2024",
            image: "/images/services/2.webp",
            panels: "92x 550W Tier-1 DCR Modules",
            inverter: "50 kW Quad-MPPT Synchronized Inverter",
            impact: "Saves ₹6.8 Lakhs annually for cold storage facility.",
            description: "Large-scale commercial rooftop solar plant installed on cold storage warehouse. Engineered with heavy-duty HDG mounting structure capable of withstanding 150 km/h wind speeds."
        },
        {
            id: "proj-8",
            title: "3.3 kW Mono PERC Solar Villa",
            category: "Residential Solar",
            location: "Bhopal Lakeview, Madhya Pradesh",
            capacity: "3.3 kW",
            type: "Residential Rooftop",
            year: "2024",
            image: "/images/slider/4.webp",
            panels: "6x 550W All-Black Mono PERC Panels",
            inverter: "3.3 kW Smart Wi-Fi On-Grid Inverter",
            impact: "Zero monthly bill with real-time smartphone monitoring.",
            description: "Architectural rooftop solar solution with elevated structure providing usable covered terrace space while generating clean green solar energy under PM Surya Ghar Yojana."
        },
                {
            id: "proj-9",
            title: "2 kW Residential Rooftop System",
            category: "Residential Solar",
            location: "Ward No. 15, Raisen (M.P.)",
            capacity: "2 kW",
            type: "Residential Rooftop",
            year: "2024",
            image: "/images/projects/6.webp",
            panels: "4x 540W Mono PERC Panels",
            inverter: "2 kW Single-Phase On-Grid",
            impact: "Received ₹60,000 PM Surya Ghar DBT subsidy.",
            description: "Compact rooftop installation delivering 240 units per month for a middle-class family. Full DISCOM paperwork, meter testing, and subsidy commissioning completed in under 21 days."
        },
        {
            id: "proj-10",
            title: "50 kW Commercial Net-Metered Plant",
            category: "Commercial & Industrial",
            location: "Raisen Bypass, Madhya Pradesh",
            capacity: "50 kW",
            type: "Commercial C&I",
            year: "2024",
            image: "/images/services/2.webp",
            panels: "92x 550W Tier-1 DCR Modules",
            inverter: "50 kW Quad-MPPT Synchronized Inverter",
            impact: "Saves ₹6.8 Lakhs annually for cold storage facility.",
            description: "Large-scale commercial rooftop solar plant installed on cold storage warehouse. Engineered with heavy-duty HDG mounting structure capable of withstanding 150 km/h wind speeds."
        },
        {
            id: "proj-11",
            title: "3.3 kW Mono PERC Solar Villa",
            category: "Residential Solar",
            location: "Bhopal Lakeview, Madhya Pradesh",
            capacity: "3.3 kW",
            type: "Residential Rooftop",
            year: "2024",
            image: "/images/slider/4.webp",
            panels: "6x 550W All-Black Mono PERC Panels",
            inverter: "3.3 kW Smart Wi-Fi On-Grid Inverter",
            impact: "Zero monthly bill with real-time smartphone monitoring.",
            description: "Architectural rooftop solar solution with elevated structure providing usable covered terrace space while generating clean green solar energy under PM Surya Ghar Yojana."
        }
    ],

    // Indian Customer Reviews / Testimonials
    testimonials: [
        {
            name: "Ramswaroop Sharma",
            location: "Arjun Nagar, Raisen (M.P.)",
            system: "3 kW Residential On-Grid System",
            rating: 5,
            review: "Shivay Energy Solutions ne mere ghar par 3 kW ka solar plant lagwaya. PM Surya Ghar yojana ki ₹78,000 ki subsidy direct mere bank account me aa gayi. Bijli ka bill jo pehle ₹3,200 aata tha ab zero ho gaya hai! Deepak ji aur unki team ka support bahut shandar hai."
        },
        {
            name: "Mahesh Patel",
            location: "Industrial Area, Mandideep, Bhopal",
            system: "25 kW Commercial Rooftop Solar",
            rating: 5,
            review: "Hamari manufacturing unit ka bijli kharcha mahine ka ₹45,000 tha. Rahul Saini ji ne complete plant design kiya aur MP electricity board se net-meter approval karwaya. Plant se hamara 70% bill kam ho gaya hai. Very professional team in Raisen district."
        },
        {
            name: "Advocate Rajesh Tiwari",
            location: "Vidisha Road, Raisen",
            system: "5 kW Hybrid Solar Plant with Lithium Battery",
            rating: 5,
            review: "Light jane par inverter ka koi jhanjhat nahi. Pure din solar se AC chalta hai aur extra bijli grid me export ho jati hai. Shivay Energy Solutions ne quality material aur genuine DCR panels use kiye hain. 100% recommended for everyone in Madhya Pradesh!"
        },
        {
            name: "Vikram Rajput",
            location: "Gairatganj, Raisen District",
            system: "5 HP Solar Water Pump for Farm",
            rating: 5,
            review: "Kheti ke liye diesel pump ka kharcha bahut tha. Shivay Energy ki team ne 5 HP ka solar pump install kiya. Din bhar bina kisi kharche ke paani milta hai. Deepak Kushwaha ji ne documentation aur subsidy process me poori madad ki."
        }
    ],

    // Indian States & MP Districts for Forms
    regions: {
        states: [
            "Madhya Pradesh", "Uttar Pradesh", "Rajasthan", "Maharashtra", "Gujarat", "Chhattisgarh", "Delhi NCR", "Haryana", "Punjab", "Bihar"
        ],
        mpDistricts: [
            "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur",
            "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda",
            "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Maihar", "Mandla", "Mandsaur", "Mauganj",
            "Morena", "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Ratlam",
            "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi",
            "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"
        ]
    }
};
