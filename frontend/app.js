import { handleTheme, updateNavbarUser, showToast, showConfirmModal, timeAgo } from './ui.js';
import { navigate } from './router.js';
import { initIpWidget } from './ip-widget.js';
import { checkAndStartTour } from './tour.js';
import { fetchWithAuth } from './api.js';

function handleImagePreviewModal() {
    const modal = document.getElementById('image-preview-modal');
    const modalImage = document.getElementById('modal-image-content');
    const closeBtn = document.getElementById('image-modal-close-btn');

    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('img-preview')) {
            modalImage.src = e.target.src;
            modal.classList.add('show');
        }
    });

    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
}

function setupUIForUser() {
    const userManagementLink = document.getElementById('user-management-link');
    const updateAppBtn = document.getElementById('update-app-btn');
    updateNavbarUser(); // Update username and avatar

    const userStr = localStorage.getItem('user');
    if (userStr) {
        // Defensive check to prevent crash from corrupted data
        if (userStr && userStr !== 'undefined' && userStr !== 'null') {
            try {
                const user = JSON.parse(userStr);
                // Make the update button visible to all logged-in users
                if (updateAppBtn) updateAppBtn.classList.remove('hidden');
                // Show admin-only links
                if (user && user.id === 1) { // Admin-only UI elements
                    if (userManagementLink) userManagementLink.classList.remove('hidden');
                }
            } catch (error) {
                console.error("Corrupted user data in localStorage (app.js). Clearing and reloading.", error);
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                location.reload();
            }
        }
    }
}

function showUpdateOverlay(initialMessage = 'جاري البحث عن تحديثات...') {
    let overlay = document.getElementById('update-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'update-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px);
            z-index: 10000; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white;
            transition: opacity 0.3s; opacity: 0;
        `;
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="update-modal">
            <h3 id="update-status">${initialMessage}</h3>
            <div class="update-log-container">
                <pre id="update-log" class="update-log"></pre>
            </div>
            <div id="update-footer" class="update-footer hidden">
                <div class="spinner"></div>
                <p>جاري إعادة تشغيل السيرفر... الرجاء الانتظار.</p>
            </div>
            <button id="close-update-overlay-btn" class="submit-btn hidden" style="margin-top: 1.5rem; width: auto; padding: 0.5rem 1rem;">إغلاق</button>
        </div>
    `;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.style.opacity = 1, 10); // Fade in

    document.getElementById('close-update-overlay-btn').addEventListener('click', () => {
        overlay.style.opacity = 0;
        setTimeout(() => overlay.classList.add('hidden'), 300);
    });
}

function checkServerStatus(attempts = 0) {
    const maxAttempts = 90; // Try for 90 seconds (90 * 1000ms)
    if (attempts >= maxAttempts) {
        const footerEl = document.getElementById('update-footer');
        const statusEl = document.getElementById('update-status');
        const closeBtn = document.getElementById('close-update-overlay-btn');

        if (footerEl) footerEl.classList.add('hidden');
        if (statusEl) {
            statusEl.textContent = 'استغرقت عملية إعادة التشغيل وقتاً طويلاً.';
            statusEl.style.color = '#ff9800';
        }
        if (closeBtn) closeBtn.classList.remove('hidden');

        const logEl = document.getElementById('update-log');
        if (logEl) {
            logEl.textContent += '\n\n--- \nفشل الاتصال بالسيرفر بعد التحديث. قد يكون لا يزال يعمل في الخلفية. حاول تحديث الصفحة يدوياً بعد قليل.';
        }
        return;
    }

    setTimeout(async () => {
        try {
            // Use a cache-busting query parameter
            const response = await fetch(`/api/health?t=${Date.now()}`);
            if (response.ok) {
                const statusEl = document.getElementById('update-status');
                if (statusEl) {
                    statusEl.textContent = 'تم إعادة تشغيل السيرفر بنجاح!';
                    statusEl.style.color = 'var(--success-color)';
                }
                const footerEl = document.getElementById('update-footer');
                if (footerEl) footerEl.classList.add('hidden');

                showToast('تم إعادة تشغيل السيرفر بنجاح! سيتم تحديث الصفحة.');
                setTimeout(() => location.reload(), 1500);
            } else { checkServerStatus(attempts + 1); }
        } catch (error) { checkServerStatus(attempts + 1); }
    }, 1000);
}

