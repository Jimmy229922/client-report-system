import { handleTheme, updateNavbarUser, showToast, showConfirmModal, timeAgo } from './ui.js';
import { navigate } from './router.js';
import { initIpWidget } from './ip-widget.js';
import { checkAndStartTour } from './tour.js';
import { fetchWithAuth } from './api.js';

// Audio element for notification sounds
const notificationSound = new Audio('notification.mp3');
const goldNotificationSound = new Audio('gold_notification.mp3');

function handleImagePreviewModal() {
    const modal = document.getElementById('image-preview-modal');
    const modalImage = document.getElementById('modal-image-content');
    const closeBtn = document.getElementById('image-modal-close-btn');
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');

    let currentImageIndex = 0;
    let currentImageGallery = [];

    const showImage = (index) => {
        if (index < 0 || index >= currentImageGallery.length) return;
        currentImageIndex = index;
        modalImage.src = currentImageGallery[index];
        prevBtn.style.display = (index > 0) ? 'block' : 'none';
        nextBtn.style.display = (index < currentImageGallery.length - 1) ? 'block' : 'none';
    };

    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('img-preview')) {
            // Find the parent container that holds all related images
            const parentContainer = e.target.closest('.archive-image-thumbnails, #image-previews');
            
            if (parentContainer) {
                const allImages = parentContainer.querySelectorAll('.img-preview');
                currentImageGallery = Array.from(allImages).map(img => img.src);
                const clickedIndex = currentImageGallery.indexOf(e.target.src);
                
                showImage(clickedIndex);
                modal.classList.add('show');
            } else { // Fallback for single images without a common container
                currentImageGallery = [e.target.src];
                showImage(0);
                modal.classList.add('show');
            }
        }
    });

    const closeModal = () => modal.classList.remove('show');

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
    prevBtn.addEventListener('click', () => showImage(currentImageIndex - 1));
    nextBtn.addEventListener('click', () => showImage(currentImageIndex + 1));
}

