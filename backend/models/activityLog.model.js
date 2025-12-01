const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    ip_address: { type: String, required: true },
    details: { type: Object, default: {} },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
