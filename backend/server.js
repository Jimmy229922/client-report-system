// 1. استيراد المكتبات
let config;
try {
    // First, try to load the shared config file.
    config = require('./config.json');
} catch (error) {
    // If it fails, it means the setup has not been run.
    console.error('---');
    console.error('FATAL ERROR: Configuration file `config.json` not found.');
    console.error('This file contains essential settings for the application to run.');
    console.error('Please run the `setup.bat` script in the main project folder to generate it.');
    console.error('---');
    process.exit(1); // Exit the application with an error code
}
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, spawn } = require('child_process');

// Check for essential environment variables on startup and provide a detailed error message
const requiredConfigKeys = ['BOT_TOKEN', 'CHAT_ID', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_KEY'];
const missingKeys = requiredConfigKeys.filter(key => !config[key]);

if (missingKeys.length > 0) {
    console.error('---');
    console.error('FATAL ERROR: Missing required configuration keys.');
    console.error(`The following keys are missing or empty in your config.json file: ${missingKeys.join(', ')}`);
    console.error('Please run `setup.bat` again to regenerate the configuration.');
    console.error('---');
    process.exit(1); // Exit the application with an error code
}

// 2. إعدادات أساسية
const app = express();
const port = config.PORT || 3001;
const bot = new Telegraf(config.BOT_TOKEN);
// 2.5. إعداد Supabase
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);


// 3. إعداد Multer (للتعامل مع الصور)
// سيتم تخزين الصور في الذاكرة مؤقتاً بدلاً من حفظها على القرص
const upload = multer({ storage: multer.memoryStorage() });

// 4. تفعيل الـ Middlewares
app.use(cors()); // للسماح بالطلبات من الواجهة الأمامية
app.use(express.json()); // لتحليل البيانات من نوع JSON
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
// تقديم ملفات الواجهة الأمامية بشكل ثابت
app.use(express.static(path.join(__dirname, '../frontend')));

const verifyToken = (req, res, next) => {
    let token = req.headers['authorization'];

    if (!token) return res.status(403).send({ auth: false, message: 'No token provided.' });

    if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
    }

    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
        
        // if everything good, save to request for use in other routes
        req.userId = decoded.id;
        req.username = decoded.username;
        req.userEmail = decoded.email;
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    // This middleware assumes verifyToken has run before it.
    // The user with ID 1 or email 'admin@inzo.com' is the admin.
    if (req.userId !== 1 && req.userEmail !== 'admin@inzo.com') {
        return res.status(403).json({ message: "صلاحية الوصول مرفوضة. هذه العملية للمسؤول فقط." });
    }
    next();
};

// 5. Authentication Endpoints & Middleware
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ message: 'Server error.' });
    if (!user) return res.status(404).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ auth: false, token: null, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url }, config.JWT_SECRET, {
        expiresIn: 86400 // 24 hours
    });

    res.status(200).json({ auth: true, token: token, user: { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url } });
});

app.put('/api/profile/password', verifyToken, verifyAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.userId;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "كلمة المرور الحالية والجديدة مطلوبتان." });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل." });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) return res.status(500).json({ message: 'Server error.' });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const passwordIsValid = bcrypt.compareSync(currentPassword, user.password);
    if (!passwordIsValid) {
        return res.status(401).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    const { error: updateError } = await supabase.from('users').update({ password: hash }).eq('id', userId);
    if (updateError) { return res.status(500).json({ error: updateError.message }); }
    res.json({ message: "تم تغيير كلمة المرور بنجاح." });
});

app.put('/api/profile/details', verifyToken, verifyAdmin, async (req, res) => {
    const { username, email } = req.body;
    const userId = req.userId;

    if (!username && !email) {
        return res.status(400).json({ message: "لا يوجد بيانات للتحديث." });
    }

    // Prevent admin (ID 1) from changing their username
    if (username && userId === 1) {
        return res.status(403).json({ message: "لا يمكن تغيير اسم المستخدم الخاص بالمسؤول." });
    }

    const updateData = {};

    if (username) {
        updateData.username = username;
    }

    if (email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
        }
        updateData.email = email.toLowerCase();
    }

    const { error: updateError } = await supabase.from('users').update(updateData).eq('id', userId);

    if (updateError) {
        if (updateError.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
        }
        return res.status(500).json({ error: updateError.message });
    }

    const { data: updatedUser, error: fetchError } = await supabase
        .from('users')
        .select('id, username, email, avatar_url')
        .eq('id', userId)
        .single();

    if (fetchError) {
        console.error('Failed to fetch user after details update:', fetchError);
        return res.status(500).json({ message: "تم تحديث البيانات، ولكن فشل استرجاعها. الرجاء تحديث الصفحة." });
    }
    res.json({ message: "تم تحديث البيانات بنجاح.", user: updatedUser });
});

