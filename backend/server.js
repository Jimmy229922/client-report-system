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
// إعداد CORS للتعامل مع طلبات preflight والسماح بالهيدرز الضرورية لعميل Supabase.
const corsOptions = {
  origin: '*', // يمكنك تقييد هذا إلى نطاق الواجهة الأمامية في بيئة الإنتاج لمزيد من الأمان
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'x-client-info',
    'apikey',
    'Content-Type'
  ],
  optionsSuccessStatus: 200 // For legacy browser support
};
app.set('trust proxy', 1); // Necessary to get the correct IP address from req.ip
app.use(cors(corsOptions));
app.use(express.json()); // لتحليل البيانات من نوع JSON
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
// تقديم ملفات الواجهة الأمامية بشكل ثابت
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Real-time Event Setup (Server-Sent Events) ---
let clients = [];

// Heartbeat to keep connections alive through proxies and firewalls
setInterval(() => {
    // This is a named event that the client can listen for or ignore.
    // It's more robust than a comment as it actively confirms the connection is alive.
    const eventString = `event: heartbeat\ndata: ${new Date().toISOString()}\n\n`;
    clients.forEach(client => {
        try {
            client.res.write(eventString);
        } catch (error) {
            // The 'close' event on the request object is the canonical way to handle disconnections.
            // We just log here for debugging purposes and let the 'close' handler do the cleanup.
            console.warn(`[SSE Heartbeat] Failed to send heartbeat to client ${client.id}. It may have disconnected.`);
        }
    });
}, 20000); // Send a keep-alive event every 20 seconds

function sendEventToAll(eventName, data = {}) {
    const eventString = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
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
    console.log(`[SSE] Sent event '${eventName}' to ${currentClients.length} client(s).`);
}

const verifyTokenForSSE = (req, res, next) => {
    console.log('[SSE Auth] Verifying token for new connection...');
    const token = req.query.token;
    if (!token) {
        console.error('[SSE Auth] FAILED: No token provided in query string. Connection rejected with 403.');
        return res.status(403).end(); // End the request for SSE
    }
    console.log('[SSE Auth] Token found in query string.');

    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error(`[SSE Auth] FAILED: JWT verification failed. Error: ${err.message}. Connection rejected with 401.`);
            return res.status(401).end();
        }
        console.log(`[SSE Auth] SUCCESS: Token verified for user ID: ${decoded.id}.`);
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

// Helper function to log activities
async function logActivity(req, userId, action, details = {}) {
    // Use req.ip which correctly respects the 'trust proxy' setting in Express
    const ipAddress = req.ip;
    try {
        const { error } = await supabase.from('activity_logs').insert({
            user_id: userId,
            action: action,
            details: details,
            ip_address: ipAddress,
        });
        if (error) {
            console.error(`[Activity Log] Failed to log action '${action}' for user ${userId}:`, error.message);
        }
    } catch (e) {
        console.error(`[Activity Log] Exception while logging action '${action}':`, e.message);
    }
}

