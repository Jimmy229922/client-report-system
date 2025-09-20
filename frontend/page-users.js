import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

async function fetchAndRenderUsers(searchTerm = '') {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><div class="spinner"></div></td></tr>';

    try {
        const result = await fetchWithAuth(`/api/users?search=${encodeURIComponent(searchTerm)}`);

        if (result.data && result.data.length > 0) {
            tableBody.innerHTML = result.data.map(user => {
                const avatarHtml = user.avatar_url
                    ? `<img src="${user.avatar_url}" class="navbar-avatar" style="margin-left: 10px;">`
                    : `<span class="profile-avatar-placeholder" style="width: 32px; height: 32px; font-size: 1rem; margin-left: 10px;">
                           <i class="fas fa-user"></i>
                       </span>`;
                
                const isAdmin = user.id === 1;
                const adminBadge = isAdmin ? `<span class="admin-badge">مسؤول</span>` : '';
                const deleteButton = !isAdmin ? `<button class="archive-btn delete" data-action="delete" data-id="${user.id}" title="حذف المستخدم"><i class="fas fa-trash"></i></button>` : '';

                return `
                <tr id="user-row-${user.id}" class="${isAdmin ? 'admin-row' : ''}">
                    <td data-field="username" style="display: flex; align-items: center;">${avatarHtml} ${user.username} ${adminBadge}</td>
                    <td data-field="email">${user.email}</td>
                    <td class="user-actions">
                        <button class="archive-btn" data-action="edit" data-id="${user.id}" title="تعديل المستخدم"><i class="fas fa-edit"></i></button>
                        ${deleteButton}
                    </td>
                </tr>
            `}).join('');
        } else {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا يوجد مستخدمين.</td></tr>';
        }
    } catch (error) {
        showToast(error.message, true);
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">${error.message}</td></tr>`;
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
            await fetchWithAuth('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            showToast('تمت إضافة المستخدم بنجاح.');
            form.reset();
            fetchAndRenderUsers(); // Refresh the list
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

    // Function to open the modal for editing
    const openEditModal = (user) => {
        userIdInput.value = user.id;
        usernameInput.value = user.username;
        emailInput.value = user.email;
        passwordInput.value = ''; // Clear password field
        
        // Admin (id:1) username cannot be changed
        usernameInput.disabled = (user.id == 1);

        modal.style.display = 'flex';
    };

    // Function to close the modal
    const closeEditModal = () => {
        modal.style.display = 'none';
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
            const username = row.querySelector('[data-field="username"]').textContent;
            const email = row.querySelector('[data-field="email"]').textContent;
            openEditModal({ id: userId, username, email });
        } else if (action === 'delete') {
            if (confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.')) {
                try {
                    await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
                    showToast('تم حذف المستخدم بنجاح.');
                    row.remove();
                } catch (error) {
                    showToast(error.message, true);
                }
            }
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
            await fetchWithAuth(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            showToast('تم تحديث بيانات المستخدم بنجاح.');
            closeEditModal();
            fetchAndRenderUsers(); // Refresh the entire list to show changes
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
                <h2>قائمة المستخدمين</h2>
                <div class="search-container">
                    <i class="fas fa-search"></i>
                    <input type="text" id="users-search" class="search-input" placeholder="ابحث عن مستخدم بالاسم أو البريد الإلكتروني...">
                </div>
                <table id="users-table">
                    <thead><tr><th>اسم المستخدم</th><th>البريد الإلكتروني</th><th>الإجراءات</th></tr></thead>
                    <tbody id="users-table-body"></tbody>
                </table>
            </div>
            <div class="add-user-container form-container">
                <h2>إضافة مستخدم جديد</h2>
                <form id="add-user-form">
                    <div class="form-group"><label for="new-username">اسم المستخدم (للعرض)</label><input type="text" id="new-username" name="new-username" required></div>
                    <div class="form-group"><label for="new-email">البريد الإلكتروني (للدخول)</label><input type="email" id="new-email" name="new-email" required></div>
                    <div class="form-group"><label for="new-password">كلمة المرور</label><input type="password" id="new-password" name="new-password" required></div>
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
}