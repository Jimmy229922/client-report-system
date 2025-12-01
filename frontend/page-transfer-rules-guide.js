import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let allRulesCache = []; // This will hold the rules as fetched for the current user type
let isAdmin = false;

// --- Configuration ---
const ACCOUNT_TYPES = [
    'B5 With outbouuns',
    'B52',
    'B53',
    'Zero Standard Account',
    'B2 after deposit',
    'B5 Yemen',
    'Copy Trade',
    'B5 First Step',
    'Depositor Zero',
    'B1',
    'B1 Client',
    'B1 Client 2',
    'B5'
].sort();
// --- End Configuration ---

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
        const user = JSON.parse(userStr);
        return user.role === 'admin';
    } catch (e) { return false; }
}

function renderRuleGroup(groupName, rules) {
    const adminGlobalActions = isAdmin ? `
        <div class="header-actions">
            <button class="submit-btn-secondary" data-action="add-rule-to-group" data-group="${groupName}"><i class="fas fa-plus"></i> إضافة قاعدة لهذا النوع</button>
        </div>
    ` : '';

    const tableHeader = isAdmin 
        ? '<thead><tr><th>القاعدة</th><th>إلى مجموعة</th><th>الحالة</th><th>الإجراءات</th></tr></thead>' 
        : '<thead><tr><th>القاعدة</th><th>إلى مجموعة</th></tr></thead>';

    const ruleRows = rules.map(rule => {
        const adminStatusColumn = isAdmin ? `<td><span class="badge ${rule.isEnabled ? 'status-active' : 'status-inactive'}"><i class="fas fa-circle"></i> ${rule.isEnabled ? 'مفعل' : 'معطل'}</span></td>` : '';
        const adminActionsColumn = isAdmin ? `<td>
            <div class="table-actions">
                <button class="action-btn" data-action="edit" data-id="${rule._id}" title="تعديل"><i class="fas fa-pen"></i></button>
                <button class="action-btn danger" data-action="delete" data-id="${rule._id}" title="حذف"><i class="fas fa-trash-alt"></i></button>
            </div>
        </td>` : '';

        return `
            <tr id="rule-row-${rule._id}">
                <td>
                    <div class="rule-name-cell">
                        <strong class="rule-name">${rule.name}</strong>
                        <span class="rule-description-preview">${rule.description}</span>
                    </div>
                </td>
                <td><i class="fas fa-long-arrow-alt-left"></i> <strong>${rule.toGroup}</strong></td>
                ${adminStatusColumn}
                ${adminActionsColumn}
            </tr>
        `;
    }).join('');

    return `
        <div class="accordion-group">
            <div class="accordion-header">
                <h3><i class="fas fa-folder"></i> ${groupName} <span class="badge role-editor">x${rules.length}</span></h3>
                ${adminGlobalActions}
                <i class="fas fa-chevron-down toggle-icon"></i>
            </div>
            <div class="accordion-content">
                <div class="table-container" style="margin: 0; border: none; box-shadow: none;">
                    <table class="results-table inner-table">
                        ${tableHeader}
                        <tbody>${ruleRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderRuleAccordions(rules) {
    const container = document.getElementById('rules-container');
    if (!container) return;

    const groupedRules = rules.reduce((acc, rule) => {
        const group = rule.fromGroup || 'Uncategorized';
        if (!acc[group]) acc[group] = [];
        acc[group].push(rule);
        return acc;
    }, {});

    const sortedGroupNames = Object.keys(groupedRules).sort();

    if (sortedGroupNames.length === 0) {
        const emptyMessage = isAdmin 
            ? 'ابدأ بإضافة قاعدة جديدة.' 
            : 'لم يقم المسؤول بإضافة أي قواعد مفعلة حاليًا.';
        container.innerHTML = `<div class="empty-state-professional"><i class="fas fa-book"></i><h3>لا توجد قواعد</h3><p>${emptyMessage}</p></div>`;
        return;
    }

    container.innerHTML = sortedGroupNames.map(groupName => renderRuleGroup(groupName, groupedRules[groupName])).join('');
}

async function fetchAndRenderRules() {
    const container = document.getElementById('rules-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner-container" style="min-height: 300px;"><div class="spinner"></div></div>';

    try {
        const endpoint = isAdmin ? '/api/transfer-rules' : '/api/transfer-rules/guide';
        const result = await fetchWithAuth(endpoint);
        
        allRulesCache = result.data || [];

        renderRuleAccordions(allRulesCache);
    } catch (error) {
        showToast(error.message, true);
        container.innerHTML = `<div class="empty-state-professional error"><h3>فشل تحميل القواعد.</h3><p>${error.message}</p></div>`;
    }
}

function openModal(rule = null, fromGroup = null) {
    const modal = document.getElementById('rule-modal');
    const form = document.getElementById('rule-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('rule-id').value = rule ? rule._id : '';
    
    const modalTitle = document.getElementById('modal-title');
    if (rule) {
        modalTitle.textContent = 'تعديل القاعدة';
    } else if (fromGroup) {
        modalTitle.textContent = `إضافة قاعدة لـ ${fromGroup}`;
    } else {
        modalTitle.textContent = 'إضافة قاعدة لنوع حساب جديد';
    }

    const fromGroupSelect = document.getElementById('from-group');
    fromGroupSelect.value = rule ? rule.fromGroup : (fromGroup || '');
    fromGroupSelect.disabled = !!fromGroup || !!rule; // Disable if adding to a group or editing

    if (rule) {
        document.getElementById('rule-name').value = rule.name;
        document.getElementById('rule-description').value = rule.description;
        document.getElementById('to-group').value = rule.toGroup;
        document.getElementById('is-enabled').value = rule.isEnabled.toString();
    }

    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('rule-modal')?.classList.remove('show');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('#rule-id').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    const ruleData = {
        name: document.getElementById('rule-name').value,
        description: document.getElementById('rule-description').value,
        fromGroup: document.getElementById('from-group').value,
        toGroup: document.getElementById('to-group').value,
        isEnabled: document.getElementById('is-enabled').value === 'true',
        conditions: {}, // Conditions are no longer managed in the UI
    };

    if (!ruleData.name || !ruleData.fromGroup || !ruleData.toGroup) {
        showToast('اسم القاعدة والمجموعات مطلوبة.', true);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    const url = id ? `/api/transfer-rules/${id}` : '/api/transfer-rules';
    const method = id ? 'PUT' : 'POST';

    try {
        await fetchWithAuth(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleData) });
        showToast(`تم ${id ? 'تحديث' : 'إنشاء'} القاعدة بنجاح`);
        closeModal();
        fetchAndRenderRules();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ';
    }
}

async function handleDelete(ruleId) {
    const confirmed = await showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذه القاعدة؟');
    if (confirmed) {
        try {
            await fetchWithAuth(`/api/transfer-rules/${ruleId}`, { method: 'DELETE' });
            showToast('تم حذف القاعدة بنجاح.');
            fetchAndRenderRules();
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

function initializePageListeners() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent || mainContent.dataset.listenersInitialized === 'true') return;

    mainContent.addEventListener('click', e => {
        const addBtn = e.target.closest('#add-rule-btn');
        const addRuleToGroupBtn = e.target.closest('[data-action="add-rule-to-group"]');
        const editBtn = e.target.closest('button[data-action="edit"]');
        const deleteBtn = e.target.closest('button[data-action="delete"]');
        const modalCloseBtn = e.target.closest('#rule-modal .close-btn');
        const modalBackdrop = e.target.id === 'rule-modal';
        const accordionHeader = e.target.closest('.accordion-header');

        if (addBtn) openModal();
        if (addRuleToGroupBtn) openModal(null, addRuleToGroupBtn.dataset.group);
        if (modalCloseBtn || modalBackdrop) closeModal();
        if (editBtn) {
            const rule = allRulesCache.find(r => r._id === editBtn.dataset.id);
            if (rule) openModal(rule);
        }
        if (deleteBtn) handleDelete(deleteBtn.dataset.id);
        if (accordionHeader && !e.target.closest('button')) {
            accordionHeader.classList.toggle('active');
            const content = accordionHeader.nextElementSibling;
            content.style.maxHeight = accordionHeader.classList.contains('active') ? `${content.scrollHeight}px` : null;
        }
    });

    document.getElementById('rule-form')?.addEventListener('submit', handleFormSubmit);

    const searchInput = document.getElementById('rules-guide-search');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const filtered = allRulesCache.filter(r => 
                (r.name && r.name.toLowerCase().includes(searchTerm)) || 
                (r.fromGroup && r.fromGroup.toLowerCase().includes(searchTerm))
            );
            renderRuleAccordions(filtered);
        });
    }

    mainContent.dataset.listenersInitialized = 'true';
}

export function renderTransferRulesGuidePage() {
    const mainContent = document.getElementById('main-content');
    isAdmin = checkAdminStatus();

    const accountTypeOptions = ACCOUNT_TYPES.map(type => `<option value="${type}">${type}</option>`).join('');
    const adminAddButton = isAdmin ? `<button id="add-rule-btn" class="submit-btn"><i class="fas fa-plus"></i> إضافة قاعدة جديدة</button>` : '';

    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title"><i class="fas fa-random"></i> قواعد تحويل الحسابات</h1>
            <div class="page-header-actions">
                <p>${isAdmin ? 'إدارة وإنشاء قواعد التحويل التلقائي للحسابات بين المجموعات.' : 'دليل شامل لجميع قواعد تحويل الحسابات.'}</p>
                ${adminAddButton}
            </div>
        </div>

        <div class="search-container" style="max-width: 600px; margin: 2rem auto;">
             <i class="fas fa-search"></i>
             <input type="text" id="rules-guide-search" class="search-input" placeholder="ابحث عن نوع حساب...">
        </div>

        <div id="rules-container" class="rules-container">
            <!-- Rule accordions will be rendered here -->
        </div>

        <!-- Modal for adding/editing rules (for admin) -->
        <div id="rule-modal" class="modal">
            <div class="modal-dialog" style="max-width: 600px;">
                <div class="modal-header"><h2 id="modal-title"></h2><button class="close-btn">&times;</button></div>
                <form id="rule-form" class="modal-body">
                    <input type="hidden" id="rule-id">
                    
                    <div class="form-group">
                        <label for="from-group">من مجموعة</label>
                        <select id="from-group" required>${accountTypeOptions}</select>
                    </div>
                    <div class="form-group">
                        <label for="to-group">إلى مجموعة</label>
                        <select id="to-group" required>${accountTypeOptions}</select>
                    </div>
                    <div class="form-group"><label for="rule-name">اسم القاعدة (مثال: تحويل تلقائي)</label><input type="text" id="rule-name" required></div>
                    <div class="form-group"><label for="rule-description">وصف مختصر للقاعدة</label><textarea id="rule-description" rows="3"></textarea></div>
                    <div class="form-group"><label for="is-enabled">الحالة</label><select id="is-enabled" required><option value="true">مفعل</option><option value="false">معطل</option></select></div>

                    <div class="modal-footer">
                        <button type="submit" class="submit-btn"><i class="fas fa-save"></i> حفظ القاعدة</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    initializePageListeners();
    fetchAndRenderRules();
}