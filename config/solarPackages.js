/**
 * SHIVAY ENERGY SOLUTIONS — OFFICIAL SOLAR GRID QUOTATION CATALOG & PRICING POLICY
 * Source: Company Rate Card (September 2026 — DCR Subsidy & Non-DCR Commercial TOPCon)
 *
 * Business Governance:
 * 1. All package rates are COMPLETE TURNKEY PACKAGE prices (GST Included).
 * 2. Employees can generate and immediately share quotations without manager approval ONLY when:
 *    - Quoted total >= minimumThresholdPrice (package standard rate up to 3% self-discount), AND
 *    - Discount <= MAX_SELF_DISCOUNT_PERCENT (3%) AND <= MAX_SELF_DISCOUNT_AMOUNT (₹10,000).
 * 3. If discount exceeds 3% or ₹10,000 (or final total < minimumThresholdPrice), quotation saves
 *    as PENDING_APPROVAL and sharing/public client acceptance stay locked until Manager/Super Admin approves.
 * 4. Employees cannot create a quotation below hardFloorPrice (85% of package catalog rate).
 */

const QUOTATION_PRICING_POLICY = Object.freeze({
    CATALOG_VERSION: 'SEP-2026',
    TAX_INCLUDED_IN_PACKAGE: true,
    DEFAULT_INCLUDED_GST_RATE: 12,
    MAX_SELF_DISCOUNT_PERCENT: 3,
    MAX_SELF_DISCOUNT_AMOUNT: 10000,
    MIN_THRESHOLD_FACTOR: 0.97, // Package price minus up to 3% discount
    HARD_FLOOR_FACTOR: 0.85,    // Absolute minimum project floor for employees
    CUSTOM_BENCHMARK_RATE_PER_KW: Object.freeze({
        RESIDENTIAL_DCR: 58000,
        COMMERCIAL_NON_DCR: 52000
    })
});

