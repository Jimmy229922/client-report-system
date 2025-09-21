import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal, updateNavbarUser } from './ui.js';

let allUsers = []; // Store the fetched users
let currentSort = { column: 'id', direction: 'asc' };

function createUserCard(user) {
    const avatarHtml = user.avatar_url ?
        `<img src="${user.avatar_url}" alt="${user.username}" class="user-card-avatar">` :
        `<div class="user-card-avatar-placeholder"><i class="fas fa-user"></i></div>`;

    const isAdmin = user.id === 1;

    const roleBadge = `<span class="badge role-${user.role}">${user.role === 'admin' ? 'مسؤول' : 'محرر'}</span>`;

    const statusIndicator = user.is_active ?
        `<span class="badge status-active"><i class="fas fa-circle"></i> نشط</span>` :
        `<span class="badge status-inactive"><i class="fas fa-circle"></i> معطل</span>`;

    return `
    <div class="user-card ${!user.is_active ? 'inactive' : ''}" id="user-card-${user.id}">
        <div class="user-card-main">
            ${avatarHtml}
            <div class="user-card-details">
                <strong class="user-name">${user.username}</strong>
                <span class="user-email">${user.email}</span>
            </div>
        </div>
        <div class="user-card-meta">
            <div class="meta-item" title="الدور">${roleBadge}</div>
            <div class="meta-item" title="الحالة">${statusIndicator}</div>
            <div class="user-card-actions">
                ${!isAdmin ? `
                    <label class="switch" title="${user.is_active ? 'تعطيل' : 'تفعيل'}">
                        <input type="checkbox" class="status-toggle" data-id="${user.id}" ${user.is_active ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                ` : ''}
                <button class="action-btn" data-action="edit" data-id="${user.id}" title="تعديل"><i class="fas fa-pen"></i></button>
                ${!isAdmin ? 
                    `<button class="action-btn danger" data-action="delete" data-id="${user.id}" title="حذف"><i class="fas fa-trash-alt"></i></button>` :
                    `<button class="action-btn disabled" title="لا يمكن حذف المسؤول" disabled><i class="fas fa-trash-alt"></i></button>`
                }
            </div>
        </div>
        <div class="user-card-footer">
            <span class="creation-date">انضم في: ${new Date(user.created_at).toLocaleDateString('ar-EG')}</span>
        </div>
    </div>
    `;
}

function renderUserStats() {
    const statsBar = document.getElementById('user-stats-bar');
    if (!statsBar) return;

    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.is_active).length;
    const adminCount = allUsers.filter(u => u.role === 'admin').length;
    const editorCount = allUsers.filter(u => u.role === 'editor').length;

    statsBar.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-users"></i>
            <div>
                <span>إجمالي المستخدمين</span>
                <strong>${totalUsers}</strong>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-user-check"></i>
            <div>
                <span>مستخدمين نشطين</span>
                <strong>${activeUsers}</strong>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-user-shield"></i>
            <div>
                <span>المسؤولين</span>
                <strong>${adminCount}</strong>
            </div>
        </div>
        <div class="stat-item">
            <i class="fas fa-user-edit"></i>
            <div>
                <span>المحررين</span>
                <strong>${editorCount}</strong>
            </div>
        </div>
    `;
}

function renderUserCards() {
    const cardsGrid = document.getElementById('user-cards-grid');
    if (!cardsGrid) return;

    // Render stats based on the current `allUsers` array
    renderUserStats();

    if (allUsers.length > 0) {
        cardsGrid.innerHTML = allUsers.map(user => createUserCard(user)).join('');
    } else {
        cardsGrid.innerHTML = `<p class="empty-state">لا يوجد مستخدمين لعرضهم. حاول إضافة مستخدم جديد.</p>`;
    }
}

async function fetchAndRenderUsers(searchTerm = '') {
    const cardsGrid = document.getElementById('user-cards-grid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = `<div class="spinner-container"><div class="spinner"></div></div>`;

    try {
        const result = await fetchWithAuth(`/api/users?search=${encodeURIComponent(searchTerm)}`);
        allUsers = result.data || []; // Store users
        currentSort = { column: 'id', direction: 'asc' }; // Reset sort on new fetch/search
        renderUserCards();
    } catch (error) {
        showToast(error.message, true);
        cardsGrid.innerHTML = `<p class="empty-state error">${error.message}</p>`;
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

/**
 * This flag ensures that persistent listeners (for modals, etc.) are only attached once.
 */
let listenersInitialized = false;

export function renderUsersPage() {
    console.log('[Debug] Rendering Users Page...');
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">إدارة الموظفين</h1>
        </div>

        <div id="user-stats-bar" class="stats-bar">
            <!-- Stats will be rendered here by JS -->
        </div>

        <div class="add-user-container">
            <div class="add-user-header" id="add-user-header">
                <h3><i class="fas fa-user-plus"></i> إضافة موظف جديد</h3>
                <button id="toggle-add-user-form-btn" class="icon-btn"><i class="fas fa-chevron-down"></i></button>
            </div>
            <div id="add-user-form-wrapper" class="collapsible-content">
                <form id="add-user-form" class="form-container" style="padding: 1.5rem; border-top: 1px solid var(--border-color);">
                    <div class="form-grid">
                        <div class="form-group"><label for="add-username">اسم المستخدم</label><input type="text" id="add-username" name="username" required></div>
                        <div class="form-group"><label for="add-email">البريد الإلكتروني</label><input type="email" id="add-email" name="email" required></div>
                        <div class="form-group"><label for="add-password">كلمة المرور</label><input type="password" id="add-password" name="password" required></div>
                        <div class="form-group"><label for="add-role">الدور</label><select id="add-role" name="role" required><option value="editor" selected>محرر</option><option value="admin">مسؤول</option></select></div>
                        <div class="form-group"><label for="add-avatar">الصورة الشخصية (اختياري)</label><input type="file" id="add-avatar" name="avatar" accept="image/*"></div>
                    </div>
                    <div class="password-strength-indicator">
                        <div class="password-strength-meter"><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div></div>
                        <small id="add-password-strength-text" class="strength-text"></small>
                    </div>
                    <button type="submit" class="submit-btn" style="width: auto; padding: 0.6rem 1.5rem;">إضافة الموظف</button>
                </form>
            </div>
        </div>

        <div class="user-list-container">
            <div class="list-header">
                <h2><i class="fas fa-users"></i> قائمة الموظفين</h2>
                <div class="list-actions">
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" id="users-search" class="search-input" placeholder="بحث...">
                    </div>
                    <button id="delete-all-users-btn" class="delete-all-btn" title="حذف جميع الموظفين"><i class="fas fa-users-slash"></i></button>
                </div>
            </div>
            <div id="user-cards-grid" class="user-cards-grid">
                <!-- User cards will be rendered here -->
            </div>
        </div>
    `;

    fetchAndRenderUsers();
    initializePageListeners();

    // --- Delegated Listeners for dynamic content ---
    const searchInput = document.getElementById('users-search'); // This is inside mainContent
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAndRenderUsers(e.target.value);
        }, 500);
    });

    const cardsGrid = document.getElementById('user-cards-grid');
    cardsGrid.addEventListener('click', handleCardClick);
    cardsGrid.addEventListener('change', handleStatusToggle);

    // Add Delete All Users logic
    const deleteAllBtn = document.getElementById('delete-all-users-btn');
    deleteAllBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            'تحذير حذف جماعي',
            'هذا الإجراء سيقوم بحذف جميع المستخدمين باستثناء حساب المسؤول. لا يمكن التراجع عنه. هل أنت متأكد؟',
            {
                iconClass: 'fas fa-exclamation-triangle',
                iconColor: 'var(--danger-color)',
                confirmText: 'نعم، متأكد',
                confirmClass: 'submit-btn danger-btn'
            });
        if (!confirmed) return;

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

    // Add User form toggle
    const addUserHeader = document.getElementById('add-user-header');
    if (addUserHeader) {
        addUserHeader.addEventListener('click', () => {
            document.querySelector('.add-user-container').classList.toggle('open');
        });
    }
}

