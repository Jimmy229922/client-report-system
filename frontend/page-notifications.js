import { fetchWithAuth } from './api.js';
import { showToast, timeAgo, showConfirmModal } from './ui.js';

let currentPage = 1;
const limit = 20;

function renderNotificationItem(notification) {
    // Reusing the same logic and classes from app.js for consistency
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const currentUserId = user ? user.id : null;
    const isAdmin = user ? user.role === 'admin' : false;
    const isLiked = notification.likes && notification.likes.includes(currentUserId);
    const iconHtml = notification.icon ? `<i class="fas ${notification.icon} notification-icon"></i>` : '<i class="fas fa-bell notification-icon"></i>';
    const typeClass = notification.type ? `notification-type-${notification.type}` : '';
    const adminDeleteBtn = isAdmin ? `<button class="delete-notification-group-btn" data-message="${encodeURIComponent(notification.message)}" data-link="${encodeURIComponent(notification.link)}" title="حذف هذا الإشعار للجميع">&times;</button>` : '';

    const likeButton = !isAdmin && notification.type !== 'like' ? `<button class="like-notification-btn ${isLiked ? 'liked' : ''}" data-id="${notification._id}" title="تأكيد القراءة"><i class="fas fa-heart"></i></button>` : '';

    return `
        <div class="timeline-item-wrapper">
            <div class="timeline-item-icon ${typeClass}">
                ${iconHtml}
            </div>
            <div class="timeline-item-card">
                <a href="${notification.link || '#'}" class="timeline-item-content" data-id="${notification._id}" data-notification-link>
                    <p class="notification-message">${notification.message}</p>
                    <span class="time">${timeAgo(notification.created_at)}</span>
                </a>
                ${likeButton}
                ${adminDeleteBtn}
            </div>
        </div>
    `;
}

function groupNotificationsByDate(notifications) {
    const groups = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1, d2) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    notifications.forEach(notification => {
        const notificationDate = new Date(notification.created_at);
        let groupKey;

        if (isSameDay(notificationDate, today)) {
            groupKey = 'اليوم';
        } else if (isSameDay(notificationDate, yesterday)) {
            groupKey = 'الأمس';
        } else {
            groupKey = notificationDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        }

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(notification);
    });

    return groups;
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    // Defensive check to prevent crash if pagination object is missing
    if (!pagination) {
        container.innerHTML = '';
        return;
    }
    const { page, totalPages } = pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<div class="pagination">`;
    html += `<button class="page-btn" data-page="1" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-double-right"></i></button>`;
    html += `<button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-right"></i></button>`;
    html += `
        <span class="page-info">
            <span class="page-info-text">صفحة</span>
            <span class="page-info-current">${page}</span>
            <span class="page-info-text">من ${totalPages}</span>
        </span>`;
    html += `<button class="page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}><i class="fas fa-angle-left"></i></button>`;
    html += `<button class="page-btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}><i class="fas fa-angle-double-left"></i></button>`;
    html += `</div>`;

    container.innerHTML = html;
}

