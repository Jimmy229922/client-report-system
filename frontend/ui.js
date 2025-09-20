// This file handles general UI updates

export function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.style.backgroundColor = isError ? 'var(--danger-color)' : 'var(--success-color)';
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

export function showLoader() {
    document.getElementById('loader').classList.remove('hidden');
}

export function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}

export function updateActiveLink(path) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        const linkPath = link.getAttribute('href');
        if (linkPath === path) {
            link.classList.add('active');
        } else if (path.startsWith('#reports') && link.parentElement.classList.contains('dropdown')) {
            link.classList.add('active');
        }
    });
}

export function updateNavbarUser() {
    const navbarUsername = document.getElementById('navbar-username');
    const navbarAvatarContainer = document.getElementById('navbar-avatar-container');
    const userStr = localStorage.getItem('user');

    if (userStr && navbarUsername && navbarAvatarContainer) {
        const user = JSON.parse(userStr);
        navbarUsername.textContent = user.username;
        if (user.avatar_url) {
            navbarAvatarContainer.innerHTML = `<img src="${user.avatar_url}" alt="Avatar" class="navbar-avatar">`;
        } else {
            navbarAvatarContainer.innerHTML = `<i class="fas fa-user-circle"></i>`;
        }
    }
}

export function handleTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleBtn.querySelector('i');

    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'light') {
        themeIcon.classList.replace('fa-sun', 'fa-moon');
    }

    themeToggleBtn.addEventListener('click', () => {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            theme = 'light';
            themeIcon.classList.replace('fa-sun', 'fa-moon');
        } else {
            theme = 'dark';
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        }
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Dispatch a custom event that other parts of the app can listen to
        document.dispatchEvent(new CustomEvent('themeChanged'));
    });
}

export function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (isNaN(seconds)) {
        return '';
    }

    if (seconds < 60) return `قبل ${seconds} ثوان`;
    if (minutes < 60) return `قبل ${minutes} دقائق`;
    if (hours < 24) return `قبل ${hours} ساعات`;
    
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}