function setupUIForUser() {
    const userManagementLink = document.getElementById('user-management-link');
    const activityLogLink = document.getElementById('activity-log-link');
    const analyticsLink = document.getElementById('analytics-link');
    const broadcastLink = document.getElementById('broadcast-link');
    const adminSectionDivider = document.getElementById('admin-section-divider');
    const updateAppBtn = document.getElementById('update-app-btn');
    updateNavbarUser(); // Update username and avatar

    const userStr = localStorage.getItem('user');
    if (userStr) {
        // Defensive check to prevent crash from corrupted data
        if (userStr && userStr !== 'undefined' && userStr !== 'null') {
            try {
                const user = JSON.parse(userStr);
                if (user && user.id === 1) { // Admin-only UI elements
                    if (userManagementLink) userManagementLink.classList.remove('hidden');
                    if (activityLogLink) activityLogLink.classList.remove('hidden');
                    if (analyticsLink) analyticsLink.classList.remove('hidden');
                    if (broadcastLink) broadcastLink.classList.remove('hidden');
                    if (adminSectionDivider) adminSectionDivider.classList.remove('hidden');
                    // The update button is also admin-only
                    if (updateAppBtn) updateAppBtn.classList.remove('hidden');
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
            <div class="progress-bar-container hidden">
                <div id="update-progress-bar" class="progress-bar"></div>
            </div>
            <p id="update-progress-text" class="progress-text"></p>
            <div class="update-log-container">
                <pre id="update-log" class="update-log"></pre>
            </div>
            <div id="update-footer" class="update-footer hidden">
                <div class="spinner"></div>
                <p>جاري إعادة تشغيل الخادم... الرجاء الانتظار.</p>
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

function animateProgressBar(duration, onComplete) {
    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    const container = progressBar.parentElement;
    container.classList.remove('hidden');

    let start = null;
    const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const percentage = Math.floor(progress * 100);
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (onComplete) onComplete();
        }
    };
    window.requestAnimationFrame(step);
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

    // Update progress bar for server check
    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    const percentage = Math.floor((attempts / maxAttempts) * 100);
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `فحص الاتصال... ${percentage}%`;

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
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = 'اكتمل 100%';
                const footerEl = document.getElementById('update-footer');
                if (footerEl) footerEl.classList.add('hidden');
 
                showToast('تم إعادة تشغيل السيرفر بنجاح! سيتم تحديث الصفحة.');
                setTimeout(() => location.reload(), 2000);
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
        animateProgressBar(15000); // Simulate a 15-second update process
        const result = await fetchWithAuth('/api/system/update', {
            method: 'POST',
            timeout: 180000 // 3-minute timeout to allow for git pull and npm install
        });
 
        statusEl.textContent = result.message;
        
        // Ensure progress bar is at 100% when command finishes
        const progressBar = document.getElementById('update-progress-bar');
        const progressText = document.getElementById('update-progress-text');
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'اكتمل 100%';
        
        if (result.log && result.log.trim() !== '') {
            logEl.textContent = result.log;
        } else {
            logEl.textContent = 'لم يتم إرجاع أي سجلات من السيرفر. قد يكون التحديث قد تم بصمت أو أن النظام محدث بالفعل.';
        }

        if (result.needsRestart) {
            footerEl.classList.remove('hidden');
            statusEl.textContent = 'تم سحب التحديثات. جاري إعادة تشغيل الخادم...';
            if (progressText) progressText.textContent = '';
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

async function handleGoldMarketUpload() {
    // 1. Create and show a modal for uploading the image
    const modal = document.createElement('div');
    modal.id = 'gold-upload-modal';
    modal.className = 'modal'; // Use existing modal styles
    modal.innerHTML = `
        <div class="modal-dialog" style="max-width: 500px; text-align: center;">
            <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                <h3><i class="fas fa-exclamation-triangle" style="color: #FFD700;"></i> إرسال تنبيه إغلاق الذهب</h3>
            </div>
            <div class="modal-body" style="padding-top: 1rem;">
                <p style="margin-bottom: 1.5rem;">ارفع صورة إثبات إغلاق السوق. سيتم إرسالها تلقائياً.</p>
                <div id="gold-upload-area" style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 2rem; text-align: center; color: #aaa; cursor: pointer; transition: all 0.2s ease;">
                    <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                    <p>الصق الصورة هنا أو انقر للاختيار</p>
                </div>
                <input type="file" id="gold-upload-input" accept="image/*" class="hidden">
            </div>
            <div class="modal-footer" style="justify-content: center; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1.5rem;">
                 <button id="gold-upload-cancel-btn" class="cancel-btn"><i class="fas fa-times"></i> إغلاق</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10); // Fade in

    const uploadArea = modal.querySelector('#gold-upload-area');
    const fileInput = modal.querySelector('#gold-upload-input');

    const handleFile = async (file) => {
        if (!file || !file.type.startsWith('image/')) {
            showToast('الرجاء رفع ملف صورة صالح.', true);
            return;
        }

        // Cleanup before sending
        document.removeEventListener('paste', pasteHandler);
        modal.remove();
        
        showToast('جاري إرسال صورة إغلاق الذهب...');

        const formData = new FormData();
        formData.append('image', file);

        try {
            const result = await fetchWithAuth('/api/broadcast/gold-market-close-with-image', {
                method: 'POST',
                body: formData
            });
            showToast(result.message);
        } catch (error) {
            showToast(error.message, true);
        }
    };

    const closeModal = () => {
        document.removeEventListener('paste', pasteHandler);
        modal.classList.remove('show');
        modal.addEventListener('transitionend', () => modal.remove(), { once: true });
    };

    modal.querySelector('#gold-upload-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    
    const pasteHandler = (e) => { const items = (e.clipboardData || window.clipboardData).items; for (const item of items) { if (item.type.indexOf('image') !== -1) { e.preventDefault(); const file = item.getAsFile(); handleFile(file); return; } } };
    document.addEventListener('paste', pasteHandler);
}

let healthCheckInterval = null;

function updateSystemHealth() {
    const container = document.getElementById('system-health-container');
    if (!container) {
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        return;
    };

    fetchWithAuth('/api/health')
        .then(result => {
            renderSystemHealth(true);
        })
        .catch((error) => {
            renderSystemHealth(false);
        });
}

function renderSystemHealth(isOverallHealthy) {
    const container = document.getElementById('system-health-container');
    if (!container) return;

    const timeString = new Date().toLocaleTimeString('ar-EG');
    const overallStatusText = isOverallHealthy ? 'النظام يعمل بشكل طبيعي' : 'توجد مشكلة في الاتصال';
    const overallStatusClass = isOverallHealthy ? 'healthy' : 'unhealthy';

    container.innerHTML = `
        <div class="health-main-status ${overallStatusClass}">
            <div class="status-light"></div>
            <span>${overallStatusText}</span>
        </div>
        <div class="health-last-checked">
            <i class="fas fa-history"></i> آخر فحص: ${timeString}
        </div>
    `;
}

async function loadAndDisplayVersion() {
    const versionSpan = document.getElementById('app-version-health');
    if (!versionSpan) return;
    try {
        const { version } = await fetchWithAuth('/api/version');
        versionSpan.textContent = `v${version || '?.?.?'}`;
    } catch (error) {
        console.error('Failed to load app version:', error);
        versionSpan.textContent = 'v?.?.?';
    }
}

async function fetchAndRenderNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    if (!list || !badge) return;

    // Ensure header and items container exist. This prevents re-rendering the header
    // on refresh, which would reset the status indicator.
    if (!list.querySelector('.notification-header')) {
        list.innerHTML = `
            <div class="notification-header">
                <h4>الإشعارات</h4>
                <button id="refresh-notifications-btn" class="icon-btn" title="تحديث"><i class="fas fa-sync-alt"></i></button>
            </div>
            <div id="notification-items-container"></div>
        `;
    }
    const itemsContainer = document.getElementById('notification-items-container');

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
            itemsContainer.innerHTML = '<div class="notification-item" style="text-align: center; color: #aaa;">لا توجد إشعارات.</div>';
            return;
        }

        itemsContainer.innerHTML = notifications.map(n => {
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

    const updateIndicator = (isConnected) => {
        const statusIndicator = document.getElementById('notification-status-indicator');
        if (statusIndicator) {
            if (isConnected) {
                statusIndicator.classList.remove('disconnected');
                statusIndicator.classList.add('connected');
                statusIndicator.title = 'متصل بالتحديثات اللحظية';
            } else {
                statusIndicator.classList.remove('connected');
                statusIndicator.classList.add('disconnected');
                statusIndicator.title = 'انقطع الاتصال اللحظي، جاري إعادة المحاولة...';
            }
        }
    };

    eventSource.onopen = () => {
        console.log('[SSE] Connection to server opened.');
        updateIndicator(true);
    };

    // NEW: Add a listener for our custom heartbeat event.
    // This confirms the connection is alive without cluttering the main message handler.
    eventSource.addEventListener('heartbeat', (event) => {
        console.log('[SSE] Heartbeat received.', event.data);
        // We know the connection is good, so ensure the indicator is green.
        updateIndicator(true);
    });

    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('[SSE] Received event:', data);

            switch (data.type) {
                case 'gold_market_closed':
                    showToast('تنبيه: تم إيقاف سوق الذهب!');
                    // Play the specific gold sound
                    goldNotificationSound.play().catch(error => {
                        console.warn("Gold notification sound could not be played.", error);
                    });
                    fetchAndRenderNotifications();
                    break;
                case 'notification_created':
                    showToast('لديك إشعار جديد!');
                    // Play sound, with a catch block for browser autoplay restrictions
                    notificationSound.play().catch(error => {
                        console.warn("Notification sound could not be played. This is often due to browser restrictions requiring user interaction first.", error);
                    });
                    fetchAndRenderNotifications();
                    break;
                case 'notification_deleted':
                    // Just refresh the list without a toast to avoid being intrusive.
                    fetchAndRenderNotifications();
                    break;
                case 'connected':
                    console.log('[SSE] Successfully connected to event stream.');
                    updateIndicator(true);
                    break;
            }
        } catch (error) {
            console.error('[SSE] Error parsing event data:', error);
        }
    };

    eventSource.onerror = function(err) {
        console.error('[SSE] EventSource connection failed. This can be due to a server restart, network issue, or an authentication problem (like an expired token). The browser does not provide specific details.', err);
        if (err.target && err.target.readyState === EventSource.CLOSED) {
            console.error('[SSE] The connection was closed by the server or due to a network error.');
        } else {
            console.error('[SSE] An unknown error occurred with the EventSource.');
        }
        updateIndicator(false);
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
    
    // Check if the data is an array (full changelog) or a single object (latest)
    const versionsToShow = Array.isArray(changelog) ? changelog : [changelog];

    bodyEl.innerHTML = versionsToShow.map(versionEntry => {
        const changeTypeMap = {
            new: { icon: 'fa-plus-circle', text: 'إضافة جديدة', class: 'new' },
            improvement: { icon: 'fa-arrow-alt-circle-up', text: 'تحسين', class: 'improvement' },
            fix: { icon: 'fa-wrench', text: 'إصلاح', class: 'fix' }
        };

        const changesHtml = versionEntry.changes.map(change => {
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
        }).join('');

        return `
            <div class="changelog-version-group">
                <h4>
                    الإصدار v${versionEntry.version}
                    <span class="changelog-date">${new Date(versionEntry.date).toLocaleDateString('ar-EG')}</span>
                </h4>
                <ul>${changesHtml}</ul>
            </div>
        `;
    }).join('');

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

    // --- Add Gold Market Close Button ---
    const navActions = document.querySelector('.nav-actions');
    if (navActions) {
        const goldButton = document.createElement('button');
        goldButton.id = 'gold-market-close-btn';
        goldButton.className = 'icon-btn';
        goldButton.title = 'إرسال تنبيه إغلاق سوق الذهب';
        // Using a gold-colored warning icon
        goldButton.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #FFD700;"></i>';
        
        // Place it after the theme toggle button for consistent ordering
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (themeToggleBtn) {
            themeToggleBtn.insertAdjacentElement('afterend', goldButton);
        } else {
            navActions.prepend(goldButton);
        }

        goldButton.addEventListener('click', handleGoldMarketUpload);
    }

    // --- Move Notification Status Indicator to Navbar ---
    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn && !document.getElementById('notification-status-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'notification-status-indicator';
        indicator.className = 'status-indicator disconnected';
        indicator.title = 'انقطع الاتصال اللحظي، جاري إعادة المحاولة...';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'notification-btn-wrapper';
        notificationsBtn.parentNode.insertBefore(wrapper, notificationsBtn);
        wrapper.appendChild(notificationsBtn);
        wrapper.appendChild(indicator);
    }

    handleImagePreviewModal();
    initIpWidget();

    const showChangelogBtn = document.getElementById('show-changelog-btn');
    if (showChangelogBtn) {
        showChangelogBtn.addEventListener('click', async () => {
            try {
                const changelogRes = await fetch('/api/changelog'); // Fetch the full changelog
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
            // For a clean logout, we clear all stored data except for the user's theme preference.
            const theme = localStorage.getItem('theme');
            localStorage.clear();
            if (theme) {
                localStorage.setItem('theme', theme);
            }
            // Use replace() to prevent the logged-in page from being in the browser history.
            window.location.replace('/');
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
    if (sessionStorage.getItem('justLoggedIn') === 'true') {
        showToast('تم تسجيل الدخول بنجاح!');
        sessionStorage.removeItem('justLoggedIn');
    }

    // Initialize global components like system health bar
    loadAndDisplayVersion();
    updateSystemHealth(); // Initial check
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(updateSystemHealth, 30000); // Check every 30 seconds
}