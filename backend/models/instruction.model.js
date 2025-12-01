const mongoose = require('mongoose');

const instructionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    search_terms: { type: [String], default: [] },
    category: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Instruction', instructionSchema);
