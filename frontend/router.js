import { renderHomePage, cleanupHomePage } from './page-home.js';
import { renderArchivePage } from './page-archive.js';
import { renderUsersPage } from './page-users.js';
import { renderProfilePage } from './page-profile.js';
import { createDepositReportPageHTML, createGeneralReportPageHTML, initCreateReportPage } from './page-report-form.js';
import { showLoader, hideLoader, updateActiveLink } from './ui.js';

let isFormDirty = false;
export function setFormDirty(isDirty) {
    isFormDirty = isDirty;
    window.onbeforeunload = isDirty ? (e) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
    } : null;
}

const routes = {
    '#home': renderHomePage,
    '#archive': renderArchivePage,
    '#users': renderUsersPage,
    '#profile': renderProfilePage,
    '#reports/suspicious': () => createGeneralReportPageHTML('Suspicious Report'),
    '#reports/deposit': () => createDepositReportPageHTML('Deposit Report'),
    '#reports/new-position': () => createGeneralReportPageHTML('New Position Report'),
    '#reports/credit-out': () => createGeneralReportPageHTML('Credit Out Report'),
    '#reports/account-transfer': () => createGeneralReportPageHTML('تحويل الحسابات'),
    '#reports/payouts': () => createGeneralReportPageHTML('PAYOUTS'),
};

export function navigate() {
    if (isFormDirty && !confirm('لديك تغييرات غير محفوظة. هل أنت متأكد من مغادرة الصفحة؟')) {
        return;
    }
    setFormDirty(false);

    // Clean up old event listeners and intervals before navigating to a new page
    cleanupHomePage();

    // Client-side route guard for admin page
    const userStr = localStorage.getItem('user');
    let user = null;
    if (userStr && userStr !== 'undefined' && userStr !== 'null') {
        try {
            user = JSON.parse(userStr);
        } catch (error) {
            console.error("Corrupted user data in localStorage (router.js). Clearing and reloading.", error);
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            location.reload();
            return; // Stop navigation to allow reload
        }
    }

    if (window.location.hash === '#users' && (!user || (user.id !== 1 && user.email !== 'admin@inzo.com'))) {
        console.warn('Access denied to user management page.');
        window.location.hash = '#home'; // Redirect to home
        return; // Stop navigation
    }

    const path = window.location.hash || '#home';
    const mainContent = document.getElementById('main-content');

    showLoader();
    setTimeout(async () => {
        try {
            const pageRenderer = routes[path];

            if (typeof pageRenderer === 'function') {
                const content = await pageRenderer(); // This might return a string or nothing
                // If the renderer returns a string, set it as the content.
                // Otherwise, assume the function handled its own DOM manipulation (like home and archive pages).
                if (typeof content === 'string') {
                    mainContent.innerHTML = content;
                }
            } else {
                mainContent.innerHTML = `<h1>404 - Page Not Found</h1>`;
            }

            // Post-render initialization for specific pages
            if (path.startsWith('#reports/')) {
                initCreateReportPage();
            }

            updateActiveLink(path);
        } catch (error) {
            console.error("Error during navigation:", error);
            mainContent.innerHTML = `<h1>حدث خطأ فادح أثناء تحميل الصفحة.</h1><p>الرجاء إبلاغ المطور بالخطأ التالي: ${error.message}</p>`;
        } finally {
            hideLoader();
            window.scrollTo(0, 0);
        }
    }, 250); // Reduced delay for faster navigation
}