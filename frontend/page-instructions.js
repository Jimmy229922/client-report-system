import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal, initTinyMCE, timeAgo } from './ui.js';

let allInstructions = []; // This will hold all instructions data
let isAdmin = false;
let listenersInitialized = false;

// --- Rich Text Editor (TinyMCE) Logic ---
async function initRichTextEditor(initialContent = '') {
    try {
        const editor = await initTinyMCE('#instruction-content', {
            plugins: 'lists link table code help wordcount directionality autoresize',
            toolbar: 'undo redo | blocks | styles | bold italic | addAuditTemplate | alignleft aligncenter alignright | bullist numlist | ltr rtl | code',
            language: 'ar',
            directionality: 'rtl',
            height: 350,
            menubar: false,
            style_formats: [
                { title: 'تنسيقات مميزة' },
                { title: 'Highlight', inline: 'span', classes: 'highlight' },
                { title: 'Highlight (Positive)', inline: 'span', classes: 'highlight-positive' },
                { title: 'Highlight (Negative)', inline: 'span', classes: 'highlight-negative' },
                { title: 'Condition Label', block: 'span', classes: 'condition-label', wrapper: true },
                { title: 'أنواع التقارير' },
                { title: 'Tag B52', inline: 'span', classes: 'tag tag-b52' },
                { title: 'Tag B53', inline: 'span', classes: 'tag tag-b53' },
            ],
            setup: (editor) => {
                editor.ui.registry.addButton('addAuditTemplate', {
                    text: 'إضافة قالب تدقيق',
                    icon: 'template',
                    tooltip: 'إضافة قالب جاهز لتعليمات التدقيق',
                    onAction: function () {
                        const template = `
                            <p>عند استلام تقرير من نوع <strong><span class="no-timestamp-result">[اكتب نوع التقرير هنا]</span></strong>، يتم اتباع الخطوات التالية:</p>
                            <ol class="instruction-steps">
                                <li>
                                    <strong>فحص <span class="no-timestamp-result">[اكتب الشرط الرئيسي هنا]</span>:</strong>
                                    <ul>
                                        <li>
                                            <span class="condition-label">إذا كان <span class="no-timestamp-result">[الشرط الفرعي أ]</span>:</span>
                                            <ul>
                                                <li>إذا كان <span class="no-timestamp-result">[الحالة 1]</span> <span class="highlight-negative"><span class="no-timestamp-result">[القيمة]</span></span>، فإن <span class="no-timestamp-result">[الإجراء 1]</span>.</li>
                                                <li>إذا كان <span class="no-timestamp-result">[الحالة 2]</span> <span class="highlight-positive"><span class="no-timestamp-result">[القيمة]</span></span>، فإن <span class="no-timestamp-result">[الإجراء 2]</span>.</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <span class="condition-label">إذا كان <span class="no-timestamp-result">[الشرط الفرعي ب]</span>:</span>
                                            <ul>
                                                <li><span class="no-timestamp-result">[اكتب الحالة والإجراء هنا]</span></li>
                                            </ul>
                                        </li>
                                    </ul>
                                </li>
                            </ol>
                        `;
                        editor.insertContent(template);
                    }
                });
                editor.on('change', () => editor.save());
            }
        });
        if (editor) {
            editor.setContent(initialContent);
        } else {
            throw new Error('Failed to initialize TinyMCE editor');
        }
    } catch (error) {
        console.error('Error initializing TinyMCE:', error);
        showToast('فشل في تحميل محرر النصوص. سيتم استخدام النص العادي.', true);
    }
}

function destroyRichTextEditor() {
    if (window.tinymce?.get) {
        const editor = window.tinymce.get('instruction-content');
        if (editor) {
            editor.remove();
        }
    }
}

function renderInstructionCard(instruction) {
    const adminButtons = isAdmin ? `
        <div class="instruction-card-actions">
            <button class="action-btn" data-action="edit-instruction" data-id="${instruction._id}" title="تعديل التعليمة"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="action-btn danger" data-action="delete-instruction" data-id="${instruction._id}" title="حذف التعليمة"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    ` : '';

    return `
        <div class="instruction-card" id="instruction-card-${instruction._id}" data-search-terms="${instruction.search_terms || ''}">
            <div class="instruction-header">
                <h4 class="instruction-title">${instruction.title}</h4>
                ${adminButtons}
            </div>
            <div class="instruction-body">${instruction.content}</div>
        </div>
    `;
}

