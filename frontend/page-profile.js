export function renderProfilePage() {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : { username: 'مستخدم', email: 'غير محدد' };

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <h1 class="page-title">الملف الشخصي</h1>
        <div class="profile-page-layout">
            <div class="profile-info-card">
                <div class="icon"><i class="fas fa-user-shield"></i></div>
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
        </div>
    `;
}