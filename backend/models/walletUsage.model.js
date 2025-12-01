const mongoose = require('mongoose');

const walletUsageSchema = new mongoose.Schema({
    address: { 
        type: String, 
        required: true, 
        index: true 
    },
    lastUsed: { 
        type: Date, 
        required: true, 
        default: Date.now 
    },
    lastUser: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    usageCount: { 
        type: Number, 
        default: 1 
    },
    usageHistory: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        timestamp: { 
            type: Date, 
            default: Date.now 
        },
        shift: {
            type: String,
            enum: ['الصباحي', 'المسائي', 'الفجر']
        }
    }]
}, { 
    timestamps: true 
});

// Index للبحث السريع
walletUsageSchema.index({ address: 1, lastUsed: -1 });

module.exports = mongoose.model('WalletUsage', walletUsageSchema);