async function handleAppUpdate() {
    const confirmed = await showConfirmModal(
        'تأكيد تحديث النظام', 
        'هل أنت متأكد من أنك تريد البحث عن تحديثات وتثبيتها؟ سيتم إعادة تشغيل السيرفر.',
        {
            iconClass: 'fas fa-cloud-download-alt',
            confirmText: 'نعم، تحديث'
        }
    );
    if (!confirmed) {
        return;
    }

    showUpdateOverlay();
    const statusEl = document.getElementById('update-status');
    const logEl = document.getElementById('update-log');
    const footerEl = document.getElementById('update-footer');
    const closeBtn = document.getElementById('close-update-overlay-btn');

    try {
        const result = await fetchWithAuth('/api/system/update', { method: 'POST' });

        statusEl.textContent = result.message;
        
        if (result.log && result.log.trim() !== '') {
            logEl.textContent = result.log;
        } else {
            logEl.textContent = 'لم يتم إرجاع أي سجلات من السيرفر. قد يكون التحديث قد تم بصمت أو أن النظام محدث بالفعل.';
        }

        if (result.needsRestart) {
            footerEl.classList.remove('hidden');
            checkServerStatus();
        } else {
            // No restart needed, show close button
            closeBtn.classList.remove('hidden');
        }
    } catch (error) {
        statusEl.textContent = 'حدث خطأ أثناء التحديث!';
        statusEl.style.color = 'var(--danger-color)';
        // The 'log' property is added to the error object in the backend for failed exec
        logEl.textContent = error.log || error.message || 'خطأ غير معروف.';
        closeBtn.classList.remove('hidden');
        console.error('Update failed:', error);
    }
}

async function fetchAndRenderNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    if (!list || !badge) return;

    const userStr = localStorage.getItem('user');
    let isAdmin = false;
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isAdmin = user.id === 1;
        } catch (e) { /* ignore */ }
    }

    try {
        // Using fetchWithAuth for consistency and robust error handling
        const result = await fetchWithAuth('/api/notifications');
        const notifications = result.data || [];

        const unreadCount = notifications.filter(n => !n.is_read).length;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (notifications.length === 0) {
            list.innerHTML = '<div class="notification-item" style="text-align: center; color: #aaa;">لا توجد إشعارات.</div>';
            return;
        }

        const header = `
            <div class="notification-header">
                <h4>الإشعارات</h4>
                <button id="refresh-notifications-btn" class="icon-btn" title="تحديث"><i class="fas fa-sync-alt"></i></button>
            </div>
        `;

        const itemsHtml = notifications.map(n => {
            const adminDeleteBtn = isAdmin ? `<button class="delete-notification-btn" data-message="${n.message}" data-link="${n.link}" title="حذف هذا الإشعار للجميع">&times;</button>` : '';
            return `
                <div class="notification-item-wrapper">
                    <a href="${n.link || '#'}" class="notification-item ${!n.is_read ? 'unread' : ''}" data-id="${n.id}">
                        ${n.message}
                        <span class="time">${timeAgo(n.created_at)}</span>
                    </a>
                    ${adminDeleteBtn}
                </div>`;
        }).join('');

        list.innerHTML = header + itemsHtml;

    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        // Do not show an error in the UI to keep it clean, just log it.
    }
}

function handleNotifications() {
    const btn = document.getElementById('notifications-btn');
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');

    if (!btn || !list) return;

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isVisible = list.style.display === 'block';
        list.style.display = isVisible ? 'none' : 'block';

        if (!isVisible && !badge.classList.contains('hidden')) {
            badge.classList.add('hidden');
            list.querySelectorAll('.unread').forEach(item => item.classList.remove('unread'));
            await fetchWithAuth('/api/notifications/mark-as-read', { method: 'POST' });
        }
    });

    document.addEventListener('click', (e) => {
        if (list.style.display === 'block' && !list.contains(e.target) && !btn.contains(e.target)) {
            list.style.display = 'none';
        }
    });

    list.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-notification-btn');
        const refreshBtn = e.target.closest('#refresh-notifications-btn');

        if (refreshBtn) {
            e.preventDefault();
            e.stopPropagation();
            const icon = refreshBtn.querySelector('i');
            icon.classList.add('fa-spin');
            await fetchAndRenderNotifications(); // This will re-render and remove the spinning button
            return;
        }

        if (deleteBtn) {
            e.preventDefault(); // Prevent navigation if the link is clicked
            e.stopPropagation(); // Stop the click from propagating to the link or the dropdown handler

            const message = deleteBtn.dataset.message;
            const link = deleteBtn.dataset.link;

            const confirmed = await showConfirmModal(
                'تأكيد الحذف',
                'هل أنت متأكد من حذف هذا الإشعار لجميع الموظفين؟',
                {
                    iconClass: 'fas fa-trash-alt',
                    iconColor: 'var(--danger-color)',
                    confirmText: 'نعم، حذف للجميع',
                    confirmClass: 'submit-btn danger-btn'
                }
            );

            if (confirmed) {
                try {
                    const result = await fetchWithAuth('/api/notifications/group', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, link }) });
                    showToast(result.message);
                    fetchAndRenderNotifications(); // Refresh the list
                } catch (error) { showToast(error.message, true); }
            }
        }
    });
}