export function renderInstructionAccordions() {
    const container = document.getElementById('instructions-container');
    if (!container) return;

    const searchTerm = document.getElementById('instructions-search')?.value.toLowerCase() || '';
    const filteredInstructions = allInstructions.filter(instruction => 
        (instruction.title && instruction.title.toLowerCase().includes(searchTerm)) ||
        // Handle cases where content might be null or undefined
        (instruction.content && typeof instruction.content === 'string' && instruction.content.toLowerCase().includes(searchTerm)) ||
        (instruction.content && instruction.content.toLowerCase().includes(searchTerm)) ||
        (instruction.search_terms && instruction.search_terms.toLowerCase().includes(searchTerm))
    );

    if (filteredInstructions.length === 0) {
        container.innerHTML = `
            <div class="empty-state-professional">
                <i class="fas fa-book-open"></i>
                <h3>${searchTerm ? 'لا توجد نتائج مطابقة' : 'لا توجد تعليمات لعرضها'}</h3>
                <p>${searchTerm ? `لم يتم العثور على تعليمات تطابق بحثك عن "${searchTerm}".` : 'ابدأ بإضافة تعليمات جديدة لتظهر هنا.'}</p>
            </div>
        `;
        return;
    }

    const instructionsByCategory = filteredInstructions.reduce((acc, instruction) => {
        const category = instruction.category || 'عام';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(instruction);
        return acc;
    }, {});

    container.innerHTML = Object.keys(instructionsByCategory).sort().map(category => {
        const instructionCardsHtml = instructionsByCategory[category].map(renderInstructionCard).join('');

        return `
            <div class="accordion-group">
                <div class="instruction-header accordion-toggle" data-target-group="${category}">
                    <h3>
                        <i class="fas fa-folder"></i> ${category} <span class="badge">${instructionsByCategory[category].length}</span>
                        ${isAdmin ? `<span class="category-actions"><button class="action-btn" data-action="edit-category" data-category="${category}" title="إعادة تسمية القسم"><i class="fa-solid fa-pen-to-square"></i></button><button class="action-btn danger" data-action="delete-category" data-category="${category}" title="حذف القسم بالكامل"><i class="fa-solid fa-trash-can"></i></button></span>` : ''}
                    </h3>
                </div>
                <div class="instruction-body">${instructionCardsHtml}</div>
            </div>
        `;
    }).join('');
}

async function fetchAndRenderInstructions() {
    const container = document.getElementById('instructions-container');
    if (!container) return;
    container.innerHTML = `<div class="spinner-container"><div class="spinner"></div></div>`;
    
    // Reset search input on full fetch
    const searchInput = document.getElementById('instructions-search');
    if (searchInput) searchInput.value = '';
    
    try {
        const result = await fetchWithAuth('/api/instructions');
        allInstructions = result.data || [];
        renderInstructionAccordions();
    } catch (error) {
        showToast(error.message, true);
        container.innerHTML = `<p class="empty-state error">${error.message}</p>`;
    }
}

function populateCategoryDropdown(selectedCategory = '') {
    const categorySelect = document.getElementById('instruction-category');
    const newCategoryContainer = document.getElementById('new-category-container');
    const newCategoryInput = document.getElementById('new-category-name');

    if (!categorySelect) return;

    const categories = [...new Set(allInstructions.map(i => i.category))];
    
    categorySelect.innerHTML = `
        <option value="" disabled>اختر قسماً...</option>
        ${categories.map(cat => `<option value="${cat}" ${cat === selectedCategory ? 'selected' : ''}>${cat}</option>`).join('')}
        <option value="--new--">إضافة قسم جديد...</option>
    `;

    categorySelect.addEventListener('change', () => {
        if (categorySelect.value === '--new--') {
            newCategoryContainer.classList.remove('hidden');
            newCategoryInput.required = true;
        } else {
            newCategoryContainer.classList.add('hidden');
            newCategoryInput.required = false;
        }
    });

    categorySelect.dispatchEvent(new Event('change'));
}

async function openModalForCreate() {
    const form = document.getElementById('instruction-form');
    const modalTitle = document.getElementById('instruction-modal-title');
    const modal = document.getElementById('instruction-modal');
    if (!form || !modalTitle || !modal) return;
    
    form.reset();
    form.querySelector('#instruction-id').value = '';
    modalTitle.textContent = 'إضافة تعليمة جديدة';
    modal.classList.add('show');
    populateCategoryDropdown();
    await initRichTextEditor('');
}

