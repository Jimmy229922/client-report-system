import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let allInstructions = [];
let isAdmin = false;
let listenersInitialized = false;

// --- Rich Text Editor (TinyMCE) Logic ---
function initRichTextEditor(initialContent = '') {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    tinymce.init({
        selector: '#instruction-content',
        plugins: 'lists link table code help wordcount directionality autoresize styles',
        toolbar: 'undo redo | blocks | styles | bold italic | addAuditTemplate | alignleft aligncenter alignright | bullist numlist | ltr rtl | code',
        skin: isDarkMode ? 'oxide-dark' : 'default',
        content_css: isDarkMode ? 'dark' : 'default',
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
            // Add the custom template button
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
                    // Hide the toolbar after inserting the template for a cleaner look
                    editor.execCommand('ToggleToolbarDrawer');
                }
            });

            editor.on('init', () => {
                editor.setContent(initialContent);
            });
            editor.on('change', () => {
                editor.save(); // Sync content with the underlying textarea
            });
        }
    });
}

function destroyRichTextEditor() {
    const editor = tinymce.get('instruction-content');
    if (editor) {
        editor.remove();
    }
}

function renderInstructionCard(instruction) {
    const adminButtons = isAdmin ? `
        <button class="action-btn" data-action="edit" data-id="${instruction.id}" title="تعديل"><i class="fas fa-pen"></i></button>
        <button class="action-btn danger" data-action="delete" data-id="${instruction.id}" title="حذف"><i class="fas fa-trash-alt"></i></button>
    ` : '';

    return `
        <div class="instruction-card" id="instruction-card-${instruction.id}" data-search-term="${instruction.search_terms || ''}">
            <div class="instruction-header">
                <h3>${instruction.title}</h3>
                ${isAdmin ? `<div class="header-actions">${adminButtons}</div>` : ''}
            </div>
            <div class="instruction-body">
                ${instruction.content}
            </div>
        </div>
    `;
}

function renderInstructionAccordions() {
    const container = document.getElementById('instructions-container');
    if (!container) return;

    if (allInstructions.length === 0) {
        container.innerHTML = '<p class="empty-state">لا توجد تعليمات لعرضها.</p>';
        return;
    }

    // Group instructions by category
    const instructionsByCategory = allInstructions.reduce((acc, instruction) => {
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
                <div class="instruction-header">
                    <h3>${category} (${instructionsByCategory[category].length})</h3>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
                <div class="accordion-content">${instructionCardsHtml}</div>
            </div>
        `;
    }).join('');
}

async function fetchAndRenderInstructions() {
    const container = document.getElementById('instructions-container');
    if (!container) return;
    container.innerHTML = `<div class="spinner-container"><div class="spinner"></div></div>`;

    try {
        const result = await fetchWithAuth('/api/instructions');
        allInstructions = result.data || [];
        renderInstructionAccordions();
    } catch (error) {
        showToast(error.message, true);
        container.innerHTML = `<p class="empty-state error">${error.message}</p>`;
    }
}

// --- Modal Logic ---
function populateCategoryDropdown(selectedCategory = '') {
    const categorySelect = document.getElementById('instruction-category');
    const newCategoryContainer = document.getElementById('new-category-container');
    const newCategoryInput = document.getElementById('new-category-name');

    if (!categorySelect) return;

    // Get unique categories from all instructions
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

    // Trigger change event in case a category is pre-selected
    categorySelect.dispatchEvent(new Event('change'));
}

function openModalForCreate() {
    const form = document.getElementById('instruction-form');
    const modalTitle = document.getElementById('instruction-modal-title');
    const modal = document.getElementById('instruction-modal');
    form.reset();
    form.querySelector('#instruction-id').value = '';
    modalTitle.textContent = 'إضافة تعليمة جديدة';
    modal.classList.add('show');
    populateCategoryDropdown();
    initRichTextEditor(); // Initialize editor for new instruction
}

function openModalForEdit(instruction) {
    const form = document.getElementById('instruction-form');
    const modalTitle = document.getElementById('instruction-modal-title');
    const modal = document.getElementById('instruction-modal');
    form.reset();
    form.querySelector('#instruction-id').value = instruction.id;
    form.querySelector('#instruction-title').value = instruction.title;
    form.querySelector('#instruction-search-terms').value = instruction.search_terms || '';
    modalTitle.textContent = 'تعديل التعليمة';
    modal.classList.add('show');
    populateCategoryDropdown(instruction.category);
    initRichTextEditor(instruction.content); // Initialize editor with existing content
}

function closeModal() {
    destroyRichTextEditor(); // Important: remove the editor instance
    document.getElementById('instruction-modal').classList.remove('show');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('#instruction-id').value;

    const categorySelect = document.getElementById('instruction-category');
    let category = categorySelect.value;
    if (category === '--new--') {
        category = document.getElementById('new-category-name').value.trim();
    }

    if (!category) {
        showToast('الرجاء اختيار أو إدخال اسم للقسم.', true);
        return;
    }

    const payload = {
        title: form.querySelector('#instruction-title').value,
        content: tinymce.get('instruction-content').getContent(), // Get content from the editor
        search_terms: form.querySelector('#instruction-search-terms').value,
        category: category
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/instructions/${id}` : '/api/instructions';

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
        closeModal();
        fetchAndRenderInstructions(); // Refresh the list
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'حفظ التعليمة';
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
            fetchAndRenderInstructions(); // Refresh the list
        } catch (error) {
            showToast(error.message, true);
        }
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

    const userStr = localStorage.getItem('user');
    isAdmin = false;
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isAdmin = user.id === 1;
        } catch (e) { /* ignore */ }
    }

    mainContent.innerHTML = `
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
    `;

    fetchAndRenderInstructions();
    initializePageListeners();

    // Add search functionality
    const searchInput = document.getElementById('instructions-search');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.accordion-group').forEach(group => {
            let hasVisibleCard = false;
            group.querySelectorAll('.instruction-card').forEach(card => {
                const cardTerms = card.dataset.searchTerm.toLowerCase();
                const cardTitle = card.querySelector('h3').innerText.toLowerCase();
                const cardContent = card.querySelector('.instruction-body').innerText.toLowerCase();
                const isMatch = cardTerms.includes(searchTerm) || cardTitle.includes(searchTerm) || cardContent.includes(searchTerm);
                
                card.style.display = isMatch ? 'block' : 'none';
                if (isMatch) {
                    hasVisibleCard = true;
                }
            });
            group.style.display = hasVisibleCard ? 'block' : 'none';
        });
    });

    // Add event listeners using delegation
    const instructionsContainer = document.getElementById('instructions-container');
    instructionsContainer.addEventListener('click', (e) => {
        // Prioritize action buttons to prevent toggling the card
        const editBtn = e.target.closest('button[data-action="edit"]');
        const deleteBtn = e.target.closest('button[data-action="delete"]');
        if (editBtn || deleteBtn) {
            e.stopPropagation(); // Stop the click from bubbling up to the header
            if (editBtn) {
                const instruction = allInstructions.find(i => i.id == editBtn.dataset.id);
                if (instruction) openModalForEdit(instruction);
            }
            if (deleteBtn) {
                handleDelete(deleteBtn.dataset.id);
            }
            return;
        }

        // Only handle accordion group clicks now
        const accordionHeader = e.target.closest('.accordion-group > .instruction-header');

        if (accordionHeader) {
            accordionHeader.classList.toggle('active');
            const content = accordionHeader.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        }
    });

    if (isAdmin) {
        const addBtn = document.getElementById('add-instruction-btn');
        if(addBtn) addBtn.addEventListener('click', openModalForCreate);
    }
}