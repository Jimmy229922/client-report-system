const ActivityLog = require('../models/activityLog.model.js');

async function logActivity(req, userId, action, details = {}) {
    try {
        await ActivityLog.create({
            user_id: userId,
            action,
            ip_address: req.ip || req.connection.remoteAddress,
            details
        });
    } catch (error) {
        console.error(`[Activity Log] Failed to log action "${action}" for user ${userId}:`, error.message);
    }
}

module.exports = {
    logActivity
};

