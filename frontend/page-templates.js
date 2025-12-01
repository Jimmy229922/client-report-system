import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let allTemplates = [];
let currentFilteredTemplates = [];
let listenersInitialized = false;
let isAdmin = false;
let currentUserId = null;

// --- Pagination State ---
let currentPage = 1;
const TEMPLATES_PER_PAGE = 8;

/**
 * Checks the user's role from localStorage.
 */
function checkUserStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        isAdmin = false;
        currentUserId = null;
        return;
    }
    try {
        const user = JSON.parse(userStr);
        isAdmin = user.role === 'admin';
        currentUserId = user.id;
    } catch (e) { /* ignore */ }
}

/**
 * يعرض بطاقة قالب فردية
 * @param {object} template - كائن القالب
 * @returns {string} - كود HTML للبطاقة
 */
function renderTemplateCard(template) {
    const previewContent = template.content.length > 100 ? template.content.substring(0, 100) + '...' : template.content;
    const creationDate = new Date(template.created_at).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // An admin can edit/delete any template. A user can only edit/delete their own.
    const canModify = isAdmin || (currentUserId && template.user_id._id.toString() === currentUserId.toString());

    const actions = canModify ? `
        <div class="template-actions">
            <button class="action-btn" data-action="edit" data-id="${template._id}" title="تعديل"><i class="fas fa-pen"></i></button>
            <button class="action-btn danger" data-action="delete" data-id="${template._id}" title="حذف"><i class="fas fa-trash-alt"></i></button>
        </div>
    ` : '';

    return `
        <div class="template-card" id="template-card-${template._id}">
            <div class="card-body">
                <h4 class="template-title">${template.title}</h4>
                <p class="template-preview">${previewContent.replace(/<[^>]*>?/gm, '')}</p>
            </div>
            <div class="card-footer">
                <span class="template-date"><i class="fas fa-calendar-alt fa-fw"></i> ${creationDate}</span>
                ${actions}
            </div>
        </div>
    `;
}

/**
 * Renders pagination controls.
 * @param {number} totalPages - The total number of pages.
 */
