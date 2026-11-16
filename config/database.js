require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
        console.warn('⚠️ MongoDB connection note: Neither MONGODB_URI nor MONGO_URI is set in .env. Operating with in-memory & file-based storage fallback.');
        return;
    }
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 8000
        });
        console.log('✅ MongoDB Connected Successfully to Database.');

        // Self-heal manager prefixes (e.g. SES-EMP-xxx -> SES-MGR-xxx) and remove assigned managers from managers
        try {
            const User = require('../models/User');
            const managers = await User.find({ role: { $in: ['BRANCH_MANAGER', 'MANAGER'] } });
            for (const m of managers) {
                let changed = false;
                if (m.employeeId && m.employeeId.startsWith('SES-EMP-')) {
                    m.employeeId = m.employeeId.replace('SES-EMP-', 'SES-MGR-');
                    changed = true;
                }
                if (m.managerId) {
                    m.managerId = null;
                    changed = true;
                }
                if (changed) {
                    await m.save();
                }
            }
        } catch (healErr) {}
    } catch (err) {
        console.warn(`⚠️ MongoDB connection note: ${err.message}. Operating with in-memory & file-based storage fallback.`);
    }
};

module.exports = connectDB;
