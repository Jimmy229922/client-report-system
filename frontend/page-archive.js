import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let IS_ADMIN = false; // Cache admin status
let reportsByTypeCache = {}; // Cache for lazy loading reports in accordions

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
        const user = JSON.parse(userStr);
        return user.id === 1;
    } catch (e) { return false; }
}

async function populateUserFilter() {
    if (!IS_ADMIN) return;

    const container = document.getElementById('user-filter-container');
    const select = document.getElementById('user-filter');
    if (!container || !select) return;

    try {
        const result = await fetchWithAuth('/api/users');
        const users = result.data || [];
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            select.appendChild(option);
        });
        container.classList.remove('hidden');
    } catch (error) {
        console.error("Failed to populate user filter:", error);
    }
}

function getReportType(report) { // Changed to accept the whole report object
    // Prioritize the new 'type' column if it exists
    if (report.type) {
        const typeMap = {
            'suspicious': 'تقارير مشبوهة',
            'deposit_percentages': 'إيداعات',
            'new-positions': 'صفقات جديدة',
            'credit-out': 'سحب رصيد',
            'account_transfer': 'تحويل حسابات',
            'payouts': 'دفعات (PAYOUTS)',
            'other': 'تقارير أخرى'
        };
        return typeMap[report.type] || 'تقارير أخرى';
    }

    // Fallback to old text parsing method for older reports
    const reportText = report.report_text;
    if (reportText.includes('#suspicious')) return 'تقارير مشبوهة';
    if (reportText.includes('#deposit_percentages')) return 'إيداعات';
    if (reportText.includes('#new-positions')) return 'صفقات جديدة';
    if (reportText.includes('#credit-out')) return 'سحب رصيد';
    if (reportText.includes('تقرير تحويل الحسابات')) return 'تحويل حسابات';
    if (reportText.includes('#payouts')) return 'دفعات (PAYOUTS)';
    return 'تقارير أخرى';
}

function createReportCard(report) {
    // For admins, show author. For others, it won't be in the data.
    const authorHtml = report.users && report.users.username
        ? `<div class="report-author"><i class="fas fa-user-pen"></i><span>بواسطة:</span><strong>${report.users.username}</strong></div>`
        : '';

    const hasImages = report.image_urls && report.image_urls.length > 0;

    // The image thumbnails container, now with a 'hidden' class
    const imagesContainerHtml = hasImages
        ? `<div class="archive-image-thumbnails hidden">
            ${report.image_urls.map(url => `
                <div class="archive-thumbnail-wrapper">
                    <img src="${url}" alt="صورة مرفقة" class="archive-thumbnail img-preview">
                    ${IS_ADMIN ? `<button class="delete-image-btn" data-report-id="${report.id}" data-image-url="${url}" title="حذف هذه الصورة">&times;</button>` : ''}
                </div>`).join('')}
           </div>`
        : '';

    // The new button to show the images, placed in the footer
    const showImagesButtonHtml = hasImages
        ? `<button class="archive-btn show-images">
                <i class="fas fa-images"></i> عرض الصور (${report.image_urls.length})
           </button>`
        : '';

    return `
        <div class="archive-card" id="report-card-${report.id}">
            <div class="archive-card-header">
                <strong>${report.report_text.split('\n')[0]}</strong>
                <div class="archive-card-actions">
                    <button class="archive-btn copy" data-report-text="${report.report_text.replace(/"/g, '&quot;')}"><i class="fas fa-copy"></i></button>
                    <button class="archive-btn delete" data-id="${report.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="archive-card-body">${report.report_text}</div>
            ${imagesContainerHtml}
            <div class="archive-card-footer">
                <div class="footer-meta-left">
                    ${authorHtml}
                    ${showImagesButtonHtml}
                </div>
                <div class="report-date">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${new Date(report.timestamp).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span>-</span>
                    <span>${new Date(report.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>
        </div>
    `;
}