async function openModalForEdit(instruction) {
    const form = document.getElementById('instruction-form');
    const modalTitle = document.getElementById('instruction-modal-title');
    const modal = document.getElementById('instruction-modal');
    if (!form || !modalTitle || !modal) return;
    
    form.reset();
    form.querySelector('#instruction-id').value = instruction._id;
    form.querySelector('#instruction-title').value = instruction.title;
    form.querySelector('#instruction-search-terms').value = instruction.search_terms || '';
    modalTitle.textContent = 'تعديل التعليمة';
    modal.classList.add('show');
    populateCategoryDropdown(instruction.category);
    await initRichTextEditor(instruction.content);
}

function openInstructionViewModal(instruction) {
    const modal = document.getElementById('instruction-view-modal');
    if (!modal) return;

    modal.querySelector('#instruction-view-title').textContent = instruction.title;
    modal.querySelector('#instruction-view-content').innerHTML = instruction.content;

    const actionsContainer = modal.querySelector('#instruction-view-actions');
    if (isAdmin) {
        actionsContainer.innerHTML = `
            <button class="action-btn" data-action="edit" data-id="${instruction._id}" title="تعديل"><i class="fas fa-pen"></i> تعديل</button>
            <button class="action-btn danger" data-action="delete" data-id="${instruction._id}" title="حذف"><i class="fas fa-trash-alt"></i> حذف</button>
        `;
    } else {
        actionsContainer.innerHTML = '';
    }

    modal.classList.add('show');
}

function closeModal() {
    destroyRichTextEditor();
    const editModal = document.getElementById('instruction-modal');
    if (editModal) editModal.classList.remove('show');
    
    const viewModal = document.getElementById('instruction-view-modal');
    if (viewModal) viewModal.classList.remove('show');
}

