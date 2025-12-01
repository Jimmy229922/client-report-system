const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shiftManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientEmail: { type: String, required: false },
    clientAccountNumber: { type: String, required: false },
    errorLevel: { type: String, enum: ['صغير', 'متوسط', 'كبير'], required: true },
    actionTaken: { type: String, enum: ['تنبيه شفهي', 'كتاب تنبيه', 'كتاب عقوبة'], required: true },
    mistake: { type: String, required: true },
    details: { type: String, required: true },
    date: { type: Date, default: Date.now },
    image_urls: { type: [String], default: [] }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);