async function fetchAndRenderArchive() {
    const archiveGrid = document.getElementById('archive-grid');
    if (!archiveGrid) return;
    archiveGrid.innerHTML = `<div class="spinner"></div>`;
    reportsByTypeCache = {}; // Clear cache on new fetch/search

    // 1. Collect all filter values
    const searchTerm = document.getElementById('archive-search').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const userFilter = document.getElementById('user-filter');
    const userId = userFilter ? userFilter.value : 'all';
    const typeFilter = document.getElementById('type-filter');
    const reportType = typeFilter ? typeFilter.value : 'all';

    // 2. Build query string
    const params = new URLSearchParams();
    if (searchTerm) params.append('search', searchTerm);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (userId !== 'all' && IS_ADMIN) params.append('userId', userId);
    if (reportType !== 'all') params.append('type', reportType);
    const queryString = params.toString();

    try {
        const result = await fetchWithAuth(`/api/reports?${queryString}`);
        const reports = result.data || [];

        if (reports.length > 0) {
            // --- بداية التعديل: إضافة رسائل للكونسول ---
            console.log('--- فحص صور الأرشيف ---');
            reports.forEach(report => {
                if (report.image_urls && report.image_urls.length > 0) {
                    // Log success with the actual data for verification
                    console.log(`✅ تقرير #${report.id}: تم العثور على ${report.image_urls.length} صورة متاحة للمعاينة.`, report.image_urls);
                } else {
                    // Log failure and show the value of image_urls (which should be null or an empty array)
                    console.log(`❌ تقرير #${report.id}: لا توجد صور مرفقة. (قيمة image_urls: ${JSON.stringify(report.image_urls)})`);
                }
            });
            // --- نهاية التعديل ---

            const reportsByType = reports.reduce((acc, report) => {
                const type = getReportType(report);
                if (!acc[type]) acc[type] = [];
                acc[type].push(report);
                return acc;
            }, {});

            reportsByTypeCache = reportsByType; // Store data for lazy loading

            archiveGrid.innerHTML = Object.keys(reportsByTypeCache).sort().map(type => {

                return `
                    <div class="accordion-group">
                        <div class="accordion-header">
                            <h3>${type} (${reportsByTypeCache[type].length})</h3>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <div class="accordion-content" data-report-type="${type}"></div>
                    </div>
                `;
            }).join('');

            // Accordion and action button logic
            setupArchiveInteractions();
        } else {
            // This block handles the case where the API returns an empty data array.
            // This is the correct behavior for a search with no results.
            const messageHtml = searchTerm
                ? `
                <div class="empty-state-professional">
                    <i class="fas fa-file-search"></i>
                    <h3>لا توجد سجلات مطابقة</h3>
                    <p>لم يتم العثور على أي تقارير لرقم الحساب <strong>"${searchTerm}"</strong>.</p>
                </div>`
                : '<p style="text-align: center; padding: 2rem;">لا توجد تقارير لعرضها في الأرشيف حالياً.</p>';
            
            archiveGrid.innerHTML = messageHtml;
        }
    } catch (error) {
        console.error('Failed to fetch archive:', error);
        archiveGrid.innerHTML = `
            <div class="empty-state-professional" style="border-color: var(--danger-color);">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-color);"></i>
                <h3>حدث خطأ</h3>
                <p>فشل تحميل الأرشيف. يرجى المحاولة مرة أخرى.</p>
                <p class="error-details">${error.message}</p>
            </div>`;
    }
}

function setupArchiveInteractions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const reportType = content.dataset.reportType;

            // Lazy load content if it hasn't been loaded yet
            if (!content.hasAttribute('data-loaded')) {
                const reports = reportsByTypeCache[reportType] || [];
                const reportsHtml = `<div class="archive-section-grid">${reports.map(createReportCard).join('')}</div>`;
                content.innerHTML = reportsHtml;
                content.setAttribute('data-loaded', 'true');
            }

            header.classList.toggle('active');
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                // Add a buffer for safety in case of margin/padding
                content.style.maxHeight = (content.scrollHeight + 20) + "px";
            }
        });
    });

    // Use event delegation for all actions within the archive grid
    const archiveGrid = document.getElementById('archive-grid');
    if (!archiveGrid) return;

    archiveGrid.addEventListener('click', async (e) => {
        const button = e.target.closest('.archive-btn, .delete-image-btn');
        if (!button) return;

        if (button.classList.contains('copy')) handleCopy(button);
        else if (button.classList.contains('delete')) handleDelete(button);
        else if (button.classList.contains('show-images')) handleShowImages(button);
        else if (button.classList.contains('delete-image-btn')) handleDeleteImage(button);
    });
}
function handleCopy(button) {
    const reportText = button.dataset.reportText;
    navigator.clipboard.writeText(reportText).then(() => {
        showToast('تم نسخ نص التقرير.');
    }).catch(err => {
        showToast('فشل نسخ النص.', true);
    });
}

function handleShowImages(button) {
    const card = button.closest('.archive-card');
    if (card) {
        const thumbnails = card.querySelector('.archive-image-thumbnails');
        if (thumbnails) {
            thumbnails.classList.remove('hidden');
            button.style.display = 'none'; // Hide the button after clicking
        }
    }
}

async function handleDelete(button) {
    const reportId = button.dataset.id;
    const confirmed = await showConfirmModal(
        'تأكيد الحذف',
        'هل أنت متأكد من حذف هذا التقرير؟ لا يمكن التراجع عن هذا الإجراء.',
        {
            iconClass: 'fas fa-trash-alt',
            iconColor: 'var(--danger-color)',
            confirmText: 'نعم، حذف',
            confirmClass: 'submit-btn danger-btn'
        });
    if (confirmed) {
        try {
            const card = document.getElementById(`report-card-${reportId}`);
            const group = card.closest('.accordion-group');
            const header = group.querySelector('.accordion-header h3');
            const grid = card.parentElement;

            await fetchWithAuth(`/api/reports/${reportId}`, { method: 'DELETE' });
            card.remove(); // Remove the card from the DOM
            showToast('تم حذف التقرير بنجاح.');

            // Update the count in the header
            const currentCount = parseInt(header.textContent.match(/\((\d+)\)/)[1]);
            const newCount = currentCount - 1;

            if (newCount > 0) {
                header.textContent = header.textContent.replace(`(${currentCount})`, `(${newCount})`);
            } else {
                // If no reports are left in this group, remove the whole group
                group.remove();
            }
        } catch (err) {
            showToast(err.message, true);
        }
    }
}