// 5. Authentication Endpoints & Middleware
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

    if (error && error.code !== 'PGRST116') {
        await logActivity(req, null, 'login_failed', { reason: 'server_error', email: email.toLowerCase() });
        return res.status(500).json({ message: 'Server error.' });
    }
    if (!user) {
        await logActivity(req, null, 'login_failed', { reason: 'user_not_found', email: email.toLowerCase() });
        return res.status(404).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    if (!user.is_active) {
        await logActivity(req, user.id, 'login_failed', { reason: 'account_inactive' });
        return res.status(403).json({ auth: false, token: null, message: 'تم تعطيل هذا الحساب. يرجى التواصل مع المسؤول.' });
    }

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) {
        await logActivity(req, user.id, 'login_failed', { reason: 'invalid_password' });
        return res.status(401).json({ auth: false, token: null, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, config.JWT_SECRET, {
        expiresIn: 86400 // 24 hours
    });

    await logActivity(req, user.id, 'login_success', {});
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
        const { reportText, reportType } = req.body;
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

        // 1. Insert report text to get an ID
        const { data: newReport, error: insertError } = await supabase
            .from('reports')
            .insert({ report_text: reportText, user_id: req.userId, type: reportType })
            .select('id')
            .single();

        if (insertError) {
            console.error('Error saving report text to database:', insertError.message);
            // Don't proceed if we can't even save the text
            return res.status(500).json({ success: false, message: 'فشل حفظ نص التقرير.' });
        }

        const reportId = newReport.id;
        await logActivity(req, req.userId, 'create_report', { reportId, reportType });
        console.log('[DB Save] Report ID created:', reportId);
        let imageUrls = [];

        // 2. If images exist, upload them
        if (images && images.length > 0) {
            const uploadPromises = images.map((file, index) => {
                const fileExt = path.extname(file.originalname);
                const fileName = `reports/${reportId}/image_${index}${fileExt}`;
                console.log(`[DB Save] Preparing to upload: ${fileName}`);
                return supabase.storage.from('reports-images').upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });
            });

            const uploadResults = await Promise.all(uploadPromises);

            console.log('[DB Save] Raw upload results from Promise.all:', JSON.stringify(uploadResults, null, 2));

            // 3. Get public URLs for successfully uploaded images
            const successfulUploads = uploadResults.filter(result => {
                if (result.error) {
                    console.error('[DB Save] An image upload failed:', result.error.message);
                    return false;
                }
                if (!result.data || !result.data.path) {
                    console.error('[DB Save] A successful upload result is missing data.path:', result);
                    return false;
                }
                return true;
            });

            console.log('[DB Save] Filtered successful uploads:', JSON.stringify(successfulUploads, null, 2));

            imageUrls = successfulUploads.map(result => {
                const { data: publicUrlData, error: urlError } = supabase.storage.from('reports-images').getPublicUrl(result.data.path);
                if (urlError) {
                    console.error(`[DB Save] Failed to get public URL for path ${result.data.path}:`, urlError);
                    return null; // Return null for failed URL generations
                }
                console.log(`[DB Save] Generated public URL for ${result.data.path}:`, publicUrlData.publicUrl);
                return publicUrlData.publicUrl;
            }).filter(url => url !== null); // Filter out any nulls from failed URL generations
            
            console.log('[DB Save] Final public URLs to be saved:', imageUrls);
        }

        // 4. Update the report with image URLs and count
        console.log(`[DB Save] Attempting to update report ${reportId} with ${imageUrls.length} image(s).`);
        const { error: updateError } = await supabase
            .from('reports')
            .update({ image_urls: imageUrls, image_count: imageUrls.length })
            .eq('id', reportId);

        if (updateError) {
            console.error('[DB Save] CRITICAL: Failed to update report with image URLs.', updateError);
        } else {
            console.log(`[DB Save] Successfully updated report ${reportId}.`);
        }

        // Notify the admin (user_id: 1) about the new report
        try {
            const adminNotification = {
                user_id: 1, // Admin's ID
                message: `تقرير جديد تم إرساله بواسطة ${username}`,
                link: '#archive', // Link to the archive page
                type: 'info',
                icon: 'fa-file-medical-alt'
            };
            const { error: notifError } = await supabase.from('notifications').insert(adminNotification);
            if (notifError) throw notifError;

            // Send a real-time event to all clients.
            sendEventToAll('notification_created');
            console.log(`[Notification] Sent notification to admin about new report ${reportId} from user ${username}.`);
        } catch (notificationError) {
            // Log the error but don't fail the whole request.
            console.error('[Notification] Failed to create notification for new report:', notificationError.message);
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
app.get('/api/reports', verifyToken, async (req, res) => {
    const {
        limit: limitStr,
        search = '',
        startDate,
        endDate,
        userId: filterUserId,
        type: reportType
    } = req.query;
    const limit = limitStr ? parseInt(limitStr) : 0;
    const isAdmin = req.userId === 1;

    let query;
    if (isAdmin) {
        // Admin sees all reports and the username of the creator
        query = supabase.from('reports').select('*, image_urls, type, users(username)');
    } else {
        // Regular user sees only their own reports
        query = supabase.from('reports').select('*, image_urls, type').eq('user_id', req.userId);
    }

    const isNumericSearch = /^\d+$/.test(search);

    if (search) {
        if (isNumericSearch) {
            // If it's a number, perform a broad search for the account number field.
            // This is intentionally loose to catch variations in spacing. We will filter precisely later.
            query = query.like('report_text', `%رقم الحساب: ${search}%`);
        } else {
            // For other text (like IP, email, etc.), perform a general case-insensitive search
            query = query.ilike('report_text', `%${search}%`);
        }
    }

    if (startDate) {
        query = query.gte('timestamp', startDate);
    }
    if (endDate) {
        query = query.lte('timestamp', `${endDate}T23:59:59.999Z`);
    }
    if (isAdmin && filterUserId && filterUserId !== 'all') {
        query = query.eq('user_id', filterUserId);
    }
    if (reportType && reportType !== 'all') {
        query = query.eq('type', reportType);
    }

    query = query.order('timestamp', { ascending: false });
    if (limit > 0) query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
        return res.status(500).json({ "error": error.message });
    }

    // If we performed a numeric search, we must filter the results for an exact match
    // to prevent '7' from matching '77777'.
    let finalData = data;
    if (search && isNumericSearch) {
        finalData = data.filter(report => {
            // This regex finds "رقم الحساب:", optional whitespace, and then captures the full number.
            const match = report.report_text.match(/رقم الحساب:\s*(\d+)/);
            // We return true only if a match was found AND the captured number is exactly our search term.
            return match && match[1] === search;
        });
    }

    res.json({
        "message": "success",
        "data": finalData
    });
});

