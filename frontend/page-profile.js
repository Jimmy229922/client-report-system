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
            const result = await fetchWithAuth('/api/profile/avatar', {
                method: 'POST',
                body: formData,
            });

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

    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword !== confirmPassword) {
                showToast('كلمتا المرور الجديدتان غير متطابقتين.', true);
                return;
            }

            const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'جاري الحفظ...';

            try {
                const result = await fetchWithAuth('/api/profile/password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                showToast(result.message);
                changePasswordForm.reset();
            } catch (error) {
                showToast(error.message, true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'حفظ كلمة المرور';
            }
        });
    }
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
            <div class="form-container" style="max-width: 100%; margin: 0;">
                <h2 style="margin-top: 0; margin-bottom: 1.5rem; font-size: 1.5rem;">تغيير كلمة المرور</h2>
                <form id="change-password-form">
                    <div class="form-group">
                        <label for="current-password">كلمة المرور الحالية</label>
                        <input type="password" id="current-password" required autocomplete="current-password">
                    </div>
                    <div class="form-group">
                        <label for="new-password">كلمة المرور الجديدة</label>
                        <input type="password" id="new-password" required autocomplete="new-password" minlength="6">
                    </div>
                    <div class="form-group">
                        <label for="confirm-password">تأكيد كلمة المرور الجديدة</label>
                        <input type="password" id="confirm-password" required autocomplete="new-password">
                    </div>
                    <button type="submit" class="submit-btn">حفظ كلمة المرور</button>
                </form>
            </div>
        </div>
    `;
    initProfilePage();
}