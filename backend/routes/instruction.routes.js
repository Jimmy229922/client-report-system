const express = require('express');
const router = express.Router();
const { logActivity } = require('../services/activity.service.js');
const { sendEventToAll } = require('../services/sse.service.js');
const Instruction = require('../models/instruction.model.js');
const User = require('../models/user.model.js');
const Notification = require('../models/notification.model.js');

module.exports = (verifyToken, verifyAdmin) => {
    // GET /api/instructions
    router.get('/', verifyToken, async (req, res) => {
        try {
            const instructions = await Instruction.find().sort({ title: 1 }).lean();
            res.json({ data: instructions });
        } catch (error) {
            console.error('[Instructions] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch instructions' });
        }
    });

    // POST /api/instructions
    router.post('/', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { title, content, category, search_terms } = req.body;
            if (!title || !content || !category) {
                return res.status(400).json({ message: 'Title, content, and category are required.' });
            }
            const newInstruction = await Instruction.create({ title, content, category, search_terms: search_terms || [] });
            await logActivity(req, req.userId, 'create_instruction', { instructionId: newInstruction._id, title: newInstruction.title });

            // Notify all users about the new instruction
            try {
                const users = await User.find({ is_active: true }).select('_id');
                const notificationMessage = `تم إضافة تعليمة جديدة: ${title}`;
                const notifications = users.map(user => ({
                    user_id: user._id,
                    message: notificationMessage,
                    link: '#instructions',
                    type: 'info',
                    icon: 'fa-info-circle'
                }));
                
                if (notifications.length > 0) {
                    await Notification.insertMany(notifications);
                }

                sendEventToAll('notification_created', { 
                    message: notificationMessage,
                    link: '#instructions',
                    type: 'info',
                    icon: 'fa-info-circle'
                });
            } catch (notificationError) {
                console.error('[Create Instruction] Failed to send notification:', notificationError.message);
                // Do not block the main response for this
            }

            res.status(201).json({ message: 'تم إنشاء التعليمة بنجاح.', data: newInstruction });
        } catch (error) {
            console.error('[Create Instruction] Error:', error.message);
            res.status(500).json({ message: 'Failed to create instruction' });
        }
    });

    // PUT /api/instructions/:id
    router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const { title, content, category, search_terms } = req.body;
            if (!title || !content || !category) {
                return res.status(400).json({ message: 'Title, content, and category are required.' });
            }
            const updatedInstruction = await Instruction.findByIdAndUpdate(
                req.params.id,
                { title, content, category, search_terms: search_terms || [] },
                { new: true }
            );
            if (!updatedInstruction) return res.status(404).json({ message: 'Instruction not found' });
            await logActivity(req, req.userId, 'update_instruction', { instructionId: req.params.id, title: updatedInstruction.title });
            res.json({ message: 'تم تحديث التعليمة بنجاح.', data: updatedInstruction });
        } catch (error) {
            console.error('[Update Instruction] Error:', error.message);
            res.status(500).json({ message: 'Failed to update instruction' });
        }
    });

    // DELETE /api/instructions/:id
    router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
        try {
            const deleted = await Instruction.findByIdAndDelete(req.params.id);
            if (!deleted) return res.status(404).json({ message: 'Instruction not found' });
            await logActivity(req, req.userId, 'delete_instruction', { instructionId: req.params.id, title: deleted.title });
            res.status(204).send();
        } catch (error) {
            console.error('[Delete Instruction] Error:', error.message);
            res.status(500).json({ message: 'Failed to delete instruction' });
        }
    });

    return router;
};