/**
 * Attaches listeners to elements that persist outside of the main content area, like modals.
 * It runs only once to avoid duplicating listeners.
 */
function initializePageListeners() {
    if (listenersInitialized) {
        console.log('[Debug] Listeners already initialized. Skipping.');
        return;
    }
    console.log('[Debug] Initializing persistent listeners for User Page...');

    // --- Add User Modal ---
    const addForm = document.getElementById('add-user-form');
    if(addForm) {
        addForm.addEventListener('submit', handleAddUserSubmit);
        // Password strength meter for add form
        const addPasswordInput = document.getElementById('add-password');
        const addPasswordMeter = addForm.querySelector('.password-strength-meter');
        const addPasswordText = addForm.querySelector('.strength-text');
        addPasswordInput.addEventListener('input', () => {
            updatePasswordStrength(addPasswordInput.value, addPasswordMeter, addPasswordText);
        });
    }

    // --- Edit User Modal ---
    const editPasswordInput = document.getElementById('edit-password');
    const editPasswordMeter = editPasswordInput.nextElementSibling;
    const editPasswordText = editPasswordMeter.nextElementSibling;
    if (editPasswordInput) editPasswordInput.addEventListener('input', () => {
        updatePasswordStrength(editPasswordInput.value, editPasswordMeter, editPasswordText);
    });

    const editForm = document.getElementById('user-edit-form');
    editForm.addEventListener('submit', handleEditUserSubmit);

    const editModal = document.getElementById('user-edit-modal');
    const closeEditBtn = document.getElementById('user-edit-modal-close-btn');
    closeEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

    // Handle avatar PREVIEW within the edit modal
    const avatarContainer = document.getElementById('edit-user-avatar-container');
    const avatarUploadInput = document.createElement('input');
    avatarUploadInput.type = 'file';
    avatarUploadInput.id = 'edit-avatar-upload-input';
    avatarUploadInput.name = 'avatar';
    avatarUploadInput.accept = 'image/png, image/jpeg, image/webp';
    avatarUploadInput.style.display = 'none';
    avatarContainer.appendChild(avatarUploadInput);

    avatarUploadInput.addEventListener('change', () => {
        const file = avatarUploadInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                let img = avatarContainer.querySelector('img');
                if (img) {
                    img.src = e.target.result;
                } else {
                    const placeholder = avatarContainer.querySelector('.profile-avatar-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                    img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'profile-avatar';
                    avatarContainer.prepend(img);
                }
            };
            reader.readAsDataURL(file);
        }
    });

    listenersInitialized = true;
    console.log('[Debug] Persistent listeners attached successfully.');
}

