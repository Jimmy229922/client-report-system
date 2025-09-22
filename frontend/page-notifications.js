import { fetchWithAuth } from './api.js';
import { showToast, timeAgo } from './ui.js';

let currentPage = 1;
const limit = 20;

function renderNotificationItem(notification) {
    // Reusing the same logic and classes from app.js for consistency
    const iconHtml = notification.icon ? `<i class="fas ${notification.icon} notification-icon"></i>` : '<i class="fas fa-bell notification-icon"></i>';
    const typeClass = notification.type ? `notification-type-${notification.type}` : '';

    return `
        <a href="${notification.link || '#'}" class="notification-history-item ${!notification.is_read ? 'unread' : ''} ${typeClass}" data-id="${notification.id}">
            ${iconHtml}
            <div class="notification-content">
                <p class="notification-message">${notification.message}</p>
                <span class="time">${timeAgo(notification.created_at)}</span>
            </div>
        </a>
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
    html += `<span class="page-info">صفحة ${page} من ${totalPages}</span>`;
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
        const params = new URLSearchParams({ page: currentPage, limit });
        const result = await fetchWithAuth(`/api/notifications?${params.toString()}`);
        
        if (result.data && result.data.length > 0) {
            const groupedNotifications = groupNotificationsByDate(result.data);
            
            let html = '';
            for (const date in groupedNotifications) {
                html += `
                    <div class="notification-date-group">
                        <h3 class="notification-date-header">${date}</h3>
                        <div class="notification-items-list">
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
        renderPagination(result.pagination);

    } catch (error) {
        showToast(error.message, true);
        listContainer.innerHTML = `<div class="empty-state-professional error"><h3>فشل تحميل الإشعارات.</h3><p>${error.message}</p></div>`;
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
    fetchAndRenderHistory();
}

export function renderNotificationsHistoryPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">سجل الإشعارات</h1>
            <p>جميع الإشعارات التي تلقيتها، مرتبة من الأحدث إلى الأقدم.</p>
        </div>

        <div id="notifications-history-list" class="notifications-history-container">
            <!-- Notifications will be rendered here -->
        </div>
        <div id="pagination-container"></div>
    `;
    currentPage = 1; // Reset page on render
    initNotificationsHistoryPage();
}