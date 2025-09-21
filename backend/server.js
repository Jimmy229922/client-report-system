// 1. استيراد المكتبات
let config;
const changelog = require('./changelog.json');
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

// --- Database Schema Note ---
// The following changes assume you have updated your 'users' table in Supabase.
// If you haven't, please run the following SQL commands in your Supabase SQL Editor:
// ALTER TABLE public.users ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
// ALTER TABLE public.users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
// UPDATE public.users SET role = 'admin' WHERE id = 1;


// 3. إعداد Multer (للتعامل مع الصور)
// سيتم تخزين الصور في الذاكرة مؤقتاً بدلاً من حفظها على القرص
const upload = multer({ storage: multer.memoryStorage() });

// 4. تفعيل الـ Middlewares
app.use(cors()); // للسماح بالطلبات من الواجهة الأمامية
app.use(express.json()); // لتحليل البيانات من نوع JSON
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
// تقديم ملفات الواجهة الأمامية بشكل ثابت
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Real-time Event Setup (Server-Sent Events) ---
let clients = [];

function sendEventToAll(data) {
    const eventString = `data: ${JSON.stringify(data)}\n\n`;
    // Create a copy of the clients array to prevent issues if a client disconnects during the loop
    const currentClients = [...clients]; 
    currentClients.forEach(client => {
        try {
            client.res.write(eventString);
        } catch (error) {
            console.error(`[SSE] Failed to send event to client ${client.id}. Removing client.`, error.message);
            clients = clients.filter(c => c.id !== client.id);
        }
    });
    console.log(`[SSE] Sent event of type '${data.type}' to ${currentClients.length} client(s).`);
}

const verifyTokenForSSE = (req, res, next) => {
    const token = req.query.token;
    if (!token) {
        return res.status(403).end(); // End the request for SSE
    }
    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).end();
        }
        req.userId = decoded.id;
        next();
    });
};

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
    // The user with ID 1 is the admin.
    if (req.userId !== 1) {
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

    if (!user.is_active) {
        return res.status(403).json({ auth: false, token: null, message: 'تم تعطيل هذا الحساب. يرجى التواصل مع المسؤول.' });
    }

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ auth: false, token: null, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, config.JWT_SECRET, {
        expiresIn: 86400 // 24 hours
    });

    res.status(200).json({ auth: true, token: token, user: { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url, has_completed_tour: user.has_completed_tour } });
});

