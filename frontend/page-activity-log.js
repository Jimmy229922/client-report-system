import { fetchWithAuth } from './api.js';
import { showToast, timeAgo, showConfirmModal } from './ui.js';

let currentPage = 1;
const limit = 25;
let IS_ADMIN = false;
let usersCache = []; // Cache for user data to resolve IDs to names

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
        const user = JSON.parse(userStr);
        return user.role === 'admin';
    } catch (e) {
        return false;
    }
}

async function populateUserFilter() {
    if (!IS_ADMIN) return;
    const select = document.getElementById('log-user-filter');
    if (!select) return;
    try {
        const result = await fetchWithAuth('/api/users');
        const users = result.data || [];
        usersCache = users; // Store users in cache
        users.forEach(user => {
            // Use user._id as it's the actual ObjectId from MongoDB
            select.appendChild(new Option(user.username, user._id));
        });
        select.parentElement.classList.remove('hidden');
    } catch (error) { console.error("Failed to populate user filter for logs:", error); }
}

function formatAction(action, details) {
    const actionMap = {
        'login_success': { text: 'تسجيل دخول', icon: 'fa-sign-in-alt', color: 'var(--success-color)' },
        'login_failed': { text: 'فشل تسجيل الدخول', icon: 'fa-exclamation-triangle', color: 'var(--danger-color)' },
        'logout': { text: 'تسجيل خروج', icon: 'fa-sign-out-alt', color: '#aaa' },
        'register': { text: 'تسجيل حساب جديد', icon: 'fa-user-plus', color: 'var(--success-color)' },
        'create_report': { text: 'إنشاء تقرير', icon: 'fa-plus-circle', color: 'var(--accent-color)' },
        'copy_report_data': { text: 'نسخ بيانات تقرير', icon: 'fa-copy', color: '#00BCD4' },
        'delete_report': { text: 'حذف تقرير', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'delete_report_image': { text: 'حذف صورة من تقرير', icon: 'fa-file-image', color: 'var(--danger-color)' },
        'resolve_report': { text: 'حل تقرير', icon: 'fa-check-circle', color: 'var(--success-color)' },
        'gold_market_broadcast': { text: 'إرسال تنبيه الذهب', icon: 'fa-exclamation-triangle', color: '#FFD700' },
        'resend_telegram_success': { text: 'إعادة إرسال لتليجرام', icon: 'fab fa-telegram-plane', color: 'var(--success-color)' },
        'resend_telegram_failed': { text: 'فشل إعادة الإرسال لتليجرام', icon: 'fab fa-telegram-plane', color: 'var(--danger-color)' },
        'create_user': { text: 'إنشاء مستخدم جديد', icon: 'fa-user-plus', color: 'var(--success-color)' },
        'update_user': { text: 'تحديث مستخدم', icon: 'fa-user-edit', color: '#ff9800' },
        'update_own_avatar': { text: 'تحديث الصورة الشخصية', icon: 'fa-camera', color: '#00BCD4' },
        'update_user_avatar': { text: 'تحديث صورة المستخدم', icon: 'fa-camera', color: '#00BCD4' },
        'toggle_user_status': { text: 'تغيير حالة مستخدم', icon: 'fa-user-clock', color: '#ff9800' },
        'delete_user': { text: 'حذف مستخدم', icon: 'fa-user-minus', color: 'var(--danger-color)' },
        'send_notification': { text: 'إرسال إشعار خاص', icon: 'fa-envelope', color: '#00BCD4' },
        'broadcast': { text: 'إرسال إشعار عام', icon: 'fa-bullhorn', color: '#00BCD4' },
        'send_specific_notification': { text: 'إرسال إشعار خاص', icon: 'fa-envelope', color: '#00BCD4' },
        'mark_notifications_read': { text: 'تعليم الإشعارات كمقروءة', icon: 'fa-check-double', color: '#673AB7' },
        'like_notification': { text: 'تأكيد قراءة إشعار', icon: 'fa-heart', color: 'var(--danger-color)' },
        'delete_notification_group': { text: 'حذف مجموعة إشعارات', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'create_instruction': { text: 'إنشاء تعليمة', icon: 'fa-info-circle', color: 'var(--accent-color)' },
        'update_instruction': { text: 'تحديث تعليمة', icon: 'fa-edit', color: '#ff9800' },
        'delete_instruction': { text: 'حذف تعليمة', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'create_template': { text: 'إنشاء قالب', icon: 'fa-plus-square', color: 'var(--accent-color)' },
        'update_template': { text: 'تحديث قالب', icon: 'fa-edit', color: '#ff9800' },
        'delete_template': { text: 'حذف قالب', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'create_special_identifier': { text: 'إضافة تبليغ خاص', icon: 'fa-asterisk', color: 'var(--accent-color)' },
        'delete_special_identifier': { text: 'حذف تبليغ خاص', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'complete_tour': { text: 'إكمال الجولة التعريفية', icon: 'fa-flag-checkered', color: 'var(--success-color)' },
        'create_transfer_rule': { text: 'إنشاء قاعدة تحويل', icon: 'fa-plus-circle', color: 'var(--accent-color)' },
        'update_transfer_rule': { text: 'تحديث قاعدة تحويل', icon: 'fa-edit', color: '#ff9800' },
        'delete_transfer_rule': { text: 'حذف قاعدة تحويل', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'delete_evaluation': { text: 'حذف تقييم', icon: 'fa-clipboard-check', color: 'var(--danger-color)' },
        'system_update': { text: 'تحديث النظام', icon: 'fa-cloud-download-alt', color: '#9C27B0' },
    };
    const info = actionMap[action] || { text: action.replace(/_/g, ' '), icon: 'fa-info-circle', color: '#aaa' };
    
    let detailsText = '';
    if (details) {
        const targetUser = usersCache.find(u => u._id === details.targetUserId);
        const targetUsername = targetUser ? targetUser.username : `مستخدم (${details.targetUserId?.slice(-4) || 'غير معروف'})`;

        if (action === 'gold_market_broadcast' && details.imageUrl) { // NOSONAR
            detailsText = `(<a href="#!" data-src="${details.imageUrl}" class="img-preview" style="text-decoration: underline; cursor: pointer;">عرض الصورة</a>)`;
        } else if (action === 'copy_report_data' && details.reportType === 'Employee Evaluation') {
            detailsText = `(تقييم موظف)`;
        } else if (action === 'create_report' && details.reportId) {
            detailsText = `(تقرير رقم: ${details.reportId})`;
        } else if (action === 'delete_evaluation' && details.employeeName) {
            detailsText = `(للموظف: ${details.employeeName})`;
        } else if (['delete_report', 'resend_telegram_success', 'resend_telegram_failed', 'resolve_report', 'delete_report_image', 'copy_report_data'].includes(action) && (details.reportId || details.reportType)) {
            detailsText = `(${details.reportId ? `تقرير رقم: ${details.reportId}` : `نوع: ${details.reportType}`})`;
        }
        if (['create_user', 'register'].includes(action) && details.newUserEmail) {
            detailsText = `(البريد: ${details.newUserEmail})`;
        }
        if (action === 'update_user' && details.targetUserId) {
            const fields = details.updatedFields ? ` - الحقول: ${details.updatedFields.join(', ')}` : '';
            detailsText = `(المستخدم: ${targetUsername}${fields})`;
        }
        if (['toggle_user_status', 'delete_user', 'send_specific_notification', 'send_notification', 'update_user_avatar'].includes(action) && details.targetUserId) {
            const statusText = details.newStatus !== undefined ? ` إلى ${details.newStatus ? 'نشط' : 'غير نشط'}` : '';
            detailsText = `(المستخدم: ${targetUsername}${statusText})`;
        }
        if (['login_failed', 'login_success', 'register', 'logout'].includes(action) && details.email) {
            detailsText = `(البريد: ${details.email})`;
        }
        if (action === 'mark_notifications_read') {
            detailsText = ''; // No details needed
        } else if (['broadcast', 'delete_notification_group', 'like_notification'].includes(action) && details.message) {
            detailsText = `(الرسالة: ${details.message.substring(0, 30)}...)`;
        }
        if (['create_template', 'update_template'].includes(action) && details.title) {
            detailsText = `(عنوان: ${details.title})`;
        }
        if (action === 'delete_template' && details.templateId) { detailsText = `(قالب رقم: ${details.templateId})`; }
        if (['create_instruction', 'update_instruction', 'delete_instruction'].includes(action) && (details.title || details.instructionId)) {
            detailsText = `(العنوان: ${details.title || details.instructionId})`;
        }
        if (['create_special_identifier', 'delete_special_identifier'].includes(action) && (details.identifierId || details.identifier || details.identifierValue)) {
            detailsText = `(البيان: ${details.identifier || details.identifierId})`;
        }
        if (['create_transfer_rule', 'update_transfer_rule', 'delete_transfer_rule'].includes(action) && details.ruleId) {
            detailsText = `(قاعدة رقم: ${details.ruleId})`;
        }
    }

    return `
        <div class="action-cell" style="color: ${info.color};">
            <i class="fas ${info.icon}"></i>
            <span>${info.text}</span>
            <small class="action-details">${detailsText}</small>
        </div>
    `;
}

function renderLogEntry(log) {
    const userHtml = log.user_id 
        ? `<div class="user-cell">
             ${log.user_id.avatar_url ? `<img src="${log.user_id.avatar_url}" class="user-avatar">` : `<div class="user-avatar-placeholder"><i class="fas fa-user"></i></div>`}
             <span>${log.user_id.username}</span>
           </div>`
        : `<div class="user-cell system-event"><span>(نظام/غير مسجل)</span></div>`;

    return `
        <tr data-log-id="${log._id}">
            <td style="text-align: center;">
                <input type="checkbox" class="log-select-checkbox" data-id="${log._id}">
            </td>
            <td>${userHtml}</td>
            <td>${formatAction(log.action, log.details || {})}</td>
            <td class="ip-address-cell">${(log.ip_address === '::1' ? 'جهاز محلي' : log.ip_address) || 'غير متاح'}</td>
            <td title="${timeAgo(log.created_at)}">${new Date(log.created_at).toLocaleString('ar-EG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
        </tr>
    `;
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    // Defensive check to prevent crash if pagination object is missing
    if (!pagination) {
        container.innerHTML = '';
        return;
    }
    const { page, pages: totalPages } = pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<div class="pagination">`;
    html += `<button class="page-btn" data-page="1" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-double-right"></i></button>`;
    html += `<button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-right"></i></button>`;

    html += `<span class="page-info">صفحة ${page} من ${totalPages}</span>`;

    html += `<button class="page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}><i class="fas fa-angle-left"></i></button>`;
    html += `<button class="page-btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}><i class="fas fa-angle-double-left"></i></button>`;
    html += `</div>`;

    container.innerHTML = html;
}

async function fetchAndRenderLogs() {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4"><div class="spinner" style="margin: 2rem auto;"></div></td></tr>`;

    const search = document.getElementById('log-search-input')?.value || '';
    const userId = document.getElementById('log-user-filter')?.value || '';
    const action = document.getElementById('log-action-filter')?.value || '';

    try {
        const params = new URLSearchParams({ page: currentPage, limit });
        if (search) params.append('search', search);
        if (userId && userId !== 'all') params.append('userId', userId);
        if (action && action !== 'all') params.append('action', action);

        const result = await fetchWithAuth(`/api/activity-logs?${params.toString()}`);
        const logs = result.data ? result.data.logs : [];
        if (logs.length > 0) {
            tbody.innerHTML = logs.map(renderLogEntry).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">لا توجد سجلات لعرضها.</td></tr>`;
        }
        renderPagination(result.data.pagination);

    } catch (error) {
        showToast(error.message, true);
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state error">فشل تحميل السجلات.</td></tr>`;
    }
}

function updateBulkActionUI() {
    const selectedCheckboxes = document.querySelectorAll('.log-select-checkbox:checked');
    const bulkDeleteBtn = document.getElementById('bulk-delete-logs-btn');
    const selectAllCheckbox = document.getElementById('select-all-logs');
    const allCheckboxes = document.querySelectorAll('.log-select-checkbox');

    if (bulkDeleteBtn) {
        if (selectedCheckboxes.length > 0) {
            bulkDeleteBtn.classList.remove('hidden');
            bulkDeleteBtn.querySelector('span').textContent = `حذف (${selectedCheckboxes.length})`;
        } else {
            bulkDeleteBtn.classList.add('hidden');
        }
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = allCheckboxes.length > 0 && selectedCheckboxes.length === allCheckboxes.length;
    }
}

async function handleBulkDelete() {
    const selectedIds = Array.from(document.querySelectorAll('.log-select-checkbox:checked')).map(cb => cb.dataset.id);
    if (selectedIds.length === 0) return;

    const confirmed = await showConfirmModal(
        'تأكيد الحذف',
        `هل أنت متأكد من حذف ${selectedIds.length} سجلات؟ هذا الإجراء لا يمكن التراجع عنه.`,
        { confirmText: 'نعم، حذف', confirmClass: 'danger-btn' }
    );

    if (!confirmed) return;

    try {
        const result = await fetchWithAuth('/api/activity-logs', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds })
        });
        showToast(result.message);
        fetchAndRenderLogs(); // Refresh the list
    } catch (error) {
        showToast(error.message, true);
    }
}

function initActivityLogPage() {
    const searchInput = document.getElementById('log-search-input');
    const userFilter = document.getElementById('log-user-filter');
    const actionFilter = document.getElementById('log-action-filter');
    const resetBtn = document.getElementById('log-reset-filters-btn');
    const selectAllCheckbox = document.getElementById('select-all-logs');
    const tbody = document.getElementById('logs-tbody');
    const bulkDeleteBtn = document.getElementById('bulk-delete-logs-btn');

    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', handleBulkDelete);
    }

    let debounceTimer;
    const debouncedFetch = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentPage = 1; // Reset to first page on new filter
            fetchAndRenderLogs();
        }, 500);
    };

    searchInput?.addEventListener('input', debouncedFetch);
    userFilter?.addEventListener('change', debouncedFetch);
    actionFilter?.addEventListener('change', debouncedFetch);

    resetBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (userFilter) userFilter.value = 'all';
        if (actionFilter) actionFilter.value = 'all';
        currentPage = 1;
        fetchAndRenderLogs();
    });

    if (selectAllCheckbox && tbody) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            tbody.querySelectorAll('.log-select-checkbox').forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            updateBulkActionUI();
        });
    }

    tbody?.addEventListener('change', (e) => {
        if (e.target.classList.contains('log-select-checkbox')) updateBulkActionUI();
    });

    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.page-btn');
            if (button && !button.disabled) {
                currentPage = parseInt(button.dataset.page, 10);
                fetchAndRenderLogs();
            }
        });
    }
    fetchAndRenderLogs();
}

