
import { showToast, showConfirmModal } from './ui.js';
import { fetchWithAuth } from './api.js';
// page-transfer-rules.js

export function createTransferRulesPageHTML() {
    return `
        <div class="page-container">
            <div class="page-header-actions">
                <h1 class="page-title"><i class="fas fa-random"></i> إدارة قواعد تحويل الحسابات</h1>
                <div class="actions-container">
                    <button id="add-rule-btn" class="submit-btn"><i class="fas fa-plus"></i> إضافة قاعدة جديدة</button>
                </div>
            </div>
            <p class="page-subtitle">هنا يمكنك إنشاء وتعديل قواعد تحويل الحسابات بين المجموعات.</p>

            <div class="list-header">
                <div class="search-container" style="width: 100%; max-width: 400px;">
                    <i class="fas fa-search"></i>
                    <input type="text" id="rules-search" class="search-input" placeholder="ابحث عن قاعدة...">
                </div>
            </div>

            <div class="table-container modern-table-container">
                <table id="rules-table" class="data-table">
                    <thead>
                        <tr>
                            <th>نوع الحساب</th>
                            <th>من مجموعة</th>
                            <th>إلى مجموعة</th>
                            <th>الحالة</th>
                            <th>إجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="rules-table-body">
                        <!-- Rows will be populated by JavaScript -->
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal for adding/editing rules -->
        <div id="rule-modal" class="modal" style="background-color: rgba(0, 0, 0, 0.5);">
            <div class="modal-dialog" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                <h2 id="modal-title">إضافة قاعدة جديدة</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                <form id="rule-form">
                    <input type="hidden" id="rule-id">
                    <div class="form-group">
                        <label for="rule-name">نوع الحساب</label>
                        <input type="text" id="rule-name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="rule-description">وصف القاعدة</label>
                        <textarea id="rule-description" class="form-control" rows="3" required></textarea>
                    </div>
                    <div class="form-group" style="display: none;">
                        <label for="from-group">من مجموعة</label>
                        <input type="text" id="from-group" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="to-group">إلى مجموعة</label>
                        <input type="text" id="to-group" class="form-control" required placeholder="اكتب اسم المجموعة الهدف هنا...">
                    </div>
                    <div class="form-group">
                        <label for="is-enabled">الحالة</label>
                        <select id="is-enabled" class="form-control" required>
                            <option value="true">مفعل</option>
                            <option value="false">معطل</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="submit-btn" id="rule-form-submit-btn">
                            <i class="fas fa-save"></i> حفظ
                        </button>
                    </div>
                </form>
                </div>
            </div>
        </div>
    `;
}

