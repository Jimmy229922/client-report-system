import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let usersCache = [];

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
        const user = JSON.parse(userStr);
        return user.role === 'admin';
    } catch (e) { return false; }
}

function getStatusBadge(user) {
    if (!user.is_active) {
        return `<span class="badge status-disabled"><i class="fas fa-ban"></i> معطّل</span>`;
    }
    if (user.isOnline) {
        return `<span class="badge status-active"><i class="fas fa-circle"></i> متصل</span>`;
    }
    return `<span class="badge status-inactive"><i class="far fa-circle"></i> غير متصل</span>`;
}

async function renderUserCard(user) {
    const roleBadgeMapping = {
        admin: `<span class="badge role-admin"><i class="fas fa-shield-halved"></i> مسؤول</span>`,
        editor: `<span class="badge role-editor"><i class="fas fa-user"></i> موظف</span>`,
        'shift-manager': `<span class="badge role-shift-manager"><i class="fas fa-user-tie"></i> مدير وردية</span>`
    };
    const roleBadge = roleBadgeMapping[user.role] || `<span class="badge role-editor"><i class="fas fa-user"></i> ${user.role}</span>`;
    let currentUserId = null;
    try {
        const currentUser = JSON.parse(localStorage.getItem('user'));
        if (currentUser && currentUser.id) {
            currentUserId = currentUser.id.toString();
        }
    } catch (e) { /* Ignore */ }
    const isSelf = currentUserId && user._id.toString() === currentUserId;
    const isAdmin = user.role === 'admin';
    const disableEdit = isSelf; // You can't edit your own role/password from this page, only from profile page.
    const disableToggle = isSelf || isAdmin;

    const editButton = `<div class="action-wrapper"><button class="action-icon-btn" data-action="edit" data-id="${user._id}" ${disableEdit ? 'disabled' : ''}><i class="fas fa-pen-to-square"></i></button><span class="action-tooltip">تعديل البيانات</span></div>`;
    const toggleButton = user.is_active ?
        `<div class="action-wrapper"><button class="action-icon-btn warning" data-action="toggle-status" data-id="${user._id}" ${disableToggle ? 'disabled' : ''}><i class="fas fa-user-lock"></i></button><span class="action-tooltip">تعطيل الحساب</span></div>` :
        `<div class="action-wrapper"><button class="action-icon-btn success" data-action="toggle-status" data-id="${user._id}" ${disableToggle ? 'disabled' : ''}><i class="fas fa-user-check"></i></button><span class="action-tooltip">تفعيل الحساب</span></div>`;
    const deleteButton = !isAdmin ? `<div class="action-wrapper"><button class="action-icon-btn danger" data-action="delete" data-id="${user._id}"><i class="fas fa-trash-can"></i></button><span class="action-tooltip">حذف الحساب</span></div>` : '';
    const notifyButton = `<div class="action-wrapper"><button class="action-icon-btn" data-action="notify" data-id="${user._id}"><i class="fas fa-paper-plane"></i></button><span class="action-tooltip">إرسال إشعار</span></div>`;

    const card = document.createElement('div');
    card.className = `user-card modern-card ${!user.is_active ? 'inactive' : ''} ${isAdmin ? 'admin-card' : ''}`;
    card.id = `user-card-${user._id}`;

    let avatarHtml = `<div class="user-card-avatar no-avatar"><i class="fas fa-user"></i></div>`;
    if (user.avatar_url) {
        try {
            const response = await fetchWithAuth(user.avatar_url, {}, true);
            if (!response.ok) throw new Error('Failed to fetch avatar');
            const imageBlob = await response.blob();
            avatarHtml = `<img src="${URL.createObjectURL(imageBlob)}" alt="${user.username}" class="user-card-avatar">`;
        } catch (error) {
            // Fallback to placeholder if fetch fails
        }
    }

    const avatarContainerClass = checkAdminStatus() ? 'avatar-container admin-can-edit' : 'avatar-container';

    card.innerHTML = `
        <div class="user-card-main">
            <div class="${avatarContainerClass}" data-user-id="${user._id}" title="${checkAdminStatus() ? 'اضغط لتغيير الصورة' : ''}">
                ${avatarHtml}
                ${checkAdminStatus() ? '<div class="avatar-overlay"><i class="fas fa-camera"></i></div>' : ''}
            </div>
            <div class="user-card-details">
                <span class="user-name">${user.username}</span>
                <span class="user-email">${user.email}</span>
                <div class="user-card-meta" style="margin-top: 8px;">${roleBadge}</div>
            </div>
            <div class="user-card-actions-inline">
                ${editButton}
                ${toggleButton}
                ${deleteButton}
                ${notifyButton}
            </div>
        </div>`;
    
    return card;
}

