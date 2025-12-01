import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let IS_ADMIN = false; // Cache admin status
let reportsByTypeCache = {}; // Cache for lazy loading reports in accordions

function checkAdminStatus() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
        const user = JSON.parse(userStr);
        return user.role === 'admin';
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
            option.value = user._id;
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
            'bulk_deposit_percentages': 'إيداعات مجمعة (Bulk)',
            'new-positions': 'صفقات جديدة',
            'credit-out': 'سحب رصيد',
            'account_transfer': 'تحويل حسابات',
            'payouts': 'دفعات (payouts)',
            'profit_watching': 'Profit Watching',
            '3days_balance': 'رصيد 3 أيام (3Days Balance)',
            'profit_leverage': 'Profit Leverage',
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
    if (reportText.includes('#payouts')) return 'دفعات (payouts)';
    if (reportText.includes('#profit_watching')) return 'Profit Watching';
    if (reportText.includes('#3days_balance')) return 'رصيد 3 أيام (3Days Balance)';
    return 'تقارير أخرى';
}

function createReportCard(report) {
    const authorHtml = IS_ADMIN && report.user_id && report.user_id.username
        ? `<div class="report-author"><i class="fas fa-user-pen"></i><span>بواسطة:</span><strong>${report.user_id.username}</strong></div>`
        : '';

    const hasImages = report.image_urls && report.image_urls.length > 0;

    let imagesHtml = '';
    if (hasImages) {
        imagesHtml = `
            <div class="archive-image-thumbnails hidden">
                ${report.image_urls.map(url => `
                    <div class="archive-thumbnail-wrapper">
                        <img data-src="${url}" alt="صورة مرفقة" class="archive-thumbnail img-preview lazy-load" loading="lazy">
                    </div>`).join('')}
            </div>
            <button class="archive-btn show-images">
                <i class="fas fa-images"></i> عرض الصور (${report.image_urls.length})
            </button>`;
    }

    const currentUserId = JSON.parse(localStorage.getItem('user'))?.id;
    const canDelete = IS_ADMIN || (report.user_id && report.user_id._id.toString() === currentUserId);

    const resendBtnHtml = (IS_ADMIN && report.telegram_failed)
        ? `<button class="archive-btn resend-telegram" 
                   data-id="${report._id}" 
                   title="فشل الإرسال الأولي. اضغط لإعادة المحاولة.">
             <i class="fab fa-telegram-plane"></i>
           </button>`
        : '';

    const cleanReportText = report.report_text.replace(/<[^>]*>/g, '');

    return `
        <div class="archive-card" id="report-card-${report._id}">
            <div class="archive-card-header">
                <strong>${cleanReportText.split('\n')[0]}</strong>
                <div class="archive-card-actions">
                    ${resendBtnHtml}
                    <button class="archive-btn copy" data-report-text="${cleanReportText.replace(/"/g, '&quot;')}"><i class="fas fa-copy"></i></button>
                    ${canDelete ? `<button class="archive-btn delete" data-id="${report._id}"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <div class="archive-card-body">${cleanReportText.trim().replace(/\n+/g, '<br>')}</div>
            ${imagesHtml}
            <div class="archive-card-footer">
                <div class="footer-meta-left">
                    ${authorHtml}
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

async function loadVisibleImages(container) {
    const images = container.querySelectorAll('img.lazy-load[data-src]');
    for (const img of images) {
        const src = img.dataset.src;
        if (!src) continue;

                try {
            // Use fetchWithAuth to get the image blob securely
            const response = await fetchWithAuth(src, { method: 'GET', timeout: 300000 }, true); // 5 minute timeout for large images
            if (!response.ok) throw new Error('Image fetch failed');
            const imageBlob = await response.blob();
            img.src = URL.createObjectURL(imageBlob);
            // img.removeAttribute('data-src'); // Prevent re-loading, but we need it for the previewer
            img.classList.remove('lazy-load');
        } catch (error) {
            console.error(`Failed to load image: ${src}`, error);
        }
    }
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
    const userFilter = document.getElementById('user-filter'); // This element only exists for admins
    const userId = userFilter ? userFilter.value : 'all'; // If userFilter is null, userId becomes 'all'
    const typeFilter = document.getElementById('type-filter');
    const reportType = typeFilter ? typeFilter.value : 'all';

    // 2. Build query string
    const params = new URLSearchParams();
    if (searchTerm) params.append('search', searchTerm);

    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (IS_ADMIN && userId && userId !== 'all') params.append('userId', userId);
    if (reportType !== 'all') params.append('type', reportType);
    const queryString = params.toString();

    // For non-admins, the API should scope results. We add a param to be explicit.
    const finalQuery = !IS_ADMIN 
        ? (queryString ? `${queryString}&scope=user` : 'scope=user')
        : queryString;

    // Append a high limit to fetch all reports, overriding the backend's default pagination
    const queryWithLimit = finalQuery ? `${finalQuery}&limit=10000` : 'limit=10000';

    try {
        const result = await fetchWithAuth(`/api/reports?${queryWithLimit}`);
        const reports = result.data || [];

        // إضافة علامة للتقارير التي فشلت ليتمكن الـ frontend من عرض الزر
        const notifications = (await fetchWithAuth('/api/notifications')).data.notifications || [];
        const failedReportIds = new Set(
            notifications
                .filter(n => n.message.includes('فشل إرسال تنبيه تليجرام'))
                .map(n => n.link.split('=').pop())
        );

        reports.forEach(report => report.telegram_failed = failedReportIds.has(report._id));

        // DEBUG: Log the entire data array received from the server
        // console.log('[Archive] Fetched reports data from server:', reports);

        if (reports.length > 0) {
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
            // setupImagePreview is no longer needed here, as app.js handles it globally.
        } else {
            // This block handles the case where the API returns an empty data array.
            // This is the correct behavior for a search with no results.
            const messageHtml = searchTerm
            ? `<div class="empty-state-professional">
                   <i class="fas fa-file-search"></i>
                   <h3>لا توجد سجلات مطابقة</h3>
                   ${sessionStorage.getItem('fromComparator') === 'true'
                       ? `<p>رقم الحساب <strong>"${searchTerm}"</strong> الذي بحثت عنه غير موجود في الأرشيف.</p>
                          <p class="note">يمكنك العودة لأداة المقارنة من الزر في الأعلى.</p>`
                       : `<p>لم يتم العثور على أي تقارير تطابق بحثك عن <strong>"${searchTerm}"</strong>.</p>
                          ${!IS_ADMIN ? '<p class="note">ملاحظة: البحث يتم فقط ضمن تقاريرك الخاصة.</p>' : ''}`
                   }
               </div>`
                : `<p style="text-align: center; padding: 2rem;">لا توجد تقارير لعرضها في الأرشيف حالياً. ${!IS_ADMIN ? '<br><small>بمجرد إضافتك لتقارير، ستظهر هنا.</small>' : ''}</p>`;
            
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

function renderAccordionContent(contentElement, reportType, page = 1) {
    const reports = reportsByTypeCache[reportType] || [];
    const reportsPerPage = 4;
    const startIndex = (page - 1) * reportsPerPage;
    const endIndex = startIndex + reportsPerPage;
    const paginatedReports = reports.slice(startIndex, endIndex);

    const reportsHtml = `<div class="archive-section-grid">${paginatedReports.map(createReportCard).join('')}</div>`;

    const totalPages = Math.ceil(reports.length / reportsPerPage);
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
            <div class="accordion-pagination" style="text-align: center; margin-top: 1rem;">
                <button class="pagination-btn prev-page submit-btn" ${page === 1 ? 'disabled' : ''} style="width: auto; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 0.5rem; ${page === 1 ? 'background-color: var(--border-color); cursor: not-allowed; border: none;' : ''}">
                    <i class="fas fa-arrow-left"></i> السابق
                </button>
                <span class="pagination-info" style="margin: 0 1rem; font-weight: bold;">صفحة ${page} من ${totalPages}</span>
                <button class="pagination-btn next-page submit-btn" ${page === totalPages ? 'disabled' : ''} style="width: auto; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 0.5rem; ${page === totalPages ? 'background-color: var(--border-color); cursor: not-allowed; border: none;' : ''}">
                    التالي <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    contentElement.innerHTML = reportsHtml + paginationHtml;
    contentElement.setAttribute('data-current-page', page);
    loadVisibleImages(contentElement);
}

function setupArchiveInteractions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const reportType = content.dataset.reportType;

            // Load initial content (page 1) only if it hasn't been loaded before
            if (!content.hasAttribute('data-loaded')) {
                renderAccordionContent(content, reportType, 1);
                content.setAttribute('data-loaded', 'true');
            }

            // Toggle accordion visibility
            header.classList.toggle('active');
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                // Set a slight delay to allow content to render before calculating scrollHeight
                setTimeout(() => {
                    content.style.maxHeight = (content.scrollHeight + 40) + "px"; // Add extra space for padding/margins
                }, 50);
            }
        });
    });

    // Use event delegation for all actions within the archive grid
    const archiveGrid = document.getElementById('archive-grid');
    if (!archiveGrid) return;

    archiveGrid.addEventListener('click', async (e) => {
        // Handle pagination inside accordions
        const paginationBtn = e.target.closest('.pagination-btn');
        if (paginationBtn) {
            const content = paginationBtn.closest('.accordion-content');
            const reportType = content.dataset.reportType;
            let currentPage = parseInt(content.dataset.currentPage, 10);

            if (paginationBtn.classList.contains('next-page')) {
                currentPage++;
            } else if (paginationBtn.classList.contains('prev-page')) {
                currentPage--;
            }

            renderAccordionContent(content, reportType, currentPage);
            // Adjust maxHeight after content changes
            content.style.maxHeight = (content.scrollHeight + 40) + "px";
            return; // Stop further processing
        }

        // Check if the click was on an action button and handle it.
        const showImagesBtn = e.target.closest('.archive-btn.show-images');
        const copyBtn = e.target.closest('.archive-btn.copy');
        const deleteBtn = e.target.closest('.archive-btn.delete');
        const deleteImageBtn = e.target.closest('.delete-image-btn');
        const resendBtn = e.target.closest('.archive-btn.resend-telegram');

        if (showImagesBtn) {
            const card = showImagesBtn.closest('.archive-card');
            if (card) {
                const thumbnails = card.querySelector('.archive-image-thumbnails');
                if (thumbnails) {
                    thumbnails.classList.remove('hidden');
                    loadVisibleImages(thumbnails); // Load images when they become visible
                    showImagesBtn.style.display = 'none'; // Hide the button after clicking
                }
            }
        } else if (copyBtn) {
            handleCopy(copyBtn);
        } else if (deleteBtn) {
            handleDelete(deleteBtn);
        } else if (deleteImageBtn) {
            handleDeleteImage(deleteImageBtn);
        } else if (resendBtn) {
            handleResend(resendBtn);
        }
    });
}

