import { handleTheme, updateNavbarUser, showToast } from './ui.js';
import { navigate } from './router.js';
import { fetchWithAuth } from './api.js';

function handleImagePreviewModal() {
    const modal = document.getElementById('image-preview-modal');
    const modalImage = document.getElementById('modal-image-content');
    const closeBtn = document.getElementById('image-modal-close-btn');

    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('img-preview')) {
            modalImage.src = e.target.src;
            modal.style.display = 'flex';
        }
    });

    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function setupUIForUser() {
    const userManagementLink = document.getElementById('user-management-link');
    const updateAppBtn = document.getElementById('update-app-btn');
    updateNavbarUser(); // Update username and avatar

    const userStr = localStorage.getItem('user');
    if (userStr) {
        const user = JSON.parse(userStr);
        if (user.id === 1) { // Admin-only UI elements
            if (userManagementLink) userManagementLink.classList.remove('hidden');
            if (updateAppBtn) updateAppBtn.classList.remove('hidden');
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
    if (!confirm('هل أنت متأكد من أنك تريد البحث عن تحديثات وتثبيتها؟ سيتم إعادة تشغيل السيرفر.')) {
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
        logEl.textContent = result.log || 'لا يوجد سجلات لعرضها.';

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

export function initApp() {
    handleTheme();
    handleImagePreviewModal();
    setupUIForUser(); // Setup UI based on user role

    const updateBtn = document.getElementById('update-app-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', handleAppUpdate);
    }

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user'); // Clear user info on logout
        location.reload();
    });

    window.addEventListener('hashchange', navigate);
    navigate(); // Load initial page
}