// Endpoint to delete a report
app.delete('/api/reports/:id', verifyToken, async (req, res) => { // verifyToken provides req.userId
    const reportId = req.params.id;
    const userId = req.userId;
    const isAdmin = req.userId === 1;

    // First, get the report to check its owner
    const { data: report, error: fetchError } = await supabase.from('reports').select('user_id, image_urls').eq('id', reportId).single();

    if (fetchError) {
        return res.status(404).json({ "error": "التقرير غير موجود." });
    }

    // Check for permission
    if (!isAdmin && report.user_id !== userId) {
        return res.status(403).json({ "error": "ليس لديك صلاحية لحذف هذا التقرير." });
    }

    // If images exist, delete them from storage
    if (report.image_urls && report.image_urls.length > 0) {
        const imagePaths = report.image_urls.map(url => {
            // Extract path from URL: https://.../storage/v1/object/public/reports-images/reports/123/image_0.jpg
            // The path is 'reports/123/image_0.jpg'
            return url.substring(url.indexOf('/reports-images/') + '/reports-images/'.length);
        });
        const { error: storageError } = await supabase.storage.from('reports-images').remove(imagePaths);
        if (storageError) {
            console.error(`Failed to delete images for report ${reportId}:`, storageError.message);
            // Don't block the report deletion, just log the error.
        }
    }

    // Proceed with deletion
    const { error: deleteError, count } = await supabase.from('reports').delete({ count: 'exact' }).eq('id', reportId);
    if (deleteError) {
        return res.status(500).json({ "error": deleteError.message });
    }
    await logActivity(req, userId, 'delete_report', { reportId, ownerId: report.user_id });
    res.json({ "message": "deleted", changes: count });
});

// Endpoint to broadcast a "Gold Market Close" message WITH an image
app.post('/api/broadcast/gold-market-close-with-image', verifyToken, upload.single('image'), async (req, res) => {
    const username = req.username; // from verifyToken
    const image = req.file;

    if (!image) {
        return res.status(400).json({ success: false, message: 'لم يتم رفع أي صورة.' });
    }

    const caption = `😱😱😱الذهبببببببببب ( اغلاق السوق )😱😱😱\n@Mudarballoul\n@batoulhassan`;

    try {
        await bot.telegram.sendPhoto(
            config.CHAT_ID,
            { source: image.buffer },
            { caption: caption, disable_notification: true }
        );
        console.log(`[Broadcast] 'Gold Market Close' image sent by ${username}.`);

        // After sending to Telegram, create notifications for all users
        try {
            const { data: users, error: usersError } = await supabase.from('users').select('id').eq('is_active', true);
            if (usersError) throw usersError;

            const notificationMessage = `تنبيه من ${username}: تم إيقاف سوق الذهب!`;
            const notifications = users.map(user => ({
                user_id: user.id,
                message: notificationMessage,
                link: '#home'
            }));

            if (notifications.length > 0) {
                await supabase.from('notifications').insert(notifications);
                sendEventToAll('gold_market_closed'); // Send a specific event for this
                console.log(`[Broadcast] Created ${notifications.length} 'Gold Market Close' notifications.`);
            }
        } catch (notificationError) {
            // Log the error but don't fail the whole request, as the main action (Telegram message) was successful.
            console.error('[Broadcast] Failed to create notifications for Gold Market Close event:', notificationError.message);
        }

        res.status(200).json({ success: true, message: 'تم إرسال رسالة إغلاق سوق الذهب بنجاح.' });
    } catch (error) {
        console.error(`[Broadcast] Failed to send 'Gold Market Close' image. Error:`, error.message);
        res.status(500).json({ success: false, message: 'فشل إرسال الصورة إلى تليجرام.' });
    }
});

