import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

async function fetchAndRenderUsers() {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;"><div class="spinner"></div></td></tr>';

    try {
        const response = await fetchWithAuth('/api/users');
        if (!response.ok) throw new Error('فشل في جلب قائمة المستخدمين.');
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            tableBody.innerHTML = result.data.map(user => `
                <tr id="user-row-${user.id}">
                    <td data-field="username">${user.username}</td>
                    <td data-field="email">${user.email}</td>
                    <td class="user-actions">
                        <button class="archive-btn" data-action="edit" data-id="${user.id}" title="تعديل المستخدم"><i class="fas fa-edit"></i></button>
                        <button class="archive-btn delete" data-action="delete" data-id="${user.id}" title="حذف المستخدم"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
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
            const response = await fetchWithAuth('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'فشل في إضافة المستخدم.');

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
                    const response = await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'فشل في حذف المستخدم.');
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
            const response = await fetchWithAuth(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'فشل تحديث بيانات المستخدم.');

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
}