async function fetchAndRenderHistory() {
    const listContainer = document.getElementById('notifications-history-list');
    if (!listContainer) return;
    listContainer.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;

    try {
        const params = new URLSearchParams({ page: currentPage, limit, all: 'true' });
        const result = await fetchWithAuth(`/api/notifications?${params.toString()}`);
        console.log('[Notifications Page] API Result:', result); // تمت إضافة هذا السطر للتشخيص
        
        let notificationsList = [];
        if (result && result.data) {
            // The API returns { data: [...] } for this endpoint, so we use result.data directly.
            notificationsList = Array.isArray(result.data) ? result.data : (result.data.notifications || []);
        } else if (Array.isArray(result)) {
            // Fallback for a direct array response
            notificationsList = result;
        }

        if (notificationsList.length > 0) {
            const groupedNotifications = groupNotificationsByDate(notificationsList);
            
            let html = '';
            for (const date in groupedNotifications) {
                html += `
                    <div class="timeline-group">
                        <div class="timeline-marker"><span class="timeline-date">${date}</span></div>
                        <div class="timeline-items">
                            ${groupedNotifications[date].map(renderNotificationItem).join('')}
                        </div>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
        } else {
            listContainer.innerHTML = `
                <div class="empty-state-professional">
                    <i class="fas fa-bell-slash"></i>
                    <h3>لا توجد إشعارات</h3>
                    <p>سجل الإشعارات الخاص بك فارغ حالياً.</p>
                </div>
            `;
        }
        // The pagination object is nested under `data` for this specific API response structure.
        const paginationData = result.data && result.data.pagination ? result.data.pagination : result.pagination;
        renderPagination(paginationData);

    } catch (error) {
        showToast(error.message, true);
        listContainer.innerHTML = `<div class="empty-state-professional error"><h3>فشل تحميل الإشعارات.</h3><p>${error.message}</p></div>`;
    }
}

async function handleGroupDelete(e) {
    const deleteBtn = e.target.closest('.delete-notification-group-btn');
    if (!deleteBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const message = decodeURIComponent(deleteBtn.dataset.message);
    const link = decodeURIComponent(deleteBtn.dataset.link);

    const confirmed = await showConfirmModal(
        'تأكيد الحذف الجماعي',
        'هل أنت متأكد من حذف هذا الإشعار من عند جميع المستخدمين؟',
        { confirmText: 'نعم، حذف الكل', confirmClass: 'danger-btn' }
    );

    if (confirmed) {
        try {
            const result = await fetchWithAuth('/api/notifications/group', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, link })
            });
            showToast(result.message);
            fetchAndRenderHistory(); // Refresh the view
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function handleBulkDeleteAll() {
    const confirmed = await showConfirmModal(
        'تأكيد حذف كل الإشعارات',
        'تحذير: سيتم حذف جميع الإشعارات في النظام بشكل نهائي لجميع المستخدمين. هل أنت متأكد؟',
        { confirmText: 'نعم، أحذف كل شيء', confirmClass: 'danger-btn' }
    );
    if (confirmed) {
        try {
            const result = await fetchWithAuth('/api/notifications/all', { method: 'DELETE' });
            showToast(result.message);
            fetchAndRenderHistory();
        } catch (error) { showToast(error.message, true); }
    }
}

function initNotificationsHistoryPage() {
    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.page-btn');
            if (button && !button.disabled) {
                currentPage = parseInt(button.dataset.page, 10);
                fetchAndRenderHistory();
                window.scrollTo(0, 0);
            }
        });
    }

    const listContainer = document.getElementById('notifications-history-list');
    if (listContainer) {
        listContainer.addEventListener('click', async (e) => {
            const likeBtn = e.target.closest('.like-notification-btn');
            handleGroupDelete(e);

            const notificationLink = e.target.closest('[data-notification-link]');

            if (notificationLink) {
                return; // Allow navigation
            }

            if (likeBtn && !likeBtn.classList.contains('liked')) {
                e.preventDefault();
                e.stopPropagation();
                const notificationId = likeBtn.dataset.id;
                likeBtn.classList.add('liked');
                likeBtn.disabled = true;
                const heartIcon = likeBtn.querySelector('i');
                if (heartIcon) {
                    heartIcon.style.color = 'var(--danger-color)';
                }
                try {
                    await fetchWithAuth(`/api/notifications/${notificationId}/like`, { method: 'POST' });
                    showToast('تم تأكيد القراءة.');
                } catch (error) {
                    showToast(error.message, true);
                }
            }
        });
    }

    document.getElementById('bulk-delete-all-notifications-btn')?.addEventListener('click', handleBulkDeleteAll);

    fetchAndRenderHistory();
}

export function renderNotificationsHistoryPage() {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const isAdmin = user && user.role === 'admin';

    const adminControls = isAdmin ? `
        <div class="page-header-actions">
            <button id="bulk-delete-all-notifications-btn" class="btn-danger" title="حذف جميع الإشعارات في النظام">
                <i class="fas fa-trash"></i> حذف كل السجلات
            </button>
        </div>
    ` : '';

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
    <div class="notifications-page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">سجل الإشعارات</h1>
                <p>جميع الإشعارات التي تلقيتها، مرتبة من الأحدث إلى الأقدم.</p>
            </div>
            ${adminControls}
        </div>

        <div id="notifications-history-list" class="notifications-timeline">
            <!-- Notifications will be rendered here -->
        </div>
        <div id="pagination-container"></div>
    </div>
    `;
    currentPage = 1; // Reset page on render
    initNotificationsHistoryPage();
}