export async function initTransferRulesPage() {
    const addRuleBtn = document.getElementById('add-rule-btn');
    const modal = document.getElementById('rule-modal');
    const closeModalBtn = modal?.querySelector('.close-btn');
    const ruleForm = document.getElementById('rule-form');
    const ruleFormSubmitBtn = document.getElementById('rule-form-submit-btn');

    const openModal = (rule = null) => {
        ruleForm.reset();
        const ruleIdInput = document.getElementById('rule-id');
        if (ruleIdInput) ruleIdInput.value = '';

        if (rule) {
            document.getElementById('modal-title').textContent = 'تعديل قاعدة';
            if (ruleIdInput) ruleIdInput.value = rule._id;
            // If it's a copy action, clear the ID and adjust the name
            if (rule.isCopy) {
                document.getElementById('modal-title').textContent = 'إنشاء نسخة من القاعدة';
                if (ruleIdInput) ruleIdInput.value = ''; // Ensure it's treated as a new rule
                rule.name = `نسخة من - ${rule.name}`;
            }
            document.getElementById('rule-name').value = rule.name;
            document.getElementById('rule-description').value = rule.description;
            document.getElementById('from-group').value = rule.fromGroup;
            document.getElementById('to-group').value = rule.toGroup;
            document.getElementById('is-enabled').value = rule.isEnabled.toString();
        } else {
            document.getElementById('modal-title').textContent = 'إضافة قاعدة جديدة';
        }
        modal.classList.add('show');
    };

    const closeModal = () => {
        modal.classList.remove('show');
    };

    let allRules = []; // Cache rules for search and edit

    const renderRules = (rules) => {
        const tbody = document.getElementById('rules-table-body');
        if (!tbody) return;

        allRules = rules; // Update cache

        if (rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">لا توجد قواعد لعرضها.</td></tr>`;
            return;
        }

        tbody.innerHTML = rules.map(rule => `
            <tr>
                <td>${rule.name}</td>
                <td>${rule.fromGroup}</td>
                <td>${rule.toGroup}</td>
                <td>${rule.isEnabled ? '<span class="badge badge-success">مفعل</span>' : '<span class="badge badge-danger">معطل</span>'}</td>
                <td>
                    <button class="action-icon-btn copy-rule-btn" data-id="${rule._id}" title="نسخ"><i class="fas fa-copy"></i></button>
                    <button class="action-icon-btn edit-rule-btn" data-id="${rule._id}" title="تعديل"><i class="fas fa-pen"></i></button>
                    <button class="action-icon-btn danger delete-rule-btn" data-id="${rule._id}" title="حذف"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.edit-rule-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ruleId = e.currentTarget.dataset.id;
                const rule = allRules.find(r => r._id === ruleId);
                openModal(rule);
            });
        });

        document.querySelectorAll('.copy-rule-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ruleId = e.currentTarget.dataset.id;
                const ruleToCopy = allRules.find(r => r._id === ruleId);
                if (ruleToCopy) openModal({ ...ruleToCopy, isCopy: true });
            });
        });

        document.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ruleId = e.currentTarget.dataset.id;
                const confirmed = await showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذه القاعدة؟');
                if (confirmed) {
                    // Show loading state on the button
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    btn.disabled = true;

                    try {
                        await fetchWithAuth(`/api/transfer-rules/${ruleId}`, { method: 'DELETE' });
                        showToast('تم حذف القاعدة بنجاح');
                        loadRules();
                    } catch (error) {
                        showToast(error.message, true);
                    } finally {
                        // Restore button state even on error
                        btn.disabled = false;
                        // The button will be re-rendered by loadRules(), so no need to restore icon
                    }
                }
            });
        });
    };

    const loadRules = async () => {
        try {
            const tbody = document.getElementById('rules-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="5"><div class="spinner" style="margin: 2rem auto;"></div></td></tr>`;

            const { data } = await fetchWithAuth('/api/transfer-rules');
            renderRules(data);
        } catch (error) {
            showToast(error.message, true);
            const tbody = document.getElementById('rules-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state error">فشل تحميل القواعد.</td></tr>`;
        }
    };

    // --- Paste and Auto-fill Logic ---
    const ruleNameInput = document.getElementById('rule-name');
    const fromGroupInput = document.getElementById('from-group');

    if (ruleNameInput && fromGroupInput) {
        // Auto-fill 'fromGroup' when 'ruleName' changes
        ruleNameInput.addEventListener('input', () => {
            fromGroupInput.value = ruleNameInput.value;
        });

        // Handle pasting into 'ruleName'
        ruleNameInput.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            ruleNameInput.value = pastedText.trim();
            // Trigger the input event to update the 'fromGroup' field
            ruleNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    // --- End of Paste and Auto-fill Logic ---


    addRuleBtn.addEventListener('click', () => openModal());
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        // Close modal if clicking outside the content
        if (e.target === modal) {
            closeModal();
        }
    });

    // Search functionality
    const searchInput = document.getElementById('rules-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredRules = allRules.filter(rule =>
                rule.name.toLowerCase().includes(searchTerm) ||
                (rule.description && rule.description.toLowerCase().includes(searchTerm)) ||
                rule.fromGroup.toLowerCase().includes(searchTerm) ||
                rule.toGroup.toLowerCase().includes(searchTerm)
            );
            renderRules(filteredRules);
        });
    }

    ruleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('rule-id').value;

        const ruleData = {
            name: document.getElementById('rule-name').value,
            // 'fromGroup' is now automatically set from 'rule-name'
            description: document.getElementById('rule-description').value,
            fromGroup: document.getElementById('from-group').value,
            toGroup: document.getElementById('to-group').value,
            isEnabled: document.getElementById('is-enabled').value === 'true',
            conditions: [], // Send an empty array for conditions
        };

        // Show loading state on submit button
        ruleFormSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        ruleFormSubmitBtn.disabled = true;

        const url = id ? `/api/transfer-rules/${id}` : '/api/transfer-rules';
        const method = id ? 'PUT' : 'POST';

        try {
            await fetchWithAuth(url, { 
                method, 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ruleData)
            });
            showToast(`تم ${id ? 'تحديث' : 'إنشاء'} القاعدة بنجاح`);
            closeModal();
            loadRules();
        } catch (error) {
            showToast(error.message, true);
        } finally {
            ruleFormSubmitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ';
            ruleFormSubmitBtn.disabled = false;
        }
    });

    loadRules();
}
