const express = require('express');
const router = express.Router();
const WalletUsage = require('../models/walletUsage.model');

// سيتم تمرير verifyToken من server.js
module.exports = (verifyToken) => {

/**
 * التحقق من استخدام عنوان المحفظة
 * GET /api/wallet-usage/check?address=xxx
 */
router.get('/check', verifyToken, async (req, res) => {
    try {
        const { address } = req.query;
        
        if (!address) {
            return res.status(400).json({ 
                success: false, 
                message: 'عنوان المحفظة مطلوب' 
            });
        }

        // البحث عن آخر استخدام لهذا العنوان
        const usage = await WalletUsage.findOne({ address })
            .populate('lastUser', 'username')
            .sort({ lastUsed: -1 });

        if (!usage) {
            return res.json({
                success: true,
                data: null,
                message: 'لم يتم استخدام هذا العنوان من قبل'
            });
        }

        res.json({
            success: true,
            data: {
                address: usage.address,
                lastUsed: usage.lastUsed,
                lastUser: usage.lastUser?.username,
                usageCount: usage.usageCount
            }
        });

    } catch (error) {
        console.error('Error checking wallet usage:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء التحقق من عنوان المحفظة' 
        });
    }
});

/**
 * تسجيل استخدام عنوان المحفظة
 * POST /api/wallet-usage/record
 */
router.post('/record', verifyToken, async (req, res) => {
    try {
        const { address } = req.body;
        const userId = req.userId; // استخدام req.userId من middleware
        
        if (!address) {
            return res.status(400).json({ 
                success: false, 
                message: 'عنوان المحفظة مطلوب' 
            });
        }

        // تحديد الشفت الحالي
        const now = new Date();
        const hour = now.getHours();
        let shift;
        
        if (hour >= 8 && hour < 16) {
            shift = 'الصباحي';
        } else if (hour >= 16 && hour < 24) {
            shift = 'المسائي';
        } else {
            shift = 'الفجر';
        }

        // البحث عن السجل الموجود أو إنشاء واحد جديد
        let usage = await WalletUsage.findOne({ address });

        if (usage) {
            // تحديث السجل الموجود
            usage.lastUsed = now;
            usage.lastUser = userId;
            usage.usageCount += 1;
            usage.usageHistory.push({
                userId,
                timestamp: now,
                shift
            });
            
            // الاحتفاظ بآخر 50 استخدام فقط
            if (usage.usageHistory.length > 50) {
                usage.usageHistory = usage.usageHistory.slice(-50);
            }
            
            await usage.save();
        } else {
            // إنشاء سجل جديد
            usage = new WalletUsage({
                address,
                lastUsed: now,
                lastUser: userId,
                usageCount: 1,
                usageHistory: [{
                    userId,
                    timestamp: now,
                    shift
                }]
            });
            
            await usage.save();
        }

        res.json({
            success: true,
            message: 'تم تسجيل استخدام عنوان المحفظة',
            data: {
                address: usage.address,
                lastUsed: usage.lastUsed,
                usageCount: usage.usageCount
            }
        });

    } catch (error) {
        console.error('Error recording wallet usage:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء تسجيل استخدام عنوان المحفظة' 
        });
    }
});

/**
 * الحصول على سجل استخدامات عنوان محفظة معين
 * GET /api/wallet-usage/history/:address
 */
router.get('/history/:address', verifyToken, async (req, res) => {
    try {
        const { address } = req.params;
        
        const usage = await WalletUsage.findOne({ address })
            .populate('usageHistory.userId', 'username')
            .populate('lastUser', 'username');

        if (!usage) {
            return res.status(404).json({ 
                success: false, 
                message: 'لم يتم العثور على سجل لهذا العنوان' 
            });
        }

        res.json({
            success: true,
            data: usage
        });

    } catch (error) {
        console.error('Error fetching wallet history:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء جلب سجل العنوان' 
        });
    }
});

return router;
};
