import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

let allUsers = []; // Store the fetched users
let currentSort = { column: 'id', direction: 'asc' };

function createUserRow(user) {
    const avatarHtml = user.avatar_url
        ? `<img src="${user.avatar_url}" class="navbar-avatar" style="margin-left: 10px;">`
        : `<span class="profile-avatar-placeholder" style="width: 32px; height: 32px; font-size: 1rem; margin-left: 10px;">
               <i class="fas fa-user"></i>
           </span>`;
    
    const isAdmin = user.id === 1 || user.email === 'admin@inzo.com';
    const adminBadge = isAdmin ? `<span class="admin-badge">مسؤول</span>` : '';
    const deleteButton = !isAdmin ? `<button class="archive-btn delete" data-action="delete" data-id="${user.id}" title="حذف المستخدم"><i class="fas fa-trash"></i></button>` : '';

    return `
    <tr id="user-row-${user.id}" class="${isAdmin ? 'admin-row' : ''}">
        <td data-field="username" style="display: flex; align-items: center;">${avatarHtml} ${user.username} ${adminBadge}</td>
        <td data-field="email" class="email-cell">
            <span>${user.email}</span>
            <button class="archive-btn copy-email" data-email="${user.email}" title="نسخ البريد الإلكتروني"><i class="fas fa-copy"></i></button>
        </td>
        <td data-field="created_at">${new Date(user.created_at).toLocaleDateString('ar-EG')}</td>
        <td class="user-actions">
            <button class="archive-btn" data-action="edit" data-id="${user.id}" title="تعديل المستخدم"><i class="fas fa-edit"></i></button>
            ${deleteButton}
        </td>
    </tr>
    `;
}