// --- Modal Controls ---
function openEditModal(user) {
    console.log('[Debug] Opening "Edit User" modal for user:', user.username);
    const modal = document.getElementById('user-edit-modal');
    const userIdInput = document.getElementById('edit-user-id');
    const usernameInput = document.getElementById('edit-username');
    const emailInput = document.getElementById('edit-email');
    const roleInput = document.getElementById('edit-role');
    const passwordInput = document.getElementById('edit-password');
    const avatarContainer = document.getElementById('edit-user-avatar-container');
    const avatarUploadInput = document.getElementById('edit-avatar-upload-input');

    userIdInput.value = user.id;
    usernameInput.value = user.username;
    emailInput.value = user.email;
    roleInput.value = user.role;
    passwordInput.value = '';
    avatarUploadInput.value = ''; // Clear any previously selected file

    // Dynamically create the avatar part to ensure it's fresh
    const avatarContent = `
        ${user.avatar_url
            ? `<img src="${user.avatar_url}" alt="الصورة الشخصية" class="profile-avatar">`
            : `<div class="profile-avatar-placeholder"><i class="fas fa-user"></i></div>`
        }
        <label for="edit-avatar-upload-input" class="avatar-edit-overlay">
            <i class="fas fa-camera"></i>
        </label>
    `;
    // Clear previous content and add new avatar content
    avatarContainer.innerHTML = avatarContent;
    avatarContainer.appendChild(avatarUploadInput); // Re-append the persistent input

    const isSelf = user.id.toString() === JSON.parse(localStorage.getItem('user')).id.toString();
    const isAdmin = user.id === 1;

    usernameInput.disabled = isAdmin;
    roleInput.disabled = isSelf || isAdmin;

    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('user-edit-modal');
    modal.classList.remove('show');
    modal.querySelector('form').reset();
}

