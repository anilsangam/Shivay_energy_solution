const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shivay_energy_solutions';
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 2500
        });
        console.log(`✅ MongoDB Connected Successfully: ${mongoURI}`);
    } catch (err) {
        console.warn(`⚠️ MongoDB connection note: ${err.message}. Operating with in-memory & file-based storage fallback.`);
    }
};

module.exports = connectDB;