function renderUserTable() {
    const tableBody = document.getElementById('users-table-body');
    const tableHead = document.querySelector('#users-table thead tr');
    if (!tableBody || !tableHead) return;

    // Sort the users array
    allUsers.sort((a, b) => {
        const valA = a[currentSort.column];
        const valB = b[currentSort.column];
        const comparison = valA > valB ? 1 : (valA < valB ? -1 : 0);
        return currentSort.direction === 'desc' ? comparison * -1 : comparison;
    });

    if (allUsers.length > 0) {
        tableBody.innerHTML = allUsers.map(user => createUserRow(user)).join('');
    } else {
        tableBody.innerHTML = `<tr><td colspan="${tableHead.children.length}" style="text-align:center;">لا يوجد مستخدمين.</td></tr>`;
    }

    // Update sort indicators on headers
    document.querySelectorAll('#users-table th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === currentSort.column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

async function fetchAndRenderUsers(searchTerm = '') {
    const tableBody = document.getElementById('users-table-body');
    const tableHead = document.querySelector('#users-table thead tr');
    if (!tableBody || !tableHead) return;
    tableBody.innerHTML = `<tr><td colspan="${tableHead.children.length}" style="text-align:center;"><div class="spinner"></div></td></tr>`;

    try {
        const result = await fetchWithAuth(`/api/users?search=${encodeURIComponent(searchTerm)}`);
        allUsers = result.data || []; // Store users
        currentSort = { column: 'id', direction: 'asc' }; // Reset sort on new fetch/search
        renderUserTable();
    } catch (error) {
        showToast(error.message, true);
        tableBody.innerHTML = `<tr><td colspan="${tableHead.children.length}" style="text-align:center;">${error.message}</td></tr>`;
    }
}

function updatePasswordStrength(password, meterElement, textElement) {
    const strength = {
        0: { text: "ضعيفة جداً", color: "var(--danger-color)" },
        1: { text: "ضعيفة", color: "#ff9800" },
        2: { text: "متوسطة", color: "#FFCE56" },
        3: { text: "قوية", color: "#4CAF50" },
        4: { text: "قوية جداً", color: "var(--success-color)" }
    };

    let score = 0;
    if (password.length === 0) {
        score = -1; // Special case for empty
    } else {
        if (password.length >= 8) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        if (password.length < 6) score = 0;
    }

    const bars = meterElement.querySelectorAll('.strength-bar');
    bars.forEach((bar, index) => {
        if (index < score) {
            bar.style.backgroundColor = strength[score].color;
        } else {
            bar.style.backgroundColor = 'var(--border-color)';
        }
    });

    if (score >= 0) {
        textElement.textContent = strength[score].text;
        textElement.style.color = strength[score].color;
    } else {
        textElement.textContent = '';
    }
}

function handleAddUser() {
    const form = document.getElementById('add-user-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('new-username');
        const emailInput = document.getElementById('new-email');
        const passwordInput = document.getElementById('new-password');
        const username = usernameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            const result = await fetchWithAuth('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            showToast('تمت إضافة المستخدم بنجاح.');
            form.reset();

            // Optimistic UI update
            const newUser = result.data;
            allUsers.push(newUser);
            const tableBody = document.getElementById('users-table-body');
            const noUsersRow = tableBody.querySelector('td[colspan]');
            if (noUsersRow) {
                noUsersRow.parentElement.remove();
            }
            tableBody.insertAdjacentHTML('beforeend', createUserRow(newUser));
        } catch (error) {
            showToast(error.message, true);
        }
    });
}

function handleUserActions() {
    const table = document.getElementById('users-table');
    const modal = document.getElementById('user-edit-modal');
    const form = document.getElementById('user-edit-form');
    const closeBtn = document.getElementById('user-edit-modal-close-btn');
    const userIdInput = document.getElementById('edit-user-id');
    const usernameInput = document.getElementById('edit-username');
    const emailInput = document.getElementById('edit-email');
    const passwordInput = document.getElementById('edit-password');

    const avatarContainer = document.getElementById('edit-user-avatar-container');
    const avatarUploadInput = document.createElement('input');
    avatarUploadInput.type = 'file';
    avatarUploadInput.id = 'edit-avatar-upload-input';
    avatarUploadInput.accept = 'image/png, image/jpeg, image/webp';
    avatarUploadInput.className = 'hidden';
    // Function to open the modal for editing
    const openEditModal = (user) => {
        userIdInput.value = user.id;
        usernameInput.value = user.username;
        emailInput.value = user.email;
        passwordInput.value = ''; // Clear password field
        
        // Render avatar
        avatarContainer.innerHTML = `
            ${user.avatar_url 
                ? `<img src="${user.avatar_url}" alt="الصورة الشخصية" class="profile-avatar">`
                : `<div class="profile-avatar-placeholder"><i class="fas fa-user"></i></div>`
            }
            <label for="edit-avatar-upload-input" class="avatar-edit-overlay">
                <i class="fas fa-camera"></i>
            </label>
        `;
        avatarContainer.appendChild(avatarUploadInput);
        // Admin (id:1) username cannot be changed
        usernameInput.disabled = (user.id == 1 || user.email === 'admin@inzo.com');

        modal.classList.add('show');
    };

    // Function to close the modal
    const closeEditModal = () => {
        modal.classList.remove('show');
        form.reset();
    };

    closeBtn.onclick = closeEditModal;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditModal();
        }
    });

    // Handle clicks on Edit/Delete buttons in the table
    table.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const userId = button.dataset.id;
        const row = button.closest('tr');

        if (action === 'edit') {
            const user = allUsers.find(u => u.id == userId);
            if (user) {
                openEditModal(user);
            } else {
                showToast('لم يتم العثور على المستخدم.', true);
            }
        } else if (action === 'delete') {
            if (confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.')) {
                try {
                    await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
                    showToast('تم حذف المستخدم بنجاح.');
                    // Remove the user from the local cache
                    allUsers = allUsers.filter(u => u.id != userId);
                    // Animate before removing
                    row.classList.add('row-fade-out');
                    setTimeout(() => {
                        row.remove();
                    }, 400); // Match the transition duration in CSS
                } catch (error) {
                    showToast(error.message, true);
                }
            }
        } else if (button.classList.contains('copy-email')) {
            const email = button.dataset.email;
            navigator.clipboard.writeText(email).then(() => {
                showToast('تم نسخ البريد الإلكتروني.');
            }).catch(err => {
                showToast('فشل نسخ البريد الإلكتروني.', true);
            });
        }
    });

    // Handle avatar upload within the modal
    avatarUploadInput.addEventListener('change', async () => {
        const file = avatarUploadInput.files[0];
        const userId = userIdInput.value;
        if (!file || !userId) return;

        const formData = new FormData();
        formData.append('avatar', file);

        showToast('جاري رفع الصورة...');

        try {
            await fetchWithAuth(`/api/users/${userId}/avatar`, {
                method: 'PUT',
                body: formData,
            });
            showToast('تم تحديث الصورة بنجاح!');
            closeEditModal();
            fetchAndRenderUsers(); // Refresh the list
        } catch (error) {
            showToast(error.message, true);
        }
    });

    // Handle form submission for editing a user
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = userIdInput.value;
        const payload = {
            username: usernameInput.value,
            email: emailInput.value,
        };
        
        // Only include password if it's not empty
        if (passwordInput.value) {
            payload.password = passwordInput.value;
        }

        try {
            const result = await fetchWithAuth(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            showToast('تم تحديث بيانات المستخدم بنجاح.');
            closeEditModal();
            
            // --- Optimistic UI Update ---
            // Update the specific row instead of reloading the whole table
            const updatedUser = result.user;
            const userRow = document.getElementById(`user-row-${updatedUser.id}`);
            if (userRow) {
                userRow.querySelector('[data-field="username"]').innerHTML = `${userRow.querySelector('img, span.profile-avatar-placeholder').outerHTML} ${updatedUser.username} ${userRow.querySelector('.admin-badge')?.outerHTML || ''}`;
                userRow.querySelector('[data-field="email"] span').textContent = updatedUser.email;
            }
            // Update the user in the local cache
            const userIndex = allUsers.findIndex(u => u.id == updatedUser.id);
            if (userIndex > -1) {
                allUsers[userIndex] = updatedUser;
            }
        } catch (error) {
            showToast(error.message, true);
        }
    });
}

