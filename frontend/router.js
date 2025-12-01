import { renderHomePage, cleanupHomePage } from './page-home.js';
import { renderDataFilterPage } from './page-data-filter.js';
import { renderArchivePage } from './page-archive.js';
import { renderProfilePage } from './page-profile.js';
import { renderComparatorPage } from './page-comparator.js';
import { renderInstructionsPage } from './page-instructions.js';
import { renderActivityLogPage } from './page-activity-log.js';
import { renderBroadcastPage } from './page-broadcast.js';
import { renderNotificationsHistoryPage } from './page-notifications.js';
import { renderAnalyticsPage } from './page-analytics.js';
import { renderUsersPage } from './page-users.js'; // Keep this line
import { renderTemplatesPage } from './page-templates.js'; // Keep this line
import { renderTransferRulesGuidePage } from './page-transfer-rules-guide.js';
import { renderEvaluationsPage, initEvaluationsPage } from './page-evaluations.js';
import { createDepositReportPageHTML, createGeneralReportPageHTML, initCreateReportPage, cleanupReportPage, initBulkDepositReportPage, renderBulkDepositReportPage } from './page-report-form.js';
import { renderPayoutsPage, cleanupPayoutsPage } from './page-payouts.js';
import { renderSamePriceSLPage } from './page-same-price-sl.js';
import { showLoader, hideLoader, updateActiveLink, showConfirmModal } from './ui.js';

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
    '#comparator': renderComparatorPage,
    '#data-filter': renderDataFilterPage, // <--- أضف هذا السطر
    '#instructions': renderInstructionsPage,
    '#activity-log': renderActivityLogPage,
    '#broadcast': renderBroadcastPage,
    '#analytics': renderAnalyticsPage,
    '#users': renderUsersPage,
    '#transfer-rules': renderTransferRulesGuidePage, // Merged guide and management
    '#templates': renderTemplatesPage,
    '#profile': renderProfilePage,
    '#notifications': renderNotificationsHistoryPage,
    '#evaluations': { render: renderEvaluationsPage, init: initEvaluationsPage },
    '#reports/suspicious': () => createGeneralReportPageHTML('Suspicious Report'),
    '#reports/deposit': () => createDepositReportPageHTML('Deposit Report'),
    '#reports/deposit-percentage': { render: renderBulkDepositReportPage, init: initBulkDepositReportPage },
    '#reports/new-position': () => createGeneralReportPageHTML('New Position Report'),
    '#reports/credit-out': () => createGeneralReportPageHTML('Credit Out Report'),
    '#reports/account-transfer': () => createGeneralReportPageHTML('تحويل الحسابات'),
    '#reports/payouts': renderPayoutsPage,
    '#reports/profit-watching': () => createGeneralReportPageHTML('PROFIT WATCHING'),
    '#reports/profit-summary': () => createGeneralReportPageHTML('Profit Summary'),
    '#reports/3days-balance': () => createGeneralReportPageHTML('3Days Balance'),
    '#reports/profit-leverage': () => createGeneralReportPageHTML('Profit Leverage'),
    '#reports/employee-evaluation': () => createGeneralReportPageHTML('Employee Evaluation'),
    '#reports/same-price-sl': () => createGeneralReportPageHTML('Same Price and SL'),
    '#same-price-sl': renderSamePriceSLPage,
    '#reports/deals-no-profit': () => createGeneralReportPageHTML('Deals with No profit'),
};