function closeViewModal() {
    const viewModal = document.getElementById('instruction-view-modal');
    if (viewModal) viewModal.classList.remove('show');
}
async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form) return;
    
    const id = form.querySelector('#instruction-id').value;

    const categorySelect = document.getElementById('instruction-category');
    let category = categorySelect ? categorySelect.value : '';
    if (category === '--new--') {
        const newCategoryInput = document.getElementById('new-category-name');
        category = newCategoryInput ? newCategoryInput.value.trim() : '';
    }

    if (!category) {
        showToast('الرجاء اختيار أو إدخال اسم للقسم.', true);
        return;
    }

    let content = '';
    const editor = window.tinymce?.get('instruction-content');
    content = editor ? editor.getContent() : '';

    if (!content) {
        const textarea = document.getElementById('instruction-content');
        content = textarea ? textarea.value : '';
    }

    const titleInput = form.querySelector('#instruction-title');
    const searchInput = form.querySelector('#instruction-search-terms');
    const payload = {
        title: titleInput ? titleInput.value : '',
        content: content,
        search_terms: searchInput ? searchInput.value : '',
        category: category
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/instructions/${id}` : '/api/instructions';

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const result = await fetchWithAuth(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast(result.message);
        closeModal();
        fetchAndRenderInstructions();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'حفظ التعليمة';
        }
    }
}

async function handleEditCategory(oldCategoryName) {
    const newCategoryName = prompt(`أدخل الاسم الجديد للقسم "${oldCategoryName}":`, oldCategoryName);

    if (newCategoryName && newCategoryName.trim() !== '' && newCategoryName !== oldCategoryName) {
        const confirmed = await showConfirmModal(
            'تأكيد إعادة التسمية',
            `هل أنت متأكد من تغيير اسم القسم من "${oldCategoryName}" إلى "${newCategoryName}"؟ سيتم تحديث جميع التعليمات في هذا القسم.`,
            { confirmText: 'نعم، أعد التسمية' }
        );

        if (confirmed) {
            try {
                const result = await fetchWithAuth('/api/instructions/category', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldCategory: oldCategoryName, newCategory: newCategoryName.trim() })
                });
                showToast(result.message);
                fetchAndRenderInstructions();
            } catch (error) {
                showToast(error.message, true);
            }
        }
    }
}

async function handleDeleteCategory(categoryName) {
    const confirmed = await showConfirmModal(
        'تأكيد حذف القسم',
        `تحذير! أنت على وشك حذف القسم "${categoryName}" وجميع التعليمات الموجودة بداخله. هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.`,
        {
            iconClass: 'fas fa-exclamation-triangle',
            iconColor: 'var(--danger-color)',
            confirmText: 'نعم، حذف القسم بالكامل',
            confirmClass: 'submit-btn danger-btn'
        }
    );

    if (confirmed) {
        try {
            const result = await fetchWithAuth('/api/instructions/category', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: categoryName })
            });
            showToast(result.message);
            fetchAndRenderInstructions();
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function handleDelete(id) {
    const confirmed = await showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذه التعليمة؟', {
        iconClass: 'fas fa-trash-alt',
        iconColor: 'var(--danger-color)',
        confirmText: 'نعم، حذف',
        confirmClass: 'submit-btn danger-btn'
    });

    if (confirmed) {
        try {
            const result = await fetchWithAuth(`/api/instructions/${id}`, { method: 'DELETE' });
            showToast(result.message);
            fetchAndRenderInstructions();
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function initSpecialIdentifiersManager() {
    const adminManagerContainer = document.getElementById('special-identifiers-manager');
    const viewerContainer = document.getElementById('special-identifiers-viewer');
    if (!viewerContainer) return;

    const listEl = viewerContainer.querySelector('#special-identifiers-list');
    const form = adminManagerContainer ? adminManagerContainer.querySelector('#add-identifier-form') : null;
    if (!listEl) return;
    
    const renderList = (items) => {
        if (items.length === 0) {
            listEl.innerHTML = '<p>لا توجد تبليغات حالياً.</p>';
            return;
        }
        listEl.innerHTML = items.map(item => `
            <div class="special-identifier-card">
                <div class="card-icon-wrapper type-${item.type}">
                     <i class="fas ${item.type === 'ip' ? 'fa-network-wired' : 'fa-envelope'}"></i>
                </div>
                <div class="card-content-wrapper">
                    <div class="card-header">
                        <span class="identifier-value">${item.identifier}</span>
                        ${isAdmin ? `<button class="action-btn danger" data-id="${item._id}" title="حذف"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    </div>
                    <p class="identifier-message">${item.message}</p>
                </div>
            </div>
        `).join('');
    };

    const fetchAndRender = async () => {
        try {
            const result = await fetchWithAuth('/api/special-identifiers/list');
            renderList(result.data);
        } catch (error) {
            showToast('فشل تحميل قائمة التبليغات.', true);
        }
    };

    // Make it accessible from outside
    viewerContainer.fetchAndRender = fetchAndRender;

    if (form) {
        const identifierInput = form.elements.identifier;
        const typeSelect = form.elements.type;
        const messageTextarea = form.elements.message;

        const handleIdentifierInput = () => {
            const identifier = identifierInput.value.trim();
            const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
            const emailRegex = /^\S+@\S+\.\S+$/;

            if (ipRegex.test(identifier)) {
                typeSelect.value = 'ip';
            } else if (emailRegex.test(identifier)) {
                typeSelect.value = 'email';
            }

            if (!identifier) {
                messageTextarea.placeholder = 'اكتب رسالة التنبيه هنا...';
                messageTextarea.value = '';
                return;
            }

            if (typeSelect.value === 'ip') {
                messageTextarea.value = `تم إدخال الـ IP: \`${identifier}\`\nيجب تحويل هذا العميل إلى **B5 3** فورًا.`;
            } else if (typeSelect.value === 'email') {
                messageTextarea.value = `تم إدخال البريد الإلكتروني: \`${identifier}\`\nيجب تحويل الحساب المرتبط به إلى مجموعة **B5 3** فورًا.`;
            }
        };

        identifierInput.addEventListener('input', handleIdentifierInput);
        typeSelect.addEventListener('change', handleIdentifierInput);

        identifierInput.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;
            const match = pastedText.match(ipRegex);
            identifierInput.value = match ? match[0] : pastedText;
            identifierInput.dispatchEvent(new Event('input', { bubbles: true }));
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const identifier = form.elements.identifier.value.trim();
            const type = form.elements.type.value;
            const message = form.elements.message.value.trim();

            if (!identifier || !message) {
                showToast('الرجاء ملء جميع الحقول.', true);
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                await fetchWithAuth('/api/special-identifiers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier, type, message })
                });
                showToast('تمت إضافة التبليغ بنجاح.');
                form.reset();
                messageTextarea.value = '';
                fetchAndRender();
                document.dispatchEvent(new CustomEvent('specialIdentifiersUpdated'));
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة';
            }
        });
    }

    listEl.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.action-btn.danger');
        if (!deleteBtn) return;

        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirmModal(
            'تأكيد الحذف',
            'هل أنت متأكد من حذف هذا التبليغ؟ سيتم إعلام جميع الموظفين.',
            { confirmClass: 'submit-btn danger-btn', confirmText: 'نعم، حذف' }
        );

        if (confirmed) {
            try {
                await fetchWithAuth(`/api/special-identifiers/${id}`, { method: 'DELETE' });
                showToast('تم حذف التبليغ.');
                // إرسال حدث لإعلام باقي أجزاء التطبيق بالتحديث
                document.dispatchEvent(new CustomEvent('specialIdentifiersUpdated'));
                fetchAndRender();
            } catch (error) {
                showToast(error.message, true);
            }
        }
    });

    fetchAndRender();
}