export function renderUsersPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <h1 class="page-title">إدارة المستخدمين</h1>
        <div class="user-management-layout">
            <div class="user-list-container">
                <div class="user-list-header">
                    <h2>قائمة المستخدمين</h2>
                    <button id="delete-all-users-btn" class="delete-all-btn"><i class="fas fa-users-slash"></i> حذف جميع الموظفين</button>
                </div>
                <div class="search-container">
                    <i class="fas fa-search"></i>
                    <input type="text" id="users-search" class="search-input" placeholder="ابحث عن مستخدم بالاسم أو البريد الإلكتروني...">
                </div>
                <table id="users-table">
                    <thead><tr>
                        <th data-sort="username">اسم المستخدم</th>
                        <th data-sort="email">البريد الإلكتروني</th>
                        <th data-sort="created_at">تاريخ الإنشاء</th>
                        <th>الإجراءات</th>
                    </tr></thead>
                    <tbody id="users-table-body"></tbody>
                </table>
            </div>
            <div class="add-user-container form-container">
                <h2>إضافة مستخدم جديد</h2>
                <form id="add-user-form">
                    <div class="form-group">
                        <label for="new-username">اسم المستخدم (للعرض)</label>
                        <input type="text" id="new-username" name="new-username" required>
                    </div>
                    <div class="form-group">
                        <label for="new-email">البريد الإلكتروني (للدخول)</label>
                        <input type="email" id="new-email" name="new-email" required>
                    </div>
                    <div class="form-group">
                        <label for="new-password">كلمة المرور</label>
                        <input type="password" id="new-password" name="new-password" required>
                        <div class="password-strength-meter"><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div></div>
                        <small id="new-password-strength-text" class="strength-text"></small>
                    </div>
                    <button type="submit" class="submit-btn">إضافة مستخدم</button>
                </form>
            </div>
        </div>
    `;

    fetchAndRenderUsers();
    handleAddUser();
    handleUserActions();

    // Add search logic
    const searchInput = document.getElementById('users-search');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAndRenderUsers(e.target.value);
        }, 500);
    });

    // Add Delete All Users logic
    const deleteAllBtn = document.getElementById('delete-all-users-btn');
    deleteAllBtn.addEventListener('click', async () => {
        const confirmation1 = confirm("تحذير: هذا الإجراء سيقوم بحذف جميع المستخدمين باستثناء حساب المسؤول. لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟");
        if (!confirmation1) return;

        const confirmation2 = prompt("للتأكيد، يرجى كتابة 'حذف الكل' في المربع أدناه:");
        if (confirmation2 !== 'حذف الكل') {
            showToast('تم إلغاء العملية. النص المدخل غير مطابق.', true);
            return;
        }

        try {
            const result = await fetchWithAuth('/api/users/all-non-admins', { method: 'DELETE' });
            showToast(result.message);
            fetchAndRenderUsers(); // Refresh the list
        } catch (error) {
            showToast(error.message, true);
        }
    });

    // Add sorting logic
    document.querySelectorAll('#users-table th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            renderUserTable();
        });
    });

    // Add password strength meter logic
    const newPasswordInput = document.getElementById('new-password');
    const newPasswordMeter = newPasswordInput.nextElementSibling;
    const newPasswordText = newPasswordMeter.nextElementSibling;
    newPasswordInput.addEventListener('input', () => {
        updatePasswordStrength(newPasswordInput.value, newPasswordMeter, newPasswordText);
    });

    const editPasswordInput = document.getElementById('edit-password');
    const editPasswordMeter = editPasswordInput.nextElementSibling;
    const editPasswordText = editPasswordMeter.nextElementSibling;
    editPasswordInput.addEventListener('input', () => {
        updatePasswordStrength(editPasswordInput.value, editPasswordMeter, editPasswordText);
    });
}