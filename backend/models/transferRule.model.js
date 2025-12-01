const mongoose = require('mongoose');

const transferRuleSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    fromGroup: { type: String, required: true, trim: true },
    toGroup: { type: String, required: true, trim: true },
    conditions: { type: mongoose.Schema.Types.Mixed, required: true },
    isEnabled: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('TransferRule', transferRuleSchema);
