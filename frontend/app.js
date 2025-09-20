import { handleTheme } from './ui.js';
import { navigate } from './router.js';
import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

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
    const navbarUsername = document.getElementById('navbar-username');
    const userStr = localStorage.getItem('user');

    if (userStr) {
        const user = JSON.parse(userStr);
        if (navbarUsername) {
            navbarUsername.textContent = user.username;
        }
        if (user.id === 1) { // Admin-only UI elements
            if (userManagementLink) userManagementLink.classList.remove('hidden');
            if (updateAppBtn) updateAppBtn.classList.remove('hidden');
        }
    }
}

async function handleAppUpdate() {
    if (!confirm('هل أنت متأكد من أنك تريد البحث عن تحديثات وتثبيتها؟ سيتم إعادة تشغيل السيرفر.')) {
        return;
    }

    showToast('جاري البحث عن تحديثات...');

    try {
        const response = await fetchWithAuth('/api/system/update', { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
            const errorDetail = result.error ? `\n\nالتفاصيل: ${result.error}` : '';
            throw new Error((result.message || 'فشل عملية التحديث.') + errorDetail);
        }

        showToast(result.message);

        if (result.message.includes('سيتم إعادة تشغيل السيرفر')) {
            const mainContent = document.getElementById('main-content');
            mainContent.innerHTML = `
                <div class="form-container" style="text-align: center; max-width: 600px; margin: 2rem auto;">
                    <h2 style="color: var(--success-color);"><i class="fas fa-check-circle"></i> تم التحديث بنجاح!</h2>
                    <p style="margin-top: 1rem;">يقوم السيرفر الآن بإعادة التشغيل بآخر إصدار.</p>
                    <p>الرجاء الانتظار بضع ثوانٍ ثم قم بتحديث الصفحة يدوياً.</p>
                    <button class="submit-btn" style="margin-top: 1.5rem;" onclick="location.reload(true)">تحديث الصفحة الآن</button>
                </div>
            `;
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