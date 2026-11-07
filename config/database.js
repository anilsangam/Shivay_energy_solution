const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
        console.warn('MongoDB connection note: MONGO_URI is not set. Operating with in-memory & file-based storage fallback.');
        return;
    }
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 2500
        });
        console.log('MongoDB Connected Successfully.');
    } catch (err) {
        console.warn(`⚠️ MongoDB connection note: ${err.message}. Operating with in-memory & file-based storage fallback.`);
    }
};

module.exports = connectDB;