async function handleDeleteImage(button) {
    const reportId = button.dataset.reportId;
    const imageUrl = button.dataset.imageUrl;

    const confirmed = await showConfirmModal(
        'تأكيد حذف الصورة',
        'هل أنت متأكد من حذف هذه الصورة فقط من التقرير؟ لا يمكن التراجع عن هذا الإجراء.',
        {
            iconClass: 'fas fa-image',
            iconColor: 'var(--danger-color)',
            confirmText: 'نعم، حذف الصورة',
            confirmClass: 'submit-btn danger-btn'
        }
    );

    if (confirmed) {
        try {
            const result = await fetchWithAuth(`/api/reports/${reportId}/images`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl })
            });
            showToast(result.message);
            // Remove the image from the DOM
            const thumbnailWrapper = button.closest('.archive-thumbnail-wrapper');
            if (thumbnailWrapper) thumbnailWrapper.remove();
        } catch (err) {
            showToast(err.message, true);
        }
    }
}

export function renderArchivePage() {
    const mainContent = document.getElementById('main-content');
    const cameFromComparator = !!sessionStorage.getItem('highlight-row');

    const backButtonHtml = cameFromComparator ? 
        `<a href="#comparator" id="back-to-comparator-btn" class="submit-btn" style="width: auto; padding: 0.6rem 1.2rem;"><i class="fas fa-arrow-left"></i> العودة للمقارنة</a>` : '';

    mainContent.innerHTML = `
        <div class="page-header page-header-actions">
            <h1 class="page-title">أرشيف التقارير</h1>
            ${backButtonHtml}
        </div>
        <div class="filter-bar">
            <div class="filter-controls">
                <div class="filter-item search-filter">
                    <i class="fas fa-search"></i>
                    <input type="text" id="archive-search" class="search-input" placeholder="ابحث في التقارير...">
                </div>
                <div class="filter-item date-filter">
                    <label for="start-date">من</label>
                    <input type="date" id="start-date">
                </div>
                <div class="filter-item date-filter">
                    <label for="end-date">إلى</label>
                    <input type="date" id="end-date">
                </div>
                <div class="filter-item user-filter hidden" id="user-filter-container">
                    <label for="user-filter">الموظف</label>
                    <select id="user-filter">
                        <option value="all">الكل</option>
                    </select>
                </div>
                <div class="filter-item">
                    <label for="type-filter">النوع</label>
                    <select id="type-filter">
                        <option value="all">كل الأنواع</option>
                        <option value="suspicious">Suspicious</option>
                        <option value="deposit_percentages">Deposit</option>
                        <option value="new-positions">New Position</option>
                        <option value="credit-out">Credit Out</option>
                        <option value="account_transfer">Account Transfer</option>
                        <option value="payouts">PAYOUTS</option>
                    </select>
                </div>
            </div>
            <div class="filter-actions">
                <button id="reset-filters-btn" class="cancel-btn" style="width: auto; padding: 0.6rem 1.2rem;"><i class="fas fa-times"></i> مسح</button>
            </div>
        </div>
        <div id="archive-grid" class="archive-grid">
            <div class="spinner"></div>
        </div>
    `;

    IS_ADMIN = checkAdminStatus();
    if (IS_ADMIN) {
        populateUserFilter();
    }

    const searchInput = document.getElementById('archive-search');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const userFilterSelect = document.getElementById('user-filter');
    const typeFilterSelect = document.getElementById('type-filter');
    const resetBtn = document.getElementById('reset-filters-btn');

    let debounceTimer;
    const debouncedFetch = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchAndRenderArchive, 500);
    };

    searchInput.addEventListener('input', debouncedFetch);
    startDateInput.addEventListener('change', fetchAndRenderArchive);
    endDateInput.addEventListener('change', fetchAndRenderArchive);
    userFilterSelect.addEventListener('change', fetchAndRenderArchive);
    typeFilterSelect.addEventListener('change', fetchAndRenderArchive);

    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        startDateInput.value = '';
        endDateInput.value = '';
        userFilterSelect.value = 'all';
        typeFilterSelect.value = 'all';
        fetchAndRenderArchive();
    });

    // Check for a search query in the URL hash
    const [path, queryString] = location.hash.substring(1).split('?');
    const params = new URLSearchParams(queryString || '');
    const initialSearchTerm = params.get('search');

    if (initialSearchTerm) {
        searchInput.value = initialSearchTerm;
        fetchAndRenderArchive();
    } else {
        fetchAndRenderArchive();
    }
}