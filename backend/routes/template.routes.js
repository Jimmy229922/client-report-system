const express = require('express');
const router = express.Router();
const { logActivity } = require('../services/activity.service.js');
const Template = require('../models/template.model.js');

module.exports = (verifyToken) => {
    // GET /api/templates
    router.get('/', verifyToken, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const { search } = req.query;

            let query = {};
            if (req.userRole !== 'admin') {
                query.user_id = req.userId;
            }

            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { content: { $regex: search, $options: 'i' } }
                ];
            }

            const total = await Template.countDocuments(query);
            const templates = await Template.find(query)
                .populate('user_id', 'username')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            res.json({
                data: templates.map(t => ({ ...t, id: t._id.toString() })),
                pagination: {
                    total, page, limit, totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('[GET /api/templates] Error:', error.message);
            res.status(500).json({ message: 'Failed to fetch templates' });
        }
    });

    // POST /api/templates
    router.post('/', verifyToken, async (req, res) => {
        try {
            const { title, content } = req.body;
            const userId = req.userId;

            if (!title || !content || !userId) {
                return res.status(400).json({ message: 'Title, content, and user authentication are required.' });
            }

            const newTemplate = await Template.create({ title, content, user_id: userId });
            await logActivity(req, userId, 'create_template', { templateId: newTemplate._id, title });
            const templateObject = newTemplate.toObject();
            templateObject.id = templateObject._id.toString();

            res.status(201).json({ message: 'تم إنشاء القالب بنجاح.', data: templateObject });
        } catch (error) {
            console.error('[POST /api/templates] Error:', error.message);
            res.status(500).json({ message: 'Failed to create template due to a server error.' });
        }
    });

    // PUT /api/templates/:id
    router.put('/:id', verifyToken, async (req, res) => {
        try {
            const { title, content } = req.body;
            const { id } = req.params;
            const userId = req.userId;

            if (!title || !content) {
                return res.status(400).json({ message: 'Title and content are required.' });
            }

            const template = await Template.findById(id);
            if (!template) return res.status(404).json({ message: 'Template not found.' });

            if (template.user_id.toString() !== userId && req.userRole !== 'admin') {
                    return res.status(404).json({ message: 'Template not found or you do not have permission to edit it.' });
            }

            const updatedTemplate = await Template.findByIdAndUpdate(id, { title, content }, { new: true });
            if (!updatedTemplate) return res.status(404).json({ message: 'Template not found.' });

            await logActivity(req, userId, 'update_template', { templateId: id, title });
            res.json({ message: 'تم تحديث القالب بنجاح.', data: updatedTemplate });

        } catch (error) {
            console.error(`[PUT /api/templates/${req.params.id}] Error:`, error.message);
            res.status(500).json({ message: 'Failed to update template.' });
        }
    });

    // DELETE /api/templates/:id
    router.delete('/:id', verifyToken, async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.userId;

            const template = await Template.findById(id);
            if (!template) return res.status(404).json({ message: 'Template not found.' });

            if (template.user_id.toString() !== userId && req.userRole !== 'admin') {
                    return res.status(404).json({ message: 'Template not found or you do not have permission to delete it.' });
            }

            const deleted = await Template.findByIdAndDelete(id);
            if (!deleted) return res.status(404).json({ message: 'Template not found.' });

            await logActivity(req, userId, 'delete_template', { templateId: id });
            res.json({ message: 'تم حذف القالب بنجاح.' });
        } catch (error) {
            console.error(`[DELETE /api/templates/${req.params.id}] Error:`, error.message);
            res.status(500).json({ message: 'Failed to delete template.' });
        }
    });
    return router;
};
