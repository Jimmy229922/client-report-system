const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

const { verifyToken, verifyAdmin } = require('../middleware/auth.js');
const { handleUploadErrors } = require('../middleware/uploads.js');
const { logActivity } = require('../services/activity.service.js');
const { sendEventToAll, sendEventToUser } = require('../services/sse.service.js');

const User = require('../models/user.model.js');
const Notification = require('../models/notification.model.js');

// This module exports a function that takes dependencies as arguments
module.exports = function({ upload, gridfsBucket }) {
    const userRouter = express.Router();
    const profileRouter = express.Router();

    // --- Profile Routes --- //

    // GET /api/profile
    profileRouter.get('/', verifyToken, async (req, res) => {
        try {
            const user = await User.findById(req.userId).select('-password').lean();
            if (!user) return res.status(404).json({ message: 'المستخدم غير موجود.' });
            res.json({ data: user });
        } catch (error) {
            console.error('[Profile] Error:', error.message);
            res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات الملف الشخصي.' });
        }
    });

    // POST /api/profile/avatar
    profileRouter.post('/avatar', verifyToken, handleUploadErrors(upload.single('avatar')), async (req, res) => {
        const userId = req.userId;
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
        }
    
        try {
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'المستخدم غير موجود.' });
            }
    
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

    // POST /api/profile/complete-tour
    profileRouter.post('/complete-tour', verifyToken, async (req, res) => {
        try {
            await User.findByIdAndUpdate(req.userId, { has_completed_tour: true });
            await logActivity(req, req.userId, 'complete_tour');
            res.json({ message: 'Tour status updated successfully.' });
        } catch (error) {
            console.error('[Complete Tour] Error:', error.message);
            res.status(500).json({ message: 'Failed to update tour status.' });
        }
    });

    // --- User Routes --- //

    // GET /api/users
    userRouter.get('/', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const users = await User.find({ is_active: true }).select('-password').lean();
            res.json({ data: users });
        } catch (error) {
            console.error('[Users] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch users' });
        }
    });

    // POST /api/users
    userRouter.post('/', verifyToken, verifyAdmin, handleUploadErrors(upload.single('avatar')), async (req, res) => {
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
            role: role || 'editor',
            is_active: true
        };
    
        try {
            const user = await User.create(newUserPayload);
            const finalUserObject = user.toObject();
            finalUserObject.id = finalUserObject._id.toString();

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

    // GET /api/users/role/:role
    userRouter.get('/role/:role', verifyToken, async (req, res) => {
        try {
            const users = await User.find({ role: req.params.role, is_active: true }).select('username _id').lean();
            res.json({ data: users });
        } catch (error) {
            console.error('[Users by Role] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch users by role' });
        }
    });

    // GET /api/users/online-status
    userRouter.get('/online-status', verifyToken, verifyAdmin, async (req, res) => {
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

    // PUT /api/users/:id
    userRouter.put('/:id', verifyToken, verifyAdmin, handleUploadErrors(upload.none()), async (req, res) => {
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

    // POST /api/users/:id/notify
    userRouter.post('/:id/notify', verifyToken, verifyAdmin, async (req, res) => {
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

    // POST /api/users/:id/avatar
    userRouter.post('/:id/avatar', verifyToken, verifyAdmin, handleUploadErrors(upload.single('avatar')), async (req, res) => {
        const { id } = req.params;
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم رفع أي صورة.' });
        }
    
        try {
            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({ message: 'المستخدم غير موجود.' });
            }
    
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
            userObject.id = userObject._id.toString();
    
            sendEventToAll('user_updated', { user: userObject });
            res.json({ message: 'تم تحديث الصورة الشخصية بنجاح.', data: userObject });
        } catch (error) {
            console.error(`[POST /api/users/${id}/avatar] Error:`, error.message);
            res.status(500).json({ message: 'فشل تحديث الصورة الشخصية.' });
        }
    });

    // DELETE /api/users/:id
    userRouter.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const userId = req.params.id;
            const user = await User.findById(userId);
    
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
    
            await User.findByIdAndDelete(userId);
    
            await logActivity(req, req.userId, 'delete_user', { targetUserId: userId });
            
            sendEventToAll('user_deleted', { userId: userId });
    
            res.json({ message: 'تم حذف المستخدم وبياناته بشكل دائم.' });
    
        } catch (error) {
            console.error('[Delete User] Error:', error.message);
            res.status(500).json({ message: 'فشل حذف المستخدم.' });
        }
    });

    return { userRouter, profileRouter };
}