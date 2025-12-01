const mongoose = require('mongoose');

const specialIdentifierSchema = new mongoose.Schema({
    identifier: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['ip', 'email'], required: true },
    message: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('SpecialIdentifier', specialIdentifierSchema);
