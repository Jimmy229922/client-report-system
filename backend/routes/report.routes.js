const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');

// Models
const Report = require('../models/report.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

module.exports = (verifyToken, verifyAdmin, handleUploadErrors, upload, telegramHelper, gridfsBucket, sendEventToAll, sendEventToUser, logActivity, config) => {

    router.post('/', verifyToken, handleUploadErrors(upload.array('images', 10)), async (req, res) => {
        const userId = req.userId;
        const { report_text, type, skip_archive } = req.body;

        if (!report_text || !type) {
            return res.status(400).json({ message: 'يرجى ملء جميع الحقول المطلوبة' });
        }

        try {
            let imageUrls = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    try {
                        const readableStream = require('stream').Readable.from(file.buffer);
                        const filename = `report_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname)}`;
                        const uploadStream = gridfsBucket.openUploadStream(filename, { contentType: file.mimetype });
                        await new Promise((resolve, reject) => {
                            readableStream.pipe(uploadStream)
                                .on('error', (error) => reject(error))
                                .on('finish', () => resolve());
                        });
                        imageUrls.push(`/api/files/${filename}`);
                    } catch (uploadError) {
                        console.error('[Report Upload] Error uploading a file:', uploadError.message);
                    }
                }
            }

            let newReport = null;
            if (skip_archive !== 'true') {
                newReport = await Report.create({ report_text, user_id: userId, type, image_urls: imageUrls });
                await logActivity(req, req.userId, 'create_report', { reportId: newReport._id, type: newReport.type });
                sendEventToAll('new_report', { reportId: newReport._id, type: newReport.type });
            }

            // Send Telegram notification asynchronously to avoid blocking the response
            (async () => {
                try {
                    const fullCaption = report_text;
                    if (req.files && req.files.length > 0) {
                        if (req.files.length === 1) {
                            await telegramHelper.sendPhoto(config.CHAT_ID, { source: req.files[0].buffer }, { caption: fullCaption, parse_mode: 'HTML' });
                        } else {
                            const mediaGroup = req.files.map((file, index) => ({
                                type: 'photo',
                                media: { source: file.buffer },
                                caption: index === 0 ? fullCaption : '',
                                parse_mode: 'HTML'
                            }));
                            await telegramHelper.sendMediaGroup(config.CHAT_ID, mediaGroup);
                        }
                    } else {
                        await telegramHelper.sendMessage(config.CHAT_ID, fullCaption, { parse_mode: 'HTML' });
                    }
                    
                    if (newReport && newReport.telegram_failed) {
                        newReport.telegram_failed = false;
                        newReport.telegram_error_message = null;
                        await newReport.save();
                    }
                } catch (telegramError) {
                    console.error('═══════════════════════════════════════════════════');
                    console.error('[TELEGRAM ERROR] Report ID:', newReport ? newReport._id : 'NOT_SAVED');
                    console.error('[TELEGRAM ERROR] Error Type:', telegramError.name);
                    console.error('[TELEGRAM ERROR] Error Message:', telegramError.message);
                    console.error('[TELEGRAM ERROR] Error Code:', telegramError.code);
                    console.error('[TELEGRAM ERROR] Error Response:', JSON.stringify(telegramError.response, null, 2));
                    console.error('[TELEGRAM ERROR] Stack Trace:', telegramError.stack);
                    console.error('[TELEGRAM ERROR] Full Error Object:', JSON.stringify(telegramError, null, 2));
                    console.error('[TELEGRAM ERROR] Report Text Length:', report_text?.length);
                    console.error('[TELEGRAM ERROR] Number of Images:', req.files?.length || 0);
                    console.error('[TELEGRAM ERROR] Chat ID:', config.CHAT_ID);
                    console.error('═══════════════════════════════════════════════════');
                    
                    if (newReport) {
                        const admin = await User.findOne({ role: 'admin' });
                        if (admin) {
                            const errorDetails = telegramError.response?.description || telegramError.message || 'Unknown error';
                            const notificationMessage = `فشل إرسال تنبيه تليجرام للتقرير رقم ${newReport._id}\nالسبب: ${errorDetails}`;
                            const newNotification = { user_id: admin._id, message: notificationMessage, link: `#archive?search=${newReport._id}`, type: 'error', icon: 'fab fa-telegram-plane' };
                            await Notification.create(newNotification);
                            sendEventToUser(admin._id, 'notification_created', newNotification);
                        }
                        newReport.telegram_failed = true;
                        newReport.telegram_error_message = telegramError.response?.description || telegramError.message;
                        await newReport.save();
                    }
                }
            })();

            res.status(201).json({ message: 'تم حفظ التقرير وإرساله بنجاح.', report: newReport });
        } catch (error) {
            console.error('[Reports] Error:', error.message);
            res.status(500).json({ message: 'حدث خطأ أثناء إرسال التقرير. يرجى المحاولة لاحقًا.' });
        }
    });

    router.post('/deposit-percentage', verifyToken, handleUploadErrors(upload.any()), async (req, res) => {
        const userId = req.userId;
        let accounts;
        try {
            accounts = JSON.parse(req.body.accounts || '[]');
        } catch (error) {
            return res.status(400).json({ message: 'بيانات الحسابات غير صالحة.' });
        }

        if (!Array.isArray(accounts) || accounts.length === 0) {
            return res.status(400).json({ message: 'أضف على الأقل حساب واحد قبل الإرسال.' });
        }

        const deals = (() => {
            try {
                return JSON.parse(req.body.deals || '[]');
            } catch (error) {
                return [];
            }
        })();

        const summaryText = (req.body.summary || accounts.map((entry, idx) => `${idx + 1}. ${entry.generated_note || entry.account_number || 'حساب'}`).join('\n')).trim();

        const storedImageUrls = [];
        const accountFilesMap = {};

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const match = /^accountImages\[(\d+)\]$/.exec(file.fieldname || '');
                if (match) {
                    const idx = Number(match[1]);
                    accountFilesMap[idx] = accountFilesMap[idx] || [];
                    accountFilesMap[idx].push(file);
                }
                try {
                    const readableStream = require('stream').Readable.from(file.buffer);
                    const filename = `deposit-percentage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname)}`;
                    const uploadStream = gridfsBucket.openUploadStream(filename, { contentType: file.mimetype });
                    await new Promise((resolve, reject) => {
                        readableStream.pipe(uploadStream)
                            .on('error', (error) => reject(error))
                            .on('finish', () => resolve());
                    });
                    storedImageUrls.push(`/api/files/${filename}`);
                } catch (uploadError) {
                    console.error('[Deposit Percentage] GridFS upload failed:', uploadError.message);
                }
            }
        }

        const reportPayload = {
            report_text: summaryText || 'دفعة Deposit Percentage',
            user_id: userId,
            type: 'deposit_percentages',
            image_urls: storedImageUrls
        };

        const newReport = await Report.create(reportPayload);
        await logActivity(req, req.userId, 'deposit_percentage_batch', { reportId: newReport._id, accountCount: accounts.length, dealsCount: deals.length });
        sendEventToAll('new_report', { reportId: newReport._id, type: newReport.type });

        const escapeTelegram = (text = '') => text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
        const telegramCaptionLines = (entry, index) => {
            const lines = [];
            lines.push(`<b>حساب ${entry.account_number || index + 1}</b>`);
            if (entry.email) lines.push(`الإيميل: ${escapeTelegram(entry.email)}`);
            if (entry.ip) {
                const country = entry.ip_country || 'غير معروف';
                lines.push(`IP: ${escapeTelegram(entry.ip)} (${escapeTelegram(country)})`);
            }
            if (entry.margin_percentage) lines.push(`نسبة الهامش: ${escapeTelegram(entry.margin_percentage)}%`);
            if (entry.floating_status) lines.push(`الأرباح العائمة: ${escapeTelegram(entry.floating_status)}`);
            if (entry.ip_status) lines.push(`IP الأخير: ${escapeTelegram(entry.ip_status)}`);
            if (entry.bonus_status) lines.push(`البونص: ${escapeTelegram(entry.bonus_status)}`);
            if (entry.additional_notes) lines.push(`ملاحظات: ${escapeTelegram(entry.additional_notes)}`);
            return lines.join('\n');
        };

        let telegramFailed = false;
        let telegramErrorMsg = null;

        for (const [index, entry] of accounts.entries()) {
            const caption = telegramCaptionLines(entry, index);
            const files = accountFilesMap[index] || [];
            try {
                if (files.length === 0) {
                    await telegramHelper.sendMessage(config.CHAT_ID, caption, { parse_mode: 'HTML' });
                } else if (files.length === 1) {
                    await telegramHelper.sendPhoto(config.CHAT_ID, { source: files[0].buffer }, { caption, parse_mode: 'HTML' });
                } else {
                    const mediaGroup = files.slice(0, 10).map((file, mediaIndex) => ({
                        type: 'photo',
                        media: { source: file.buffer },
                        caption: mediaIndex === 0 ? caption : '',
                        parse_mode: 'HTML'
                    }));
                    await telegramHelper.sendMediaGroup(config.CHAT_ID, mediaGroup);
                }
            } catch (err) {
                console.error('[Deposit Percentage Telegram] Error sending account message:', err.message);
                telegramFailed = true;
                telegramErrorMsg = err.response?.description || err.message;
            }
        }

        if (deals.length > 0) {
            const dealsMessage = deals.map((deal) => `- ${escapeTelegram(deal.account || '—')} | ${escapeTelegram(deal.type || '—')} | ${escapeTelegram(deal.amount || '—')}`).join('\n');
            try {
                await telegramHelper.sendMessage(config.CHAT_ID, `<b>الصفقات المرتبطة:</b>\n${dealsMessage}`, { parse_mode: 'HTML' });
            } catch (err) {
                console.error('[Deposit Percentage Telegram] Error sending deals message:', err.message);
                telegramFailed = true;
                telegramErrorMsg = err.response?.description || err.message;
            }
        }

        if (telegramFailed) {
            newReport.telegram_failed = true;
            newReport.telegram_error_message = telegramErrorMsg;
            await newReport.save();
        }

        res.status(201).json({
            message: telegramFailed ? 'تم حفظ الدفعة ولكن حدث خطأ في إرسال التلجرام.' : 'تم إرسال الدفعة بنجاح.',
            warning: telegramFailed ? 'TELEGRAM_FAILED' : undefined
        });
    });

    router.get('/recent', verifyToken, async (req, res) => {
        const isUserScope = req.query.scope === 'user';
        const query = isUserScope ? { user_id: req.userId } : {};
        try {
            const recentReports = await Report.find(query)
                .populate('user_id', 'username')
                .sort({ timestamp: -1 })
                .limit(5)
                .lean();
            res.json({ data: recentReports });
        } catch (error) {
            console.error('[Recent Reports] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch recent reports' });
        }
    });

    router.get('/counts', verifyToken, async (req, res) => {
        try {
            const { search, startDate, endDate, userId, scope } = req.query;
            let query = {};
            if (scope === 'user' && req.userRole !== 'admin') {
                query.user_id = new mongoose.Types.ObjectId(req.userId);
            } else if (userId && userId !== 'all' && userId !== 'undefined' && req.userRole === 'admin') {
                query.user_id = new mongoose.Types.ObjectId(userId);
            }
            if (search) { query.report_text = { $regex: search, $options: 'i' }; }
            if (startDate || endDate) {
                query.timestamp = {};
                if (startDate) { query.timestamp.$gte = new Date(startDate); }
                if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.timestamp.$lte = end; }
            }
            const counts = await Report.aggregate([{ $match: query }, { $group: { _id: '$type', count: { $sum: 1 } } }]);
            const countsMap = counts.reduce((acc, item) => { if (item._id) acc[item._id] = item.count; return acc; }, {});
            res.json({ data: countsMap });
        } catch (error) {
            console.error('[Reports Counts] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch report counts' });
        }
    });

    router.get('/', verifyToken, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const { search, type, startDate, endDate, userId } = req.query;
            let query = {};

            if (req.userRole === 'admin') {
                if (userId && userId !== 'all') {
                    query.user_id = new mongoose.Types.ObjectId(userId);
                }
            } else {
                query.user_id = new mongoose.Types.ObjectId(req.userId);
            }

            if (type && type !== 'all') {
                query.type = type;
            }

            if (search) {
                query.report_text = { $regex: search, $options: 'i' };
            }

            if (startDate || endDate) {
                query.timestamp = {};
                if (startDate) {
                    query.timestamp.$gte = new Date(startDate);
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    query.timestamp.$lte = end;
                }
            }

            const total = await Report.countDocuments(query);
            const reports = await Report.find(query)
                .populate('user_id', 'username')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean();
            
            res.json({
                data: reports,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('[Reports] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch reports' });
        }
    });

    router.get('/check-wallet', verifyToken, async (req, res) => {
        const { address } = req.query;
    
        if (!address) {
            return res.status(400).json({ message: 'Wallet address is required.' });
        }
    
        try {
            const escapedAddress = address.replace(/[-/\\^$*+?.()|[]{}]/g, '\\$&');
            const searchRegex = new RegExp(`عنوان المحفظة: <code>${escapedAddress}</code>`);
    
            const lastReport = await Report.findOne({
                type: 'payouts',
                report_text: { $regex: searchRegex }
            })
            .sort({ timestamp: -1 })
            .populate('user_id', 'username')
            .lean();
    
            if (lastReport) {
                res.json({
                    found: true,
                    lastUsed: lastReport.timestamp,
                    user: lastReport.user_id ? lastReport.user_id.username : 'مستخدم محذوف',
                });
            } else {
                res.json({ found: false });
            }
        } catch (error) {
            console.error('[Check Wallet] Error:', error.message);
            res.status(500).json({ message: 'Failed to check wallet address.' });
        }
    });

    router.get('/:id', verifyToken, async (req, res) => {
        try {
            const report = await Report.findById(req.params.id)
                .populate('user_id', 'username')
                .lean();
            if (!report) return res.status(404).json({ message: 'التقرير غير موجود.' });
            res.json({ data: report });
        } catch (error) {
            console.error('[Report] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch report' });
        }
    });

    router.patch('/:id/resolve', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { notes } = req.body;
            const report = await Report.findByIdAndUpdate(
                req.params.id,
                { is_resolved: true, resolution_notes: notes || '' },
                { new: true }
            );
            if (!report) return res.status(404).json({ message: 'Report not found' });
            await logActivity(req, req.userId, 'resolve_report', { reportId: req.params.id });
            sendEventToUser(report.user_id, 'report_resolved', { reportId: req.params.id });
            res.json({ message: 'Report marked as resolved', data: report });
        } catch (error) {
            console.error('[Resolve Report] Error:', error.message);
            res.status(500).json({ message: 'Failed to update report' });
        }
    });

    router.delete('/:id', verifyToken, async (req, res) => {
        try {
            const { id } = req.params;
            const report = await Report.findById(id);
            if (!report) {
                return res.status(404).json({ message: 'Report not found' });
            }

            const isOwner = report.user_id.toString() === req.userId;
            if (req.userRole !== 'admin' && !isOwner) {
                return res.status(403).json({ message: 'صلاحية الوصول مرفوضة. لا يمكنك حذف هذا التقرير.' });
            }

            if (report.image_urls && report.image_urls.length > 0) {
                for (const imageUrl of report.image_urls) {
                    try {
                        const filename = path.basename(imageUrl);
                        const files = await gridfsBucket.find({ filename }).toArray();
                        if (files.length > 0) {
                            await gridfsBucket.delete(files[0]._id);
                        }
                    } catch (gridfsError) {
                        console.error(`[GridFS Delete] Failed to delete image ${imageUrl} for report ${id}:`, gridfsError.message);
                    }
                }
            }

            await Report.findByIdAndDelete(id);
            await logActivity(req, req.userId, 'delete_report', { reportId: id });
            res.status(200).json({ message: 'تم حذف التقرير بنجاح.' });
        } catch (error) {
            console.error(`[DELETE /api/reports/${req.params.id}] Error:`, error.message);
            res.status(500).json({ message: 'Failed to delete report.' });
        }
    });

    router.delete('/:id/images', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { imageUrl } = req.body;

            if (!imageUrl) {
                return res.status(400).json({ message: 'Image URL is required.' });
            }

            const report = await Report.findById(id);
            if (!report) {
                return res.status(404).json({ message: 'Report not found.' });
            }

            const initialImageCount = report.image_urls.length;
            report.image_urls = report.image_urls.filter(url => url !== imageUrl);
            if (report.image_urls.length === initialImageCount) {
                return res.status(404).json({ message: 'Image URL not found in this report.' });
            }
            await report.save();

            try {
                const filename = path.basename(imageUrl);
                const files = await gridfsBucket.find({ filename }).toArray();
                if (files.length > 0) {
                    await gridfsBucket.delete(files[0]._id);
                }
            } catch (gridfsError) {
                console.error(`[GridFS Delete] Failed to delete image file ${imageUrl}:`, gridfsError.message);
            }

            await logActivity(req, req.userId, 'delete_report_image', { reportId: id, imageUrl });

            res.json({ message: 'تم حذف الصورة بنجاح.' });
        } catch (error) {
            console.error(`[DELETE /api/reports/${req.params.id}/images] Error:`, error.message);
            res.status(500).json({ message: 'Failed to delete image.' });
        }
    });

    router.post('/:id/resend-telegram', verifyToken, verifyAdmin, async (req, res) => {
        const { id } = req.params;
    
        try {
            const report = await Report.findById(id).populate('user_id', 'username');
            if (!report) {
                return res.status(404).json({ message: 'التقرير غير موجود.' });
            }
    
            const username = report.user_id ? report.user_id.username : 'مستخدم محذوف';
            const fullCaption = report.report_text;

            async function getBufferFromGridFS(relativeUrl) {
                const filename = path.basename(relativeUrl);
                return new Promise((resolve, reject) => {
                    const chunks = [];
                    const stream = gridfsBucket.openDownloadStreamByName(filename);
                    stream.on('data', (d) => chunks.push(d));
                    stream.on('error', (e) => reject(e));
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                });
            }

            try {
                if (report.image_urls && report.image_urls.length > 0) {
                    if (report.image_urls.length === 1) {
                        const buffer = await getBufferFromGridFS(report.image_urls[0]);
                        await telegramHelper.sendPhoto(config.CHAT_ID, { source: buffer }, { caption: fullCaption, parse_mode: 'HTML' });
                    } else {
                        const mediaGroup = [];
                        for (let i = 0; i < report.image_urls.length; i++) {
                            const buffer = await getBufferFromGridFS(report.image_urls[i]);
                            mediaGroup.push({
                                type: 'photo',
                                media: { source: buffer },
                                caption: i === 0 ? fullCaption : '',
                                parse_mode: 'HTML'
                            });
                        }
                        await telegramHelper.sendMediaGroup(config.CHAT_ID, mediaGroup);
                    }
                } else {
                    await telegramHelper.sendMessage(config.CHAT_ID, fullCaption, { parse_mode: 'HTML' });
                }

                const notificationMessage = `فشل إرسال تنبيه تليجرام للتقرير رقم ${report._id}`;
                await Notification.deleteMany({ message: notificationMessage });
                sendEventToAll('notification_deleted', { message: notificationMessage });

                report.telegram_failed = false;
                report.telegram_error_message = null;
                await report.save();

                await logActivity(req, req.userId, 'resend_telegram_success', { reportId: id });
                res.json({ message: 'تم إعادة إرسال التنبيه إلى تليجرام بنجاح.' });

            } catch (telegramError) {
                console.error('═══════════════════════════════════════════════════');
                console.error('[TELEGRAM RESEND ERROR] Report ID:', id);
                console.error('[TELEGRAM RESEND ERROR] Error Type:', telegramError.name);
                console.error('[TELEGRAM RESEND ERROR] Error Message:', telegramError.message);
                console.error('[TELEGRAM RESEND ERROR] Error Code:', telegramError.code);
                console.error('[TELEGRAM RESEND ERROR] Error Response:', JSON.stringify(telegramError.response, null, 2));
                console.error('[TELEGRAM RESEND ERROR] Stack Trace:', telegramError.stack);
                console.error('[TELEGRAM RESEND ERROR] Full Error Object:', JSON.stringify(telegramError, null, 2));
                console.error('[TELEGRAM RESEND ERROR] Report Text Length:', report.report_text?.length);
                console.error('[TELEGRAM RESEND ERROR] Number of Images:', report.image_urls?.length || 0);
                console.error('[TELEGRAM RESEND ERROR] Chat ID:', config.CHAT_ID);
                console.error('═══════════════════════════════════════════════════');
                
                report.telegram_failed = true;
                report.telegram_error_message = telegramError.response?.description || telegramError.message;
                await report.save();
                await logActivity(req, req.userId, 'resend_telegram_failed', { reportId: id, error: telegramError.message });
                res.status(500).json({ 
                    message: 'فشل إعادة إرسال التنبيه إلى تليجرام. تحقق من الإعدادات.',
                    error: telegramError.response?.description || telegramError.message 
                });
            }
    
        } catch (error) {
            console.error(`[POST /api/reports/${id}/resend-telegram] Error:`, error.message);
            res.status(500).json({ message: 'حدث خطأ عام أثناء محاولة إعادة الإرسال.' });
        }
    });

    return router;
}
