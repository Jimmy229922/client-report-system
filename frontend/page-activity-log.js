import { fetchWithAuth } from './api.js';
import { showToast, timeAgo } from './ui.js';

let currentPage = 1;
const limit = 25;
let IS_ADMIN = false;

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try { return JSON.parse(userStr).id === 1; } catch (e) { return false; }
}

async function populateUserFilter() {
    if (!IS_ADMIN) return;
    const select = document.getElementById('log-user-filter');
    if (!select) return;
    try {
        const result = await fetchWithAuth('/api/users');
        const users = result.data || [];
        users.forEach(user => select.appendChild(new Option(user.username, user.id)));
        select.parentElement.classList.remove('hidden');
    } catch (error) { console.error("Failed to populate user filter for logs:", error); }
}

function formatAction(action, details) {
    const actionMap = {
        'login_success': { text: 'تسجيل دخول ناجح', icon: 'fa-sign-in-alt', color: 'var(--success-color)' },
        'login_failed': { text: 'فشل تسجيل الدخول', icon: 'fa-exclamation-triangle', color: 'var(--danger-color)' },
        'create_report': { text: 'إنشاء تقرير', icon: 'fa-plus-circle', color: 'var(--accent-color)' },
        'delete_report': { text: 'حذف تقرير', icon: 'fa-trash-alt', color: 'var(--danger-color)' },
        'create_user': { text: 'إنشاء مستخدم جديد', icon: 'fa-user-plus', color: 'var(--success-color)' },
        'update_user': { text: 'تحديث بيانات مستخدم', icon: 'fa-user-edit', color: '#ff9800' },
        'toggle_user_status': { text: 'تغيير حالة مستخدم', icon: 'fa-user-clock', color: '#ff9800' },
        'delete_user': { text: 'حذف مستخدم', icon: 'fa-user-minus', color: 'var(--danger-color)' },
    };
    const info = actionMap[action] || { text: action, icon: 'fa-info-circle', color: '#aaa' };
    
    let detailsText = '';
    if (details) {
        if (action === 'create_report' && details.reportId) detailsText = `(تقرير #${details.reportId})`;
        if (action === 'delete_report' && details.reportId) detailsText = `(تقرير #${details.reportId})`;
        if (action === 'create_user' && details.newUserEmail) detailsText = `(${details.newUserEmail})`;
        if (action === 'update_user' && details.targetUserId) detailsText = `(مستخدم #${details.targetUserId})`;
        if (action === 'toggle_user_status' && details.targetUserId) {
            detailsText = `(مستخدم #${details.targetUserId} إلى ${details.newStatus ? 'نشط' : 'غير نشط'})`;
        }
        if (action === 'delete_user' && details.deletedUserId) detailsText = `(مستخدم #${details.deletedUserId})`;
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
    const userHtml = log.users 
        ? `<div class="user-cell">
             ${log.users.avatar_url ? `<img src="${log.users.avatar_url}" class="user-avatar">` : `<div class="user-avatar-placeholder"><i class="fas fa-user"></i></div>`}
             <span>${log.users.username}</span>
           </div>`
        : `<div class="user-cell system-event"><span>(نظام/غير مسجل)</span></div>`;

    return `
        <tr>
            <td>${userHtml}</td>
            <td>${formatAction(log.action, log.details)}</td>
            <td>${log.ip_address || 'N/A'}</td>
            <td title="${new Date(log.timestamp).toLocaleString()}">${timeAgo(log.timestamp)}</td>
        </tr>
    `;
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const { total, page, totalPages } = pagination;

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
        
        if (result.data && result.data.length > 0) {
            tbody.innerHTML = result.data.map(renderLogEntry).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state">لا توجد سجلات لعرضها.</td></tr>`;
        }
        renderPagination(result.pagination);

    } catch (error) {
        showToast(error.message, true);
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state error">فشل تحميل السجلات.</td></tr>`;
    }
}

function initActivityLogPage() {
    const searchInput = document.getElementById('log-search-input');
    const userFilter = document.getElementById('log-user-filter');
    const actionFilter = document.getElementById('log-action-filter');
    const resetBtn = document.getElementById('log-reset-filters-btn');

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
        <div class="page-header">
            <h1 class="page-title">سجل النشاط</h1>
            <p>مراقبة جميع الإجراءات الهامة التي تتم في النظام.</p>
        </div>

        <div class="filter-bar">
            <div class="filter-controls">
                <div class="filter-item search-filter">
                    <i class="fas fa-search"></i>
                    <input type="text" id="log-search-input" class="search-input" placeholder="ابحث في التفاصيل...">
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
                        <option value="login_success">تسجيل دخول</option>
                        <option value="login_failed">فشل تسجيل دخول</option>
                        <option value="create_report">إنشاء تقرير</option>
                        <option value="delete_report">حذف تقرير</option>
                        <option value="create_user">إنشاء مستخدم</option>
                        <option value="update_user">تحديث مستخدم</option>
                    </select>
                </div>
            </div>
            <button id="log-reset-filters-btn" class="cancel-btn" style="width: auto; padding: 0.6rem 1.2rem;"><i class="fas fa-times"></i> مسح</button>
        </div>

        <div class="table-container">
            <table class="activity-log-table">
                <thead>
                    <tr>
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
    `;
    IS_ADMIN = checkAdminStatus();
    if (IS_ADMIN) {
        populateUserFilter();
    }
    initActivityLogPage();
}