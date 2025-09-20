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

    const profileLayout = document.querySelector('.profile-page-layout');
    if (!profileLayout) return;

    // --- Event Delegation for Editing Details ---
    profileLayout.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const field = button.dataset.field;
        if (!field) return;

        const fieldContainer = button.closest('.profile-field');
        const valueSpan = fieldContainer.querySelector('span');
        const input = fieldContainer.querySelector('input[type="text"], input[type="email"]');
        const editBtn = fieldContainer.querySelector('.edit-btn');
        const actionBtns = fieldContainer.querySelector('.edit-actions');

        const toggleEdit = (isEditing) => {
            valueSpan.classList.toggle('hidden', isEditing);
            input.classList.toggle('hidden', !isEditing);
            editBtn.classList.toggle('hidden', isEditing);
            actionBtns.classList.toggle('hidden', !isEditing);
            if (isEditing) {
                input.value = valueSpan.textContent;
                input.focus();
            }
        };

        if (button.classList.contains('edit-btn')) {
            toggleEdit(true);
        }

        if (button.classList.contains('cancel-btn')) {
            toggleEdit(false);
        }

        if (button.classList.contains('save-btn')) {
            const newValue = input.value.trim();
            const originalValue = valueSpan.textContent;

            if (newValue === '' || newValue === originalValue) {
                toggleEdit(false);
                return;
            }

            const payload = { [field]: newValue };
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Show spinner
            button.disabled = true;

            try {
                const result = await fetchWithAuth('/api/profile/details', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                showToast(result.message);
                localStorage.setItem('user', JSON.stringify(result.user));
                renderProfilePage(); // Re-render to reflect changes and reset state
                updateNavbarUser();

            } catch (error) {
                showToast(error.message, true);
                toggleEdit(false); // Revert on error
            }
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
    let user = { username: 'مستخدم', email: 'غير محدد', avatar_url: null }; // Default user

    if (userStr && userStr !== 'undefined' && userStr !== 'null') {
        try {
            user = JSON.parse(userStr);
        } catch (error) {
            console.error("Corrupted user data in localStorage (profile page). Clearing and reloading.", error);
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            location.reload();
            return; // Stop rendering to prevent further errors
        }
    }

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
                    <div class="profile-field" data-field="username">
                        <label>اسم المستخدم</label>
                        <div class="value-container">
                            <span>${user.username}</span>
                            <input type="text" class="hidden profile-edit-input" value="${user.username}">
                            ${user.id !== 1 ? `
                                <button class="edit-btn" data-field="username" title="تعديل"><i class="fas fa-pen"></i></button>
                                <div class="edit-actions hidden">
                                    <button class="save-btn" data-field="username" title="حفظ"><i class="fas fa-check"></i></button>
                                    <button class="cancel-btn" data-field="username" title="إلغاء"><i class="fas fa-times"></i></button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="profile-field" data-field="email">
                        <label>البريد الإلكتروني</label>
                        <div class="value-container">
                            <span>${user.email}</span>
                            <input type="email" class="hidden profile-edit-input" value="${user.email}">
                            <button class="edit-btn" data-field="email" title="تعديل"><i class="fas fa-pen"></i></button>
                            <div class="edit-actions hidden">
                                <button class="save-btn" data-field="email" title="حفظ"><i class="fas fa-check"></i></button>
                                <button class="cancel-btn" data-field="email" title="إلغاء"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="form-container" style="max-width: 100%; margin: 0; grid-column: 1 / -1;">
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