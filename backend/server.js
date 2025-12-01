const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken');
const { Telegraf } = require('telegraf');
require('dotenv').config({ quiet: true });



// External config and changelog
let config;
const changelog = require('./changelog.json');

// Check for configuration file
try {
    config = require('./config.json');
} catch (error) {
    console.error('---');
    console.error('FATAL ERROR: Configuration file `config.json` not found.');
    console.error('This file contains essential settings for the application to run.');
    console.error('Please run the `setup.bat` script in the main project folder to generate it.');
    console.error('---');
    process.exit(1);
}

// Build required keys dynamically; Telegram keys are required only if not disabled
const TELEGRAM_DISABLED = String(config.TELEGRAM_DISABLED || '').toLowerCase() === 'true';
const requiredConfigKeys = ['SERVER_URL', 'JWT_SECRET', 'MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'PORT']
    .concat(TELEGRAM_DISABLED ? [] : ['BOT_TOKEN', 'CHAT_ID']);
const missingKeys = requiredConfigKeys.filter(key => config[key] === undefined || config[key] === null || config[key] === '');

if (missingKeys.length > 0) {
    console.error('---');
    console.error('FATAL ERROR: Missing required configuration keys.');
    console.error(`The following keys are missing or empty in your config.json file: ${missingKeys.join(', ')}`);
    if (missingKeys.includes('SERVER_URL')) console.error('NOTE: SERVER_URL should be the public URL of the server, e.g., "http://192.168.1.10:3001" or your ngrok URL.');
    console.error('Please run `setup.bat` again to regenerate the configuration.');
    console.error('---');    
    process.exit(1);
}

// Initialize express app
const app = express();
const port = process.env.PORT || 3001;
let bot;
let gridfsBucket;
let upload;
let telegramHelper;

// Middlewares
const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Authorization', 
        'x-client-info', 
        'apikey', 
        'Content-Type',
        'ngrok-skip-browser-warning'
    ],
    optionsSuccessStatus: 200
};

app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Middleware to handle ngrok browser warning
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});









// Mongoose Models
const User = require('./models/user.model.js');
const Report = require('./models/report.model.js');
const Notification = require('./models/notification.model.js');
const Instruction = require('./models/instruction.model.js');
const Template = require('./models/template.model.js');
const ActivityLog = require('./models/activityLog.model.js');
const SpecialIdentifier = require('./models/specialIdentifier.model.js');
const TransferRule = require('./models/transferRule.model.js');
const Evaluation = require('./models/evaluation.model.js');
const WalletUsage = require('./models/walletUsage.model.js');

// Helper function for logging activities
const { logActivity } = require('./services/activity.service.js');
const createTelegramService = require('./services/telegram.service.js');

// Error Handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    }
    console.error('--- UNHANDLED ERROR ---');
    console.error(err.stack);
    if (!res.headersSent) {
        res.status(500).json({
            message: 'حدث خطأ غير متوقع في الخادم.',
            error: err.message
        });
    }
});

// Database connection and server startup
const isRestart = process.argv.includes('--restarted');

