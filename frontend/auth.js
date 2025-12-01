// This file handles authentication logic

export function checkAuth() {
    return localStorage.getItem('token');
}

export function handleLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    // --- منطق إظهار/إخفاء كلمة المرور ---
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('toggle-password');

    if (passwordInput && togglePassword) {
        togglePassword.addEventListener('click', function () {
            // تبديل نوع الحقل
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            // تبديل شكل الأيقونة
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const loginError = document.getElementById('login-error');
        const email = e.target.email.value;
        const password = e.target.password.value;
        loginError.textContent = '';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.' }));
                throw new Error(errorData.message || 'فشل تسجيل الدخول.');
            }

            const data = await response.json();
            if (data.auth) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user)); // Store user info
                sessionStorage.setItem('justLoggedIn', 'true'); // Flag for showing welcome toast
                location.reload(); // Reload the page to re-run the auth check in main.js
            }
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                loginError.textContent = 'فشل الاتصال بالسيرفر. هل السيرفر يعمل؟';
            } else {
                loginError.textContent = error.message;
            }
            e.target.password.value = ''; // Clear password field on error
        }
    });
}