export function renderActivityLogPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
    <div class="activity-log-page-container">
        <div class="page-header">
            <h1 class="page-title">سجل النشاط</h1>
            <p>مراقبة جميع الإجراءات الهامة التي تتم في النظام.</p>
        </div>

        <div class="filter-bar">
            <div class="filter-controls">
                <div class="filter-item search-filter">
                    <i class="fas fa-search"></i>
                    <input type="text" id="log-search-input" placeholder="ابحث في التفاصيل...">
                </div>
                <div class="filter-item user-filter hidden">
                    <label for="log-user-filter">الموظف</label>
                    <select id="log-user-filter">
                        <option value="all">الكل</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label for="log-action-filter">الإجراء</label>
                    <select id="log-action-filter">
                        <option value="all">كل الإجراءات</option>
                        <optgroup label="المستخدمين والنظام">
                            <option value="login_success">تسجيل دخول</option>
                            <option value="login_failed">فشل تسجيل دخول</option>
                            <option value="logout">تسجيل خروج</option>
                            <option value="create_user">إنشاء مستخدم</option>
                            <option value="update_user">تحديث مستخدم</option>
                            <option value="delete_user">حذف مستخدم</option>
                            <option value="system_update">تحديث النظام</option>
                        </optgroup>
                        <optgroup label="التقارير">
                            <option value="create_report">إنشاء تقرير</option>
                            <option value="delete_report">حذف تقرير</option>
                            <option value="copy_report_data">نسخ بيانات تقرير</option>
                            <option value="resolve_report">حل تقرير</option>
                        </optgroup>
                        <optgroup label="الإشعارات والتنبيهات">
                            <option value="broadcast">إشعار عام</option>
                            <option value="send_notification">إشعار خاص</option>
                            <option value="delete_notification_group">حذف إشعارات</option>
                            <option value="gold_market_broadcast">تنبيه الذهب</option>
                            <option value="resend_telegram_success">إعادة إرسال لتليجرام</option>
                        </optgroup>
                        <optgroup label="القوالب والتعليمات">
                            <option value="create_template">إنشاء قالب</option>
                            <option value="update_template">تحديث قالب</option>
                            <option value="delete_template">حذف قالب</option>
                            <option value="create_instruction">إنشاء تعليمة</option>
                            <option value="update_instruction">تحديث تعليمة</option>
                            <option value="delete_instruction">حذف تعليمة</option>
                            <option value="delete_evaluation">حذف تقييم</option>
                        </optgroup>
                    </select>
                </div>
            </div>
            <div class="filter-actions">
                <button id="bulk-delete-logs-btn" class="cancel-btn danger-btn hidden" style="width: auto; padding: 0.6rem 1.2rem;">
                    <i class="fas fa-trash-alt"></i> <span>حذف</span>
                </button>
                <button id="log-reset-filters-btn" class="cancel-btn" style="width: auto; padding: 0.6rem 1.2rem;"><i class="fas fa-times"></i> مسح</button>
            </div>
        </div>

        <div class="table-container">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th style="width: 20px;"><input type="checkbox" id="select-all-logs" title="تحديد الكل"></th>
                        <th>المستخدم</th>
                        <th>الإجراء</th>
                        <th>عنوان IP</th>
                        <th>الوقت</th>
                    </tr>
                </thead>
                <tbody id="logs-tbody">
                    <!-- Log entries will be rendered here -->
                </tbody>
            </table>
        </div>
        <div id="pagination-container"></div>
    </div>
    `;
    IS_ADMIN = checkAdminStatus();
    if (IS_ADMIN) {
        populateUserFilter();
    }
    initActivityLogPage();
}