app.put('/api/profile/password', verifyToken, async (req, res) => {
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

app.put('/api/profile/details', verifyToken, async (req, res) => {
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
        .select('id, username, email, avatar_url, has_completed_tour')
        .eq('id', userId)
        .single();

    if (fetchError) {
        console.error('Failed to fetch user after details update:', fetchError);
        return res.status(500).json({ message: "تم تحديث البيانات، ولكن فشل استرجاعها. الرجاء تحديث الصفحة." });
    }
    res.json({ message: "تم تحديث البيانات بنجاح.", user: updatedUser });
});

app.post('/api/profile/tour-completed', verifyToken, async (req, res) => {
    const userId = req.userId;
    try {
        const { error } = await supabase
            .from('users')
            .update({ has_completed_tour: true })
            .eq('id', userId);
        if (error) throw error;
        res.status(200).json({ message: 'Tour status updated successfully.' });
    } catch (error) {
        console.error('Error marking tour as completed:', error);
        // Don't send a critical error to the user, just log it.
        res.status(500).json({ message: 'Failed to update tour status on the server.' });
    }
});

app.post('/api/profile/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
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
        const { data: updatedUser, error: updateError } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId).select('id, username, email, avatar_url, has_completed_tour').single();
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

        // Always add the author to the report title.
        const authorSuffix = req.username ? ` (بواسطة: ${req.username})` : '';
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
    const isAdmin = req.userId === 1;

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
    const userId = req.userId;
    const isAdmin = userId === 1;
    console.log(`[API /api/stats] Request from user ID: ${userId}, Is Admin: ${isAdmin}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helper function to apply user filter if not admin
    const userFilter = (query) => {
        return isAdmin ? query : query.eq('user_id', userId);
    };

    const queries = [
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true })),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).gte('timestamp', today.toISOString())),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#suspicious%')),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#deposit%')),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#new-position%')),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#credit-out%')),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%تقرير تحويل الحسابات%')),
        userFilter(supabase.from('reports').select('*', { count: 'exact', head: true }).ilike('report_text', '%#payouts%'))
    ];

    const results = await Promise.all(queries);
    const [total, reports_today, suspicious, deposit, new_positions, credit_out, account_transfer, payouts] = results.map(r => r.count);

    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
        console.error("Stats error:", errors[0].error);
        return res.status(500).json({ error: errors[0].error.message });
    }

    res.json({ message: "success", data: { total, reports_today, suspicious, deposit, new_positions, credit_out, account_transfer, payouts } });
});

// Endpoint for weekly stats
app.get('/api/stats/weekly', verifyToken, async (req, res) => {
    const userId = req.userId;
    const isAdmin = userId === 1;
    const filterId = isAdmin ? null : userId;
    console.log(`[API /api/stats/weekly] Request from user ID: ${userId}, Is Admin: ${isAdmin}. Filtering by user: ${filterId}`);

    // Pass user_id to the RPC function. If admin, pass NULL to get all data.
    const { data, error } = await supabase.rpc('get_daily_stats', { 
        user_filter_id: filterId
    });

    if (error) {
        return res.status(500).json({ "error": `Database function error: ${error.message}` });
    }
    res.json({ message: "success", data });
});

// Endpoint for recent reports
app.get('/api/reports/recent', verifyToken, async (req, res) => {
    const userId = req.userId;
    const isAdmin = userId === 1;
    console.log(`[API /api/reports/recent] Request from user ID: ${userId}, Is Admin: ${isAdmin}`);

    try {
        let query;
        if (isAdmin) {
            // Admin sees all reports and the username of the creator
            query = supabase
                .from('reports')
                .select('id, report_text, timestamp, users(username)')
                .order('timestamp', { ascending: false })
                .limit(5);
        } else {
            // Regular user sees only their own reports, no author needed
            query = supabase
                .from('reports')
                .select('id, report_text, timestamp')
                .eq('user_id', userId)
                .order('timestamp', { ascending: false })
                .limit(5);
        }

        const { data, error } = await query;
        if (error) throw error;
        // Ensure data is an array, even if null is returned
        res.json({ message: "success", data: data || [] });
    } catch (error) {
        console.error("Error in /api/reports/recent:", error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint for top contributor
app.get('/api/stats/top-contributor', verifyToken, async (req, res) => {
    const userId = req.userId;
    const isAdmin = userId === 1;
    console.log(`[API /api/stats/top-contributor] Request from user ID: ${userId}, Is Admin: ${isAdmin}`);

    try {
        if (isAdmin) {
            // Admin gets the global top contributors
            console.log(`[Top Contributor] Admin request. Fetching top 3.`);
            const { data, error } = await supabase.rpc('get_top_contributor').limit(3);
            if (error) {
                console.error(`[Top Contributor] RPC error:`, error);
                throw error;
            }
            console.log(`[Top Contributor] RPC result:`, data);
            res.json({ message: "success", data: data || [] }); // Return an array
        } else {
            // Regular user gets their own stats
            const { data: user, error: userError } = await supabase.from('users').select('username, avatar_url').eq('id', userId).single();
            if (userError) throw userError;

            const { count, error: countError } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('user_id', userId);
            if (countError) throw countError;

            res.json({ 
                message: "success", 
                data: { username: user.username, avatar_url: user.avatar_url, report_count: count, is_self: true } 
            });
        }
    } catch (error) {
        console.error("Error in /api/stats/top-contributor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint for the update process


app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Endpoint to get the latest changelog entry
app.get('/api/changelog/latest', (req, res) => {
    // Assuming the changelog is sorted with the newest version first
    if (changelog && changelog.length > 0) {
        res.json(changelog[0]);
    } else {
        res.status(404).json({ error: "Changelog not found or is empty." });
    }
});

// --- Instructions Endpoints ---

// --- Notifications Endpoints ---

// SSE endpoint for real-time events
app.get('/api/notifications/events', verifyTokenForSSE, (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);

    const clientId = Date.now();
    const newClient = { id: clientId, userId: req.userId, res: res };
    clients.push(newClient);
    console.log(`[SSE] Client ${clientId} (User ${req.userId}) connected. Total clients: ${clients.length}`);

    // Send a welcome/connection confirmation event
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
        console.log(`[SSE] Client ${clientId} disconnected. Total clients: ${clients.length}`);
    });
});

app.get('/api/notifications', verifyToken, async (req, res) => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

app.post('/api/notifications/mark-as-read', verifyToken, async (req, res) => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', req.userId)
        .eq('is_read', false);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});

// New endpoint for deleting a notification group (admin only)
app.delete('/api/notifications/group', verifyToken, verifyAdmin, async (req, res) => {
    const { message, link } = req.body;

    if (!message || !link) {
        return res.status(400).json({ message: "Message and link are required to identify the notification group." });
    }

    const { error, count } = await supabase
        .from('notifications')
        .delete({ count: 'exact' })
        .eq('message', message)
        .eq('link', link);

    // If deletion was successful, send a real-time event to all clients
    if (!error && count > 0) {
        sendEventToAll({
            type: 'notification_deleted'
        });
    }

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    if (count === 0) return res.status(200).json({ message: 'لم يتم العثور على إشعارات مطابقة أو تم حذفها بالفعل.' });
    res.json({ message: `تم حذف ${count} إشعار بنجاح.` });
});

// GET all instructions (public)
app.get('/api/instructions', async (req, res) => {
    const { data, error } = await supabase
        .from('instructions')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// POST a new instruction (admin only)
app.post('/api/instructions', verifyToken, verifyAdmin, async (req, res) => {
    const { title, content, search_terms, category } = req.body;
    if (!title || !content || !category) {
        return res.status(400).json({ message: 'العنوان، المحتوى، والقسم مطلوبان.' });
    }

    const { data, error } = await supabase
        .from('instructions')
        .insert({ title, content, search_terms, category })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    // Create notifications for all users about the new instruction
    if (data) {
        try {
            const { data: users, error: usersError } = await supabase.from('users').select('id').eq('is_active', true);
            if (usersError) throw usersError;

            const notifications = users.map(user => ({
                user_id: user.id,
                message: `تمت إضافة تعليمة جديدة: ${data.title.replace(/<[^>]*>?/gm, '')}`,
                link: '#instructions'
            }));
            if (notifications.length > 0) await supabase.from('notifications').insert(notifications);
            sendEventToAll({ type: 'notification_created' });
        } catch (e) { console.error('[Instructions] Failed to create new instruction notifications:', e.message); }
    }
    res.status(201).json({ message: 'تمت إضافة التعليمة بنجاح.', data });
});

// PUT (update) an instruction (admin only)
app.put('/api/instructions/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, content, search_terms, category } = req.body;

    const { data, error } = await supabase
        .from('instructions')
        .update({ title, content, search_terms, category })
        .eq('id', id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: 'التعليمة غير موجودة.' });

    // Create notifications for all users about the updated instruction
    if (data) {
        try {
            const { data: users, error: usersError } = await supabase.from('users').select('id').eq('is_active', true);
            if (usersError) throw usersError;

            const notifications = users.map(user => ({
                user_id: user.id,
                message: `تم تحديث تعليمة: ${data.title.replace(/<[^>]*>?/gm, '')}`,
                link: '#instructions'
            }));
            if (notifications.length > 0) await supabase.from('notifications').insert(notifications);
            sendEventToAll({ type: 'notification_created' });
        } catch (e) { console.error('[Instructions] Failed to create update instruction notifications:', e.message); }
    }

    res.json({ message: 'تم تحديث التعليمة بنجاح.', data });
});

// DELETE an instruction (admin only)
app.delete('/api/instructions/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;

    const { error, count } = await supabase.from('instructions').delete({ count: 'exact' }).eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    if (count === 0) return res.status(404).json({ message: 'التعليمة غير موجودة.' });
    res.json({ message: 'تم حذف التعليمة بنجاح.' });
});


// --- User Management Endpoints ---

// Get all users
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const { search } = req.query;
    let query = supabase.from('users').select('id, username, email, avatar_url, created_at, role, is_active');

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
app.post('/api/users', verifyToken, verifyAdmin, upload.single('avatar'), async (req, res) => {
    const { username, email, password, role } = req.body;
    const file = req.file;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "اسم المستخدم، البريد الإلكتروني، وكلمة المرور مطلوبان." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
    }

    const allowedRoles = ['admin', 'editor'];
    if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({ message: "الدور المحدد غير صالح." });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    // Initial user data to insert
    const newUserPayload = {
        username,
        email: email.toLowerCase(),
        password: hash,
        role: role || 'editor',
        is_active: true
    };

    // Insert user without avatar first
    const { data: user, error: insertError } = await supabase
        .from('users')
        .insert(newUserPayload)
        .select('id, username, email, avatar_url, created_at, role, is_active')
        .single();

    if (insertError) {
        if (insertError.code === '23505') {
            return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
        }
        return res.status(500).json({ error: insertError.message });
    }

    let finalUser = user;
    let message = "تم إنشاء المستخدم بنجاح.";

    // If user was created and there's a file, handle avatar upload
    if (user && file) {
        try {
            const fileExt = path.extname(file.originalname);
            const fileName = `user_${user.id}/${Date.now()}${fileExt}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file.buffer, { contentType: file.mimetype });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);

            // Update the user record with the avatar URL
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({ avatar_url: publicUrlData.publicUrl })
                .eq('id', user.id)
                .select('id, username, email, avatar_url, created_at, role, is_active')
                .single();

            if (updateError) throw updateError;
            finalUser = updatedUser; // Use the fully updated user data
        } catch (avatarError) {
            console.error('Avatar upload failed for new user, but user was created:', avatarError);
            message = "تم إنشاء المستخدم ولكن فشل رفع الصورة.";
        }
    }

    // Create a notification for the main admin (ID 1) about the new user
    if (finalUser) {
        try {
            const { error: notifError } = await supabase.from('notifications').insert({
                user_id: 1, // Notify admin with ID 1
                message: `تم إنشاء مستخدم جديد: ${finalUser.username}`,
                link: '#users'
            });
            if (notifError) throw notifError;
            // Send event to clients
            sendEventToAll({ type: 'notification_created' });
        } catch (e) {
            console.error('Failed to create notification for new user:', e.message);
        }
    }

    res.status(201).json({ message, data: finalUser });
});