function handleCopy(button) {
    let reportTextToCopy = button.dataset.reportText;
    // Explicitly replace "الدولة" with "ip country" before copying
    reportTextToCopy = reportTextToCopy.replace(/الدولة\s*:/gi, 'ip country:');
    navigator.clipboard.writeText(reportTextToCopy).then(() => {
        showToast('تم نسخ نص التقرير.');
    }).catch(err => {
        showToast('فشل نسخ النص.', true);
    });
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
            const contentElement = card.closest('.accordion-content');
            const reportType = contentElement.dataset.reportType;
            const currentPage = parseInt(contentElement.dataset.currentPage, 10);

            await fetchWithAuth(`/api/reports/${reportId}`, { method: 'DELETE' });
            showToast('تم حذف التقرير بنجاح.');

            // Update cache
            const report = Object.values(reportsByTypeCache).flat().find(r => r._id === reportId);
            if (report) {
                const type = getReportType(report);
                reportsByTypeCache[type] = reportsByTypeCache[type].filter(r => r._id !== reportId);
            }

            // Re-render the accordion content to fill the gap
            const reportsForType = reportsByTypeCache[reportType] || [];
            const totalPages = Math.ceil(reportsForType.length / 4); // 4 is reportsPerPage
            const pageToRender = Math.min(currentPage, totalPages > 0 ? totalPages : 1);

            renderAccordionContent(contentElement, reportType, pageToRender);
            updateAccordionHeaderCount(contentElement.closest('.accordion-group'));

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

            const thumbnailWrapper = button.closest('.archive-thumbnail-wrapper');
            if (thumbnailWrapper) thumbnailWrapper.remove();

            const card = button.closest('.archive-card');
            if (card && IS_ADMIN) {
                const imagesContainer = card.querySelector('.admin-images-header');
                if (imagesContainer) {
                    const countMatch = imagesContainer.textContent.match(/\((\d+)\)/);
                    if (countMatch) {
                        const currentCount = parseInt(countMatch[1]);
                        imagesContainer.textContent = imagesContainer.textContent.replace(`(${currentCount})`, `(${currentCount - 1})`);
                        if (currentCount - 1 === 0) {
                            card.querySelector('.archive-image-thumbnails.admin-images').remove();
                        }
                    }
                }
            }

            const report = Object.values(reportsByTypeCache).flat().find(r => r._id === reportId);
            if (report) {
                report.image_urls = report.image_urls.filter(url => url !== imageUrl);
            }
        } catch (err) {
            showToast(err.message, true);
        }
    }
}