export async function navigate() {
    if (isFormDirty) {
        const confirmed = await showConfirmModal(
            'تأكيد المغادرة',
            'لديك تغييرات غير محفوظة. هل أنت متأكد من مغادرة الصفحة؟ سيتم فقدان جميع التغييرات.',
            { confirmText: 'نعم، مغادرة', confirmClass: 'danger-btn' }
        );
        if (!confirmed) {
            return;
        }
    }
    setFormDirty(false);

    // Clean up old event listeners and intervals before navigating to a new page
    cleanupHomePage();
    cleanupReportPage();
    cleanupPayoutsPage();

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

    const adminOnlyPages = ['#users', '#activity-log', '#broadcast', '#analytics', '#data-filter'];
    const shiftManagerOrAdminPages = ['#evaluations'];
    const requestedPage = window.location.hash || '#home';

    if (adminOnlyPages.includes(requestedPage.split('?')[0]) && (!user || user.role !== 'admin')) {
        console.warn('Access denied to user management page.');
        window.location.hash = '#home'; // Redirect to home
        return;
    }

    if (shiftManagerOrAdminPages.includes(requestedPage.split('?')[0]) && (!user || (user.role !== 'admin' && user.role !== 'shift-manager'))) {
        console.warn('Access denied to evaluations page.');
        window.location.hash = '#home'; // Redirect to home
        return; // Stop navigation
    }

    const fullPath = window.location.hash || '#home';
    let [path] = fullPath.split('?'); // Get the base path before the query string
    const mainContent = document.getElementById('main-content');

    showLoader();
    // Use an IIFE to keep the async/await structure without the artificial delay.
    (async () => {
        try {
            const pageRenderer = routes[path];

            // --- Fix: Clear back-button flags on direct navigation to archive ---
            // If navigating directly to the archive page (without search params),
            // it means the user clicked the main navbar link. We should clear any
            // lingering flags from previous visits to the comparator or data-filter tools.
            const fullHash = window.location.hash;
            if (path === '#archive' && !fullHash.includes('?')) {
                sessionStorage.removeItem('fromComparator');
                sessionStorage.removeItem('fromDataFilter');
            }

            if (typeof pageRenderer === 'function') {
                const content = await pageRenderer(); // This might return a string or nothing
                if (typeof content === 'string') {
                    mainContent.innerHTML = content;
                }
            } else if (pageRenderer && typeof pageRenderer.render === 'function') {
                const content = await pageRenderer.render();
                if (typeof content === 'string') {
                    mainContent.innerHTML = content;
                }
                if (typeof pageRenderer.init === 'function') {
                    pageRenderer.init();
                }
            } else {
                mainContent.innerHTML = `<h1>404 - Page Not Found</h1>`;
                path = '#home'; // Fallback to home
            }

            // Check if we came from the data filter page
            if (sessionStorage.getItem('fromDataFilter') === 'true') {
                addGoBackButton('العودة للفلتر', '#data-filter', 'fromDataFilter');
            }

            // Post-render initialization for specific pages
            if (path.startsWith('#reports/') &&
                path !== '#reports/payouts' &&
                path !== '#reports/deposit-percentage') {
                initCreateReportPage();
            }

            updateActiveLink(path);
        } catch (error) {
            console.error("Error during navigation:", error);
            mainContent.innerHTML = `<h1>حدث خطأ فادح أثناء تحميل الصفحة.</h1><p>الرجاء إبلاغ المطور بالخطأ التالي: ${error.message}</p>`;
        } finally {
            hideLoader();
            // Scroll to top unless we are on the comparator page and need to highlight a specific row.
            // This ensures report pages always load at the top.
            const highlightKey = sessionStorage.getItem('highlightRowId');
            const shouldNotScroll = (path === '#comparator' && highlightKey) || 
                                    (path === '#data-filter' && highlightKey);
            if (!shouldNotScroll) {
                window.scrollTo(0, 0);
            }
        }
    })();
}

function addGoBackButton(text, targetHash, sessionKey) {
    const header = document.querySelector('.archive-page-container .page-header');
    if (header && !header.querySelector('.go-back-btn')) {
        const backButton = document.createElement('a');
        backButton.href = targetHash;
        backButton.className = 'submit-btn go-back-btn';
        backButton.style.width = 'auto';
        backButton.innerHTML = `<i class="fas fa-arrow-left"></i> ${text}`;
        
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.removeItem(sessionKey);
            window.location.hash = targetHash;
        });
        header.appendChild(backButton);
    }
}
