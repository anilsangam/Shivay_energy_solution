/**
 * Manual Database Seed Script for Shivay Energy Solutions
 * 
 * Execution:
 *   node scripts/seed.js
 * 
 * Safety:
 *   - Idempotent: Only inserts records if they do not already exist in the database.
 *   - Non-destructive: Never overwrites, deletes, or alters existing production records.
 *   - Offline/Stand-alone: Can be executed manually by DevOps/Engineers when bootstrapping a new environment.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const WebService = require('../models/WebService');
const WebProduct = require('../models/WebProduct');
const WebProject = require('../models/WebProject');
const WebTeam = require('../models/WebTeam');
const WebTestimonial = require('../models/WebTestimonial');
const WebsiteService = require('../services/websiteService');

async function seedDatabase() {
    console.log('====================================================');
    console.log('🌱 Shivay Energy Solutions — Standalone Database Seeder');
    console.log('====================================================');

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/solar_panial';

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ Connected to MongoDB successfully.\n');

        // Execute idempotent seed
        console.log('Checking collections and seeding missing initial records...');
        await WebsiteService.ensureInitialSeedData();

        const [serviceCount, productCount, projectCount, teamCount, testimonialCount] = await Promise.all([
            WebService.countDocuments(),
            WebProduct.countDocuments(),
            WebProject.countDocuments(),
            WebTeam.countDocuments(),
            WebTestimonial.countDocuments()
        ]);

        console.log('\n📊 Current Database Inventory:');
        console.log(`   - Services:     ${serviceCount} records`);
        console.log(`   - Products:     ${productCount} records`);
        console.log(`   - Projects:     ${projectCount} records`);
        console.log(`   - Team Members: ${teamCount} records`);
        console.log(`   - Testimonials: ${testimonialCount} records`);

        console.log('\n✅ Seeding check completed without errors. Existing records preserved.');
    } catch (err) {
        console.error('❌ Error executing database seed:', err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        console.log('====================================================\n');
    }
}

if (require.main === module) {
    seedDatabase();
}

module.exports = seedDatabase;