function renderPaginationControls(totalPages) {
    const paginationContainer = document.getElementById('templates-pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    paginationContainer.innerHTML = `
        <button class="pagination-btn submit-btn" data-action="prev" ${currentPage === 1 ? 'disabled' : ''} style="width: auto; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 0.5rem; ${currentPage === 1 ? 'background-color: var(--border-color); cursor: not-allowed; border: none;' : ''}">
            <i class="fas fa-arrow-left"></i> السابق
        </button>
        <span class="pagination-info" style="margin: 0 1rem; font-weight: bold;">صفحة ${currentPage} من ${totalPages}</span>
        <button class="pagination-btn submit-btn" data-action="next" ${currentPage === totalPages ? 'disabled' : ''} style="width: auto; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 0.5rem; ${currentPage === totalPages ? 'background-color: var(--border-color); cursor: not-allowed; border: none;' : ''}">
            التالي <i class="fas fa-arrow-right"></i>
        </button>
    `;
}

/**
 * Renders the templates for the current page.
 * @param {Array} templatesToRender - The array of templates to paginate and render.
 */
function renderPaginatedTemplates(templatesToRender) {
    const container = document.getElementById('templates-grid');
    if (!container) return;

    const totalPages = Math.ceil(templatesToRender.length / TEMPLATES_PER_PAGE);
    currentPage = Math.max(1, Math.min(currentPage, totalPages)); // Ensure currentPage is valid

    const startIndex = (currentPage - 1) * TEMPLATES_PER_PAGE;
    const endIndex = startIndex + TEMPLATES_PER_PAGE;
    const paginatedTemplates = templatesToRender.slice(startIndex, endIndex);

    if (templatesToRender.length === 0) {
        const searchInput = document.getElementById('templates-search');
        if (searchInput && searchInput.value) {
            container.innerHTML = '<p class="empty-state">لا توجد قوالب تطابق بحثك.</p>';
        } else {
            container.innerHTML = '<p class="empty-state">لا توجد قوالب لعرضها. ابدأ بإضافة قالب جديد!</p>';
        }
    } else {
        container.innerHTML = paginatedTemplates.map(renderTemplateCard).join('');
    }

    renderPaginationControls(totalPages);
    if (templatesToRender.length === 0) {
        document.getElementById('templates-pagination').innerHTML = '';
        return;
    }
}

/**
 * يجلب القوالب من الخادم ويعرضها
 */
async function fetchAndRenderTemplates() {
    const container = document.getElementById('templates-grid');
    if (!container) return;
    container.innerHTML = `<div class="spinner-container"><div class="spinner"></div></div>`;

    try {
        const result = await fetchWithAuth('/api/templates');
        allTemplates = result.data || [];
        currentFilteredTemplates = [...allTemplates];
        renderPaginatedTemplates(currentFilteredTemplates);
    } catch (error) {
        showToast(error.message, true);
        container.innerHTML = `<p class="empty-state error">${error.message}</p>`;
    }
}

/**
 * يفتح نافذة الإضافة/التعديل
 * @param {object|null} template - كائن القالب للتعديل، أو null للإضافة
 */
function openTemplateModal(template = null) {
    const form = document.getElementById('template-form');
    const modalTitle = document.getElementById('template-modal-title');
    const modal = document.getElementById('template-modal');
    if (!form || !modalTitle || !modal) return;

    form.reset();
    if (template) {
        // وضع التعديل
        modalTitle.textContent = 'تعديل القالب';
        form.querySelector('#template-id').value = template._id;
        form.querySelector('#template-title').value = template.title;
        form.querySelector('#template-content').value = template.content;
    } else {
        // وضع الإضافة
        modalTitle.textContent = 'إضافة قالب جديد';
        form.querySelector('#template-id').value = '';
    }
    modal.classList.add('show');
}

/**
 * يغلق نافذة الإضافة/التعديل
 */
function closeTemplateModal() {
    const modal = document.getElementById('template-modal');
    if (modal) modal.classList.remove('show');
}

/**
 * يتعامل مع إرسال نموذج القالب (إضافة/تعديل)
 * @param {Event} e - حدث الإرسال
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('#template-id').value;
    const title = form.querySelector('#template-title').value;
    const content = form.querySelector('#template-content').value;

    const payload = { title, content };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/templates/${id}` : '/api/templates';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const result = await fetchWithAuth(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast(result.message);
        closeTemplateModal();
        fetchAndRenderTemplates(); // إعادة تحميل القوالب
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'حفظ القالب';
    }
}

/**
 * يتعامل مع حذف قالب
 * @param {string} id - معرف القالب
 */
async function handleDelete(id) {
    const confirmed = await showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذا القالب؟ لا يمكن التراجع عن هذا الإجراء.', {
        iconClass: 'fas fa-trash-alt',
        iconColor: 'var(--danger-color)',
        confirmText: 'نعم، حذف',
        confirmClass: 'submit-btn danger-btn'
    });

    if (confirmed) {
        try {
            const result = await fetchWithAuth(`/api/templates/${id}`, { method: 'DELETE' });
            showToast(result.message);
            fetchAndRenderTemplates(); // إعادة تحميل القوالب
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

/**
 * يربط المستمعات للأحداث في الصفحة
 */
function initializePageListeners() {
    if (listenersInitialized) return;

    document.getElementById('add-template-btn')?.addEventListener('click', () => openTemplateModal());
    document.getElementById('template-modal-close-btn')?.addEventListener('click', closeTemplateModal);
    document.getElementById('template-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'template-modal') closeTemplateModal();
    });

    const templateForm = document.getElementById('template-form');
    if (templateForm) {
        templateForm.addEventListener('submit', handleFormSubmit);

        // --- تفعيل اللصق الذكي ---
        templateForm.addEventListener('paste', (e) => {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const lines = pastedText.trim().split('\n');

            // إذا كان النص الملصق يحتوي على أكثر من سطر
            if (lines.length > 1) {
                e.preventDefault(); // منع اللصق الافتراضي
                const titleInput = document.getElementById('template-title');
                const contentTextarea = document.getElementById('template-content');

                titleInput.value = lines[0]; // السطر الأول كعنوان
                contentTextarea.value = lines.slice(1).join('\n'); // الباقي كمحتوى
                showToast('تم تقسيم النص الملصق إلى عنوان ومحتوى.');
            }
        });
    }

    // البحث
    const searchInput = document.getElementById('templates-search');
    searchInput?.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        currentFilteredTemplates = allTemplates.filter(template =>
            template.title.toLowerCase().includes(searchTerm) ||
            template.content.toLowerCase().includes(searchTerm)
        );
        currentPage = 1; // Reset to first page on search
        renderPaginatedTemplates(currentFilteredTemplates);
    });

    // Pagination events
    document.getElementById('templates-pagination')?.addEventListener('click', (e) => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'next') {
            currentPage++;
        } else if (action === 'prev') {
            currentPage--;
        }
        renderPaginatedTemplates(currentFilteredTemplates);
    });

    // أحداث التعديل والحذف
    document.getElementById('templates-grid')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('button[data-action="edit"]');
        const deleteBtn = e.target.closest('button[data-action="delete"]');

        if (editBtn) {
            const template = allTemplates.find(t => t._id === editBtn.dataset.id);
            if (template) openTemplateModal(template);
        } else if (deleteBtn) {
            handleDelete(deleteBtn.dataset.id);
        }
    });

    listenersInitialized = true;
}

/**
 * الدالة الرئيسية لعرض صفحة القوالب
 */
export function renderTemplatesPage() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    checkUserStatus(); // Check user status on page render

    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">إدارة القوالب</h1>
            <div class="page-header-actions">
                <p>أنشئ وعدّل قوالب الملاحظات الخاصة بك لتسريع كتابة التقارير.</p>
                <button id="add-template-btn" class="submit-btn" style="width: auto;"><i class="fas fa-plus"></i> إضافة قالب جديد</button>
            </div>
        </div>

        <div class="search-container" style="max-width: 800px; margin: 0 auto 2rem auto;">
            <i class="fas fa-search"></i>
            <input type="text" id="templates-search" class="search-input" placeholder="ابحث عن قالب...">
        </div>

        <div id="templates-grid" class="templates-grid">
            <!-- Template cards will be rendered here -->
        </div>

        <div id="templates-pagination" class="pagination-container" style="margin-top: 2rem; text-align: center;">
            <!-- Pagination controls will be rendered here -->
        </div>

        <!-- Modal for adding/editing templates -->
        <div id="template-modal" class="modal">
            <div class="modal-dialog form-container" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 id="template-modal-title" class="page-title" style="margin-bottom: 0;"></h2>
                    <button class="close-btn" id="template-modal-close-btn">&times;</button>
                </div>
                <form id="template-form" class="modal-body">
                    <input type="hidden" id="template-id">
                    <div class="form-group">
                        <label for="template-title">عنوان القالب</label>
                        <input type="text" id="template-title" required>
                    </div>
                    <div class="form-group">
                        <label for="template-content">محتوى القالب</label>
                        <textarea id="template-content" rows="8" required></textarea>
                    </div>
                    <button type="submit" class="submit-btn">حفظ القالب</button>
                </form>
            </div>
        </div>
    `;

    fetchAndRenderTemplates();
    initializePageListeners();
}