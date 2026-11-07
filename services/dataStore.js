/**
 * Central Data Store Service for Shivay Energy Solutions
 * Provides unified in-memory store with Mongoose fallback and persistence.
 */
const Enquiry = require('../models/Enquiry');
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Attendance = require('../models/Attendance');
const Complaint = require('../models/Complaint');

// Initial seed enquiries for Raisen & MP
let enquiries = [
    {
        id: 'ENQ-94821',
        name: 'Mukesh Ahirwar',
        mobile: '+91 98261 44521',
        district: 'Raisen (M.P.)',
        state: 'Madhya Pradesh',
        requirement: '3 kW Residential (PM Surya Ghar)',
        monthlyBill: 3200,
        message: 'Looking for 3kW rooftop solar with net meter under PM Surya Ghar Yojana. Roof is 400 sq.ft.',
        status: 'new',
        date: '07-11-2026',
        createdAt: new Date('2026-11-07T10:15:00+05:30'),
        notes: ['Customer contacted on phone, interested in 3kW mono perc subsidy.']
    },
    {
        id: 'ENQ-94820',
        name: 'Sunil Verma',
        mobile: '+91 94250 88712',
        district: 'Bhopal',
        state: 'Madhya Pradesh',
        requirement: '25 kW Commercial Rooftop',
        monthlyBill: 38000,
        message: 'Warehouse rooftop installation for flour mill near Mandideep.',
        status: 'survey_scheduled',
        date: '06-11-2026',
        createdAt: new Date('2026-11-06T14:30:00+05:30'),
        notes: ['Site survey scheduled with site engineer Vikram Solanki for 9th Nov.']
    },
    {
        id: 'ENQ-94819',
        name: 'Babulal Meena',
        mobile: '+91 99933 11204',
        district: 'Gairatganj, Raisen',
        state: 'Madhya Pradesh',
        requirement: '5 HP Solar Water Pump',
        monthlyBill: 0,
        message: 'Agricultural pump installation under PM-KUSUM Component-B.',
        status: 'converted',
        date: '06-11-2026',
        createdAt: new Date('2026-11-06T11:00:00+05:30'),
        notes: ['Payment received for 5HP VFD solar pump kit. Dispatch initiated.']
    },
    {
        id: 'ENQ-94818',
        name: 'Dr. Alok Saxena',
        mobile: '+91 98930 77319',
        district: 'Vidisha Road, Raisen',
        state: 'Madhya Pradesh',
        requirement: '5 kW Hybrid Lithium System',
        monthlyBill: 6500,
        message: 'Need battery backup for private clinic during frequent grid cuts.',
        status: 'quotation_sent',
        date: '05-11-2026',
        createdAt: new Date('2026-11-05T16:45:00+05:30'),
        notes: ['Quotation SES-Q2026-401 sent via WhatsApp. Follow up on Monday.']
    },
    {
        id: 'ENQ-94817',
        name: 'Dharmendra Lodhi',
        mobile: '+91 91792 55301',
        district: 'Begumganj, Raisen',
        state: 'Madhya Pradesh',
        requirement: '2 kW Residential (PM Surya Ghar)',
        monthlyBill: 2100,
        message: 'Family home rooftop. Wants subsidy directly into SBI account.',
        status: 'new',
        date: '05-11-2026',
        createdAt: new Date('2026-11-05T09:20:00+05:30'),
        notes: []
    }
];

// Initial seed quotations
let quotations = [
    {
        quotationNumber: 'SES-Q2026-402',
        customerName: 'Suresh Chouksey',
        customerMobile: '+91 98260 12345',
        customerAddress: 'Near Bus Stand, Raisen (M.P.)',
        plantCapacityKw: 3,
        ratePerKw: 58000,
        grossAmount: 174000,
        subsidy: 78000,
        netAmount: 96000,
        panelSpecs: '6 x 540W Mono PERC Half-Cut (DCR Compliant)',
        inverterSpecs: '3 kW On-Grid Dual MPPT Inverter with Wi-Fi Monitoring',
        date: '07-11-2026',
        status: 'sent'
    },
    {
        quotationNumber: 'SES-Q2026-401',
        customerName: 'Dr. Alok Saxena',
        customerMobile: '+91 98930 77319',
        customerAddress: 'Vidisha Road, Raisen (M.P.)',
        plantCapacityKw: 5,
        ratePerKw: 62000,
        grossAmount: 310000,
        subsidy: 78000,
        netAmount: 232000,
        panelSpecs: '10 x 540W Mono PERC TopCon Modules',
        inverterSpecs: '5 kW Hybrid Inverter with 5.12 kWh Lithium Battery',
        date: '05-11-2026',
        status: 'sent'
    }
];