async function handleResend(button) {
    const reportId = button.dataset.id;
    const icon = button.querySelector('i');
    
    button.disabled = true;
    icon.classList.remove('fa-telegram-plane');
    icon.classList.add('fa-spinner', 'fa-spin');

    try {
        const result = await fetchWithAuth(`/api/reports/${reportId}/resend-telegram`, { method: 'POST' });
        showToast(result.message);
        // إخفاء الزر بعد النجاح
        button.style.display = 'none';
    } catch (error) {
        showToast(error.message, true);
    } finally {
        button.disabled = false;
        icon.classList.add('fa-telegram-plane');
        icon.classList.remove('fa-spinner', 'fa-spin');
    }
}

function updateAccordionHeaderCount(accordionGroup) {
    if (!accordionGroup) return;
    const header = accordionGroup.querySelector('.accordion-header h3');
    const content = accordionGroup.querySelector('.accordion-content');
    const reportType = content.dataset.reportType;
    const newCount = reportsByTypeCache[reportType]?.length || 0;

    if (newCount > 0) {
        header.textContent = `${reportType} (${newCount})`;
    } else {
        accordionGroup.remove();
    }
}

export function renderArchivePage() {
    const mainContent = document.getElementById('main-content');
    const cameFromComparator = sessionStorage.getItem('fromComparator') === 'true'; // NOSONAR
    const cameFromDataFilter = sessionStorage.getItem('fromDataFilter') === 'true';

    let backButtonHtml = '';
    if (cameFromComparator) {
        backButtonHtml = `<a href="#comparator" id="back-to-comparator-btn" class="submit-btn" style="width: auto; padding: 0.6rem 1.2rem; background-color: var(--success-color);"><i class="fas fa-arrow-left"></i> العودة للمقارنة</a>`;
    } else if (cameFromDataFilter) {
        backButtonHtml = `<a href="#data-filter" id="back-to-data-filter-btn" class="submit-btn" style="width: auto; padding: 0.6rem 1.2rem; background-color: var(--success-color);"><i class="fas fa-arrow-left"></i> العودة للفلتر</a>`;
    }

    mainContent.innerHTML = `
    <div class="archive-page-container">
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
                <div class="filter-group">
                    <div class="filter-item date-filter">
                        <label for="start-date">من</label>
                        <input type="date" id="start-date">
                    </div>
                    <div class="filter-item date-filter">
                        <label for="end-date">إلى</label>
                        <input type="date" id="end-date">
                    </div>
                </div>
                <div class="filter-group">
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
                            <option value="payouts">payouts</option>
                            <option value="3days_balance">3Days Balance</option>
                            <option value="profit_leverage">Profit Leverage</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="filter-actions">
                <button id="reset-filters-btn" class="cancel-btn" style="width: auto; padding: 0.6rem 1.2rem;"><i class="fas fa-times"></i> مسح</button>
            </div>
        </div>
        <div id="archive-grid" class="archive-grid">
            <div class="spinner"></div>
        </div>
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
        if (userFilterSelect) userFilterSelect.value = 'all';
        if (typeFilterSelect) typeFilterSelect.value = 'all';
        fetchAndRenderArchive();
    });

    // Clean up the specific flag that brought us here when the back button is clicked.
    if (cameFromComparator || cameFromDataFilter) {
        const backBtn = document.querySelector('#back-to-comparator-btn, #back-to-data-filter-btn');
        backBtn?.addEventListener('click', () => {
            if (cameFromComparator) sessionStorage.removeItem('fromComparator');
            if (cameFromDataFilter) sessionStorage.removeItem('fromDataFilter');
        }, { once: true });
    }

    // Check for a search query in the URL hash
    const [path, queryString] = location.hash.substring(1).split('?');
    const params = new URLSearchParams(queryString || '');
    const initialSearchTerm = params.get('search');

    // إذا كان هناك بحث أولي قادم من صفحة أخرى، قم بتنفيذه
    if (initialSearchTerm) {
        searchInput.value = initialSearchTerm;
        fetchAndRenderArchive();
    } else {
        // If there's no search term, just fetch all reports.
        // The router.js file now handles clearing flags on direct navigation.
        fetchAndRenderArchive();
    }
}