export function addInstruction(instruction) {
    // Add to the start of the array to show it first
    allInstructions.unshift(instruction);
    renderInstructionAccordions();
}

export function updateInstruction(updatedInstruction) {
    const index = allInstructions.findIndex(i => i._id === updatedInstruction._id);
    if (index !== -1) {
        allInstructions[index] = updatedInstruction;
        renderInstructionAccordions();
    }
}

export function removeInstruction(id) {
    const index = allInstructions.findIndex(i => i._id === id);
    if (index !== -1) {
        allInstructions.splice(index, 1);
        renderInstructionAccordions();
    }
}

export function fetchAndRenderSpecialIdentifiers() {
    const viewerContainer = document.getElementById('special-identifiers-viewer');
    // The function is attached to the element in initSpecialIdentifiersManager
    if (viewerContainer && typeof viewerContainer.fetchAndRender === 'function') {
        viewerContainer.fetchAndRender();
    } else {
        // Fallback in case the page structure changes or it's called too early
        console.warn('Could not find fetchAndRender function for special identifiers.');
    }
}

function initializePageListeners() {
    if (listenersInitialized) return;

    const modal = document.getElementById('instruction-modal');
    const form = document.getElementById('instruction-form');
    const closeBtn = document.getElementById('instruction-modal-close-btn');

    if (modal && form && closeBtn) {
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        form.addEventListener('submit', handleFormSubmit);
        listenersInitialized = true;
    }
}