// Endpoint to delete a single image from a report (Admin only)
app.delete('/api/reports/:reportId/images', verifyToken, verifyAdmin, async (req, res) => {
    const { reportId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required." });
    }

    try {
        // 1. Fetch the report
        const { data: report, error: fetchError } = await supabase
            .from('reports')
            .select('image_urls')
            .eq('id', reportId)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: "التقرير غير موجود." });
        }

        if (!report.image_urls || !report.image_urls.includes(imageUrl)) {
            return res.status(404).json({ error: "الصورة المحددة غير موجودة في هذا التقرير." });
        }

        // 2. Remove the image from the array
        const updatedImageUrls = report.image_urls.filter(url => url !== imageUrl);

        // 3. Update the report in the database
        const { error: updateError } = await supabase
            .from('reports')
            .update({ image_urls: updatedImageUrls, image_count: updatedImageUrls.length })
            .eq('id', reportId);

        if (updateError) {
            console.error(`Failed to update report ${reportId} after image deletion:`, updateError);
            throw new Error("فشل تحديث سجل التقرير في قاعدة البيانات.");
        }

        // 4. Delete the image file from storage
        const imagePath = imageUrl.substring(imageUrl.indexOf('/reports-images/') + '/reports-images/'.length);
        const { error: storageError } = await supabase.storage.from('reports-images').remove([imagePath]);
        if (storageError) console.error(`Failed to delete image file '${imagePath}' from storage:`, storageError);
        res.json({ message: "تم حذف الصورة بنجاح." });
    } catch (error) {
        console.error("Error deleting image from report:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في الخادم." });
    }
});

// Endpoint for statistics
app.get('/api/stats', verifyToken, async (req, res) => {
    const userId = req.userId;
    const isAdmin = userId === 1;
    console.log(`[API /api/stats] Request from user ID: ${userId}, Is Admin: ${isAdmin}`);

    const filterId = isAdmin ? null : userId;

    // Use a single RPC call for much better performance
    const { data, error } = await supabase.rpc('get_report_stats', {
        user_filter_id: filterId
    });

    if (error) {
        console.error("Stats RPC error:", error);
        return res.status(500).json({ error: `Database function error: ${error.message}` });
    }

    // The RPC function returns a single row with all counts.
    // If there are no reports, it might return an empty array, so we default to an empty object.
    res.json({ message: "success", data: data[0] || {} });
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
app.get('/api/health', async (req, res) => {
    try {
        // A simple query to check DB connection
        const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
        if (error) throw error;
        res.status(200).json({ status: 'ok', services: { api: 'online', database: 'online' } });
    } catch (dbError) {
        console.error("[Health Check] Database connection error:", dbError.message);
        res.status(503).json({ status: 'error', services: { api: 'online', database: 'offline' }, error: dbError.message });
    }
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

    // Send a welcome/connection confirmation event TO THIS CLIENT ONLY
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connection established' })}\n\n`);

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
        sendEventToAll('notification_deleted');
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
                message: `تمت إضافة تعليمة جديدة: ${data.title.replace(/<[^>]*>?/gm, '')}`, // Strip HTML for notification
                link: '#instructions',
                type: 'info',
                icon: 'fa-file-alt'
            }));
            if (notifications.length > 0) await supabase.from('notifications').insert(notifications);
            sendEventToAll('notification_created');
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
                message: `تم تحديث تعليمة: ${data.title.replace(/<[^>]*>?/gm, '')}`, // Strip HTML for notification
                link: '#instructions',
                type: 'info',
                icon: 'fa-edit'
            }));
            if (notifications.length > 0) await supabase.from('notifications').insert(notifications);
            sendEventToAll('notification_created');
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

// --- Template Management Endpoints ---

// GET all templates for the current user
app.get('/api/templates', verifyToken, async (req, res) => {
    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// POST a new template
app.post('/api/templates', verifyToken, async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'العنوان والمحتوى مطلوبان.' });
    }

    const { data, error } = await supabase
        .from('templates')
        .insert({ title, content, user_id: req.userId })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: 'تم إنشاء القالب بنجاح.', data });
});

// PUT (update) a template
app.put('/api/templates/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;

    // RLS handles ownership, so we can update directly.
    const { data, error } = await supabase
        .from('templates')
        .update({ title, content })
        .eq('id', id)
        .eq('user_id', req.userId) // Double-check ownership
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: 'القالب غير موجود أو لا تملك صلاحية تعديله.' });
    res.json({ message: 'تم تحديث القالب بنجاح.', data });
});

