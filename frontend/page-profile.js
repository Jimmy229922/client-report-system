import { fetchWithAuth } from './api.js';
import { showToast, updateNavbarUser } from './ui.js';

function initProfilePage() {
    const avatarInput = document.getElementById('avatar-upload-input');
    if (!avatarInput) return;

    avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);

        showToast('جاري رفع الصورة...');

        try {
            const response = await fetchWithAuth('/api/profile/avatar', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'فشل رفع الصورة.');

            showToast('تم تحديث الصورة بنجاح!');
            
            // Update localStorage with the new user object
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // Re-render the page content and update the navbar
            renderProfilePage();
            updateNavbarUser();

        } catch (error) {
            showToast(error.message, true);
        }
    });
}

export function renderProfilePage() {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : { username: 'مستخدم', email: 'غير محدد', avatar_url: null };

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <h1 class="page-title">الملف الشخصي</h1>
        <div class="profile-page-layout">
            <div class="profile-info-card">
                <div class="profile-avatar-container">
                    ${user.avatar_url 
                        ? `<img src="${user.avatar_url}" alt="الصورة الشخصية" id="profile-avatar-img" class="profile-avatar">`
                        : `<div class="profile-avatar-placeholder"><i class="fas fa-user"></i></div>`
                    }
                    <label for="avatar-upload-input" class="avatar-edit-overlay">
                        <i class="fas fa-camera"></i>
                    </label>
                    <input type="file" id="avatar-upload-input" accept="image/png, image/jpeg, image/webp" class="hidden">
                </div>
                <div class="profile-details">
                    <div class="profile-field">
                        <label>اسم المستخدم</label>
                        <div class="value-container">
                            <span id="profile-username">${user.username}</span>
                        </div>
                    </div>
                    <div class="profile-field">
                        <label>البريد الإلكتروني</label>
                        <div class="value-container">
                            <span id="profile-email">${user.email}</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- TODO: Add change password form here in another card -->
        </div>
    `;
    initProfilePage();
}