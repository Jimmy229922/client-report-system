// 1. استيراد المكتبات
require('dotenv').config(); // لتحميل المتغيرات من ملف .env
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, spawn } = require('child_process');

// Check for essential environment variables on startup and provide a detailed error message
const requiredEnvVars = ['BOT_TOKEN', 'CHAT_ID', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('---');
    console.error('FATAL ERROR: Missing required environment variables.');
    console.error(`The following variables are missing or empty in your .env file: ${missingVars.join(', ')}`);
    console.error('---');
    process.exit(1); // Exit the application with an error code
}

// 2. إعدادات أساسية
const app = express();
const port = process.env.PORT || 3001;
const bot = new Telegraf(process.env.BOT_TOKEN);

// 3. إعداد Multer (للتعامل مع الصور)
// سيتم تخزين الصور في الذاكرة مؤقتاً بدلاً من حفظها على القرص
const upload = multer({ storage: multer.memoryStorage() });

// 4. تفعيل الـ Middlewares
app.use(cors()); // للسماح بالطلبات من الواجهة الأمامية
app.use(express.json()); // لتحليل البيانات من نوع JSON
app.use(express.urlencoded({ extended: true })); // لتحليل البيانات من النماذج
// تقديم ملفات الواجهة الأمامية بشكل ثابت
app.use(express.static(path.join(__dirname, '../frontend')));

// 4.5. إعداد قاعدة البيانات
const db = new sqlite3.Database('./reports.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Database connected successfully.');
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_text TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                image_count INTEGER DEFAULT 0
            )`);

            const migrateUsersAndStart = () => {
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    email TEXT UNIQUE,
                    password TEXT NOT NULL
                )`);

                // Chain the rest of the setup to ensure order and start the server at the end
                db.all("PRAGMA table_info(users)", (err, columns) => {
                    if (err) { console.error("DB Migration Check Error:", err); return; }

                    const hasEmailColumn = columns.some(col => col.name === 'email');

                    const onDbReady = () => {
                        db.get("SELECT COUNT(id) as count FROM users", (err, row) => {
                            if (err) { console.error("Error checking for users:", err.message); return; }

                            if (row && row.count === 0) {
                                console.log("Users table is empty. Creating default admin user...");
                                const salt = bcrypt.genSaltSync(10);
                                const hash = bcrypt.hashSync("password", salt);
                                db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', ['INZO LLC', 'admin@inzo.llc', hash], () => {
                                    console.log('✓ Default user "INZO LLC" created.');
                                    app.listen(port, () => {
                                        const url = `http://localhost:${port}`;
                                        console.log(`🚀 السيرفر يعمل على المنفذ ${url}`);
                                        console.log(`إذا لم يفتح المتصفح تلقائياً، قم بنسخ الرابط أعلاه ولصقه في المتصفح.`);                                        
                                        // Try to open the browser, but don't let it crash the server if it fails.
                                        import('open').then(openModule => {
                                            openModule.default(url);
                                        }).catch(err => {
                                            console.warn('Could not open browser automatically. Please open it manually.');
                                        });
                                    });
                                });
                            } else {
                                app.listen(port, () => {
                                    const url = `http://localhost:${port}`;
                                    console.log(`🚀 السيرفر يعمل على المنفذ ${url}`);
                                    console.log(`إذا لم يفتح المتصفح تلقائياً، قم بنسخ الرابط أعلاه ولصقه في المتصفح.`);                                    
                                    import('open').then(openModule => {
                                        openModule.default(url);
                                    }).catch(err => {
                                        console.warn('Could not open browser automatically. Please open it manually.');
                                    });
                                });
                            }
                        });
                    };

                    if (!hasEmailColumn) {
                        console.log("Database schema is outdated. Applying migration...");
                        // Step 1: Add the column without the UNIQUE constraint.
                        db.run("ALTER TABLE users ADD COLUMN email TEXT", (alterErr) => {
                            if (alterErr) { console.error("Migration Failed (Step 1/3 - Add Column):", alterErr); return; }
                            console.log("✓ Step 1/3: 'email' column added.");
                            // Step 2: Populate the email and update username for the original default admin user.
                            db.run("UPDATE users SET email = ?, username = ? WHERE id = 1 AND username = 'admin'", ['admin@inzo.llc', 'INZO LLC'], (updateErr) => {
                                if (updateErr) { console.error("Migration Failed (Step 2/3 - Populate Data):", updateErr); return; }
                                console.log("✓ Step 2/3: Default admin data updated.");
                                // Step 3: Create a UNIQUE index on the now-populated column.
                                db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)", (indexErr) => {
                                    if (indexErr) { console.error("Migration Failed (Step 3/3 - Create Index):", indexErr); return; }
                                    console.log("✓ Step 3/3: Unique index on 'email' created. Migration complete.");
                                    onDbReady();
                                });
                            });
                        });
                    } else {
                        onDbReady();
                    }
                });
            };

            // First, check and migrate the 'reports' table.
            db.all("PRAGMA table_info(reports)", (err, columns) => {
                if (err) { console.error("DB Migration Check Error (reports):", err); return; }
                const hasImageCount = columns.some(col => col.name === 'image_count');
                if (!hasImageCount) {
                    console.log("Applying migration: Adding 'image_count' to 'reports' table...");
                    db.run("ALTER TABLE reports ADD COLUMN image_count INTEGER DEFAULT 0", (alterErr) => {
                        if (alterErr) { console.error("Migration Failed (reports):", alterErr); return; }
                        console.log("✓ 'reports' table migrated.");
                        migrateUsersAndStart(); // Chain to the next step
                    });
                } else {
                    migrateUsersAndStart(); // Chain to the next step
                }
            });
        });
    }
});