// Update a user's details (Admin only)
app.put('/api/users/:id', verifyToken, verifyAdmin, upload.single('avatar'), async (req, res) => {
    const { id } = req.params;
    const { username, email, password, role } = req.body;
    const file = req.file;
    const updateData = {};

    // Prevent admin (ID 1) from being modified in critical ways
    if (id == 1) {
        if (role && role !== 'admin') {
            return res.status(403).json({ message: "لا يمكن تغيير دور المسؤول الرئيسي." });
        }
        if (username) {
            return res.status(403).json({ message: "لا يمكن تغيير اسم مستخدم المسؤول الرئيسي." });
        }
    }

    if (username) updateData.username = username;

    if (email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
        }
        updateData.email = email.toLowerCase();
    }

    if (role) {
        const allowedRoles = ['admin', 'editor'];
        if (!allowedRoles.includes(role)) return res.status(400).json({ message: "الدور المحدد غير صالح." });
        updateData.role = role;
    }

    if (password && typeof password === 'string' && password.length > 0) {
        if (password.length < 6) return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        updateData.password = hash;
    }

    if (Object.keys(updateData).length === 0 && !file) {
        return res.status(400).json({ message: "لا توجد بيانات للتحديث." });
    }

    // Handle avatar upload if a file is present
    if (file) {
        try {
            // Get user data to find old avatar to delete
            const { data: user, error: fetchError } = await supabase.from('users').select('avatar_url').eq('id', id).single();
            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

            if (user && user.avatar_url) {
                const oldAvatarPath = user.avatar_url.split('/avatars/')[1];
                if (oldAvatarPath) {
                    await supabase.storage.from('avatars').remove([oldAvatarPath]);
                }
            }

            // Upload new avatar
            const fileExt = path.extname(file.originalname);
            const fileName = `user_${id}/${Date.now()}${fileExt}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
            updateData.avatar_url = publicUrlData.publicUrl;

        } catch (avatarError) {
            console.error('Avatar update failed during user edit:', avatarError);
            return res.status(500).json({ message: 'فشل تحديث الصورة، لم يتم حفظ أي تغييرات أخرى.' });
        }
    }

    const { data, error } = await supabase.from('users').update(updateData).eq('id', id).select('id, username, email, avatar_url, created_at, role, is_active').single();

    if (error) {
        if (error.code === '23505') return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
        return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ message: "المستخدم غير موجود." });

    res.json({ message: "تم تحديث بيانات المستخدم بنجاح.", user: data });
});

// Toggle user active status
app.put('/api/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    const { id: userIdToUpdate } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: "الحالة (is_active) يجب أن تكون true أو false." });
    }

    // Prevent deactivating the main admin or oneself
    if (userIdToUpdate == 1) {
        return res.status(403).json({ message: "لا يمكن تعطيل حساب المسؤول الرئيسي." });
    }
    if (userIdToUpdate == req.userId) {
        return res.status(403).json({ message: "لا يمكنك تعطيل حسابك بنفسك." });
    }

    const { data, error } = await supabase
        .from('users')
        .update({ is_active: is_active })
        .eq('id', userIdToUpdate)
        .select('id, is_active')
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: "المستخدم غير موجود." });

    res.json({ message: `تم ${is_active ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح.`, user: data });
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
    const command = 'git reset --hard HEAD && git pull && cd backend && npm install';
    console.log(`[Update] Executing command: ${command}`);

    exec(command, { cwd: projectRoot }, async (err, stdout, stderr) => {
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

        // Create notifications for all users about the update
        try {
            const { data: users, error: usersError } = await supabase.from('users').select('id').eq('is_active', true);
            if (usersError) throw usersError;

            const notifications = users.map(user => ({
                user_id: user.id,
                message: 'تم تحديث النظام بنجاح. قد تحتاج لإعادة تحميل الصفحة.',
                link: '#home'
            }));

            if (notifications.length > 0) {
                await supabase.from('notifications').insert(notifications);
                sendEventToAll({ type: 'notification_created' });
            }
        } catch (e) {
            console.error('[Update] Failed to create update notifications:', e.message);
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

// Endpoint to get the application version from package.json
app.get('/api/version', (req, res) => {
    try {
        // Use path.join with __dirname for a more robust and absolute path.
        // The package.json is in the same directory as server.js.
        const packageJsonPath = path.join(__dirname, 'package.json');
        const packageJson = require(packageJsonPath);
        if (packageJson && packageJson.version) {
            res.json({ version: packageJson.version });
        } else {
            throw new Error('Version property not found in package.json');
        }
    } catch (error) {
        console.error("Error reading package.json for version:", error.message);
        // Send a specific error instead of crashing the server
        res.status(500).json({ error: "Could not determine application version." });
    }
});

// Centralized Error Handler
// This should be placed after all your API routes but before the frontend fallback.
// It catches errors from middleware (like Multer) and unhandled exceptions in routes.
app.use((err, req, res, next) => {
    // Multer-specific error handling
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    }
    // Generic error handling
    console.error('--- UNHANDLED ERROR ---');
    console.error(err.stack);
    res.status(500).json({
        message: 'حدث خطأ غير متوقع في الخادم.',
        error: err.message // Send back the actual error message for debugging
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
        .insert({ id: 1, username: 'INZO LLC', email: 'admin@inzo.com', password: hash, avatar_url: null, role: 'admin', is_active: true, has_completed_tour: true });

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