const SOLAR_PACKAGES = Object.freeze([
    // =========================================================================
    // 1. RESIDENTIAL DCR (PM SURYA GHAR SUBSIDY ELIGIBLE - 3 kW to 3.5 kW)
    // =========================================================================
    {
        id: 'dcr-3kw-waaree',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Waaree',
        moduleWattage: '540W',
        panelQty: 6,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 180000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,998/Month'
    },
    {
        id: 'dcr-3kw-adani',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Adani',
        moduleWattage: '545W',
        panelQty: 6,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 185000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹2,054/Month'
    },
    {
        id: 'dcr-3_5kw-tata',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3.5,
        company: 'Tata Power Solar',
        moduleWattage: '580W',
        panelQty: 6,
        inverterSpecs: 'GoodWe / Similar On-Grid Inverter',
        standardRate: 210000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹2,220/Month'
    },
    {
        id: 'dcr-3kw-kosol',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Kosol',
        moduleWattage: '550W',
        panelQty: 6,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 180000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,998/Month'
    },
    {
        id: 'dcr-3kw-havells',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Havells',
        moduleWattage: '550W',
        panelQty: 6,
        inverterSpecs: 'Havells / Similar On-Grid Inverter',
        standardRate: 185000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹2,054/Month'
    },
    {
        id: 'dcr-3kw-oswal',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Oswal',
        moduleWattage: '550W',
        panelQty: 6,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 175000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,943/Month'
    },
    {
        id: 'dcr-3kw-premier',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Premier Energy',
        moduleWattage: '540W',
        panelQty: 6,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 180000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,998/Month'
    },
    {
        id: 'dcr-3kw-microtek',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Microtek',
        moduleWattage: '540W',
        panelQty: 6,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 185000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹2,054/Month'
    },
    {
        id: 'dcr-3kw-rayzon',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Rayzon Solar',
        moduleWattage: '540W',
        panelQty: 6,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 182000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹2,021/Month'
    },

    // =========================================================================
    // 2. RESIDENTIAL DCR (PM SURYA GHAR SUBSIDY ELIGIBLE - 5 kW to 5.2 kW)
    // =========================================================================
    {
        id: 'dcr-5kw-waaree',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Waaree',
        moduleWattage: '540W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 280000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,434/Month'
    },
    {
        id: 'dcr-5kw-adani',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Adani',
        moduleWattage: '545W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 285000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,496/Month'
    },
    {
        id: 'dcr-5_2kw-tata',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5.2,
        company: 'Tata Power Solar',
        moduleWattage: '580W',
        panelQty: 9,
        inverterSpecs: 'GoodWe / Similar On-Grid Inverter',
        standardRate: 310000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,802/Month'
    },
    {
        id: 'dcr-5kw-kosol',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Kosol',
        moduleWattage: '550W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 280000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,434/Month'
    },
    {
        id: 'dcr-5kw-havells',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Havells',
        moduleWattage: '550W',
        panelQty: 9,
        inverterSpecs: 'Havells / Similar On-Grid Inverter',
        standardRate: 285000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,496/Month'
    },
    {
        id: 'dcr-5kw-oswal',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Oswal',
        moduleWattage: '550W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 275000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,373/Month'
    },
    {
        id: 'dcr-5kw-premier',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Premier Energy',
        moduleWattage: '540W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 280000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,434/Month'
    },
    {
        id: 'dcr-5kw-microtek',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Microtek',
        moduleWattage: '540W',
        panelQty: 9,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 285000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,496/Month'
    },
    {
        id: 'dcr-5kw-rayzon',
        category: 'RESIDENTIAL_DCR',
        categoryLabel: 'Subsidy Eligible (DCR)',
        customerType: 'RESIDENTIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Rayzon Solar',
        moduleWattage: '540W',
        panelQty: 9,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 282000,
        subsidyEligible: true,
        subsidyAmount: 78000,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: '8.25% (as per govt rules)',
        estimatedEmi: '₹3,131/Month'
    },

    // =========================================================================
    // 3. NON-SUBSIDY COMMERCIAL PLANTS (NON-DCR TOPCON - 3 kW)
    // =========================================================================
    {
        id: 'ndcr-3kw-waaree',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Waaree NDCR Topcon',
        moduleWattage: '600W',
        panelQty: 5,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 160000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,776/Month'
    },
    {
        id: 'ndcr-3kw-adani',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Adani NDCR Topcon',
        moduleWattage: '600+W',
        panelQty: 5,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 162000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,799/Month'
    },
    {
        id: 'ndcr-3kw-kosol',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Kosol NDCR Topcon',
        moduleWattage: '620W',
        panelQty: 5,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 155000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,721/Month'
    },
    {
        id: 'ndcr-3kw-havells',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Havells NDCR Topcon',
        moduleWattage: '620W',
        panelQty: 5,
        inverterSpecs: 'Havells / Similar On-Grid Inverter',
        standardRate: 160000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,776/Month'
    },
    {
        id: 'ndcr-3kw-oswal',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Oswal NDCR Topcon',
        moduleWattage: '600W',
        panelQty: 5,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 152000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,688/Month'
    },
    {
        id: 'ndcr-3kw-premier',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Premier NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 5,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 160000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,776/Month'
    },
    {
        id: 'ndcr-3kw-microtek',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Microtek NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 5,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 160000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,776/Month'
    },
    {
        id: 'ndcr-3kw-rayzon',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 3,
        company: 'Rayzon NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 5,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 160000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '12-15 Units/Day',
        monthlyUnits: '300-400 Units',
        financeInterestRate: '5.75% (as per govt rules)',
        estimatedEmi: '₹1,776/Month'
    },

    // =========================================================================
    // 4. NON-SUBSIDY COMMERCIAL PLANTS (NON-DCR TOPCON - 5 kW)
    // =========================================================================
    {
        id: 'ndcr-5kw-waaree',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Waaree NDCR Topcon',
        moduleWattage: '600W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 260000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-adani',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Adani NDCR Topcon',
        moduleWattage: '600+W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 262000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-kosol',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Kosol NDCR Topcon',
        moduleWattage: '620W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 255000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-havells',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Havells NDCR Topcon',
        moduleWattage: '620W',
        panelQty: 9,
        inverterSpecs: 'Havells / Similar On-Grid Inverter',
        standardRate: 260000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-oswal',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Oswal NDCR Topcon',
        moduleWattage: '600W',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 252000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-premier',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Premier NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 9,
        inverterSpecs: 'Polycab / Similar On-Grid Inverter',
        standardRate: 260000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-microtek',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Microtek NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 9,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 260000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    },
    {
        id: 'ndcr-5kw-rayzon',
        category: 'COMMERCIAL_NON_DCR',
        categoryLabel: 'Non-Subsidy Commercial (NDCR Topcon)',
        customerType: 'COMMERCIAL',
        systemType: 'ON_GRID',
        capacityKw: 5,
        company: 'Rayzon NDCR Topcon',
        moduleWattage: '600W+',
        panelQty: 9,
        inverterSpecs: 'Microtek / Polycab / Similar Inverter',
        standardRate: 260000,
        subsidyEligible: false,
        subsidyAmount: 0,
        unitPerDay: '20-25 Units/Day',
        monthlyUnits: '500-600 Units',
        financeInterestRate: 'As per finance bank rules',
        estimatedEmi: 'As per finance bank rules'
    }
]);

const EXTRA_MATERIAL_PRESETS = Object.freeze([
    { description: 'Elevated GI Mounting Structure Upgrade (Per kW / Site)', unit: 'Set', unitPrice: 12000 },
    { description: 'Extra DC Solar Cable 4 sq.mm Copper', unit: 'Mtr', unitPrice: 85 },
    { description: 'Extra AC Armoured / Copper Cable 4 sq.mm', unit: 'Mtr', unitPrice: 110 },
    { description: 'Additional Chemical Earthing Pit & GI Strip', unit: 'Set', unitPrice: 3500 },
    { description: 'HDG Lightning Arrester Mast Extension', unit: 'Nos', unitPrice: 2500 },
    { description: 'Module Cleaning Sprinkler / Piping Kit', unit: 'Set', unitPrice: 4500 }
]);

function getPackageById(packageId) {
    if (!packageId) return null;
    return SOLAR_PACKAGES.find(p => p.id === packageId) || null;
}

/**
 * Evaluate package pricing (plus optional extra materials), tax-included statutory split,
 * minimum price floor, and approval routing.
 */
function evaluatePackagePricing(params = {}) {
    const pkg = getPackageById(params.packageId);
    const category = pkg
        ? pkg.category
        : (params.packageCategory === 'COMMERCIAL_NON_DCR' ? 'COMMERCIAL_NON_DCR' : 'RESIDENTIAL_DCR');
    const isCommercialNonDcr = category === 'COMMERCIAL_NON_DCR';
    const capacityKw = Math.max(1, Number(pkg ? pkg.capacityKw : params.plantCapacityKw) || 3);

    const benchmarkPerKw = QUOTATION_PRICING_POLICY.CUSTOM_BENCHMARK_RATE_PER_KW[category];
    const catalogPrice = pkg ? pkg.standardRate : Math.round(capacityKw * benchmarkPerKw);

    // Base quoted package rate can be standard catalog price or higher custom scope price
    const rawQuotedBase = Number(params.packagePrice);
    const packageBasePrice = (Number.isFinite(rawQuotedBase) && rawQuotedBase > 0)
        ? Math.max(catalogPrice, Math.round(rawQuotedBase))
        : catalogPrice;

    // Sanitize optional Extra Materials (tax-inclusive line items)
    const rawExtras = Array.isArray(params.extraMaterials) ? params.extraMaterials : [];
    const gstRate = QUOTATION_PRICING_POLICY.DEFAULT_INCLUDED_GST_RATE;
    const sanitizedExtras = [];
    let extraMaterialsTotal = 0;

    rawExtras.forEach((item) => {
        if (!item) return;
        const desc = typeof item.description === 'string' ? item.description.trim() : '';
        if (!desc) return;
        const qty = Math.max(0.1, Number(item.quantity) || 1);
        const unit = (typeof item.unit === 'string' && item.unit.trim()) ? item.unit.trim() : 'Nos';
        const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
        const amount = Math.round(qty * unitPrice);
        extraMaterialsTotal += amount;
        sanitizedExtras.push({
            description: desc,
            sku: 'SES-EXTRA-MAT',
            quantity: qty,
            unit,
            unitPrice,
            discount: 0,
            gstRate
        });
    });

    const quotedBasePrice = packageBasePrice + extraMaterialsTotal;
    const minimumThresholdPrice = Math.round(catalogPrice * QUOTATION_PRICING_POLICY.MIN_THRESHOLD_FACTOR) + extraMaterialsTotal;
    const hardFloorPrice = Math.round(catalogPrice * QUOTATION_PRICING_POLICY.HARD_FLOOR_FACTOR) + extraMaterialsTotal;

    // Discount computation: discountPercent OR explicit discountAmount
    let discountPercent = Math.max(0, Number(params.discountPercent) || 0);
    let discountAmount = Math.max(0, Number(params.discountAmount) || 0);

    if (discountAmount > 0 && !(Number(params.discountPercent) > 0)) {
        discountPercent = quotedBasePrice > 0
            ? Number(((discountAmount / quotedBasePrice) * 100).toFixed(2))
            : 0;
    } else if (discountPercent > 0) {
        discountAmount = Math.round((quotedBasePrice * discountPercent) / 100);
        discountPercent = Number(discountPercent.toFixed(2));
    }

    const finalPackageTotal = Math.max(0, Math.round(quotedBasePrice - discountAmount));

    const maxAllowedSelfDiscount = Math.min(
        Math.round((quotedBasePrice * QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_PERCENT) / 100),
        QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_AMOUNT
    );

    const meetsHardFloor = finalPackageTotal >= hardFloorPrice;
    const meetsMinimumThreshold = finalPackageTotal >= minimumThresholdPrice;
    const withinDiscountPercent = discountPercent <= QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_PERCENT + 0.01;
    const withinDiscountAmount = discountAmount <= QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_AMOUNT;
    const withinDiscountCap = withinDiscountPercent && withinDiscountAmount;

    const requiresManagerApproval = !(meetsMinimumThreshold && withinDiscountCap);

    let approvalTriggerReason = 'Meets minimum project price threshold and self-discount policy (<= 3% & <= ₹10,000). Auto-approved for immediate sharing.';
    if (!meetsHardFloor) {
        approvalTriggerReason = `Quoted total ₹${finalPackageTotal.toLocaleString('en-IN')} is below the minimum allowed project floor ₹${hardFloorPrice.toLocaleString('en-IN')}.`;
    } else if (!withinDiscountAmount) {
        approvalTriggerReason = `Discount ₹${discountAmount.toLocaleString('en-IN')} exceeds employee self-approval limit of ₹${QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_AMOUNT.toLocaleString('en-IN')}. Manager approval required.`;
    } else if (!withinDiscountPercent) {
        approvalTriggerReason = `Discount ${discountPercent}% exceeds employee self-approval limit of ${QUOTATION_PRICING_POLICY.MAX_SELF_DISCOUNT_PERCENT}%. Manager approval required.`;
    } else if (!meetsMinimumThreshold) {
        approvalTriggerReason = `Quoted price ₹${finalPackageTotal.toLocaleString('en-IN')} is below the auto-approval threshold ₹${minimumThresholdPrice.toLocaleString('en-IN')}. Manager approval required.`;
    }

    const customerState = params.state || 'Madhya Pradesh';
    const isIntraState = !customerState || customerState.toLowerCase().includes('madhya pradesh');
    const taxableValue = Number((finalPackageTotal / (1 + gstRate / 100)).toFixed(2));
    const totalGstAmount = Number((finalPackageTotal - taxableValue).toFixed(2));
    const cgstAmount = isIntraState ? Number((totalGstAmount / 2).toFixed(2)) : 0;
    const sgstAmount = isIntraState ? Number((totalGstAmount - cgstAmount).toFixed(2)) : 0;
    const igstAmount = isIntraState ? 0 : totalGstAmount;

    const subsidyAmount = pkg
        ? pkg.subsidyAmount
        : (isCommercialNonDcr ? 0 : (capacityKw < 1.5 ? 30000 : (capacityKw < 2.5 ? 60000 : 78000)));
    const netPayableAfterSubsidy = Math.max(0, Number((finalPackageTotal - subsidyAmount).toFixed(2)));

    const companyBrand = pkg ? pkg.company : (params.companyBrand || 'Waaree / Tier-1 MNRE Approved');
    const moduleWattage = pkg ? pkg.moduleWattage : (params.moduleWattage || (isCommercialNonDcr ? '600W TOPCon' : '540W Mono PERC'));
    const panelQty = pkg ? pkg.panelQty : Math.max(1, Math.ceil((capacityKw * 1000) / (isCommercialNonDcr ? 600 : 540)));
    const inverterSpecs = pkg ? pkg.inverterSpecs : (params.inverterSpecs || 'Polycab / GoodWe / Similar Dual MPPT On-Grid Inverter');
    const unitPerDay = pkg ? pkg.unitPerDay : `${Math.round(capacityKw * 4)}-${Math.round(capacityKw * 5)} Units/Day`;
    const monthlyUnits = pkg ? pkg.monthlyUnits : `${Math.round(capacityKw * 100)}-${Math.round(capacityKw * 125)} Units`;
    const financeInterestRate = pkg ? pkg.financeInterestRate : (capacityKw <= 3.5 ? '5.75% (as per govt rules)' : 'As per finance bank rules');
    const estimatedEmi = pkg ? pkg.estimatedEmi : 'As per bank financing terms';

    const packageDescription = `${capacityKw} kW Complete Turnkey Solar Grid Package (${companyBrand} ${moduleWattage} x ${panelQty} Panels + ${inverterSpecs}, HDG Structure, ACDB/DCDB, Earthing, LA, Installation & Net Metering — GST Included)`;

    const lineItems = [
        {
            description: packageDescription,
            sku: pkg ? pkg.id.toUpperCase() : `SES-CUSTOM-${capacityKw}KW`,
            quantity: 1,
            unit: 'Package',
            unitPrice: packageBasePrice,
            discount: 0,
            gstRate
        },
        ...sanitizedExtras
    ];

    return {
        pkg,
        packageId: pkg ? pkg.id : null,
        packageCategory: category,
        customerType: pkg ? pkg.customerType : (isCommercialNonDcr ? 'COMMERCIAL' : 'RESIDENTIAL'),
        systemType: pkg ? pkg.systemType : (params.systemType || 'ON_GRID'),
        capacityKw,
        companyBrand,
        moduleWattage,
        panelQty,
        inverterSpecs,
        unitPerDay,
        monthlyUnits,
        financeInterestRate,
        estimatedEmi,
        pricingMode: 'TAX_INCLUSIVE',
        catalogPrice,
        packageBasePrice,
        extraMaterials: sanitizedExtras,
        extraMaterialsTotal,
        quotedBasePrice,
        minimumThresholdPrice,
        hardFloorPrice,
        maxAllowedSelfDiscount,
        discountPercent,
        discountAmount,
        grossTotal: quotedBasePrice,
        grandTotal: finalPackageTotal,
        taxableValue,
        gstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalGstAmount,
        estimatedSubsidy: subsidyAmount,
        netPayableAfterSubsidy,
        meetsHardFloor,
        meetsMinimumThreshold,
        withinDiscountCap,
        requiresManagerApproval,
        approvalMode: requiresManagerApproval ? 'MANAGER_REQUIRED' : 'AUTO_THRESHOLD',
        approvalTriggerReason,
        lineItems
    };
}

module.exports = {
    QUOTATION_PRICING_POLICY,
    SOLAR_PACKAGES,
    EXTRA_MATERIAL_PRESETS,
    getPackageById,
    evaluatePackagePricing
};
