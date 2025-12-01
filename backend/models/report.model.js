const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    report_text: { type: String, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['suspicious', 'credit-out', 'payouts', 'deposit_percentages', 'bulk_deposit_percentages', 'new-positions', 'account_transfer', 'profit_watching', '3days_balance', 'profit_leverage', 'same_price_sl', 'deals_no_profit', 'evaluation', 'other'], required: true },
    image_urls: { type: [String], default: [] },
    is_resolved: { type: Boolean, default: false },
    resolution_notes: { type: String, default: null },
    telegram_failed: { type: Boolean, default: false },
    telegram_error_message: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

reportSchema.index({ user_id: 1 });
reportSchema.index({ timestamp: -1 });
reportSchema.index({ type: 1 });
reportSchema.index({ report_text: 'text' });

module.exports = mongoose.model('Report', reportSchema);
