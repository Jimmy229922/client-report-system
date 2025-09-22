import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let templatesCache = [];

// Function to render a single template card
function createTemplateCard(template) {
    return `
        <div class="template-card" data-template-id="${template.id}">
            <div class="template-card-header">
                <h4 class="template-title">${template.title}</h4>
                <div class="template-actions">
                    <button class="action-btn edit-template-btn" title="تعديل"><i class="fas fa-pen"></i></button>
                    <button class="action-btn delete-template-btn" title="حذف"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="template-card-body">
                <div class="template-content-preview">${template.content}</div>
            </div>
        </div>
    `;
}

// Function to show the modal for adding/editing a template
async function showTemplateModal(template = null) {
    // --- Helper functions for the editor ---
    function initTemplateEditor(initialContent = '') {
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        tinymce.init({
            selector: '#template-content-input',
            plugins: 'lists link code wordcount directionality autoresize',
            toolbar: 'undo redo | blocks | bold italic | bullist numlist | alignleft aligncenter alignright | ltr rtl | code',
            skin: isDarkMode ? 'oxide-dark' : 'default',
            content_css: isDarkMode ? 'dark' : 'default',
            language: 'ar',
            directionality: 'rtl',
            height: 300,
            menubar: false,
            setup: (editor) => {
                editor.on('init', () => {
                    editor.setContent(initialContent);
                });
                editor.on('change', () => {
                    editor.save(); // Sync content with the underlying textarea
                });
            }
        });
    }

    function destroyTemplateEditor() {
        const editor = tinymce.get('template-content-input');
        if (editor) {
            editor.remove();
        }
    }
    // --- End of helper functions ---

    const isEditing = template !== null;
    const title = isEditing ? 'تعديل القالب' : 'إضافة قالب جديد';
    const confirmText = isEditing ? 'حفظ التغييرات' : 'إضافة القالب';

    const modalHtml = `
        <div id="template-editor-modal" class="modal show">
            <div class="modal-dialog" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-magic"></i> ${title}</h3>
                    <button class="close-btn" id="close-template-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="template-title-input">عنوان القالب</label>
                        <input type="text" id="template-title-input" value="${isEditing ? template.title : ''}" placeholder="مثال: رد على استفسار عام">
                    </div>
                    <div class="form-group">
                        <label for="template-content-input">محتوى القالب</label>
                        <textarea id="template-content-input"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancel-template-btn" class="cancel-btn">إلغاء</button>
                    <button id="save-template-btn" class="submit-btn">${confirmText}</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalElement = document.getElementById('template-editor-modal');
    const titleInput = modalElement.querySelector('#template-title-input');

    initTemplateEditor(isEditing ? template.content : '');

    const closeModal = () => {
        destroyTemplateEditor();
        modalElement.remove();
    };

    modalElement.querySelector('#close-template-modal').addEventListener('click', closeModal);
    modalElement.querySelector('#cancel-template-btn').addEventListener('click', closeModal);
    modalElement.addEventListener('click', (e) => { if (e.target === modalElement) closeModal(); });

    modalElement.querySelector('#save-template-btn').addEventListener('click', async () => {
        const newTitle = titleInput.value.trim();
        const newContent = tinymce.get('template-content-input').getContent();

        if (!newTitle || !newContent) {
            showToast('يجب ملء العنوان والمحتوى.', true);
            return;
        }

        const url = isEditing ? `/api/templates/${template.id}` : '/api/templates';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const result = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle, content: newContent })
            });
            showToast(result.message);
            closeModal();
            fetchAndRenderTemplates(); // Refresh the list
        } catch (error) {
            showToast(error.message, true);
        }
    });
}

// Main function to fetch and display templates
async function fetchAndRenderTemplates() {
    const container = document.getElementById('templates-grid');
    if (!container) return;
    container.innerHTML = `<div class="spinner"></div>`;

    try {
        const result = await fetchWithAuth('/api/templates');
        templatesCache = result.data || [];

        if (templatesCache.length > 0) {
            container.innerHTML = templatesCache.map(createTemplateCard).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state-professional">
                    <i class="fas fa-file-alt"></i>
                    <h3>لا توجد قوالب محفوظة</h3>
                    <p>اضغط على "إضافة قالب جديد" لإنشاء أول قالب لك.</p>
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل القوالب.</p>`;
        showToast(error.message, true);
    }
}

// Setup event listeners for the page
function initTemplatesPage() {
    document.getElementById('add-template-btn')?.addEventListener('click', () => showTemplateModal());

    const grid = document.getElementById('templates-grid');
    grid?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-template-btn');
        const deleteBtn = e.target.closest('.delete-template-btn');

        if (editBtn) {
            const card = editBtn.closest('.template-card');
            const templateId = parseInt(card.dataset.templateId, 10);
            const template = templatesCache.find(t => t.id === templateId);
            if (template) showTemplateModal(template);
        }

        if (deleteBtn) {
            const card = deleteBtn.closest('.template-card');
            const templateId = card.dataset.templateId;
            
            const confirmed = await showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذا القالب؟');
            if (confirmed) {
                try {
                    const result = await fetchWithAuth(`/api/templates/${templateId}`, { method: 'DELETE' });
                    showToast(result.message);
                    fetchAndRenderTemplates();
                } catch (error) {
                    showToast(error.message, true);
                }
            }
        }
    });

    fetchAndRenderTemplates();
}

// Main render function for the page
export function renderTemplatesPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header-actions">
            <h1 class="page-title">إدارة القوالب السريعة</h1>
            <button id="add-template-btn" class="submit-btn" style="width: auto;"><i class="fas fa-plus"></i> إضافة قالب جديد</button>
        </div>
        <p>هنا يمكنك إنشاء وتعديل القوالب النصية التي تستخدمها بشكل متكرر في صفحة إنشاء التقارير.</p>
        <div id="templates-grid" class="templates-grid">
            <!-- Templates will be loaded here -->
        </div>
    `;
    initTemplatesPage();
}