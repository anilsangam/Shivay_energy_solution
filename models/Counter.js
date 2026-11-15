const mongoose = require('mongoose');

const memoryCounters = new Map();

const counterSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    seq: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

counterSchema.statics.getNextSequence = async function(sequenceName) {
    if (mongoose.connection.readyState !== 1) {
        const current = (memoryCounters.get(sequenceName) || 0) + 1;
        memoryCounters.set(sequenceName, current);
        return current;
    }
    const counter = await this.findByIdAndUpdate(
        sequenceName,
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );
    return counter.seq;
};

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