async function fetchAndRenderUsers() {
    const container = document.getElementById('user-cards-grid');
    if (!container) return;
    container.innerHTML = `<div class="spinner"></div>`;

    try {
        console.log("[Users] بدء عملية جلب بيانات المستخدمين وحالتهم...");
        const results = await Promise.allSettled([
            fetchWithAuth('/api/users'),
            fetchWithAuth('/api/users/online-status')
        ]);

        const usersResult = results[0];
        const onlineStatusResult = results[1];

        if (usersResult.status === 'rejected') {
            throw new Error('فشل جلب قائمة المستخدمين الأساسية.');
        }
        
        let onlineUserIds = new Set();
        if (onlineStatusResult.status === 'fulfilled' && onlineStatusResult.value?.data?.onlineUsers) {
            onlineUserIds = new Set(Object.keys(onlineStatusResult.value.data.onlineUsers));
        }

        let users = [];
        if (usersResult.value && usersResult.value.data) {
            if (Array.isArray(usersResult.value.data)) {
                users = usersResult.value.data; // Handles { data: [...] }
            } else if (Array.isArray(usersResult.value.data.users)) {
                users = usersResult.value.data.users; // Handles { data: { users: [...] } }
            }
        } else if (Array.isArray(usersResult.value)) {
            users = usersResult.value; // Handles [...]
        }
        
        usersCache = users.map(user => ({ ...user, isOnline: onlineUserIds.has(user._id.toString()) }));

        if (usersCache.length > 0) {
            container.innerHTML = '';
            for (const user of usersCache) { // NOSONAR
                const card = await renderUserCard(user);
                container.appendChild(card);
            }
        } else {
            container.innerHTML = `<p>لا يوجد مستخدمين لعرضهم.</p>`;
        }
    } catch (error) {
        console.error("❌ حدث خطأ عام أثناء عرض المستخدمين:", error);
        showToast(error.message, true);
        container.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل المستخدمين.</p>`;
    }
}

function openEditModal(user) {
    const modal = document.getElementById('user-edit-modal');
    if (!modal) return;
    
    document.getElementById('edit-user-id').value = user._id;
    document.getElementById('edit-username').value = user.username;
    document.getElementById('edit-email').value = user.email;
    document.getElementById('edit-role').value = user.role;
    document.getElementById('edit-password').value = '';
    
    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('user-edit-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const userId = form.querySelector('#edit-user-id').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const updateData = {
        username: form.querySelector('#edit-username').value,
        email: form.querySelector('#edit-email').value,
        role: form.querySelector('#edit-role').value,
    };
    const password = form.querySelector('#edit-password').value;
    if (password) {
        updateData.password = password;
    }

    try {
        const result = await fetchWithAuth(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });

        const updatedUserFromServer = result.data;
        showToast(result.message);
        closeEditModal();

        const userIndex = usersCache.findIndex(u => u._id.toString() === userId.toString());
        if (userIndex !== -1) {
            usersCache[userIndex] = { ...usersCache[userIndex], ...updatedUserFromServer };
            const cardElement = document.getElementById(`user-card-${userId}`); // NOSONAR
            const newCard = renderUserCard(usersCache[userIndex]);
            if (cardElement) {
                cardElement.replaceWith(newCard);
            }
        }
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'حفظ التغييرات';
    }
}

async function handleDeleteUser(userId) {
    const confirmed = await showConfirmModal(
        'تأكيد الحذف',
        'هل أنت متأكد من حذف هذا المستخدم؟ سيتم حذف جميع بياناته ولا يمكن التراجع.',
        {
            iconClass: 'fas fa-user-slash',
            iconColor: 'var(--danger-color)',
            confirmText: 'نعم، حذف',
            confirmClass: 'submit-btn danger-btn'
        }
    );

    if (confirmed) {
        try {
            const result = await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
            showToast(result.message);
            
            const cardElement = document.getElementById(`user-card-${userId}`);
            if (cardElement) {
                cardElement.classList.add('row-fade-out');
                cardElement.addEventListener('transitionend', () => cardElement.remove());
            } else {
                fetchAndRenderUsers();
            }

        } catch (error) {
            showToast(error.message, true);
        }
    }
}

async function handleStatusToggle(userId, isActive) {
    const button = document.querySelector(`button[data-action="toggle-status"][data-id="${userId}"]`);
    if (button) button.disabled = true;

    try {
        const result = await fetchWithAuth(`/api/users/${userId}/toggle-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });
        showToast(result.message || `تم ${isActive ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح.`);
        updateUserActiveStatus({ userId, isActive });
    } catch (error) {
        showToast(error.message, true);
        if (button) button.disabled = false;
    }
}

