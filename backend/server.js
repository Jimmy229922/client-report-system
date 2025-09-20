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
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    // This middleware assumes verifyToken has run before it.
    // The user with ID 1 is the default admin.
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
        .eq('email', email)
        .single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ message: 'Server error.' });
    if (!user) return res.status(404).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ auth: false, token: null, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, config.JWT_SECRET, {
        expiresIn: 86400 // 24 hours
    });

    res.status(200).json({ auth: true, token: token, user: { id: user.id, username: user.username, email: user.email } });
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
        updateData.email = email;
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
        .select('id, username, email')
        .eq('id', userId)
        .single();

    if (fetchError) { return res.json({ message: "تم تحديث البيانات بنجاح." }); }
    res.json({ message: "تم تحديث البيانات بنجاح.", user: updatedUser });
});

// 6. Protected API Endpoints
app.post('/api/send-report', verifyToken, upload.array('images', 3), async (req, res) => {
    try {
        // استخراج البيانات النصية من الطلب
        const { reportText } = req.body;
        // استخراج ملفات الصور
        const images = req.files;

        if (!reportText) {
            return res.status(400).json({ success: false, message: 'نص التقرير مفقود.' });
        }

        const TELEGRAM_CAPTION_LIMIT = 1024;

        // التحقق من وجود صور
        if (images && images.length > 0) {
            // إذا كان النص أطول من الحد المسموح به للتعليق على الصور
            if (reportText.length > TELEGRAM_CAPTION_LIMIT) {
                console.log('النص طويل، سيتم إرسال الصور والنص بشكل منفصل.');
                // 1. أرسل الصور أولاً بدون تعليق
                const mediaGroup = images.map(image => ({
                    type: 'photo',
                    media: { source: image.buffer },
                }));
                const sentPhotoMessages = await bot.telegram.sendMediaGroup(config.CHAT_ID, mediaGroup);

                // 2. أرسل النص كرسالة رد على أول صورة تم إرسالها
                await bot.telegram.sendMessage(config.CHAT_ID, reportText, {
                    reply_to_message_id: sentPhotoMessages[0].message_id
                });
            } else {
                // إذا كان النص ضمن الحد المسموح به، أرسله كتعليق
                console.log('النص قصير، سيتم إرساله كتعليق على الصورة.');
                const mediaGroup = images.map((image, index) => ({
                    type: 'photo',
                    media: { source: image.buffer },
                    caption: index === 0 ? reportText : '',
                }));
                await bot.telegram.sendMediaGroup(config.CHAT_ID, mediaGroup);
            }
        } else {
            // إذا لم تكن هناك صور، أرسل النص فقط
            await bot.telegram.sendMessage(config.CHAT_ID, reportText);
        }

        // بعد الإرسال الناجح، قم بحفظ التقرير في قاعدة البيانات
        const imageCount = images ? images.length : 0;
        const { error: insertError } = await supabase
            .from('reports')
            .insert({ report_text: reportText, image_count: imageCount });

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
app.get('/api/reports', verifyToken, async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 0;
    const search = req.query.search || '';

    let query = supabase.from('reports').select('*');

    if (search) {
        query = query.like('report_text', `%${search}%`);
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
app.delete('/api/reports/:id', verifyToken, async (req, res) => {
    const { error, count } = await supabase.from('reports').delete({ count: 'exact' }).eq('id', req.params.id);
    if (error) {
        return res.status(500).json({ "error": error.message });
    }
    res.json({ "message": "deleted", changes: count });
});

// Endpoint for statistics
app.get('/api/stats', verifyToken, async (req, res) => {
    const queries = [
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%#suspicious%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%#deposit_percentages%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%#new-positions%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%#credit-out%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%تقرير تحويل الحسابات%'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).like('report_text', '%#payouts%'),
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

// --- User Management Endpoints ---

// Get all users
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const { data, error } = await supabase.from('users').select('id, username, email').order('id', { ascending: true });
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
        .insert({ username, email, password: hash })
        .select('id, username, email')
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
        updateData.email = email;
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

    const { data, error } = await supabase.from('users').update(updateData).eq('id', id).select('id, username, email').single();

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

    if (error) { return res.status(500).json({ error: error.message }); }
    if (count === 0) { return res.status(404).json({ message: "المستخدم غير موجود." }); }
    res.json({ message: "تم حذف المستخدم بنجاح." });
});

// Endpoint for self-updating the application
app.post('/api/system/update', verifyToken, (req, res) => {
    const projectRoot = path.join(__dirname, '..');
    // Using `cd` is more reliable across different npm versions and platforms than `--prefix`.
    const command = 'git pull && cd backend && npm install';

    exec(command, { cwd: projectRoot }, (err, stdout, stderr) => {
        if (err) {
            console.error('Update failed during exec:', stderr);
            return res.status(500).json({ message: 'فشل تنفيذ أمر التحديث. تأكد من تثبيت Git وأن المشروع تم تحميله عبر git clone.', error: stderr });
        }

        if (stdout.includes('Already up to date.')) {
            return res.json({ message: 'النظام محدث بالفعل. لا حاجة لإعادة التشغيل.' });
        }

        // If we are here, there were updates.
        res.json({ message: 'تم سحب التحديثات بنجاح. سيتم إعادة تشغيل السيرفر...' });

        // Use a short delay to ensure the response is sent before exiting
        setTimeout(() => {
            const subprocess = spawn(process.argv[0], process.argv.slice(1), {
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
        .insert({ id: 1, username: 'INZO LLC', email: 'admin@inzo.llc', password: hash });

      if (insertError) {
        console.error('Failed to create default admin user:', insertError);
      } else {
        console.log('✓ Default admin user created.');
      }
    }
}

initializeAdmin().then(() => {
    app.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`🚀 Supabase connected. Server is running at ${url}`);
        import('open').then(openModule => openModule.default(url)).catch(() => {});
    });
});