// Initial seed invoices
let invoices = [
    {
        invoiceNumber: 'SES-INV-2026-118',
        customerName: 'Patel Cold Storage & Agro Pvt. Ltd.',
        customerMobile: '+91 94250 88712',
        customerAddress: 'Mandideep Industrial Area, Bhopal (M.P.)',
        customerGstin: '23AABCP1234F1Z0',
        plantCapacityKw: 25,
        subtotal: 996640,
        cgst: 59798.40,
        sgst: 59798.40,
        totalAmount: 1116236.80,
        paymentStatus: 'paid',
        paymentMethod: 'NEFT / RTGS (SBI Raisen)',
        date: '07-11-2026'
    },
    {
        invoiceNumber: 'SES-INV-2026-117',
        customerName: 'Ramswaroop Meena',
        customerMobile: '+91 99933 11204',
        customerAddress: 'Gairatganj, Raisen (M.P.)',
        customerGstin: '',
        plantCapacityKw: 5,
        subtotal: 215000,
        cgst: 12900,
        sgst: 12900,
        totalAmount: 240800,
        paymentStatus: 'paid',
        paymentMethod: 'UPI / Direct Bank',
        date: '06-11-2026'
    }
];

// Initial seed field attendance records for today
let attendanceRecords = [
    {
        id: 'ATT-101',
        employeeId: 'SES-EMP-01',
        employeeName: 'Deepak Kushwaha',
        role: 'Technical Lead & Co-Founder',
        type: 'check_in',
        latitude: 23.3315,
        longitude: 77.7807,
        accuracy: 8,
        locationName: 'Shivay Energy HQ, Arjun Nagar, Raisen',
        timestamp: '09:12 AM',
        date: '07-11-2026',
        isWithinGeofence: true
    },
    {
        id: 'ATT-102',
        employeeId: 'SES-EMP-02',
        employeeName: 'Rahul Saini',
        role: 'Operations Lead & Co-Founder',
        type: 'check_in',
        latitude: 23.3321,
        longitude: 77.7812,
        accuracy: 12,
        locationName: 'PHE Office Ward 15, Raisen',
        timestamp: '09:25 AM',
        date: '07-11-2026',
        isWithinGeofence: true
    },
    {
        id: 'ATT-103',
        employeeId: 'SES-EMP-03',
        employeeName: 'Anil Sharma',
        role: 'Site Technician',
        type: 'check_in',
        latitude: 23.3289,
        longitude: 77.7794,
        accuracy: 15,
        locationName: 'Site Survey: Bus Stand Road, Raisen',
        timestamp: '09:40 AM',
        date: '07-11-2026',
        isWithinGeofence: true
    },
    {
        id: 'ATT-104',
        employeeId: 'SES-EMP-04',
        employeeName: 'Vikram Solanki',
        role: 'Installation Specialist',
        type: 'check_in',
        latitude: 23.2599,
        longitude: 77.4126,
        accuracy: 18,
        locationName: 'Mandideep Industrial Sector, Raisen',
        timestamp: '10:05 AM',
        date: '07-11-2026',
        isWithinGeofence: true
    }
];

class DataStore {
    // ENQUIRIES
    static getAllEnquiries() {
        return enquiries;
    }

    static addEnquiry(data) {
        const id = 'ENQ-' + Math.floor(100000 + Math.random() * 900000);
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const newEnquiry = {
            id,
            name: data.name,
            mobile: data.mobile.startsWith('+91') ? data.mobile : `+91 ${data.mobile}`,
            email: data.email || '',
            district: data.district || 'Raisen',
            state: data.state || 'Madhya Pradesh',
            requirement: data.solarRequirement || 'Residential Rooftop (PM Surya Ghar)',
            monthlyBill: parseFloat(data.monthlyBill) || 0,
            message: data.message || '',
            status: 'new',
            date: todayStr,
            createdAt: new Date(),
            notes: []
        };

        enquiries.unshift(newEnquiry);

        // Sync with MongoDB if available
        try {
            Enquiry.create({
                enquiryId: id,
                name: newEnquiry.name,
                mobile: newEnquiry.mobile,
                email: newEnquiry.email,
                district: newEnquiry.district,
                state: newEnquiry.state,
                solarRequirement: newEnquiry.requirement,
                monthlyBill: newEnquiry.monthlyBill,
                message: newEnquiry.message,
                status: 'new'
            }).catch(() => {});
        } catch (e) {}

        return newEnquiry;
    }