// --- Event Handlers ---

async function handleAddUserSubmit(e) {
    e.preventDefault();
    console.log("[Debug] 'Add User' form submitted. Processing...");
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';

    try {
        const result = await fetchWithAuth('/api/users', { method: 'POST', body: formData });        
        showToast(result.message || 'تمت إضافة المستخدم بنجاح.');
        form.reset(); // Reset the form
        document.querySelector('.add-user-container').classList.remove('open'); // Close the accordion
        allUsers.push(result.data);
        renderUserCards();
    } catch (error) {
        console.error("An error occurred while adding the user:", error);
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'إضافة الموظف';
    }
}

async function handleEditUserSubmit(e) {
    e.preventDefault();
    console.log("[Debug] 'Edit User' form submitted. Processing...");
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const userId = document.getElementById('edit-user-id').value;
    const formData = new FormData(form);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    try {
        const result = await fetchWithAuth(`/api/users/${userId}`, { method: 'PUT', body: formData });
        showToast('تم تحديث بيانات المستخدم بنجاح.');
        closeEditModal();
        const updatedUser = result.user;
        const userIndex = allUsers.findIndex(u => u.id == updatedUser.id);
        if (userIndex > -1) {
            allUsers[userIndex] = { ...allUsers[userIndex], ...updatedUser };
            const userCard = document.getElementById(`user-card-${updatedUser.id}`);
            if (userCard) userCard.outerHTML = createUserCard(allUsers[userIndex]);
        }
    } catch (error) {
        console.error("An error occurred while editing the user:", error);
        showToast(error.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'حفظ التغييرات';
    }
}

async function handleCardClick(e) {
    const button = e.target.closest('button');
    
    if (button) {
        const action = button.dataset.action;
        const userId = button.dataset.id;

        if (action === 'edit') {
            const user = allUsers.find(u => u.id == userId);
            if (user) openEditModal(user);
        } else if (action === 'delete') {
            const card = button.closest('.user-card');
            const confirmed = await showConfirmModal(
                'تأكيد الحذف',
                'هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.',
                {
                    iconClass: 'fas fa-trash-alt',
                    iconColor: 'var(--danger-color)',
                    confirmText: 'نعم، حذف',
                    confirmClass: 'submit-btn danger-btn'
                });
            if (confirmed) {
                try {
                    await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
                    showToast('تم حذف المستخدم بنجاح.');
                    allUsers = allUsers.filter(u => u.id != userId);
                    card.classList.add('row-fade-out');
                    setTimeout(() => {
                        renderUserCards(); // Re-render to update stats and table
                    }, 400);
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
    }
}

async function handleStatusToggle(e) {
    if (!e.target.classList.contains('status-toggle')) return;
    const toggle = e.target;
    const userId = toggle.dataset.id;
    const is_active = toggle.checked;
    const card = toggle.closest('.user-card');

    try {
        await fetchWithAuth(`/api/users/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active })
        });
        showToast(`تم ${is_active ? 'تفعيل' : 'تعطيل'} المستخدم.`);
        card.classList.toggle('inactive', !is_active);
        const userIndex = allUsers.findIndex(u => u.id == userId);
        if (userIndex > -1) {
            allUsers[userIndex].is_active = is_active;
            // Re-render the specific card and stats
            card.outerHTML = createUserCard(allUsers[userIndex]);
            renderUserStats();
        }
    } catch (error) {
        showToast(error.message, true);
        toggle.checked = !is_active; // Revert toggle on error
    }
}