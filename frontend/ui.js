import { setFormDirty } from './router.js';

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

// Center screen alert (red) that auto-hides, with a close button
export function showCenterAlert(message, durationMs = 6000) {
    let el = document.getElementById('center-alert');
    if (!el) {
        el = document.createElement('div');
        el.id = 'center-alert';
        el.style.position = 'fixed';
        el.style.top = '50%';
        el.style.left = '50%';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.zIndex = '10000';
        el.style.backgroundColor = 'var(--danger-color)';
        el.style.color = 'var(--text-on-danger, #fff)';
        el.style.padding = '20px 24px';
        el.style.borderRadius = '12px';
        el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)';
        el.style.fontSize = '16px';
        el.style.display = 'none';
        el.style.textAlign = 'center';
        el.style.maxWidth = '400px';
        el.style.width = '90%';
        el.style.border = '2px solid rgba(255,255,255,0.2)';

        // Icon
        const iconEl = document.createElement('div');
        iconEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px;"></i>';
        el.appendChild(iconEl);

        // Title
        const titleEl = document.createElement('div');
        titleEl.textContent = 'تحذير أمني';
        titleEl.style.fontWeight = 'bold';
        titleEl.style.fontSize = '18px';
        titleEl.style.marginBottom = '8px';
        el.appendChild(titleEl);

        // Message
        const textWrap = document.createElement('div');
        textWrap.id = 'center-alert-text';
        textWrap.style.marginBottom = '15px';
        el.appendChild(textWrap);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'إغلاق';
        closeBtn.style.marginTop = '10px';
        closeBtn.style.background = 'rgba(255,255,255,0.2)';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'inherit';
        closeBtn.style.padding = '8px 16px';
        closeBtn.style.borderRadius = '8px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontSize = '14px';
        closeBtn.addEventListener('click', () => {
            el.style.display = 'none';
        });
        el.appendChild(closeBtn);

        document.body.appendChild(el);
    }

    const textWrap = document.getElementById('center-alert-text');
    if (textWrap) textWrap.textContent = message;
    el.style.display = 'block';

    if (durationMs && durationMs > 0) {
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, durationMs);
    }
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

    if (navbarUsername && navbarAvatarContainer) {
        // Check for invalid strings like "undefined" before attempting to parse.
        if (userStr && userStr !== 'undefined' && userStr !== 'null') {
            try {
                const user = JSON.parse(userStr);
                // Ensure user object is valid after parsing
                if (user?.username) {
                    navbarUsername.textContent = user.username;

                    if (user.avatar_url) {
                        navbarAvatarContainer.innerHTML = `<img src="${user.avatar_url}" alt="${user.username}" class="navbar-avatar">`;
                    } else {
                        navbarAvatarContainer.innerHTML = '<i class="fas fa-user-circle"></i>';
                    }
                }
            } catch (error) {
                console.error("Corrupted user data in localStorage. Clearing and reloading.", error);
                // If parsing fails, the data is corrupt. Clean up and reload to the login page.
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                location.reload();
            }
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

export function showConfirmModal(title, text, options = {}) {
    const {
        iconClass = 'fas fa-question-circle', // Default icon
        iconColor = 'var(--accent-color)', // Default color
        confirmClass = 'submit-btn',
        confirmText = 'موافق',
        cancelClass = 'cancel-btn',
        cancelText = 'إلغاء'
    } = options;

    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const iconEl = document.getElementById('confirm-modal-icon');
        const textEl = document.getElementById('confirm-modal-text');
        const okBtn = document.getElementById('confirm-modal-ok-btn');
        const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

        // The close button was removed from the HTML for a cleaner look.
        if (!modal || !titleEl || !iconEl || !textEl || !okBtn || !cancelBtn) {
            console.error('Confirmation modal elements are missing from the DOM. Falling back to native confirm().');
            resolve(confirm(`${title}\n\n${text}`));
            return;
        }

        titleEl.textContent = title;
        textEl.textContent = text;
        iconEl.innerHTML = `<i class="${iconClass}"></i>`;
        iconEl.style.color = iconColor;

        okBtn.className = confirmClass;
        okBtn.textContent = confirmText;
        cancelBtn.className = cancelClass;
        cancelBtn.textContent = cancelText;

        const closeModal = (result) => {
            modal.classList.remove('show');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.onclick = null;
            resolve(result);
        };

        okBtn.onclick = () => closeModal(true);
        cancelBtn.onclick = () => closeModal(false);
        modal.onclick = (e) => {
            if (e.target === modal) closeModal(false);
        };

        modal.classList.add('show');
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

/**
 * Initializes a TinyMCE editor with a centralized configuration.
 * @param {string} selector - The CSS selector for the textarea to be replaced.
 * @param {object} [customOptions={}] - Additional options to merge with the default config.
 */
export async function initTinyMCE(selector, customOptions = {}) {
    return new Promise((resolve, reject) => {
        const waitForTinyMCE = (callback) => {
            if (window.tinymce) {
                callback();
            } else {
                setTimeout(() => waitForTinyMCE(callback), 50);
            }
        };

        waitForTinyMCE(() => {
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const defaultConfig = {
                menubar: false,
                statusbar: false,
                paste_data_images: true,
                height: 300,
                skin: isDarkMode ? 'oxide-dark' : 'default',
                content_css: isDarkMode ? 'dark' : 'default',
                setup: (editor) => {
                    editor.on('change', () => setFormDirty(true));
                    if (customOptions.setup) customOptions.setup(editor);
                },
                ...customOptions // Merge custom options
            };

            window.tinymce.init({ selector, ...defaultConfig }).then(editors => {
                if (editors.length > 0) {
                    resolve(editors[0]);
                } else {
                    reject('TinyMCE failed to initialize for selector: ' + selector);
                }
            });
        });
    });
}