function openNotifyModal(user) {
    const modal = document.getElementById('user-notify-modal');
    if (!modal) return;
    
    document.getElementById('notify-user-id').value = user._id;
    modal.classList.add('show');
}

function closeNotifyModal() {
    const modal = document.getElementById('user-notify-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function handleSendNotification(e) {
    e.preventDefault();
    const form = e.target;
    const userId = form.querySelector('#notify-user-id').value;
    const message = form.querySelector('#notify-message').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const result = await fetchWithAuth(`/api/users/${userId}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        showToast(result.message);
        closeNotifyModal();
        form.reset();
    } catch (error) {
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'إرسال';
    }
}

async function handleAvatarUpload(userId, file) {
    const card = document.getElementById(`user-card-${userId}`);
    const avatarContainer = card?.querySelector('.avatar-container');
    if (!avatarContainer) return;

    // Show loading state
    avatarContainer.innerHTML = '<div class="spinner" style="width: 30px; height: 30px;"></div>';

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const result = await fetchWithAuth(`/api/users/${userId}/avatar`, {
            method: 'POST',
            body: formData,
        });

        showToast(result.message);

        // The 'user_updated' SSE event will handle the UI update,
        // but we can optimistically update it here for a faster response.
        const updatedUser = result.data;
        const userIndex = usersCache.findIndex(u => u._id === userId);
        if (userIndex !== -1) {
            usersCache[userIndex] = { ...usersCache[userIndex], ...updatedUser };
            const newCard = await renderUserCard(usersCache[userIndex]);
            card.replaceWith(newCard);
        }

    } catch (error) {
        showToast(error.message, true);
        // Restore previous avatar on failure
        const user = usersCache.find(u => u._id === userId);
        const avatarHtml = user?.avatar_url
            ? `<img src="${user.avatar_url}" alt="${user.username}" class="user-card-avatar">`
            : `<div class="user-card-avatar no-avatar"><i class="fas fa-user"></i></div>`;
        avatarContainer.innerHTML = avatarHtml + (checkAdminStatus() ? '<div class="avatar-overlay"><i class="fas fa-camera"></i></div>' : '');
    }
}

function setupPageListeners() {
    const userGrid = document.getElementById('user-cards-grid');

    userGrid?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (target) {
            const action = target.dataset.action;
            const userId = target.dataset.id;

            if (action === 'edit') {
                const user = usersCache.find(u => u._id === userId);
                if (user) {
                    openEditModal(user);
                }
            } else if (action === 'delete') {
                handleDeleteUser(userId);
            } else if (action === 'toggle-status') {
                const user = usersCache.find(u => u._id === userId);
                if (user) {
                    handleStatusToggle(userId, !user.is_active);
                }
            } else if (action === 'notify') {
                const user = usersCache.find(u => u._id === userId);
                if (user) {
                    openNotifyModal(user);
                }
            }
        }

        // Handle avatar click for admins
        const avatarContainer = e.target.closest('.avatar-container.admin-can-edit');
        if (avatarContainer) {
            const userId = avatarContainer.dataset.userId;
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleAvatarUpload(userId, file);
            };
            fileInput.click();
        }
    });

    document.getElementById('user-edit-modal-close-btn')?.addEventListener('click', closeEditModal);
    document.getElementById('user-edit-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'user-edit-modal') closeEditModal();
    });
    document.getElementById('user-edit-form')?.addEventListener('submit', handleEditFormSubmit);

    document.getElementById('user-notify-modal-close-btn')?.addEventListener('click', closeNotifyModal);
    document.getElementById('user-notify-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'user-notify-modal') closeNotifyModal();
    });
    document.getElementById('user-notify-form')?.addEventListener('submit', handleSendNotification);
}

/**
 * Dynamically adds a notification to the navbar dropdown list.
 * This function is typically called by the WebSocket event handler in main.js.
 * @param {object} notification - The notification object from the server.
 */
export function addNotification(notification) {
    const notificationsList = document.getElementById('notifications-list');
    const notificationBadge = document.getElementById('notification-badge');
    if (!notificationsList || !notificationBadge) return;

    // Create the new notification item
    const notificationItemWrapper = document.createElement('div');
    notificationItemWrapper.className = 'notification-item-wrapper';
    notificationItemWrapper.id = `notification-${notification._id}`;
    notificationItemWrapper.innerHTML = `
        <a href="${notification.link || '#!'}" class="notification-item unread" data-id="${notification._id}">
            ${notification.message}
            <span class="time">${new Date(notification.createdAt).toLocaleString()}</span>
        </a>
        <button class="delete-notification-btn" data-id="${notification._id}" title="إخفاء الإشعار">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Add to the top of the list
    const noNotificationsMessage = notificationsList.querySelector('.no-notifications');
    if (noNotificationsMessage) {
        notificationsList.innerHTML = ''; // Clear the 'no notifications' message
    }
    notificationsList.prepend(notificationItemWrapper);

    // Update and show the badge
    notificationBadge.textContent = notificationsList.children.length;
    notificationBadge.classList.remove('hidden');
}

export async function addUserToGrid(user) {
    const container = document.getElementById('user-cards-grid');
    if (!container) return;

    usersCache.unshift(user);

    const newCard = await renderUserCard(user);

    const noUsersMessage = container.querySelector('p');
    if (noUsersMessage) {
        container.innerHTML = '';
        container.appendChild(newCard);
    } else {
        container.prepend(newCard);
    }
}

export function updateUserOnlineStatus(userId, isOnline) {
    const statusContainer = document.getElementById(`user-status-${userId}`);
    if (!statusContainer) return;

    const userIndex = usersCache.findIndex(u => u._id.toString() === userId.toString());
    if (userIndex !== -1) {
        usersCache[userIndex].isOnline = isOnline;
    }
    
    const user = usersCache[userIndex];
    if (user) {
        statusContainer.innerHTML = getStatusBadge(user);
    }
}

export async function updateUserActiveStatus(payload) {
    const { userId, isActive, user: updatedUser } = payload;
    const cardElement = document.getElementById(`user-card-${userId}`);

    const userIndex = usersCache.findIndex(u => u._id.toString() === userId.toString());
    if (userIndex !== -1) {
        usersCache[userIndex].is_active = isActive;
        if (cardElement) {
            const newCard = await renderUserCard(usersCache[userIndex]);
            cardElement.replaceWith(newCard);
        }
    }
}

export function renderUsersPage() {
    if (!checkAdminStatus()) {
        document.getElementById('main-content').innerHTML = `
            <div class="page-header">
                <h1 class="page-title">صلاحية الوصول مرفوضة</h1>
                <p>هذه الصفحة متاحة للمسؤولين فقط.</p>
            </div>
        `;
        return;
    }

    document.getElementById('main-content').innerHTML = `
        <div class="page-header">
            <h1 class="page-title">إدارة المستخدمين</h1>
            <p>إدارة حسابات الموظفين وصلاحياتهم في النظام.</p>
        </div>

        <div class="add-user-container">
            <div class="add-user-header">
                <h3><i class="fas fa-user-plus"></i> إضافة مستخدم جديد</h3>
                <button id="toggle-add-user-form-btn" class="icon-btn" title="إظهار/إخفاء النموذج"><i class="fas fa-chevron-down"></i></button>
            </div>
            <div class="collapsible-content">
                <form id="add-user-form" class="form-container" style="border: none; padding-top: 1rem;">
                    <div class="add-user-fields-section">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="add-username">اسم المستخدم</label>
                                <input type="text" id="add-username" name="username" required>
                            </div>
                            <div class="form-group">
                                <label for="add-email">البريد الإلكتروني</label>
                                <input type="email" id="add-email" name="email" required>
                            </div>
                            <div class="form-group">
                                <label for="add-password">كلمة المرور</label>
                                <input type="password" id="add-password" name="password" required>
                            </div>
                            <div class="form-group">
                                <label for="add-role">الدور</label>
                                <select id="add-role" name="role" required>
                                    <option value="editor" selected>موظف (Editor)</option>
                                    <option value="shift-manager">مسؤول الشفت (Shift Manager)</option>
                                    <option value="admin">مسؤول (Admin)</option>
                                </select>
                            </div>
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="add-avatar">الصورة الشخصية (اختياري)</label>
                                <input type="file" id="add-avatar" name="avatar" accept="image/*">
                            </div>
                        </div>
                    </div>
                    <button type="submit" class="submit-btn">إنشاء المستخدم</button>
                </form>
            </div>
        </div>

        <div class="list-header">
            <h2><i class="fas fa-users"></i> قائمة المستخدمين</h2>
            <div class="list-actions">
                <div class="search-container">
                    <i class="fas fa-search"></i>
                    <input type="text" id="users-search" class="search-input" placeholder="ابحث عن مستخدم...">
                </div>
            </div>
        </div>
        <div id="user-cards-grid" class="user-cards-grid">
            <!-- User cards will be rendered here -->
        </div>

        <div id="user-notify-modal" class="modal">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>إرسال إشعار</h3>
                    <button id="user-notify-modal-close-btn" class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="user-notify-form">
                        <input type="hidden" id="notify-user-id">
                        <div class="form-group">
                            <label for="notify-message">الرسالة</label>
                            <textarea id="notify-message" name="message" rows="4" required></textarea>
                        </div>
                        <button type="submit" class="submit-btn">إرسال</button>
                    </form>
                </div>
            </div>
        </div>
    `;

    const addUserHeader = document.querySelector('.add-user-header');
    addUserHeader.addEventListener('click', () => {
        addUserHeader.parentElement.classList.toggle('open');
    });

    document.getElementById('users-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.user-card').forEach(card => {
            const name = card.querySelector('.user-name').textContent.toLowerCase();
            const email = card.querySelector('.user-email').textContent.toLowerCase();
            card.style.display = (name.includes(searchTerm) || email.includes(searchTerm)) ? 'grid' : 'none';
        });
    });

    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = addUserForm;
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const formData = new FormData();
        formData.append('username', form.querySelector('#add-username').value);
        formData.append('email', form.querySelector('#add-email').value);
        formData.append('password', form.querySelector('#add-password').value);
        formData.append('role', form.querySelector('#add-role').value);

        const avatarFile = form.querySelector('#add-avatar').files[0];
        if (avatarFile) {
            formData.append('avatar', avatarFile);
        }

        try {
            const result = await fetchWithAuth('/api/users', { 
                method: 'POST',
                body: formData // Send FormData instead of JSON
            });
            showToast(result.message);
            form.reset();
            addUserHeader.parentElement.classList.remove('open');
        } catch (error) {
            showToast(error.message, true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'إنشاء المستخدم';
        }
        });
    }

    fetchAndRenderUsers();
    setupPageListeners();
}