const verifyToken = (req, res, next) => {
    let token = req.headers['authorization'];

    if (!token) return res.status(403).send({ auth: false, message: 'No token provided.' });

    if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
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
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ message: 'Server error.' });
        if (!user) return res.status(404).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ auth: false, token: null, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });

        const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: 86400 // 24 hours
        });

        res.status(200).json({ auth: true, token: token, user: { id: user.id, username: user.username, email: user.email } });
    });
});

app.put('/api/profile/password', verifyToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.userId;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "كلمة المرور الحالية والجديدة مطلوبتان." });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل." });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ message: 'Server error.' });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const passwordIsValid = bcrypt.compareSync(currentPassword, user.password);
        if (!passwordIsValid) {
            return res.status(401).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword, salt);

        db.run(`UPDATE users SET password = ? WHERE id = ?`, [hash, userId], function(err) {
            if (err) { return res.status(500).json({ error: err.message }); }
            res.json({ message: "تم تغيير كلمة المرور بنجاح." });
        });
    });
});

app.put('/api/profile/details', verifyToken, (req, res) => {
    const { username, email } = req.body;
    const userId = req.userId;

    if (!username && !email) {
        return res.status(400).json({ message: "لا يوجد بيانات للتحديث." });
    }

    // Prevent admin (ID 1) from changing their username
    if (username && userId === 1) {
        return res.status(403).json({ message: "لا يمكن تغيير اسم المستخدم الخاص بالمسؤول." });
    }

    const sqlParts = [];
    const params = [];

    if (username) {
        sqlParts.push('username = ?');
        params.push(username);
    }

    if (email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
        }
        sqlParts.push('email = ?');
        params.push(email);
    }

    const sql = `UPDATE users SET ${sqlParts.join(', ')} WHERE id = ?`;
    params.push(userId);

    db.run(sql, params, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
            }
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) { return res.status(404).json({ message: "المستخدم غير موجود." }); }
        
        db.get('SELECT id, username, email FROM users WHERE id = ?', [userId], (err, updatedUser) => {
            if (err) { return res.json({ message: "تم تحديث البيانات بنجاح." }); }
            res.json({ message: "تم تحديث البيانات بنجاح.", user: updatedUser });
        });
    });
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
                const sentPhotoMessages = await bot.telegram.sendMediaGroup(process.env.CHAT_ID, mediaGroup);

                // 2. أرسل النص كرسالة رد على أول صورة تم إرسالها
                await bot.telegram.sendMessage(process.env.CHAT_ID, reportText, {
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
                await bot.telegram.sendMediaGroup(process.env.CHAT_ID, mediaGroup);
            }
        } else {
            // إذا لم تكن هناك صور، أرسل النص فقط
            await bot.telegram.sendMessage(process.env.CHAT_ID, reportText);
        }

        // بعد الإرسال الناجح، قم بحفظ التقرير في قاعدة البيانات
        const imageCount = images ? images.length : 0;
        db.run(`INSERT INTO reports (report_text, image_count) VALUES (?, ?)`, [reportText, imageCount], function(err) {
            if (err) {
                console.error('Error saving report to database:', err.message);
                // Don't block the user, just log the error
            } else {
                console.log(`Report saved to database with ID: ${this.lastID}`);
            }
        });

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
app.get('/api/reports', verifyToken, (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : -1;
    const search = req.query.search || '';

    const query = `
        SELECT * FROM reports 
        WHERE report_text LIKE ? 
        ORDER BY timestamp DESC 
        LIMIT ?
    `;
    const params = [`%${search}%`, limit];
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// Endpoint to delete a report
app.delete('/api/reports/:id', verifyToken, (req, res) => {
    db.run(`DELETE FROM reports WHERE id = ?`, req.params.id, function(err) {
        if (err) {
            res.status(500).json({ "error": res.message });
            return;
        }
        res.json({ "message": "deleted", changes: this.changes });
    });
});

// Endpoint for statistics
app.get('/api/stats', verifyToken, (req, res) => {
    // Using a single, more efficient query
    const query = `
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN report_text LIKE '%#suspicious%' THEN 1 ELSE 0 END) AS suspicious,
            SUM(CASE WHEN report_text LIKE '%#deposit_percentages%' THEN 1 ELSE 0 END) AS deposit,
            SUM(CASE WHEN report_text LIKE '%#new-positions%' THEN 1 ELSE 0 END) AS new_positions,
            SUM(CASE WHEN report_text LIKE '%#credit-out%' THEN 1 ELSE 0 END) AS credit_out,
            SUM(CASE WHEN report_text LIKE 'تقرير تحويل الحسابات%' THEN 1 ELSE 0 END) AS account_transfer,
            SUM(CASE WHEN report_text LIKE '%#payouts%' THEN 1 ELSE 0 END) AS payouts
        FROM reports
    `;

    db.get(query, (err, row) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json({ message: "success", data: row });
    });
});

// Endpoint for weekly stats
app.get('/api/stats/weekly', verifyToken, (req, res) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const query = `
        SELECT
            strftime('%Y-%m-%d', timestamp, 'localtime') as date,
            COUNT(*) as count
        FROM reports
        WHERE timestamp >= ?
        GROUP BY date
        ORDER BY date ASC
    `;

    db.all(query, [sevenDaysAgo.toISOString()], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json({ message: "success", data: rows });
    });
});