app.post('/api/profile/avatar', verifyToken, verifyAdmin, async (req, res) => {
    const userId = req.userId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
    }

    try {
        // 1. Get current user data to find old avatar
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('avatar_url')
            .eq('id', userId)
            .single();

        if (fetchError) throw fetchError;

        // 2. If an old avatar exists, delete it from storage
        if (user.avatar_url) {
            const oldAvatarPath = user.avatar_url.split('/avatars/')[1];
            if (oldAvatarPath) {
                const { error: removeError } = await supabase.storage.from('avatars').remove([oldAvatarPath]);
                if (removeError) {
                    // Log the error but don't block the upload of the new one
                    console.error('Failed to remove old avatar:', removeError.message);
                }
            }
        }

        // 3. Upload the new avatar
        const fileExt = path.extname(file.originalname);
        const fileName = `user_${userId}/${Date.now()}${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) throw uploadError;

        // 4. Get the public URL of the new avatar
        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const publicUrl = publicUrlData.publicUrl;

        // 5. Update the user's record in the database
        const { data: updatedUser, error: updateError } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId).select('id, username, email, avatar_url').single();
        if (updateError) throw updateError;

        res.json({ message: 'تم تحديث الصورة الشخصية بنجاح.', user: updatedUser });

    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء رفع الصورة.', error: error.message });
    }
});

// 6. Protected API Endpoints
app.post('/api/send-report', verifyToken, upload.array('images', 3), async (req, res) => {
    try {
        // استخراج البيانات النصية واسم المستخدم من الطلب
        const { reportText } = req.body;
        const username = req.username; // From verifyToken middleware
        const userId = req.userId;
        // استخراج ملفات الصور
        const images = req.files;

        if (!reportText) {
            return res.status(400).json({ success: false, message: 'نص التقرير مفقود.' });
        }

        // Robustly find and separate the footer (hashtags and mentions)
        const footerRegex = /(\n\s*#\w+|\n\s*@\w+)+$/;
        const footerMatch = reportText.match(footerRegex);
        // Trim and collapse multiple newlines to a single one to ensure clean formatting
        let footer = footerMatch ? footerMatch[0].trim().replace(/\n\s*\n/g, '\n') : '';
        const mainText = footerMatch ? reportText.substring(0, footerMatch.index).trim() : reportText;

        // Specifically remove #account_transfer from the footer for sending, but it remains in the DB
        if (footer.includes('#account_transfer')) {
            footer = footer.replace(/#account_transfer\s*/g, '').trim();
        }

        // Conditionally add the author to the report title. Only add if not the admin.
        const authorSuffix = (userId !== 1 && username) ? ` (بواسطة: ${username})` : '';
        const reportTitle = mainText.split('\n')[0];
        const reportBody = mainText.substring(reportTitle.length).trim();
        
        // Construct the final message
        const telegramMessage = `${reportTitle}${authorSuffix}\n\n${reportBody}${footer ? `\n\n${footer.trim()}` : ''}`.trim();
        const TELEGRAM_CAPTION_LIMIT = 1024;

        // التحقق من وجود صور
        if (images && images.length > 0) {
            // إذا كان النص أطول من الحد المسموح به للتعليق على الصور
            if (telegramMessage.length > TELEGRAM_CAPTION_LIMIT) {
                console.log('النص طويل، سيتم إرسال الصور والنص بشكل منفصل.');
                // 1. أرسل الصور أولاً بدون تعليق
                const mediaGroup = images.map(image => ({
                    type: 'photo',
                    media: { source: image.buffer },
                }));
                const sentPhotoMessages = await bot.telegram.sendMediaGroup(config.CHAT_ID, mediaGroup);

                // 2. أرسل النص كرسالة رد على أول صورة تم إرسالها
                await bot.telegram.sendMessage(config.CHAT_ID, telegramMessage, {
                    reply_to_message_id: sentPhotoMessages[0].message_id
                });
            } else {
                // إذا كان النص ضمن الحد المسموح به، أرسله كتعليق
                console.log('النص قصير، سيتم إرساله كتعليق على الصورة.');
                const mediaGroup = images.map((image, index) => ({
                    type: 'photo',
                    media: { source: image.buffer },
                    caption: index === 0 ? telegramMessage : '',
                }));
                await bot.telegram.sendMediaGroup(config.CHAT_ID, mediaGroup);
            }
        } else {
            // إذا لم تكن هناك صور، أرسل النص فقط
            await bot.telegram.sendMessage(config.CHAT_ID, telegramMessage);
        }

        // بعد الإرسال الناجح، قم بحفظ التقرير في قاعدة البيانات
        const imageCount = images ? images.length : 0;
        const { error: insertError } = await supabase
            .from('reports')
            .insert({ report_text: reportText, image_count: imageCount, user_id: req.userId });

        if (insertError) {
            console.error('Error saving report to database:', insertError.message);
        }

        // إرسال رد ناجح إلى الواجهة الأمامية
        return res.status(200).json({ success: true, message: 'تم إرسال التقرير بنجاح!' });

    } catch (error) {
        // تسجيل الخطأ بشكل مفصل للمساعدة في التشخيص
        console.error('--- ❌ خطأ في إرسال التقرير إلى تليجرام ---');
        console.error(`الوقت: ${new Date().toISOString()}`);
        console.error('رسالة الخطأ:', error.message);
        console.error('وصف الخطأ من تليجرام:', error.description); // هذا الحقل مهم جداً
        console.error('--- نهاية سجل الخطأ ---');
        return res.status(500).json({ success: false, message: error.description || 'حدث خطأ أثناء التواصل مع تليجرام.' });
    }
});

// Endpoint to get all reports
app.get('/api/reports', verifyToken, async (req, res) => { // verifyToken provides req.userId
    const limit = req.query.limit ? parseInt(req.query.limit) : 0;
    const search = req.query.search || '';
    const isAdmin = req.userId === 1;

    let query;

    if (isAdmin) {
        // Admin sees all reports and the username of the creator
        query = supabase.from('reports').select('*, users(username)');
    } else {
        // Regular user sees only their own reports
        query = supabase.from('reports').select('*').eq('user_id', req.userId);
    }

    if (search) {
        query = query.ilike('report_text', `%${search}%`); // Use ilike for case-insensitive search
    }

    query = query.order('timestamp', { ascending: false });

    if (limit > 0) {
        query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
        return res.status(500).json({ "error": error.message });
    }
    res.json({
        "message": "success",
        "data": data
    });
});

// Endpoint to delete a report
app.delete('/api/reports/:id', verifyToken, async (req, res) => { // verifyToken provides req.userId
    const reportId = req.params.id;
    const userId = req.userId;
    const isAdmin = userId === 1;

    // First, get the report to check its owner
    const { data: report, error: fetchError } = await supabase.from('reports').select('user_id').eq('id', reportId).single();

    if (fetchError) {
        return res.status(404).json({ "error": "التقرير غير موجود." });
    }

    // Check for permission
    if (!isAdmin && report.user_id !== userId) {
        return res.status(403).json({ "error": "ليس لديك صلاحية لحذف هذا التقرير." });
    }

    // Proceed with deletion
    const { error: deleteError, count } = await supabase.from('reports').delete({ count: 'exact' }).eq('id', reportId);
    if (deleteError) {
        return res.status(500).json({ "error": deleteError.message });
    }
    res.json({ "message": "deleted", changes: count });
});

// Endpoint for statistics
app.get('/api/stats', verifyToken, async (req, res) => {
    const queries = [
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#suspicious%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#deposit%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#new-position%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#credit-out%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%تقرير تحويل الحسابات%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#payouts%')
    ];

    const results = await Promise.all(queries);
    const [total, suspicious, deposit, new_positions, credit_out, account_transfer, payouts] = results.map(r => r.count);

    const errors = results.filter(r => r.error);
    if (errors.length > 0) return res.status(500).json({ error: errors[0].error.message });

    res.json({ message: "success", data: { total, suspicious, deposit, new_positions, credit_out, account_transfer, payouts } });
});

// Endpoint for weekly stats
app.get('/api/stats/weekly', verifyToken, async (req, res) => {
    const { data, error } = await supabase.rpc('get_weekly_stats');
    if (error) {
        return res.status(500).json({ "error": error.message });
    }
    res.json({ message: "success", data });
});

// Health check endpoint for the update process
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// --- User Management Endpoints ---

// Get all users
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const { search } = req.query;
    let query = supabase.from('users').select('id, username, email, avatar_url, created_at');

    if (search) {
        // Search in both username and email fields
        query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.order('id', { ascending: true });

    const { data, error } = await query;
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json({ message: "success", data });
});

// Add a new user
app.post('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "اسم المستخدم، البريد الإلكتروني، وكلمة المرور مطلوبان." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const { data, error } = await supabase
        .from('users')
        .insert({ username, email: email.toLowerCase(), password: hash, avatar_url: null })
        .select('id, username, email, avatar_url, created_at')
        .single();

    if (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
        }
        return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ message: "User created", data });
});

// Update user data (username, email, password)
app.put('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { password, username, email } = req.body;
    const { id } = req.params;

    // Prevent admin (ID 1) from changing their username via this endpoint
    if (username && id == 1) {
        return res.status(403).json({ message: "لا يمكن تغيير اسم المستخدم الخاص بالمسؤول." });
    }

    if (!password && !username && !email) {
        return res.status(400).json({ message: "لا يوجد بيانات للتحديث." });
    }

    const updateData = {};

    if (username) {
        updateData.username = username;
    }

    if (email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
        }
        updateData.email = email.toLowerCase();
    }

    // Only validate and hash password if it's a non-empty string
    if (password && typeof password === 'string') {
        if (password.length < 6) {
            return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
        }
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        updateData.password = hash;
    }

    const { data, error } = await supabase.from('users').update(updateData).eq('id', id).select('id, username, email, avatar_url, created_at').single();

    if (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
        }
        return res.status(500).json({ error: error.message });
    }

    if (!data) {
        return res.status(404).json({ message: "المستخدم غير موجود." });
    }

    res.json({ message: "تم تحديث بيانات المستخدم بنجاح.", user: data });
});

// Delete a user
app.delete('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const idToDelete = parseInt(req.params.id, 10);

    if (idToDelete === 1) { return res.status(403).json({ message: "لا يمكن حذف المستخدم المسؤول الافتراضي." }); }
    if (idToDelete === req.userId) { return res.status(403).json({ message: "لا يمكنك حذف نفسك." }); }

    const { error, count } = await supabase.from('users').delete({ count: 'exact' }).eq('id', idToDelete);

    if (error) {
        if (error.code === '23503') { // Foreign key violation
            return res.status(409).json({ message: "لا يمكن حذف هذا المستخدم لأنه يمتلك تقارير مرتبطة به. لحذف المستخدم، يجب أولاً حذف تقاريره أو تغيير قاعدة البيانات للسماح بذلك." });
        }
        return res.status(500).json({ error: error.message });
    }
    if (count === 0) { return res.status(404).json({ message: "المستخدم غير موجود." }); }
    res.json({ message: "تم حذف المستخدم بنجاح." });
});

// Delete all non-admin users
app.delete('/api/users/all-non-admins', verifyToken, verifyAdmin, async (req, res) => {
    // This is a very destructive operation.
    // We delete all users EXCEPT the admin (ID 1).
    const adminId = 1;

    const { error, count } = await supabase
        .from('users')
        .delete({ count: 'exact' })
        .neq('id', adminId);

    if (error) {
        if (error.code === '23503') { // Foreign key violation
            return res.status(409).json({ message: "فشل الحذف. يوجد تقارير مرتبطة ببعض المستخدمين. يجب تعديل قاعدة البيانات للسماح بالحذف (SET NULL)." });
        }
        return res.status(500).json({ error: error.message });
    }

    res.json({ message: `تم حذف ${count} مستخدم بنجاح.` });
});

// Update a specific user's avatar (Admin only)
app.put('/api/users/:id/avatar', verifyToken, verifyAdmin, upload.single('avatar'), async (req, res) => {
    const { id: userId } = req.params;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
    }

    try {
        // 1. Get user data to find old avatar
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('avatar_url')
            .eq('id', userId)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') return res.status(404).json({ message: 'المستخدم غير موجود.' });
            throw fetchError;
        }

        // 2. If an old avatar exists, delete it
        if (user.avatar_url) {
            const oldAvatarPath = user.avatar_url.split('/avatars/')[1];
            if (oldAvatarPath) {
                const { error: removeError } = await supabase.storage.from('avatars').remove([oldAvatarPath]);
                if (removeError) console.error('Failed to remove old avatar:', removeError.message);
            }
        }

        // 3. Upload the new avatar
        const fileExt = path.extname(file.originalname);
        const fileName = `user_${userId}/${Date.now()}${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) throw uploadError;

        // 4. Get the public URL and update the user's record
        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        await supabase.from('users').update({ avatar_url: publicUrlData.publicUrl }).eq('id', userId);

        res.json({ message: 'تم تحديث الصورة الشخصية للمستخدم بنجاح.' });
    } catch (error) {
        console.error('Admin avatar upload error:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء رفع الصورة.', error: error.message });
    }
});
// Endpoint for self-updating the application
app.post('/api/system/update', verifyToken, (req, res) => {
    const projectRoot = path.join(__dirname, '..');
    const command = 'git pull && cd backend && npm install';
    console.log(`[Update] Executing command: ${command}`);

    exec(command, { cwd: projectRoot }, (err, stdout, stderr) => {
        const log = `> ${command}\n\n${stdout}\n${stderr}`;
        console.log('[Update] stdout:', stdout);
        if (stderr) console.error('[Update] stderr:', stderr);

        if (err) {
            console.error('[Update] Update failed during exec:', err);
            return res.status(500).json({ message: 'فشل تنفيذ أمر التحديث. تأكد من تثبيت Git وأن المشروع تم تحميله عبر git clone.', log: log, error: err.message });
        }

        if (stdout.includes('Already up to date.')) {
            console.log('[Update] System is already up to date.');
            return res.json({ message: 'النظام محدث بالفعل. لا حاجة لإعادة التشغيل.', log: log, needsRestart: false });
        }

        // If we are here, there were updates.
        console.log('[Update] Updates pulled successfully. Restarting server...');
        res.json({ message: 'تم سحب التحديثات بنجاح. سيتم إعادة تشغيل السيرفر...', log: log, needsRestart: true });

        // Use a short delay to ensure the response is sent before exiting
        setTimeout(() => {
            const subprocess = spawn(process.argv[0], [...process.argv.slice(1), '--restarted'], {
                detached: true,
                cwd: process.cwd(),
                stdio: 'ignore'
            });
            subprocess.unref();
            process.exit();
        }, 1000); // 1 second delay
    });
});

// 7. Fallback for Frontend Routing
app.use((req, res) => {
    // For any request that doesn't match a previous route, send the index.html file.
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function initializeAdmin() {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', 1)
      .single();

    // PGRST116 = "The result contains 0 rows" which is expected if admin doesn't exist
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking for admin user:', error);
      return;
    }

    if (!data) {
      console.log("Default admin user not found. Creating...");
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync("password", salt);
      const { error: insertError } = await supabase
        .from('users')
        .insert({ id: 1, username: 'INZO LLC', email: 'admin@inzo.com', password: hash, avatar_url: null });

      if (insertError) {
        console.error('Failed to create default admin user:', insertError);
      } else {
        console.log('✓ Default admin user created.');
      }
    }
}

const isRestart = process.argv.includes('--restarted');

initializeAdmin().then(() => {
    app.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`🚀 Supabase connected. Server is running at ${url}`);
        if (!isRestart) {
            import('open').then(openModule => openModule.default(url)).catch(() => {});
        }
    });
});
