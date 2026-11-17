const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    companyName: { type: String, default: "SHIVAY ENERGY SOLUTIONS" },
    shortName: { type: String, default: "Shivay Energy" },
    tagline: { type: String, default: "Save Green Energy To Build A Better Future" },
    gstin: { type: String, default: "23AXXXX0000X1Z5" },
    officialEmail: { type: String, default: "shivayenergysolutions@gmail.com" },
    primaryPhone: { type: String, default: "+91 70005 75496" },
    alternatePhone: { type: String, default: "+91 93997 61750" },
    whatsappNumber: { type: String, default: "+91 70005 75496" },
    website: { type: String, default: "https://shivayenergysolutions.com" },
    addressLine: { type: String, default: "Ward No. 15, In front of PHE Office, Arjun Nagar" },
    city: { type: String, default: "Raisen" },
    district: { type: String, default: "Raisen" },
    state: { type: String, default: "Madhya Pradesh" },
    pincode: { type: String, default: "464551" },

    // Working Hours & Socials
    workingDays: { type: String, default: "Monday - Saturday" },
    workingTime: { type: String, default: "09:00 AM - 07:00 PM (IST)" },
    facebookUrl: { type: String, default: "https://facebook.com/shivayenergysolutions" },
    instagramUrl: { type: String, default: "https://instagram.com/shivayenergysolutions" },
    youtubeUrl: { type: String, default: "https://youtube.com/@shivayenergysolutions" },
    whatsappUrl: { type: String, default: "https://wa.me/917000575496" },

    // Direct Leadership Contacts
    founder1Name: { type: String, default: "Deepak Kushwaha" },
    founder1Designation: { type: String, default: "Managing Director & Technical Head" },
    founder1Mobile: { type: String, default: "+91 70005 75496" },
    founder2Name: { type: String, default: "Rahul Saini" },
    founder2Designation: { type: String, default: "Operations & Customer Support Head" },
    founder2Mobile: { type: String, default: "+91 93997 61750" },

    // Solar Pricing & Subsidy Slabs
    defaultRatePerKw: { type: Number, default: 58000 },
    subsidy1Kw: { type: Number, default: 30000 },
    subsidy2Kw: { type: Number, default: 60000 },
    subsidy3KwMax: { type: Number, default: 78000 },
    defaultGstPercent: { type: Number, default: 13.8 },

    // Attendance & GPS Geofence
    hqLatitude: { type: Number, default: 23.3315 },
    hqLongitude: { type: Number, default: 77.7807 },
    defaultGeofenceRadiusMeters: { type: Number, default: 500 },
    enforceGeofence: { type: Boolean, default: true },

    // Security & Auth Policies
    maxFailedLoginAttempts: { type: Number, default: 5 },
    lockoutDurationMinutes: { type: Number, default: 15 },
    sessionTimeoutHours: { type: Number, default: 24 },

    // DISCOM & Net-metering
    primaryDiscom: { type: String, default: "MPPKVVCL (Madhya Kshetra)" },
    discomPortalUrl: { type: String, default: "https://portal.mpcz.in/" },
    discomHelpline: { type: String, default: "1912" },

    // Legal & Public Policies
    privacyPolicy: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    privacyPolicyUpdatedAt: { type: Date, default: Date.now },
    termsAndConditionsUpdatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