// --- User Management Endpoints ---

// Get all users
app.get('/api/users', verifyToken, verifyAdmin, (req, res) => {
    db.all("SELECT id, username, email FROM users ORDER BY id ASC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "success", data: rows });
    });
});

// Add a new user
app.post('/api/users', verifyToken, verifyAdmin, (req, res) => {
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

    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.run(sql, [username, email, hash], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: "User created", data: { id: this.lastID, username: username, email: email } });
    });
});

// Update user data (username, email, password)
app.put('/api/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { password, username, email } = req.body;
    const { id } = req.params;

    // Prevent admin (ID 1) from changing their username via this endpoint
    if (username && id == 1) {
        return res.status(403).json({ message: "لا يمكن تغيير اسم المستخدم الخاص بالمسؤول." });
    }

    if (!password && !username && !email) {
        return res.status(400).json({ message: "لا يوجد بيانات للتحديث." });
    }

    const sqlParts = [];
    const params = [];

    if (username) {
        sqlParts.push('username = ?');
        params.push(username);
    }

    if (email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صالحة." });
        }
        sqlParts.push('email = ?');
        params.push(email);
    }

    // Only validate and hash password if it's a non-empty string
    if (password && typeof password === 'string') {
        if (password.length < 6) {
            return res.status(400).json({ message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل." });
        }
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        sqlParts.push('password = ?');
        params.push(hash);
    }

    const sql = `UPDATE users SET ${sqlParts.join(', ')} WHERE id = ?`;
    params.push(id);

    db.run(sql, params, function(err) {
        if (err) { 
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ message: "البريد الإلكتروني موجود بالفعل." });
            }
            return res.status(500).json({ error: err.message }); 
        }
        if (this.changes === 0) { return res.status(404).json({ message: "المستخدم غير موجود." }); }
        
        db.get('SELECT id, username, email FROM users WHERE id = ?', [id], (err, updatedUser) => {
            if (err) { return res.json({ message: "تم تحديث بيانات المستخدم بنجاح." }); }
            // Return the updated user object to help frontend stay in sync
            res.json({ message: "تم تحديث بيانات المستخدم بنجاح.", user: updatedUser });
        });
    });
});

// Delete a user
app.delete('/api/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const idToDelete = parseInt(req.params.id, 10);

    if (idToDelete === 1) { return res.status(403).json({ message: "لا يمكن حذف المستخدم المسؤول الافتراضي." }); }
    if (idToDelete === req.userId) { return res.status(403).json({ message: "لا يمكنك حذف نفسك." }); }

    db.run(`DELETE FROM users WHERE id = ?`, idToDelete, function(err) {
        if (err) { return res.status(500).json({ error: err.message }); }
        if (this.changes === 0) { return res.status(404).json({ message: "المستخدم غير موجود." }); }
        res.json({ message: "تم حذف المستخدم بنجاح." });
    });
});

// Endpoint for self-updating the application
app.post('/api/system/update', verifyToken, verifyAdmin, (req, res) => {
    const projectRoot = path.join(__dirname, '..');
    const command = 'git pull && npm install --prefix backend';

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