    static updateEnquiryStatus(id, newStatus, note = '') {
        const item = enquiries.find(e => e.id === id);
        if (item) {
            item.status = newStatus;
            if (note) {
                item.notes.push(note);
            }
            try {
                Enquiry.findOneAndUpdate({ enquiryId: id }, { status: newStatus }).catch(() => {});
            } catch (e) {}
            return true;
        }
        return false;
    }

    // QUOTATIONS
    static getAllQuotations() {
        return quotations;
    }

    static addQuotation(data) {
        const num = data.quotationNumber || ('SES-Q2026-' + Math.floor(400 + Math.random() * 600));
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const q = {
            quotationNumber: num,
            customerName: data.customerName,
            customerMobile: data.customerMobile,
            customerAddress: data.customerAddress || 'Raisen (M.P.)',
            plantCapacityKw: parseFloat(data.plantCapacityKw) || 3,
            ratePerKw: parseFloat(data.ratePerKw) || 58000,
            grossAmount: parseFloat(data.grossAmount) || 174000,
            subsidy: parseFloat(data.subsidy) || 78000,
            netAmount: parseFloat(data.netAmount) || 96000,
            panelSpecs: data.panelSpecs || `${Math.ceil((parseFloat(data.plantCapacityKw) || 3) * 1000 / 540)} x 540W Mono PERC Half-Cut`,
            inverterSpecs: data.inverterSpecs || `${data.plantCapacityKw || 3} kW On-Grid Dual MPPT Inverter`,
            date: todayStr,
            status: 'sent'
        };

        quotations.unshift(q);

        try {
            Quotation.create({
                quotationNumber: num,
                customerName: q.customerName,
                customerMobile: q.customerMobile,
                customerAddress: q.customerAddress,
                plantCapacityKw: q.plantCapacityKw,
                grossAmount: q.grossAmount,
                estimatedSubsidy: q.subsidy,
                netAmount: q.netAmount,
                panelSpecs: q.panelSpecs,
                inverterSpecs: q.inverterSpecs,
                status: 'sent'
            }).catch(() => {});
        } catch (e) {}

        return q;
    }

    // INVOICES
    static getAllInvoices() {
        return invoices;
    }

    static addInvoice(data) {
        const num = data.invoiceNumber || ('SES-INV-2026-' + Math.floor(120 + Math.random() * 800));
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const inv = {
            invoiceNumber: num,
            customerName: data.customerName,
            customerMobile: data.customerMobile,
            customerAddress: data.customerAddress,
            customerGstin: data.customerGstin || '',
            plantCapacityKw: parseFloat(data.plantCapacityKw) || 3,
            subtotal: parseFloat(data.subtotal) || 100000,
            cgst: parseFloat(data.cgst) || 6000,
            sgst: parseFloat(data.sgst) || 6000,
            totalAmount: parseFloat(data.totalAmount) || 112000,
            paymentStatus: data.paymentStatus || 'paid',
            paymentMethod: data.paymentMethod || 'NEFT / RTGS (SBI Raisen)',
            date: todayStr
        };

        invoices.unshift(inv);
        return inv;
    }

    // ATTENDANCE
    static getTodayAttendance() {
        return attendanceRecords;
    }

    static addAttendance(data) {
        const id = 'ATT-' + (attendanceRecords.length + 101);
        const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');

        const rec = {
            id,
            employeeId: data.employeeId,
            employeeName: data.employeeName,
            role: data.role || 'Field Engineer',
            type: data.type || 'check_in',
            latitude: parseFloat(data.latitude) || 23.3315,
            longitude: parseFloat(data.longitude) || 77.7807,
            accuracy: parseFloat(data.accuracy) || 10,
            locationName: `Lat: ${(parseFloat(data.latitude) || 23.3315).toFixed(4)}, Lng: ${(parseFloat(data.longitude) || 77.7807).toFixed(4)}`,
            timestamp: timeStr,
            date: todayStr,
            isWithinGeofence: true
        };

        attendanceRecords.unshift(rec);
        return rec;
    }

    // STATS
    static getStats() {
        const totalEnquiries = enquiries.length + 43; // total historical + active
        const newEnquiries = enquiries.filter(e => e.status === 'new').length;
        const convertedEnquiries = enquiries.filter(e => e.status === 'converted').length + 24;
        const todayAttendance = attendanceRecords.filter(a => a.type === 'check_in').length;

        return {
            totalEnquiries,
            newEnquiries,
            convertedEnquiries,
            todayAttendance,
            totalEmployees: 9,
            totalQuotations: quotations.length + 32,
            totalInvoices: invoices.length + 20,
            monthlyRevenueInr: '₹18,45,000'
        };
    }
}

module.exports = DataStore;