// DELETE a template
app.delete('/api/templates/:id', verifyToken, async (req, res) => {
    const { id } = req.params;

    const { error, count } = await supabase
        .from('templates')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', req.userId);

    if (error) return res.status(500).json({ error: error.message });
    if (count === 0) return res.status(404).json({ message: 'القالب غير موجود أو لا تملك صلاحية حذفه.' });
    res.json({ message: 'تم حذف القالب بنجاح.' });
});

// --- Analytics Endpoint ---
app.get('/api/analytics', verifyToken, verifyAdmin, async (req, res) => {
    const { dateRange = 'last30' } = req.query;

    let startDate = new Date();
    const endDate = new Date();

    switch (dateRange) {
        case 'last7':
            startDate.setDate(endDate.getDate() - 7);
            break;
        case 'last90':
            startDate.setDate(endDate.getDate() - 90);
            break;
        case 'all':
            startDate = new Date('2000-01-01'); // A very early date
            break;
        case 'last30':
        default:
            startDate.setDate(endDate.getDate() - 30);
            break;
    }

    try {
        const { data, error } = await supabase.rpc('get_analytics_dashboard', {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
        });

        if (error) throw error;

        res.json({ message: 'success', data });

    } catch (error) {
        console.error('[Analytics] Error fetching analytics data:', error.message);
        res.status(500).json({ error: 'Failed to fetch analytics data.' });
    }
});

// Endpoint to send a custom broadcast message
app.post('/api/broadcast/custom', verifyToken, verifyAdmin, async (req, res) => {
    const { message, target, userId } = req.body;
    const senderUsername = req.username;

    if (!message || !target) {
        return res.status(400).json({ message: 'الرسالة والهدف مطلوبان.' });
    }
    if (target === 'specific' && !userId) {
        return res.status(400).json({ message: 'يجب تحديد مستخدم عند اختيار "موظف معين".' });
    }

    try {
        let userIds = [];
        if (target === 'all') {
            const { data: users, error } = await supabase.from('users').select('id').eq('is_active', true);
            if (error) throw error;
            userIds = users.map(u => u.id);
        } else {
            userIds.push(parseInt(userId, 10));
        }

        if (userIds.length === 0) {
            return res.status(404).json({ message: 'لم يتم العثور على مستخدمين لإرسال الإشعار إليهم.' });
        }

        const notificationMessage = `رسالة من ${senderUsername}: ${message}`;
        const notifications = userIds.map(id => ({
            user_id: id,
            message: notificationMessage,
            link: '#home',
            icon: 'fa-bullhorn'
        }));

        await supabase.from('notifications').insert(notifications);
        sendEventToAll('notification_created');
        await logActivity(req, req.userId, 'send_custom_notification', { target, count: notifications.length });
        res.status(200).json({ success: true, message: `تم إرسال الإشعار إلى ${notifications.length} مستخدم بنجاح.` });
    } catch (error) {
        console.error(`[Broadcast] Failed to send custom message. Error:`, error.message);
        res.status(500).json({ success: false, message: 'فشل إرسال الإشعار المخصص.' });
    }
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

    await logActivity(req, req.userId, 'create_user', { newUserId: finalUser.id, newUserEmail: finalUser.email });
    if (finalUser) {
        try {
            const { error: notifError } = await supabase.from('notifications').insert({
                user_id: 1, // Notify admin with ID 1
                message: `تم إنشاء مستخدم جديد: ${finalUser.username}`,
                link: '#users',
                type: 'info',
                icon: 'fa-user-plus'
            });
            if (notifError) throw notifError;
            // Send event to clients
            sendEventToAll('notification_created');
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

    await logActivity(req, req.userId, 'update_user', { targetUserId: id, updatedFields: Object.keys(updateData) });
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

    await logActivity(req, req.userId, 'toggle_user_status', { targetUserId: userIdToUpdate, newStatus: is_active });
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
    await logActivity(req, req.userId, 'delete_user', { deletedUserId: idToDelete });
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
                message: 'تم تحديث النظام بنجاح. سيتم إعادة تحميل الصفحة.',
                link: '#home',
                type: 'success',
                icon: 'fa-cloud-download-alt'
            }));

            if (notifications.length > 0) {
                await supabase.from('notifications').insert(notifications);
                sendEventToAll('notification_created');
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

// Endpoint to get the full changelog
app.get('/api/changelog', (req, res) => {
    res.json(changelog);
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