mongoose.connect(config.MONGODB_URI)
    .then(async () => {
        console.log('✓ MongoDB connected successfully.');

        // Initialize GridFS
        gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

        // Initialize Multer to use memory storage
        const storage = multer.memoryStorage();
        console.log('✓ Multer configured for memory storage.');
        
        upload = multer({
            storage,
            fileFilter: function (req, file, cb) {
                // Check the mimetype to ensure it's an image, which is more reliable than file extension
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    return cb(new Error('Only image files are allowed!'), false);
                }
            }
        });

        // Initialize Telegram (can be disabled for local setups)
        if (TELEGRAM_DISABLED) {
            console.warn('⚠ Telegram is disabled via configuration. Skipping bot initialization.');
            telegramHelper = {
                sendPhoto: async () => {},
                sendMediaGroup: async () => {},
                sendMessage: async () => {}
            };
        } else {
            bot = new Telegraf(config.BOT_TOKEN);
            const telegramRetryOptions = {
                maxAttempts: parseInt(process.env.TELEGRAM_MAX_ATTEMPTS ?? config.TELEGRAM_MAX_ATTEMPTS, 10) || 3,
                initialDelayMs: parseInt(process.env.TELEGRAM_INITIAL_DELAY_MS ?? config.TELEGRAM_INITIAL_DELAY_MS, 10) || 1200,
                maxDelayMs: parseInt(process.env.TELEGRAM_MAX_DELAY_MS ?? config.TELEGRAM_MAX_DELAY_MS, 10) || 5000,
                backoffFactor: parseFloat(process.env.TELEGRAM_BACKOFF_FACTOR ?? config.TELEGRAM_BACKOFF_FACTOR) || 1.75
            };
            telegramHelper = createTelegramService(bot, telegramRetryOptions);
        }

        // --- Moved imports ---
        const { sendEventToAll, sendEventToUser, getOnlineUsers } = require('./services/sse.service.js');
        const { verifyToken, verifyAdmin } = require('./middleware/auth.js')(config);
        const { handleUploadErrors } = require('./middleware/uploads.js');
        const { verifyTokenForSSE } = require('./middleware/sse.js')(config);
        // --- End moved imports ---

        // Ensure an admin user exists on first run
        async function ensureAdminUser() {
            try {
                const existingAdmin = await User.findOne({ role: 'admin' });
                const targetEmail = String(config.ADMIN_EMAIL || '').toLowerCase();
                if (existingAdmin) {
                    return; // Admin already present
                }

                // If a user with ADMIN_EMAIL exists, promote to admin
                if (targetEmail) {
                    const existingByEmail = await User.findOne({ email: targetEmail });
                    if (existingByEmail) {
                        existingByEmail.role = 'admin';
                        existingByEmail.is_active = true;
                        await existingByEmail.save();
                        console.log(`✓ Promoted existing user ${targetEmail} to admin.`);
                        return;
                    }
                }

                // Otherwise, create a new admin using config credentials
                const username = 'Admin';
                const email = targetEmail || 'admin@example.com';
                const rawPassword = String(config.ADMIN_PASSWORD || 'admin123');
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(rawPassword, salt);
                await User.create({
                    username,
                    email,
                    password: hash,
                    role: 'admin',
                    is_active: true
                });
                console.log(`✓ Created default admin user ${email}.`);
            } catch (e) {
                console.error('Failed to ensure admin user exists:', e.message);
            }
        }


        // Define routes
        await ensureAdminUser();
        function defineApiRoutes() {
            // Routes for additional tools
            const toolsRoutes = require('./routes/tools')(verifyToken);
            app.use('/api/tools', toolsRoutes);
            
            // Wallet usage routes
            const walletUsageRoutes = require('./routes/walletUsage.routes')(verifyToken);
            app.use('/api/wallet-usage', walletUsageRoutes);

            // Health check
            app.get('/api/health', (req, res) => {
                res.status(200).json({ status: 'ok', message: 'Server is healthy' });
            });

            // Endpoint to check the configured SERVER_URL
            app.get('/api/health/check-url', verifyToken, verifyAdmin, (req, res) => {
                res.json({ serverUrl: config.SERVER_URL });
            });

            // Token Verification API
            app.get('/api/verify-token', verifyToken, (req, res) => {
                // If the verifyToken middleware passes, the token is valid.
                res.status(200).json({ auth: true, message: 'Token is valid.' });
            });

            // User APIs
                        const authRoutes = require('./routes/auth.routes.js');
            app.use('/api/auth', authRoutes);

            // SSE Routes
            const sseRoutes = require('./routes/sse.routes.js')(config, verifyTokenForSSE);
            app.use('/api/events', sseRoutes);

            // Extracted handler for posting activity logs
            async function postActivityLogHandler(req, res) {
                const { action, details } = req.body;
                if (!action) {
                    return res.status(400).json({ message: 'Action is required.' });
                }
            
                try {
                    // The logActivity helper function already uses req.userId and req.ip
                    let finalDetails = details || {};
                    // For logout, ensure the email from the request body is included if available
                    if (action === 'logout' && details && details.email) {
                        finalDetails.email = details.email;
                    }
                    await logActivity(req, req.userId, action, finalDetails);
                    res.status(200).json({ message: 'Activity logged successfully.' });
                } catch (error) {
                    console.error('[POST /api/activity-logs] Error:', error.message);
                    res.status(500).json({ message: 'Failed to log activity.' });
                }
            }

            // Upload Routes
            const reportRoutes = require('./routes/report.routes.js')(verifyToken, verifyAdmin, handleUploadErrors, upload, telegramHelper, gridfsBucket, sendEventToAll, sendEventToUser, logActivity, config);
            app.use('/api/reports', reportRoutes);

            app.post('/api/users', verifyToken, verifyAdmin, handleUploadErrors(upload.single('avatar')), async (req, res) => {
                const { username, email, password, role } = req.body;
            
                if (!username || !email || !password) {
                    return res.status(400).json({ message: "اسم المستخدم، البريد الإلكتروني، وكلمة المرور مطلوبان." });
                }
                if (!/^\S+@\S+\.\S+$/.test(email)) {
                    return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
                }
                if (password.length < 6) {
                    return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
                }
            
                const allowedRoles = ['admin', 'editor', 'employee', 'shift-manager'];
                if (role && !allowedRoles.includes(role)) {
                    return res.status(400).json({ message: "الدور المحدد غير صالح." });
                }
            
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(password, salt);
            
                const newUserPayload = {
                    username,
                    email: email.toLowerCase(),
                    password: hash,
                    role: role || 'editor', // Default role
                    is_active: true
                };
            
                try {
                    const user = await User.create(newUserPayload);
                    const finalUserObject = user.toObject();
                    finalUserObject.id = finalUserObject._id.toString();

                    // If an avatar was uploaded, process and save it
                    if (req.file) {
                        const readableStream = require('stream').Readable.from(req.file.buffer);
                        const filename = `avatar_${user._id}_${Date.now()}${path.extname(req.file.originalname)}`;
                        
                        const uploadStream = gridfsBucket.openUploadStream(filename, {
                            contentType: req.file.mimetype
                        });

                        await new Promise((resolve, reject) => {
                            readableStream.pipe(uploadStream)
                                .on('error', (error) => reject(error))
                                .on('finish', () => resolve());
                        });

                        const newAvatarUrl = `/api/files/${filename}`;
                        user.avatar_url = newAvatarUrl;
                        await user.save();
                        finalUserObject.avatar_url = newAvatarUrl;
                    }

                    delete finalUserObject.password;

                    await logActivity(req, req.userId, 'create_user', { newUserId: user._id, newUserEmail: user.email });

                    const admin = await User.findOne({ role: 'admin' });
                    if (admin) {
                        await Notification.create({
                            user_id: admin._id,
                            message: `تم إنشاء مستخدم جديد: ${user.username}`,
                            link: '#users',
                            type: 'info',
                            icon: 'fa-user-plus'
                        });
                        sendEventToUser(admin._id, 'notification_created', {
                            message: `تم إنشاء مستخدم جديد: ${user.username}`,
                            link: '#users',
                            type: 'info',
                            icon: 'fa-user-plus'
                        });
                    }

                    sendEventToAll('user_created', { user: finalUserObject });
                    res.status(201).json({ message: "تم إنشاء المستخدم بنجاح.", data: finalUserObject });
                } catch (error) {
                    if (error.code === 11000) {
                        return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
                    }
                    console.error('[Create User] Error:', error.message);
                    res.status(500).json({ message: "حدث خطأ أثناء إنشاء المستخدم." });
                }
            });

            app.put('/api/users/:id', verifyToken, verifyAdmin, handleUploadErrors(upload.none()), async (req, res) => {
                const { id } = req.params;
                const { username, email, password, role } = req.body;
                let updateData = {};

                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({ message: "معرف المستخدم غير صالح." });
                }

                const userToUpdate = await User.findById(id);
                if (!userToUpdate) return res.status(404).json({ message: "المستخدم غير موجود." });

                if (username) updateData.username = username;

                if (email) {
                    if (!/^\S+@\S+\.\S+$/.test(email)) {
                        return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
                    }
                    updateData.email = email.toLowerCase();
                }

                if (role) {
                    const allowedRoles = ['admin', 'editor', 'employee', 'shift-manager'];
                    if (!allowedRoles.includes(role)) return res.status(400).json({ message: "الدور المحدد غير صالح." });
                    updateData.role = role;
                }

                if (password && typeof password === 'string' && password.length > 0) {
                    if (password.length < 6) return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync(password, salt);
                    updateData.password = hash;
                }

                if (Object.keys(updateData).length === 0) {
                    return res.status(400).json({ message: "لا توجد بيانات للتحديث." });
                }

                try {
                    const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
                    if (!updatedUser) return res.status(404).json({ message: "المستخدم غير موجود." });

                    const userObject = updatedUser.toObject();
                    delete userObject.password;
                    userObject.id = userObject._id.toString();

                    await logActivity(req, req.userId, 'update_user', { targetUserId: id, updatedFields: Object.keys(updateData) });
                    sendEventToAll('user_updated', { user: userObject });
                    res.json({ message: "تم تحديث بيانات المستخدم بنجاح.", data: userObject });
                } catch (error) {
                    if (error.code === 11000) return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
                    console.error('[Update User] Error:', error.message);
                    res.status(500).json({ message: "حدث خطأ أثناء تحديث المستخدم." });
                }
            });

            app.post('/api/users/:id/notify', verifyToken, verifyAdmin, async (req, res) => {
                const { id } = req.params;
                const { message } = req.body;

                if (!message) {
                    return res.status(400).json({ message: 'الرسالة مطلوبة.' });
                }

                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({ message: 'معرف المستخدم غير صالح.' });
                }

                try {
                    const user = await User.findById(id);
                    if (!user) {
                        return res.status(404).json({ message: 'المستخدم غير موجود.' });
                    }

                    const notificationForUser = {
                        user_id: id,
                        message: `رسالة من المسؤول: ${message}`,
                        link: '#',
                        type: 'info',
                        icon: 'fa-envelope'
                    };
                    const createdNotificationForUser = await Notification.create(notificationForUser);
                    sendEventToUser(id, 'notification_created', createdNotificationForUser);

                    // Also create a notification for the admin who sent it
                    const adminId = req.userId;
                    if (adminId.toString() !== id.toString()) {
                        const notificationForAdmin = {
                            user_id: adminId,
                            message: `لقد أرسلت رسالة إلى "${user.username}": ${message}`,
                            link: '#',
                            type: 'info',
                            icon: 'fa-paper-plane'
                        };
                        const createdNotificationForAdmin = await Notification.create(notificationForAdmin);
                        sendEventToUser(adminId, 'notification_created', createdNotificationForAdmin);
                    }

                    await logActivity(req, req.userId, 'send_notification', { targetUserId: id, message });

                    // Send a more specific success message
                    if (adminId.toString() === id.toString()) {
                        res.status(200).json({ message: 'تم إرسال الإشعار لنفسك بنجاح.' });
                    } else {
                        res.status(200).json({ message: `تم إرسال الإشعار إلى ${user.username} بنجاح.` });
                    }
                } catch (error) {
                    console.error('[Notify User] Error:', error.message);
                    res.status(500).json({ message: 'فشل إرسال الإشعار.' });
                }
            });

            // Non-Upload Routes
            app.get('/api/profile', verifyToken, async (req, res) => {
                try {
                    const user = await User.findById(req.userId).select('-password').lean();
                    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود.' });
                    res.json({ data: user });
                } catch (error) {
                    console.error('[Profile] Error:', error.message);
                    res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات الملف الشخصي.' });
                }
            });

            app.post('/api/profile/avatar', verifyToken, handleUploadErrors(upload.single('avatar')), async (req, res) => {
                const userId = req.userId;
                if (!req.file) {
                    return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
                }
            
                try {
                    const user = await User.findById(userId);
                    if (!user) {
                        return res.status(404).json({ message: 'المستخدم غير موجود.' });
                    }
            
                    // Delete old avatar from GridFS if it exists
                    if (user.avatar_url) {
                        try {
                            const oldFilename = path.basename(user.avatar_url);
                            const files = await gridfsBucket.find({ filename: oldFilename }).toArray();
                            if (files.length > 0) {
                                await gridfsBucket.delete(files[0]._id);
                            }
                        } catch (gridfsError) {
                            console.error(`[GridFS Delete] Failed to delete old avatar ${user.avatar_url} for user ${userId}:`, gridfsError.message);
                        }
                    }
            
                    // Upload new avatar to GridFS
                    const readableStream = require('stream').Readable.from(req.file.buffer);
                    const filename = `avatar_${userId}_${Date.now()}${path.extname(req.file.originalname)}`;
                    
                    const uploadStream = gridfsBucket.openUploadStream(filename, {
                        contentType: req.file.mimetype
                    });
            
                    await new Promise((resolve, reject) => {
                        readableStream.pipe(uploadStream)
                            .on('error', (error) => reject(error))
                            .on('finish', () => resolve());
                    });
            
                    const newAvatarUrl = `/api/files/${filename}`;
                    user.avatar_url = newAvatarUrl;
                    await user.save();
            
                    await logActivity(req, userId, 'update_own_avatar');
                    res.json({ message: 'تم تحديث الصورة الشخصية بنجاح.', avatar_url: newAvatarUrl });
                } catch (error) {
                    console.error(`[POST /api/profile/avatar] Error:`, error.message);
                    res.status(500).json({ message: 'فشل تحديث الصورة الشخصية.' });
                }
            });

            app.get('/api/stats', verifyToken, async (req, res) => {
                const isUserScope = req.query.scope === 'user';
                const userId = req.userId;
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                try {
                    const query = isUserScope ? { user_id: userId } : {};
                    const todayQuery = isUserScope ? { user_id: userId, timestamp: { $gte: today } } : { timestamp: { $gte: today } };

                    const [
                        total,
                        reports_today,
                        suspicious,
                        deposit,
                        new_positions,
                        credit_out,
                        account_transfer,
                        payouts,
                        profit_watching,
                        same_price_sl
                    ] = await Promise.all([
                        Report.countDocuments(query),
                        Report.countDocuments(todayQuery),
                        Report.countDocuments({ ...query, type: 'suspicious' }),
                        Report.countDocuments({ ...query, type: 'deposit_percentages' }),
                        Report.countDocuments({ ...query, type: 'new-positions' }),
                        Report.countDocuments({ ...query, type: 'credit-out' }),
                        Report.countDocuments({ ...query, type: 'account_transfer' }),
                        Report.countDocuments({ ...query, type: 'payouts' }),
                        Report.countDocuments({ ...query, type: 'profit_watching' }),
                        Report.countDocuments({ ...query, type: 'same_price_sl' })
                    ]);

                    res.json({
                        data: {
                            total,
                            reports_today,
                            suspicious,
                            deposit,
                            new_positions,
                            credit_out,
                            account_transfer,
                            payouts,
                            profit_watching,
                            same_price_sl
                        }
                    });
                } catch (error) {
                    console.error('[Stats] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch stats' });
                }
            });

            app.get('/api/stats/top-contributor', verifyToken, async (req, res) => {
                const isUserScope = req.query.scope === 'user';
                const userId = req.userId;

                try {
                    if (isUserScope) {
                        // Ensure avatar_url is selected
                        const user = await User.findById(userId).select('username avatar_url').lean();
                        if (!user) return res.status(404).json({ message: 'User not found' });
                        const report_count = await Report.countDocuments({ user_id: userId });
                        res.json({
                            data: {
                                is_self: true,
                                username: user.username,
                                avatar_url: user.avatar_url, // Make sure this is being sent
                                report_count
                            }
                        });
                    } else {
                        const topContributors = await Report.aggregate([
                            { $group: { _id: '$user_id', report_count: { $sum: 1 } } },
                            { $sort: { report_count: -1 } },
                            { $limit: 3 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { _id: 0, username: '$user.username', report_count: 1, avatar_url: '$user.avatar_url' } }
]);
res.json({ data: topContributors });
                    }
                } catch (error) {
                    console.error('[Top Contributor] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch top contributor' });
                }
            });

            app.get('/api/stats/weekly', verifyToken, async (req, res) => {
                const isUserScope = req.query.scope === 'user';
                const userId = req.userId;
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

                try {
                    const matchStage = isUserScope ? 
                        { $match: { user_id: new mongoose.Types.ObjectId(userId), timestamp: { $gte: twentyFourHoursAgo } } } :
                        { $match: { timestamp: { $gte: twentyFourHoursAgo } } };

                    const weeklyData = await Report.aggregate([
                        matchStage,
                        { $group: { _id: { $dateToString: { format: "%Y-%m-%dT%H:00:00.000Z", date: "$timestamp" } }, count: { $sum: 1 } } },
                        { $project: { _id: 0, hour_timestamp: '$_id', count: '$count' } },
                        { $sort: { hour_timestamp: 1 } }
                    ]);
                    res.json({ data: weeklyData });
                } catch (error) {
                    console.error('[Weekly Stats] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch weekly stats' });
                }
            });

            app.get('/api/analytics', verifyToken, async (req, res) => {
                const { range, scope } = req.query;
                const userId = req.userId;
                const isAdmin = req.userRole === 'admin';

                let dateFilter = {};
                if (range && range !== 'all') {
                    const days = parseInt(range.replace('last', ''));
                    if (!isNaN(days)) {
                        const date = new Date(); // NOSONAR
                        date.setDate(date.getDate() - days);
                        dateFilter = { timestamp: { $gte: date } };
                    }
                }

                const userFilter = (scope === 'user' && !isAdmin) ? { user_id: new mongoose.Types.ObjectId(userId) } : {};
                const matchStage = { $match: { ...dateFilter, ...userFilter } };

                try {
                    const [report_types, peak_hours, country_stats, top_ips, employee_performance] = await Promise.all([
                        // Report Types
                        Report.aggregate([
                            matchStage,
                            { $group: { _id: '$type', report_count: { $sum: 1 } } },
                            { $project: { _id: 0, type: '$_id', report_count: 1 } },
                            { $sort: { report_count: -1 } }
                        ]),
                        // Peak Hours
                        Report.aggregate([
                            matchStage,
                            { $project: { hour: { $hour: { date: '$timestamp', timezone: 'UTC' } } } },
                            { $group: { _id: '$hour', report_count: { $sum: 1 } } },
                            { $project: { _id: 0, hour: '$_id', report_count: '$report_count' } },
                            { $sort: { hour: 1 } }
                        ]),
                        // Country Stats
                        Report.aggregate([
                            matchStage,
                            {
                                $addFields: {
                                    country: {
                                        $let: {
                                            vars: { // The regex was incorrect, it should look for <code>...</code>
                                                match: { $regexFind: { input: '$report_text', regex: /ip country:.*?<code>(.*?)<\/code>/i } }
                                            }, // Corrected regex
                                            in: { $arrayElemAt: ['$$match.captures', 0] }
                                        }
                                    }
                                }
                            },
                            { $match: { country: { $ne: null } } },
                            { $group: { _id: '$country', report_count: { $sum: 1 } } },
                            { $project: { _id: 0, country: '$_id', report_count: 1 } },
                            { $sort: { report_count: -1 } },
                            { $limit: 10 }
                        ]),
                        // Top IPs
                        Report.aggregate([
                            matchStage,
                            {
                                $addFields: {
                                    ip: {
                                        $let: {
                                            vars: { match: { $regexFind: { input: '$report_text', regex: /IP: <code>(.*?)<\/code>/i } } },
                                            in: { $arrayElemAt: ['$$match.captures', 0] }
                                        }
                                    }
                                }
                            },
                            { $match: { ip: { $ne: null } } },
                            { $group: { _id: '$ip', report_count: { $sum: 1 } } },
                            { $project: { _id: 0, ip: '$_id', report_count: 1 } },
                            { $sort: { report_count: -1 } },
                            { $limit: 10 }
                        ]),
                        // Employee Performance (if admin)
                        isAdmin ? Report.aggregate([
                            { $match: { ...dateFilter } }, // Admin sees all users for the date range
                            { $group: { _id: '$user_id', report_count: { $sum: 1 } } },
                            { $sort: { report_count: -1 } },
                            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                            { $unwind: '$user' },
                            { $project: { _id: 0, username: '$user.username', report_count: 1 } }
                        ]) : Promise.resolve([])
                    ]);

                    res.json({ // NOSONAR
                        data: {
                            report_types,
                            peak_hours,
                            country_stats,
                            top_ips,
                            employee_performance,
                        }
                    });

                } catch (error) {
                    console.error('[Analytics] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch analytics data' });
                }
            });



            app.get('/api/notifications', verifyToken, async (req, res) => {
                try {
                    const page = parseInt(req.query.page) || 1;
                    const limit = parseInt(req.query.limit) || 10;
                    const skip = (page - 1) * limit;

                    let query = {};
                    // If the user is an admin and wants to see all notifications, the query is empty.
                    // Otherwise, scope to the current user.
                    if (!(req.userRole === 'admin' && req.query.all === 'true')) {
                        query.user_id = req.userId;
                    }

                    const total = await Notification.countDocuments(query);
                    const notifications = await Notification.find(query)
                        .sort({ created_at: -1 })
                        .skip(skip)
                        .limit(limit)
                        .lean();

                    const unreadCount = await Notification.countDocuments({ ...query, is_read: false });

                    res.json({ 
                        data: notifications, 
                        unreadCount,
                        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
                    });
                } catch (error) {
                    console.error('[Notifications] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch notifications' });
                }
            });

            app.post('/api/notifications/:id/like', verifyToken, async (req, res) => {
                try {
                    const notificationId = req.params.id;
                    const userId = req.userId;
            
                    const notification = await Notification.findById(notificationId);
                    if (!notification) {
                        return res.status(404).json({ message: 'الإشعار غير موجود.' });
                    }
            
                    // Add user to likes if not already present, and get the updated notification
                    const updatedNotification = await Notification.findByIdAndUpdate(
                        notificationId,
                        { $addToSet: { likes: userId } },
                        { new: true }
                    ).populate('likes', 'username');
            
                    // Notify admin
                    const admin = await User.findOne({ role: 'admin' });
                    if (admin && admin._id.toString() !== userId.toString()) {
                        const likeNotification = {
                            user_id: admin._id,
                            message: `قرأ "${req.username}" الإشعار: "${notification.message.substring(0, 50)}..."`,
                            link: '#notifications',
                            type: 'like',
                            icon: 'fa-heart'
                        };
                        await Notification.create(likeNotification);
                        sendEventToUser(admin._id.toString(), 'notification_created', likeNotification);
                    }
            
                    res.json({ message: 'تم تسجيل الإعجاب.', data: updatedNotification });
                } catch (error) {
                    console.error('[Like Notification] Error:', error.message);
                    res.status(500).json({ message: 'فشل تسجيل الإعجاب.' });
                }
            });

            // Instruction APIs
            const instructionRoutes = require('./routes/instruction.routes.js')(verifyToken, verifyAdmin);
            app.use('/api/instructions', instructionRoutes);



            app.post('/api/users/:id/avatar', verifyToken, verifyAdmin, handleUploadErrors(upload.single('avatar')), async (req, res) => {
                const { id } = req.params;
                if (!req.file) {
                    return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
                }
            
                try {
                    const user = await User.findById(id);
                    if (!user) {
                        return res.status(404).json({ message: 'المستخدم غير موجود.' });
                    }
            
                    // Delete old avatar from GridFS if it exists
                    if (user.avatar_url) {
                        try {
                            const oldFilename = path.basename(user.avatar_url);
                            const files = await gridfsBucket.find({ filename: oldFilename }).toArray();
                            if (files.length > 0) {
                                await gridfsBucket.delete(files[0]._id);
                            }
                        } catch (gridfsError) {
                            console.error(`[GridFS Delete] Failed to delete old avatar ${user.avatar_url} for user ${id}:`, gridfsError.message);
                        }
                    }
            
                    // Upload new avatar to GridFS
                    const readableStream = require('stream').Readable.from(req.file.buffer);
                    const filename = `avatar_${id}_${Date.now()}${path.extname(req.file.originalname)}`;
                    
                    const uploadStream = gridfsBucket.openUploadStream(filename, {
                        contentType: req.file.mimetype
                    });
            
                    await new Promise((resolve, reject) => {
                        readableStream.pipe(uploadStream)
                            .on('error', (error) => reject(error))
                            .on('finish', () => resolve());
                    });
            
                    const newAvatarUrl = `/api/files/${filename}`;
                    user.avatar_url = newAvatarUrl;
                    await user.save();
            
                    await logActivity(req, req.userId, 'update_user_avatar', { targetUserId: id });
            
                    const userObject = user.toObject();
                    delete userObject.password;
                    // Ensure the 'id' field is present for the frontend
                    userObject.id = userObject._id.toString();
            
                    sendEventToAll('user_updated', { user: userObject });
                    res.json({ message: 'تم تحديث الصورة الشخصية بنجاح.', data: userObject });
                } catch (error) {
                    console.error(`[POST /api/users/${id}/avatar] Error:`, error.message);
                    res.status(500).json({ message: 'فشل تحديث الصورة الشخصية.' });
                }
            });
            // User Management APIs
            app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const users = await User.find({ is_active: true }).select('-password').lean();
                    res.json({ data: users });
                } catch (error) {
                    console.error('[Users] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch users' });
                }
            });

            app.get('/api/users/role/:role', verifyToken, async (req, res) => {
                try {
                    const users = await User.find({ role: req.params.role, is_active: true }).select('username _id').lean();
                    res.json({ data: users });
                } catch (error) {
                    console.error('[Users by Role] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch users by role' });
                }
            });

            app.get('/api/users/online-status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().select('_id username').lean();
        const usersMap = users.reduce((acc, user) => {
            acc[user._id.toString()] = user.username;
            return acc;
        }, {});
        const onlineUsers = getOnlineUsers();
        const onlineUsersStrKeys = Object.fromEntries(
            Object.entries(onlineUsers).map(([key, value]) => [String(key), value])
        );
        res.json({ data: { onlineUsers: onlineUsersStrKeys, users: usersMap } });
    } catch (error) {
        console.error('[Online Status] Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch users online status' });
    }
});

            app.delete('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const userId = req.params.id;
                    const user = await User.findById(userId);
            
                    if (!user) {
                        return res.status(404).json({ message: 'User not found' });
                    }
            
                    // Hard-delete the user from the database
                    await User.findByIdAndDelete(userId);
            
                    await logActivity(req, req.userId, 'delete_user', { targetUserId: userId });
                    
                    // Notify all clients to remove the user from their views
                    sendEventToAll('user_deleted', { userId: userId });
            
                    res.json({ message: 'تم حذف المستخدم وبياناته بشكل دائم.' });
            
                } catch (error) {
                    console.error('[Delete User] Error:', error.message);
                    res.status(500).json({ message: 'فشل حذف المستخدم.' });
                }
            });

            // Notification APIs
            app.post('/api/notifications/mark-read', verifyToken, async (req, res) => {
                try {
                    await Notification.updateMany({ user_id: req.userId, is_read: false }, { is_read: true });
                    await logActivity(req, req.userId, 'mark_notifications_read');
                    res.json({ message: 'All notifications marked as read' });
                } catch (error) {
                    console.error('[Mark Notifications] Error:', error.message);
                    res.status(500).json({ message: 'Failed to mark notifications as read' });
                }
            });

            app.post('/api/broadcast', verifyToken, verifyAdmin, async (req, res) => {
                const { message, link, type, icon } = req.body;
                if (!message) return res.status(400).json({ message: 'Message is required' });

                try {
                    const users = await User.find({ is_active: true }).select('_id');
                    const notifications = users.map(user => ({
                        user_id: user._id,
                        message,
                        link: link || '#',
                        type: type || 'info',
                        icon: icon || 'fa-bullhorn'
                    }));
                    const createdNotifications = await Notification.insertMany(notifications);

                    await logActivity(req, req.userId, 'broadcast', { message, userCount: users.length });
                    
                    // Send a specific event to each user with their own notification object
                    createdNotifications.forEach(notification => {
                        sendEventToUser(notification.user_id, 'notification_created', notification);
                    });
                    res.status(200).json({ message: 'تم إرسال الإشعار العام بنجاح.' });
                } catch (error) {
                    console.error('[Broadcast] Error:', error.message);
                    res.status(500).json({ message: 'Failed to send broadcast' });
                }
            });

            app.post('/api/broadcast/custom', verifyToken, verifyAdmin, async (req, res) => {
                const { message, target, userId } = req.body;

                if (!message) {
                    return res.status(400).json({ message: 'الرسالة مطلوبة.' });
                }

                try {
                    if (target === 'specific' && userId) {
                        // Send to a specific user
                        if (!mongoose.Types.ObjectId.isValid(userId)) {
                            return res.status(400).json({ message: 'معرف المستخدم غير صالح.' });
                        }
                        const user = await User.findById(userId);
                        if (!user) {
                            return res.status(404).json({ message: 'المستخدم غير موجود.' });
                        }

                        const notification = {
                            user_id: userId,
                            message: `رسالة من المسؤول: ${message}`,
                            link: '#',
                            type: 'info',
                            icon: 'fa-envelope'
                        };

                        await Notification.create(notification);
                        sendEventToUser(userId, 'notification_created', notification);
                        await logActivity(req, req.userId, 'send_specific_notification', { targetUserId: userId, message });
                        res.status(200).json({ message: `تم إرسال الإشعار إلى ${user.username} بنجاح.` });

                    } else {
                        // Send to all users
                        const users = await User.find({ is_active: true }).select('_id');
                        const notifications = users.map(user => ({
                            user_id: user._id,
                            message,
                            link: '#',
                            type: 'info',
                            icon: 'fa-bullhorn'
                        }));
                        if (notifications.length > 0) {
                            await Notification.insertMany(notifications);
                        }
                        sendEventToAll('notification_created', { message, link: '#', type: 'info', icon: 'fa-bullhorn' });
                        await logActivity(req, req.userId, 'broadcast', { message, userCount: users.length });
                        res.status(200).json({ message: 'تم إرسال الإشعار إلى جميع الموظفين بنجاح.' });
                    }
                } catch (error) {
                    console.error('[Broadcast Custom] Error:', error.message);
                    res.status(500).json({ message: 'فشل إرسال الإشعار.' });
                }
            });

            // Template APIs
            const templateRoutes = require('./routes/template.routes.js')(verifyToken);
            app.use('/api/templates', templateRoutes);

            // Legacy singular route for activity log (POST)
            app.post('/api/activity-log', verifyToken, (req, res) => {
                console.warn(`[Deprecation] Received POST on singular /api/activity-log. Please update client-side code.`);
                postActivityLogHandler(req, res);
            });

            // Standard plural route for activity log (POST)
            app.post('/api/activity-logs', verifyToken, postActivityLogHandler);

            // Activity Log API (GET)
            app.get('/api/activity-logs', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const page = parseInt(req.query.page) || 1;
                    const limit = parseInt(req.query.limit) || 25;
                    const skip = (page - 1) * limit;
                    const { search, userId, action } = req.query;

                    let query = {};

                    if (userId && userId !== 'all') {
                        query.user_id = new mongoose.Types.ObjectId(userId);
                    }

                    if (action && action !== 'all') {
                        query.action = action;
                    }

                    if (search) {
                        // A simple search on action and ip_address. For details, a more complex setup is needed.
                        query.$or = [
                            { action: { $regex: search, $options: 'i' } },
                            { ip_address: { $regex: search, $options: 'i' } }
                        ];
                    }

                    const logs = await ActivityLog.find(query)
                        .populate('user_id', 'username email')
                        .sort({ created_at: -1 })
                        .skip(skip)
                        .limit(limit)
                        .lean();

                    const total = await ActivityLog.countDocuments(query);

                    res.json({
                        data: {
                            logs,
                            pagination: {
                                total,
                                page,
                                pages: Math.ceil(total / limit)
                            }
                        }
                    });
                } catch (error) {
                    console.error('[Activity Log] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch activity logs' });
                }
            });

            app.delete('/api/activity-logs', verifyToken, verifyAdmin, async (req, res) => {
                const { ids } = req.body;
            
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    return res.status(400).json({ message: 'مطلوب مصفوفة من المعرفات للحذف.' });
                }
            
                try {
                    const result = await ActivityLog.deleteMany({ _id: { $in: ids } });
            
                    if (result.deletedCount === 0) {
                        return res.status(404).json({ message: 'لم يتم العثور على أي سجلات للحذف.' });
                    }
            
                    res.json({ message: `تم حذف ${result.deletedCount} سجل بنجاح.` });
                } catch (error) {
                    console.error('[Delete Activity Logs] Error:', error.message);
                    res.status(500).json({ message: 'فشل حذف السجلات.' });
                }
            });

            // Tour Completion API
            app.post('/api/profile/complete-tour', verifyToken, async (req, res) => {
                try {
                    await User.findByIdAndUpdate(req.userId, { has_completed_tour: true });
                    await logActivity(req, req.userId, 'complete_tour');
                    res.json({ message: 'Tour status updated successfully.' });
                } catch (error) {
                    console.error('[Complete Tour] Error:', error.message);
                    res.status(500).json({ message: 'Failed to update tour status.' });
                }
            });

            app.get('/api/special-identifiers', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const identifiers = await SpecialIdentifier.find().sort({ created_at: -1 }).lean();
                    res.json({ data: identifiers });
                } catch (error) {
                    console.error('[GET /api/special-identifiers] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch special identifiers.' });
                }
            });

            // Special Identifiers API - Public list for all authenticated users
            app.get('/api/special-identifiers/list', verifyToken, async (req, res) => {
                try {
                    const identifiers = await SpecialIdentifier.find().lean();
                    res.json({ data: identifiers });
                } catch (error) {
                    console.error('[GET /api/special-identifiers/list] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch special identifiers.' });
                }
            });

            app.post('/api/special-identifiers', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const { identifier, type, message } = req.body;
                    if (!identifier || !type || !message) {
                        return res.status(400).json({ message: 'Identifier, type, and message are required.' });
                    }
            
                    const newIdentifier = await SpecialIdentifier.create({
                        identifier: identifier.trim().toLowerCase(),
                        type,
                        message
                    });
            
                    // Notify all users about the new special identifier
                    try {
                        const users = await User.find({ is_active: true }).select('_id');
                        const notificationMessage = `تم إضافة تبليغ خاص جديد: ${newIdentifier.identifier}`;
                        const notifications = users.map(user => ({
                            user_id: user._id,
                            message: notificationMessage,
                            link: '#instructions',
                            type: 'warning',
                            icon: 'fa-bullhorn'
                        }));
                        
                        if (notifications.length > 0) {
                            await Notification.insertMany(notifications);
                        }
                        sendEventToAll('notification_created', { message: notificationMessage, link: '#instructions', type: 'warning', icon: 'fa-bullhorn' });
                    } catch (notificationError) {
                        console.error('[Create Special Identifier] Failed to send notification:', notificationError.message);
                    }

                    await logActivity(req, req.userId, 'create_special_identifier', { identifierId: newIdentifier._id });
                    sendEventToAll('special_identifier_updated', { identifier: newIdentifier });
            
                    res.status(201).json({ message: 'تمت إضافة التبليغ الخاص بنجاح.', data: newIdentifier });
                } catch (error) {
                    if (error.code === 11000) {
                        return res.status(409).json({ message: 'This identifier already exists.' });
                    }
                    console.error('[POST /api/special-identifiers] Error:', error.message);
                    res.status(500).json({ message: 'Failed to create special identifier.' });
                }
            });

            app.delete('/api/special-identifiers/:id', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const { id } = req.params;
                    const deleted = await SpecialIdentifier.findByIdAndDelete(id);
                    if (!deleted) {
                        return res.status(404).json({ message: 'Identifier not found.' });
                    }
                    await logActivity(req, req.userId, 'delete_special_identifier', { identifierId: id });

                    // Notify all users about the deletion
                    try {
                        const users = await User.find({ is_active: true }).select('_id');
                        const notificationMessage = `تم حذف تبليغ خاص: ${deleted.identifier}`;
                        const notifications = users.map(user => ({
                            user_id: user._id,
                            message: notificationMessage,
                            link: '#instructions',
                            type: 'info',
                            icon: 'fa-trash-alt'
                        }));
                        if (notifications.length > 0) {
                            await Notification.insertMany(notifications);
                        }
                        sendEventToAll('notification_created', { message: notificationMessage, link: '#instructions', type: 'info', icon: 'fa-trash-alt' });
                    } catch (notificationError) {
                        console.error('[Delete Special Identifier] Failed to send notification:', notificationError.message);
                    }

                    sendEventToAll('special_identifier_updated', { deletedId: id });
                    res.status(200).json({ message: 'تم حذف التبليغ الخاص بنجاح.' });
                } catch (error) {
                    console.error(`[DELETE /api/special-identifiers/${req.params.id}] Error:`, error.message);
                    res.status(500).json({ message: 'Failed to delete identifier.' });
                }
            });

            // Transfer Rules API
            app.get('/api/transfer-rules', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const rules = await TransferRule.find().sort({ name: 1 }).lean();
                    res.json({ data: rules });
                } catch (error) {
                    console.error('[GET /api/transfer-rules] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch transfer rules.' });
                }
            });

            // Transfer Rules Guide API (for all users)
            app.get('/api/transfer-rules/guide', verifyToken, async (req, res) => {
                try {
                    const rules = await TransferRule.find({ isEnabled: true }).sort({ name: 1 }).lean();
                    res.json({ data: rules });
                } catch (error) {
                    console.error('[GET /api/transfer-rules/guide] Error:', error.message);
                    res.status(500).json({ message: 'Failed to fetch transfer rules guide.' });
                }
            });

            app.get('/api/transfer-rules/group/:fromGroup', verifyToken, async (req, res) => {
                try {
                    const { fromGroup } = req.params;
                    const rules = await TransferRule.find({ fromGroup: fromGroup, isEnabled: true }).lean();
                    res.json({ data: rules });
                } catch (error) {
                    console.error(`[GET /api/transfer-rules/group/${req.params.fromGroup}] Error:`, error.message);
                    res.status(500).json({ message: 'Failed to fetch transfer rules for the group.' });
                }
            });

            app.post('/api/transfer-rules', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const { name, description, fromGroup, toGroup, conditions, isEnabled } = req.body;
                    if (!name || !description || !fromGroup || !toGroup || !conditions) {
                        return res.status(400).json({ message: 'All fields are required.' });
                    }
                    const newRule = await TransferRule.create({ name, description, fromGroup, toGroup, conditions, isEnabled });
                    await logActivity(req, req.userId, 'create_transfer_rule', { ruleId: newRule._id });
                    res.status(201).json({ message: 'Transfer rule created successfully.', data: newRule });
                } catch (error) {
                    console.error('[POST /api/transfer-rules] Error:', error.message);
                    res.status(500).json({ message: 'Failed to create transfer rule.' });
                }
            });

            app.put('/api/transfer-rules/:id', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const { id } = req.params;
                    const { name, description, fromGroup, toGroup, conditions, isEnabled } = req.body;
                    if (!name || !description || !fromGroup || !toGroup || !conditions) {
                        return res.status(400).json({ message: 'All fields are required.' });
                    }
                    const updatedRule = await TransferRule.findByIdAndUpdate(id, { name, description, fromGroup, toGroup, conditions, isEnabled }, { new: true });
                    if (!updatedRule) return res.status(404).json({ message: 'Transfer rule not found.' });
                    await logActivity(req, req.userId, 'update_transfer_rule', { ruleId: id });
                    res.json({ message: 'Transfer rule updated successfully.', data: updatedRule });
                } catch (error) {
                    console.error(`[PUT /api/transfer-rules/${req.params.id}] Error:`, error.message);
                    res.status(500).json({ message: 'Failed to update transfer rule.' });
                }
            });

            app.delete('/api/transfer-rules/:id', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const { id } = req.params;
                    const deleted = await TransferRule.findByIdAndDelete(id);
                    if (!deleted) return res.status(404).json({ message: 'Transfer rule not found.' });
                    await logActivity(req, req.userId, 'delete_transfer_rule', { ruleId: id });
                    res.status(200).json({ message: 'Transfer rule deleted successfully.' });
                } catch (error) {
                    console.error(`[DELETE /api/transfer-rules/${req.params.id}] Error:`, error.message);
                    res.status(500).json({ message: 'Failed to delete transfer rule.' });
                }
            });

            // Evaluation APIs
            app.post('/api/evaluations', verifyToken, upload.none(), async (req, res) => {
                if (req.userRole !== 'admin' && req.userRole !== 'shift-manager') {
                    return res.status(403).json({ message: "صلاحية الوصول مرفوضة." });
                }
                const { employeeId, clientEmail, clientAccountNumber, errorLevel, actionTaken, mistake, details } = req.body;

                if (!employeeId || !errorLevel || !actionTaken || !mistake || !details) {
                    return res.status(400).json({ message: 'يرجى ملء جميع الحقول المطلوبة.' });
                }

                try {
                    const newEvaluation = await Evaluation.create({
                        employeeId,
                        shiftManagerId: req.userId,
                        clientEmail,
                        clientAccountNumber,
                        errorLevel,
                        actionTaken,
                        mistake,
                        details,
                        image_urls: []
                    });

                    // Notify admin
                    const admin = await User.findOne({ role: 'admin' });
                    if (admin) {
                        const employee = await User.findById(employeeId);
                        const shiftManager = await User.findById(req.userId);
                        const notificationMessage = `قام "${shiftManager.username}" بتسجيل تقييم جديد للموظف "${employee.username}".`;
                        const newNotification = {
                            user_id: admin._id,
                            message: notificationMessage,
                            link: '#evaluations',
                            type: 'info',
                            icon: 'fa-clipboard-check'
                        };
                        await Notification.create(newNotification);
                        sendEventToUser(admin._id, 'notification_created', newNotification);
                    }

                    res.status(201).json({ message: 'تم تسجيل التقييم بنجاح.', data: newEvaluation });
                } catch (error) {
                    console.error('[Create Evaluation] Error:', error.message);
                    res.status(500).json({ message: 'حدث خطأ أثناء تسجيل التقييم.' });
                }
            });

            app.get('/api/evaluations', verifyToken, async (req, res) => {
                if (req.userRole !== 'admin' && req.userRole !== 'shift-manager') {
                    return res.status(403).json({ message: "صلاحية الوصول مرفوضة." });
                }
                try {
                    const evaluations = await Evaluation.find()
                        .populate('employeeId', 'username')
                        .populate('shiftManagerId', 'username')
                        .select('-__v')
                        .sort({ date: -1 });
                    res.json({ data: evaluations });
                } catch (error) {
                    console.error('[Get Evaluations] Error:', error.message);
                    res.status(500).json({ message: 'فشل في جلب التقييمات.' });
                }
            });

            app.delete('/api/evaluations/:id', verifyToken, async (req, res) => {
                if (req.userRole !== 'admin' && req.userRole !== 'shift-manager') {
                    return res.status(403).json({ message: "صلاحية الوصول مرفوضة." });
                }
                try {
                    const evaluation = await Evaluation.findById(req.params.id);
                    if (!evaluation) {
                        return res.status(404).json({ message: 'Evaluation not found' });
                    }

                    await Evaluation.findByIdAndDelete(req.params.id);
                    await logActivity(req, req.userId, 'delete_evaluation', { evaluationId: req.params.id });
                    res.status(200).json({ message: 'تم حذف التقييم بنجاح.' });
                } catch (error) {
                    console.error('[Delete Evaluation] Error:', error.message);
                    res.status(500).json({ message: 'Failed to delete evaluation' });
                }
            });
        }

        app.post('/api/broadcast/gold-market-close-with-image', verifyToken, verifyAdmin, handleUploadErrors(upload.single('image')), async (req, res) => {
            if (!req.file) {
                return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
            }

            try {
                // Manual upload logic
                const readableStream = require('stream').Readable.from(req.file.buffer);
                const filename = `broadcast_${Date.now()}${path.extname(req.file.originalname)}`;
                
                const uploadStream = gridfsBucket.openUploadStream(filename, {
                    contentType: req.file.mimetype
                });

                await new Promise((resolve, reject) => {
                    readableStream.pipe(uploadStream)
                        .on('error', (error) => reject(error))
                        .on('finish', () => resolve());
                });

                const imageUrl = `/api/files/${filename}`;
                const caption = `😱😱😱الذهببببببببب ( اغلاق السوق )😱😱😱\n@ahmedelgma\n@batoulhassan`;

                // Send the image buffer directly to Telegram asynchronously to avoid blocking the response
                (async () => {
                    try {
                        await telegramHelper.sendPhoto(config.CHAT_ID, { source: req.file.buffer }, {
                            caption: caption
                        });
                    } catch (telegramError) {
                        console.error('[Gold Market Broadcast Telegram] Error:', telegramError.message);
                        // Optionally, create a notification for failure
                        const admin = await User.findOne({ role: 'admin' });
                        if (admin) {
                            const notificationMessage = `فشل إرسال تنبيه تليجرام لإغلاق سوق الذهب`;
                            const newNotification = { user_id: admin._id, message: notificationMessage, link: '#', type: 'error', icon: 'fab fa-telegram-plane' };
                            await Notification.create(newNotification);
                            sendEventToUser(admin._id, 'notification_created', newNotification);
                        }
                    }
                })();

                await logActivity(req, req.userId, 'gold_market_broadcast', { imageUrl });
                sendEventToAll('gold_market_closed', { imageUrl });
                res.json({ message: 'تم إرسال تنبيه إغلاق سوق الذهب بنجاح.' });

            } catch (error) {
                console.error('[Gold Market Broadcast] Error:', error.message);
                res.status(500).json({ message: 'فشل إرسال التنبيه.' });
            }
        });

            app.delete('/api/notifications/all', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const result = await Notification.deleteMany({});
                    await logActivity(req, req.userId, 'bulk_delete_all_notifications', { deletedCount: result.deletedCount });
                    
                    // Notify clients to clear their views
                    sendEventToAll('notifications_cleared');
                    res.json({ message: `تم حذف جميع الإشعارات (${result.deletedCount}) بنجاح.` });
                } catch (error) {
                    console.error('[Bulk Delete Notifications] Error:', error.message);
                    res.status(500).json({ message: 'فشل حذف جميع الإشعارات.' });
                }
            });

            app.delete('/api/notifications/group', verifyToken, verifyAdmin, async (req, res) => {
                const { message, link } = req.body;
                if (!message || !link) {
                    return res.status(400).json({ message: 'الرسالة والرابط مطلوبان لتحديد مجموعة الإشعارات.' });
                }

                try {
                    // Use a regular expression to match notifications that start with the given message.
                    // This is more robust for messages like "قرأ فلان..."
                    const messageRegex = new RegExp(`^${message.replace(/[-\/\\^$*+?.()|[\\\]{}]/g, '\\$&')}`);
                    const result = await Notification.deleteMany({ message: { $regex: messageRegex }, link });

                    await logActivity(req, req.userId, 'delete_notification_group', { message, deletedCount: result.deletedCount });
                    
                    sendEventToAll('notification_deleted', { message, link });
                    res.json({ message: `تم حذف ${result.deletedCount} إشعارًا بنجاح.` });
                } catch (error) {
                    console.error('[Delete Notification Group] Error:', error.message);
                    res.status(500).json({ message: 'Failed to delete notifications.' });
                }
            });

            app.post('/api/notifications/test', verifyToken, verifyAdmin, async (req, res) => {
                try {
                    const userId = req.userId;
                    const message = 'هذا إشعار تجريبي للتأكد من أن النظام اللحظي يعمل.';
                    
                    await Notification.create({
                        user_id: userId,
                        message: message,
                        link: '#',
                        type: 'info',
                        icon: 'fa-check-circle'
                    });

                    sendEventToUser(userId, 'notification_created', {
                        message: message,
                        link: '#',
                        type: 'info',
                        icon: 'fa-check-circle'
                    });

                    res.status(200).json({ message: 'تم إرسال الإشعار التجريبي بنجاح.' });
                } catch (error) {
                    console.error('[POST /api/notifications/test] Error:', error.message);
                    res.status(500).json({ message: 'Failed to send test notification.' });
                }
            });
        // Define routes
        defineApiRoutes();

                // API to read files from GridFS
                app.get('/api/files/:filename', async (req, res) => {
                    const filename = req.params.filename;
        
                    console.log(`[GridFS] ==> Request received for file: ${filename}`);
                    try {
                        if (!gridfsBucket) {
                            console.error('[GridFS] ❌ Error: GridFSBucket is not initialized.');
                            throw new Error('GridFS not initialized');
                        }
        
                        const files = await gridfsBucket.find({ filename }).limit(1).toArray();
        
                        if (!files || files.length === 0) {
                            console.warn(`[GridFS] ❓ File not found in GridFS: ${filename}`);
                            return res.status(404).json({ message: 'No file exists' });
                        }
        
                        const file = files[0];
                        console.log(`[GridFS] ✅ File found: ${filename}, ContentType: ${file.contentType}`);
        
                        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp', 'image/avif', 'image/svg+xml'];
                        if (!validImageTypes.includes(file.contentType)) {
                            console.warn(`[GridFS] ❗ File is not a valid image type: ${file.contentType}`);
                            return res.status(404).json({ message: 'Not an image' });
                        }
        
                        res.set('Content-Type', file.contentType);
                        res.set('Content-Length', file.length);
                        res.set('Cache-Control', 'public, max-age=31536000');
                        res.set('ngrok-skip-browser-warning', 'true');
        
                        const readstream = gridfsBucket.openDownloadStream(file._id);
        
                                            readstream.on('error', (streamErr) => {
                                                console.error(`[GridFS] Stream error for ${filename}:`, streamErr.message);
                                              
                                                if (!res.headersSent) { // NOSONAR
                                                    res.status(500).json({ message: 'Error streaming file.' });
                                                }
                                            });
                                            readstream.on('finish', () => {
                                                // console.log(`[GridFS] <== Successfully finished streaming file: ${filename}`);
                                            });
                            
                                            readstream.pipe(res);
                                        } catch (error) {
                                            console.error(`[GET /api/files/${filename}] Error:`, error.message);
                                            if (!res.headersSent) {
                                                res.status(500).json({ message: 'Failed to stream file.' });
                                            }
                                        }
                                    });
                    
                            // End of DB connection success handler
                            // Start the HTTP server and Telegram bot after routes are defined
                            app.listen(port, () => {
                                console.log(`✓ Server is running on port ${port}`);
                            });
                    
                            if (!TELEGRAM_DISABLED) {
                                bot.launch()
                                    .then(() => console.log('✓ Telegram bot is running.'))
                                    .catch((err) => console.error('Telegram bot failed to start:', err.message));
                            } else {
                                console.log('✓ Server running without Telegram integration.');
                            }
                    
                            // Graceful shutdown handlers
                            const shutdown = async () => {
                                console.log('Shutting down gracefully...');
                                if (!TELEGRAM_DISABLED) {
                                    try {
                                        if (typeof bot?.stop === 'function') {
                                            await bot.stop();
                                        }
                                    } catch (e) {
                                        // ignore
                                    }
                                }
                                try {
                                    await mongoose.connection.close();
                                } catch (e) {
                                    // ignore
                                }
                                process.exit(0);
                            };
                    
                            process.on('SIGINT', shutdown);
                            process.on('SIGTERM', shutdown);
                    
                        })
                        .catch((err) => {
                            console.error('MongoDB connection error:', err.message);
                            process.exit(1);
                        });
