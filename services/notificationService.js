const mongoose = require('mongoose');
const Notification = require('../models/Notification');

const inMemoryDedupSet = new Set();

class NotificationService {
    /**
     * Send or queue an in-app notification to one or multiple users with deduplication.
     */
    static async notify({
        recipients = [],
        sender = null,
        title,
        message,
        type = 'INFO',
        relatedResource = '',
        resourceId = null,
        dedupKey = null,
        metadata = {}
    }) {
        if (!title || !message) return [];

        const recipientList = Array.isArray(recipients) ? recipients : [recipients];
        const validRecipients = recipientList
            .filter(r => r && (mongoose.isValidObjectId(r) || (r._id && mongoose.isValidObjectId(r._id))))
            .map(r => r._id || r);

        if (validRecipients.length === 0) return [];

        const createdNotifications = [];

        for (const recipientId of validRecipients) {
            const finalDedupKey = dedupKey ? `${dedupKey}:${recipientId}` : null;

            // Check deduplication (both MongoDB and in-memory fallback)
            if (finalDedupKey) {
                if (inMemoryDedupSet.has(finalDedupKey)) {
                    continue; // Skip duplicate
                }
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                    try {
                        const existing = await Notification.findOne({ dedupKey: finalDedupKey });
                        if (existing) {
                            inMemoryDedupSet.add(finalDedupKey);
                            continue;
                        }
                    } catch (_) {}
                }
                inMemoryDedupSet.add(finalDedupKey);
            }

            const notif = new Notification({
                recipient: recipientId,
                sender: sender ? (sender._id || sender) : null,
                title,
                message,
                type,
                relatedResource,
                resourceId,
                dedupKey: finalDedupKey,
                metadata
            });

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                try {
                    await notif.save();
                } catch (err) {
                    console.error('[NotificationService.notify] DB Save Error:', err.message);
                }
            }
            createdNotifications.push(notif);
        }

        return createdNotifications;
    }

    /**
     * Send single notification helper
     */
    static async sendNotification(params) {
        const recipients = params.recipients || params.recipient;
        const res = await this.notify({ ...params, recipients });
        if (res && res.length === 0 && params.dedupKey) {
            return { isDuplicate: true };
        }
        return res && res.length > 0 ? res[0] : { success: true };
    }

    /**
     * Get unread notifications for a user
     */
    static async getUserNotifications(userId, { limit = 20 } = {}) {
        if (!userId || !mongoose.connection || mongoose.connection.readyState !== 1) {
            return [];
        }
        return Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId, userId) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
        return Notification.findOneAndUpdate(
            { _id: notificationId, recipient: userId },
            { isRead: true },
            { new: true }
        );
    }
}

module.exports = NotificationService;