export function renderInstructionsPage() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    const userStr = localStorage.getItem('user');
    isAdmin = false;
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isAdmin = user.role === 'admin';
        } catch (e) { /* ignore */ }
    }

    mainContent.innerHTML = `
    <div class="instructions-page-container">
        <div class="page-header">
            <h1 class="page-title">تعليمات قسم إدارة المخاطر</h1>
            <div class="page-header-actions">
                <p>مرجع سريع للإجراءات والسياسات المتبعة في القسم.</p>
                ${isAdmin ? '<button id="add-instruction-btn" class="submit-btn" style="width: auto;"><i class="fas fa-plus"></i> إضافة تعليمة جديدة</button>' : ''}
            </div>
        </div>

        <div class="search-container" style="max-width: 800px; margin: 0 auto 2rem auto;">
            <i class="fas fa-search"></i>
            <input type="text" id="instructions-search" class="search-input" placeholder="ابحث عن تعليمات...">
        </div>

        <div class="instructions-container" id="instructions-container">
            <!-- Instructions will be rendered here by JS -->
        </div>

        <!-- Modal for adding/editing instructions -->
        <div id="instruction-modal" class="modal">
            <div class="modal-dialog form-container" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 id="instruction-modal-title" class="page-title" style="margin-bottom: 0;"></h2>
                    <button class="close-btn" id="instruction-modal-close-btn">&times;</button>
                </div>
                <form id="instruction-form" class="modal-body">
                    <input type="hidden" id="instruction-id">
                    <div class="form-group">
                        <label for="instruction-title">العنوان</label>
                        <input type="text" id="instruction-title" required>
                    </div>
                    <div class="form-group">
                        <label for="instruction-category">القسم</label>
                        <select id="instruction-category" required></select>
                    </div>
                    <div class="form-group hidden" id="new-category-container">
                        <label for="new-category-name">اسم القسم الجديد</label>
                        <input type="text" id="new-category-name">
                    </div>
                    <div class="form-group">
                        <label for="instruction-content">المحتوى</label>
                        <textarea id="instruction-content"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="instruction-search-terms">كلمات مفتاحية للبحث (مفصولة بمسافات)</label>
                        <input type="text" id="instruction-search-terms" placeholder="مثال: b52 b53 uk netherlands">
                    </div>
                    <button type="submit" class="submit-btn">حفظ التعليمة</button>
                </form>
            </div>
        </div>
        
        ${isAdmin ? `
            <div id="special-identifiers-manager" class="admin-only form-container" style="margin-top: 2rem; border-top: 2px solid var(--border-color); padding-top: 2rem;">
                <h2 style="margin-bottom: 1.5rem; font-size: 1.5rem;"><i class="fas fa-cogs"></i> إدارة التبليغات الخاصة</h2>
                <form id="add-identifier-form" class="add-identifier-form">
                    <div class="form-group">
                        <label for="identifier-input">الـ IP أو البريد الإلكتروني</label>
                        <input type="text" id="identifier-input" name="identifier" placeholder="e.g., 166.88.54.203 or user@example.com" required>
                    </div>
                    <div class="form-group">
                        <label for="identifier-type">النوع</label>
                        <select id="identifier-type" name="type">
                            <option value="ip">IP Address</option>
                            <option value="email">Email</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="identifier-message">رسالة التنبيه</label>
                        <textarea id="identifier-message" name="message" rows="2" placeholder="e.g., يجب تحويل هذا الحساب إلى B5 3 فورًا." required></textarea>
                    </div>
                    <button type="submit" class="submit-btn" style="grid-column: 1 / -1;"><i class="fas fa-plus"></i> إضافة تبليغ</button>
                </form>
            </div>
        ` : ''}

        <div id="special-identifiers-viewer" class="form-container" style="margin-top: 2rem;">
            <h2 style="margin-bottom: 1.5rem; font-size: 1.5rem;"><i class="fas fa-bullhorn"></i> قائمة التبليغات الخاصة</h2>
            <div id="special-identifiers-list" class="special-identifiers-list"></div>
        </div>
    </div>
    `;

    fetchAndRenderInstructions();
    initializePageListeners();

    const searchInput = document.getElementById('instructions-search');
    if (searchInput) {
        searchInput.addEventListener('input', renderInstructionAccordions);
    }

        const instructionsContainer = document.getElementById('instructions-container');
        if (instructionsContainer) {
            instructionsContainer.addEventListener('click', (e) => {
                const target = e.target;
                const editInstructionBtn = target.closest('button[data-action="edit-instruction"]');
                const deleteInstructionBtn = target.closest('button[data-action="delete-instruction"]');
                const editCategoryBtn = target.closest('button[data-action="edit-category"]');
                const deleteCategoryBtn = target.closest('button[data-action="delete-category"]');
                const accordionHeader = target.closest('.accordion-group > .instruction-header.accordion-toggle');
    
                if (editInstructionBtn) {
                    e.stopPropagation();
                    const instruction = allInstructions.find(i => i._id == editInstructionBtn.dataset.id);
                    if (instruction) openModalForEdit(instruction);
                    return;
                } else if (deleteInstructionBtn) {
                    e.stopPropagation();
                    handleDelete(deleteInstructionBtn.dataset.id);
                    return;
                } else if (editCategoryBtn) {
                    e.stopPropagation();
                    handleEditCategory(editCategoryBtn.dataset.category);
                    return;
                } else if (deleteCategoryBtn) {
                    e.stopPropagation();
                    handleDeleteCategory(deleteCategoryBtn.dataset.category);
                    return;
                } else if (accordionHeader) { // Handle main accordion toggle
                    accordionHeader.classList.toggle('active');
                    const content = accordionHeader.nextElementSibling;
                    if (content) {
                        if (content.style.maxHeight) {
                            content.style.maxHeight = null; // Collapse
                        } else {
                            content.style.maxHeight = content.scrollHeight + 40 + "px"; // Expand with extra padding
                        }
                    }
                }
            });
        }
    
        // Wire up "Add instruction" button if present
        const addBtn = document.getElementById('add-instruction-btn');
        if (addBtn) {
            addBtn.addEventListener('click', openModalForCreate);
        }
    
        // Initialize special identifiers manager/viewer
        initSpecialIdentifiersManager();
    }