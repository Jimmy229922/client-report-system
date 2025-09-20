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

function showUpdateOverlay() {
    let overlay = document.getElementById('update-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'update-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px);
            z-index: 10000; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="spinner"></div>
        <p style="margin-top: 1rem;">جاري إعادة تشغيل السيرفر... الرجاء الانتظار.</p>
    `;
    overlay.classList.remove('hidden');
}

function checkServerStatus(attempts = 0) {
    const maxAttempts = 90; // Try for 90 seconds (90 * 1000ms)
    if (attempts >= maxAttempts) {
        const overlay = document.getElementById('update-overlay');
        if(overlay) {
            overlay.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ff9800;"></i>
                <p style="margin-top: 1rem;">استغرقت عملية التحديث وقتاً طويلاً.</p>
                <p>قد يكون السيرفر لا يزال يقوم بتثبيت التحديثات في الخلفية.</p>
                <p>الرجاء محاولة تحديث الصفحة يدوياً بعد دقيقة.</p>
                <button class="submit-btn" style="margin-top: 1.5rem; width: auto; padding: 0.5rem 1rem;" onclick="location.reload(true)">تحديث الصفحة</button>
            `;
        }
        return;
    }

    setTimeout(async () => {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                showToast('تم إعادة تشغيل السيرفر بنجاح!');
                setTimeout(() => location.reload(), 1000);
            } else { checkServerStatus(attempts + 1); }
        } catch (error) { checkServerStatus(attempts + 1); }
    }, 1000);
}

async function handleAppUpdate() {
    if (!confirm('هل أنت متأكد من أنك تريد البحث عن تحديثات وتثبيتها؟ سيتم إعادة تشغيل السيرفر.')) {
        return;
    }

    showToast('جاري البحث عن تحديثات...');

    try {
        const result = await fetchWithAuth('/api/system/update', { method: 'POST' });

        // Defensive check to ensure the response has the expected structure
        if (result && result.message) {
            showToast(result.message);
            if (result.message.includes('سيتم إعادة تشغيل السيرفر')) {
                showUpdateOverlay();
                checkServerStatus();
            }
        } else {
            // This case should not happen, but we handle it to prevent a crash.
            const errorMessage = 'استجابة غير متوقعة من السيرفر أثناء التحديث.';
            showToast(errorMessage, true);
            console.error('Unexpected update response:', result);
        }
    } catch (error) {
        // Display multiline errors in a readable way
        showToast(error.message.replace(/\n/g, '<br>'), true);
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