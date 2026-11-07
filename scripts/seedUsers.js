/**
 * Development & Initial Admin Seed Script for Shivay Energy Solutions
 * Creates initial Super Admin and Branch Manager accounts with bcrypt hashed passwords.
 * Run explicitly via: node scripts/seedUsers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Branch = require('../models/Branch');
const connectDB = require('../config/database');

async function seedInitialUsers() {
    console.log('--- Initializing User Database ---');
    await connectDB();

    try {
        // 1. Create or Find Raisen Central Branch
        let raisenBranch = await Branch.findOne({ code: 'MP-RSN-01' });
        if (!raisenBranch) {
            raisenBranch = await Branch.create({
                name: 'Raisen Central Branch',
                code: 'MP-RSN-01',
                contactNumber: '+91 70005 75496',
                email: 'raisen@shivayenergy.com',
                state: 'Madhya Pradesh',
                district: 'Raisen',
                city: 'Raisen',
                address: 'Ward No. 15, In front of PHE Office, Arjun Nagar, Raisen - 464551',
                coordinates: { latitude: 23.3315, longitude: 77.7807 },
                geofenceRadiusMeters: 500,
                isActive: true
            });
            console.log('✅ Created Branch: Raisen Central Branch (MP-RSN-01)');
        }

        // 2. Super Admin (Deepak Kushwaha)
        let superAdmin = await User.findOne({ email: 'admin@shivayenergy.com' });
        if (!superAdmin) {
            superAdmin = await User.create({
                name: 'Deepak Kushwaha',
                email: 'admin@shivayenergy.com',
                mobile: '+91 70005 75496',
                employeeId: 'SES-ADMIN-01',
                password: process.env.ADMIN_INITIAL_PASSWORD || 'ShivayAdmin@2026',
                role: 'SUPER_ADMIN',
                branchId: raisenBranch._id,
                status: 'ACTIVE'
            });
            console.log('✅ Seeded Super Admin: admin@shivayenergy.com (Deepak Kushwaha)');
        } else {
            console.log('ℹ️ Super Admin already exists: admin@shivayenergy.com');
        }

        // 3. Branch Manager (Rahul Saini)
        let branchManager = await User.findOne({ email: 'rahul@shivayenergy.com' });
        if (!branchManager) {
            branchManager = await User.create({
                name: 'Rahul Saini',
                email: 'rahul@shivayenergy.com',
                mobile: '+91 93997 61750',
                employeeId: 'SES-MGR-01',
                password: process.env.MANAGER_INITIAL_PASSWORD || 'ShivayManager@2026',
                role: 'BRANCH_MANAGER',
                branchId: raisenBranch._id,
                status: 'ACTIVE'
            });
            console.log('✅ Seeded Branch Manager: rahul@shivayenergy.com (Rahul Saini)');
        } else {
            console.log('ℹ️ Branch Manager already exists: rahul@shivayenergy.com');
        }

        // 4. Sample Field Staff (Anil Sharma)
        let staffUser = await User.findOne({ email: 'anil@shivayenergy.com' });
        if (!staffUser) {
            staffUser = await User.create({
                name: 'Anil Sharma',
                email: 'anil@shivayenergy.com',
                mobile: '+91 98261 44521',
                employeeId: 'SES-EMP-03',
                password: process.env.EMPLOYEE_INITIAL_PASSWORD || 'ShivayTech@2026',
                role: 'EMPLOYEE',
                branchId: raisenBranch._id,
                status: 'ACTIVE'
            });
            console.log('✅ Seeded Field Staff: anil@shivayenergy.com (Anil Sharma - SES-EMP-03)');
        } else {
            console.log('ℹ️ Field Staff already exists: anil@shivayenergy.com');
        }

        console.log('--- User Seeding Completed Successfully ---');
    } catch (err) {
        console.error('Seeding error:', err);
    } finally {
        if (require.main === module) {
            await mongoose.disconnect();
            process.exit(0);
        }
    }
}

if (require.main === module) {
    seedInitialUsers();
}

module.exports = seedInitialUsers;