function initRealtimeNotifications() {
    const token = localStorage.getItem('token');
    if (!token) return;

    console.log('[SSE] Initializing real-time connection...');
    const eventSource = new EventSource(`/api/notifications/events?token=${token}`);

    eventSource.onopen = () => {
        console.log('[SSE] Connection to server opened.');
    };

    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('[SSE] Received event:', data);

            switch (data.type) {
                case 'notification_created':
                    showToast('لديك إشعار جديد!');
                    fetchAndRenderNotifications();
                    break;
                case 'notification_deleted':
                    // Just refresh the list without a toast to avoid being intrusive.
                    fetchAndRenderNotifications();
                    break;
                case 'connected':
                    console.log('[SSE] Successfully connected to event stream.');
                    break;
            }
        } catch (error) {
            console.error('[SSE] Error parsing event data:', error);
        }
    };

    eventSource.onerror = function(err) {
        console.error('EventSource failed:', err);
        eventSource.close();
        // Attempt to reconnect after a delay
        console.log('[SSE] Connection lost. Attempting to reconnect in 10 seconds...');
        setTimeout(initRealtimeNotifications, 10000);
    };
}

async function checkVersionAndShowChangelog() {
    try {
        const versionRes = await fetch('/api/version');
        if (!versionRes.ok) return;
        const { version: currentVersion } = await versionRes.json();

        const lastSeenVersion = localStorage.getItem('appVersion');

        // Show changelog if the version is new. This will also show on the very first visit.
        if (currentVersion && currentVersion !== lastSeenVersion) {
            const changelogRes = await fetch('/api/changelog/latest');
            if (!changelogRes.ok) return;
            const changelogData = await changelogRes.json();

            // Only show if the latest changelog matches the current app version
            if (changelogData.version === currentVersion) {
                showChangelogModal(changelogData);
            }
            
            // After the check, always update the version in storage.
            localStorage.setItem('appVersion', currentVersion);
        }

    } catch (error) {
        console.error("Failed to check version or show changelog:", error);
    }
}

function showChangelogModal(changelog) {
    const modal = document.getElementById('changelog-modal');
    const titleEl = document.getElementById('changelog-title');
    const bodyEl = document.getElementById('changelog-body');
    const okBtn = document.getElementById('changelog-modal-ok-btn');
    const closeBtn = document.getElementById('changelog-modal-close-btn');

    if (!modal || !titleEl || !bodyEl || !okBtn || !closeBtn) return;

    titleEl.innerHTML = `ما الجديد في الإصدار <span class="app-version-badge" style="color: var(--accent-color)">v${changelog.version}</span>`;
    
    const changeTypeMap = {
        new: { icon: 'fa-plus-circle', text: 'إضافة جديدة', class: 'new' },
        improvement: { icon: 'fa-arrow-alt-circle-up', text: 'تحسين', class: 'improvement' },
        fix: { icon: 'fa-wrench', text: 'إصلاح', class: 'fix' }
    };

    bodyEl.innerHTML = `
        <ul>
            ${changelog.changes.map(change => {
                const typeInfo = changeTypeMap[change.type] || { icon: 'fa-info-circle', text: 'تغيير', class: '' };
                return `
                    <li>
                        <i class="fas ${typeInfo.icon} changelog-item-icon ${typeInfo.class}"></i>
                        <div>
                            <strong>${typeInfo.text}:</strong>
                            <p>${change.description}</p>
                        </div>
                    </li>
                `;
            }).join('')}
        </ul>
    `;

    const closeModal = () => modal.classList.remove('show');

    okBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    modal.classList.add('show');
}

export function initApp() {
    handleTheme();
    handleImagePreviewModal();
    initIpWidget();

    const showChangelogBtn = document.getElementById('show-changelog-btn');
    if (showChangelogBtn) {
        showChangelogBtn.addEventListener('click', async () => {
            try {
                const changelogRes = await fetch('/api/changelog/latest');
                if (!changelogRes.ok) throw new Error('تعذر تحميل سجل التغييرات.');
                const changelogData = await changelogRes.json();
                showChangelogModal(changelogData);
            } catch (error) {
                showToast(error.message, true);
                console.error('Failed to manually show changelog:', error);
            }
        });
    }

    const updateBtn = document.getElementById('update-app-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', handleAppUpdate);
    }

    const restartTourBtn = document.getElementById('restart-tour-btn');
    if (restartTourBtn) {
        restartTourBtn.addEventListener('click', () => checkAndStartTour(true));
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            'تسجيل الخروج',
            'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
            {
                iconClass: 'fas fa-sign-out-alt',
                iconColor: 'var(--danger-color)',
                confirmText: 'نعم، تسجيل الخروج',
                confirmClass: 'submit-btn danger-btn',
                cancelText: 'إلغاء'
            }
        );
        if (confirmed) {
            showToast('جاري تسجيل الخروج...');

            // For a clean logout, we clear all stored data except for the user's theme preference.
            const theme = localStorage.getItem('theme');
            localStorage.clear();
            if (theme) {
                localStorage.setItem('theme', theme);
            }

            // Redirect to the login page after a short delay to allow the user to see the toast message.
            setTimeout(() => {
                // Use replace() to prevent the logged-in page from being in the browser history.
                window.location.replace('/');
            }, 1000);
        }
    });

    window.addEventListener('hashchange', navigate);
    
    setupUIForUser(); // Setup UI based on user role
    navigate(); // Load initial page

    // Initialize notifications
    handleNotifications();
    fetchAndRenderNotifications();
    initRealtimeNotifications(); // Start listening for real-time events
    checkVersionAndShowChangelog();
}