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
    } catch (err) {
        console.warn(`⚠️ MongoDB connection note: ${err.message}. Operating with in-memory & file-based storage fallback.`);
    }
};

module.exports = connectDB;
