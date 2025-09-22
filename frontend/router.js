import { renderHomePage, cleanupHomePage } from './page-home.js';
import { renderArchivePage } from './page-archive.js';
import { renderUsersPage } from './page-users.js';
import { renderProfilePage } from './page-profile.js';
import { renderComparatorPage } from './page-comparator.js';
import { renderInstructionsPage } from './page-instructions.js';
import { renderTemplatesPage } from './page-templates.js';
import { renderActivityLogPage } from './page-activity-log.js';
import { renderBroadcastPage } from './page-broadcast.js';
import { renderNotificationsHistoryPage } from './page-notifications.js';
import { renderAnalyticsPage } from './page-analytics.js';
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
    '#comparator': renderComparatorPage,
    '#instructions': renderInstructionsPage,
    '#templates': renderTemplatesPage,
    '#activity-log': renderActivityLogPage,
    '#broadcast': renderBroadcastPage,
    '#analytics': renderAnalyticsPage,
    '#profile': renderProfilePage,
    '#notifications': renderNotificationsHistoryPage,
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

    const adminOnlyPages = ['#users', '#activity-log', '#broadcast', '#analytics'];
    const requestedPage = window.location.hash || '#home';

    if (adminOnlyPages.includes(requestedPage.split('?')[0]) && (!user || user.id !== 1)) {
        console.warn('Access denied to user management page.');
        window.location.hash = '#home'; // Redirect to home
        return; // Stop navigation
    }

    const fullPath = window.location.hash || '#home';
    const [path] = fullPath.split('?'); // Get the base path before the query string
    const mainContent = document.getElementById('main-content');

    showLoader();
    // Use an IIFE to keep the async/await structure without the artificial delay.
    (async () => {
        try {
            const pageRenderer = routes[path];

            if (typeof pageRenderer === 'function') {
                const content = await pageRenderer(); // This might return a string or nothing
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
            // Do not scroll to top if we are returning to the comparator page to highlight a row.
            if (!sessionStorage.getItem('highlight-row')) {
                window.scrollTo(0, 0);
            }
        }
    })();
}