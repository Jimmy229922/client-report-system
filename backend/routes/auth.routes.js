const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config.json');
const User = require('../models/user.model.js');
const { logActivity } = require('../services/activity.service.js');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'يرجى ملء جميع الحقول المطلوبة.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: 'البريد الإلكتروني غير صالح.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    try {
        const newUser = await User.create({
            username,
            email: email.toLowerCase(),
            password: hash,
            role: 'editor',
            is_active: true
        });

        const userResponse = { id: newUser._id, username: newUser.username, email: newUser.email };
        console.log(`[Register] Sending welcome email to: ${newUser.email}`);
        await logActivity(req, newUser._id, 'register', { email: newUser.email });

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح.', user: userResponse });
    } catch (error) {
        console.error('[Register] Error:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقًا.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'يرجى ملء جميع الحقول المطلوبة.' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            await logActivity(req, user._id, 'login_failed', { email: user.email, reason: 'Incorrect password' });
            return res.status(401).json({ message: 'كلمة المرور أو البريد الإلكتروني غير صحيح.' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, email: user.email, role: user.role }, 
            config.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        await logActivity(req, user._id, 'login_success', { email: user.email });

        res.json({
            auth: true,
            message: 'تم تسجيل الدخول بنجاح.', 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                email: user.email, 
                role: user.role,
                has_completed_tour: user.has_completed_tour,
                avatar_url: user.avatar_url
            } 
        });
    } catch (error) {
        console.error('[Login] Error:', error.message);
        res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة لاحقًا.' });
    }
});

module.exports = router;
