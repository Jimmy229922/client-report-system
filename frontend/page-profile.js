import { fetchWithAuth } from './api.js';
import { showToast, updateNavbarUser } from './ui.js';

function updatePasswordStrength(password, meterElement, textElement) {
    const strength = {
        0: { text: "ضعيفة جداً", color: "var(--danger-color)" },
        1: { text: "ضعيفة", color: "#ff9800" },
        2: { text: "متوسطة", color: "#FFCE56" },
        3: { text: "قوية", color: "#4CAF50" },
        4: { text: "قوية جداً", color: "var(--success-color)" }
    };

    let score = 0;
    if (password.length > 0) {
        if (password.length >= 8) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        if (password.length < 6) score = 0;
    }

    const bars = meterElement.querySelectorAll('.strength-bar');
    bars.forEach((bar, index) => {
        bar.style.backgroundColor = (index < score) ? strength[score].color : 'var(--border-color)';
    });

    textElement.textContent = (password.length > 0) ? strength[score].text : '';
    textElement.style.color = (password.length > 0) ? strength[score].color : '';
}

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

        if (button.classList.contains('copy-btn')) {
            const email = button.dataset.email;
            if (email) {
                navigator.clipboard.writeText(email).then(() => {
                    showToast('تم نسخ البريد الإلكتروني.');
                }).catch(err => {
                    showToast('فشل نسخ البريد الإلكتروني.', true);
                });
            }
            return;
        }

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

        // Add strength meter logic
        const newPasswordInput = document.getElementById('new-password');
        const passwordMeter = changePasswordForm.querySelector('.password-strength-meter');
        const passwordText = changePasswordForm.querySelector('.strength-text');
        if (newPasswordInput && passwordMeter && passwordText) {
            newPasswordInput.addEventListener('input', () => {
                updatePasswordStrength(newPasswordInput.value, passwordMeter, passwordText);
            });
        }
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

    const isAdmin = user && user.id === 1;

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
                    ${isAdmin ? `
                        <label for="avatar-upload-input" class="avatar-edit-overlay">
                            <i class="fas fa-camera"></i>
                        </label>
                        <input type="file" id="avatar-upload-input" accept="image/png, image/jpeg, image/webp" class="hidden">
                    ` : ''}
                </div>
                <div class="profile-details">
                    <div class="profile-field" data-field="username">
                        <label>اسم المستخدم</label>
                        <div class="value-container">
                            <span>${user.username}</span>
                            <!-- Editing username is disabled from profile page. Admin can edit from User Management. -->
                        </div>
                    </div>
                    <div class="profile-field" data-field="email">
                        <label>البريد الإلكتروني</label>
                        <div class="value-container">
                            <span style="flex-grow: 0;">${user.email}</span>
                            <button class="copy-btn" data-email="${user.email}" title="نسخ"><i class="fas fa-copy"></i></button>
                            ${isAdmin ? `
                                <input type="email" class="hidden profile-edit-input" value="${user.email}">
                                <div class="edit-controls">
                                    <button class="edit-btn" data-field="email" title="تعديل"><i class="fas fa-pen"></i></button>
                                    <div class="edit-actions hidden">
                                        <button class="save-btn" data-field="email" title="حفظ"><i class="fas fa-check"></i></button>
                                        <button class="cancel-btn" data-field="email" title="إلغاء"><i class="fas fa-times"></i></button>
                                    </div>
                                </div>
                            ` : ''}
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
                        <div class="password-strength-meter"><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div></div>
                        <small class="strength-text"></small>
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