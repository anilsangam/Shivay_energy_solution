require('dotenv').config();
const mongoose = require('mongoose');

let connectPromise = null;

const connectDB = () => {
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
        const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoURI) {
            console.warn('⚠️ MongoDB connection note: Neither MONGODB_URI nor MONGO_URI is set in .env. Operating with in-memory & file-based storage fallback.');
            return null;
        }
        try {
            await mongoose.connect(mongoURI, {
                serverSelectionTimeoutMS: 8000,
                connectTimeoutMS: 8000,
                socketTimeoutMS: 30000,
                family: 4
            });
            console.log('✅ MongoDB Connected Successfully to Database.');

            // Hydrate today's attendance from MongoDB to in-memory store on startup
            try {
                const DataStore = require('../services/dataStore');
                await DataStore.syncAttendanceFromDb();
                console.log('✅ Today\'s Attendance hydrated from MongoDB Atlas.');
            } catch (attSyncErr) {
                console.warn('⚠️ Attendance startup hydration note:', attSyncErr.message);
            }

            return mongoose.connection.getClient();
        } catch (err) {
            console.warn(`⚠️ MongoDB connection note: ${err.message}. Operating with in-memory & file-based storage fallback.`);
            return null;
        }
    })();

    return connectPromise;
};

module.exports = connectDB;
