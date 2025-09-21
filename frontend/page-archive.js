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

async function fetchAndRenderArchive(searchTerm = '') {
    const archiveGrid = document.getElementById('archive-grid');
    if (!archiveGrid) return;
    archiveGrid.innerHTML = `<div class="spinner"></div>`;
    reportsByTypeCache = {}; // Clear cache on new fetch/search
    IS_ADMIN = checkAdminStatus(); // Check admin status once per page load
    try {
        const result = await fetchWithAuth(`/api/reports?search=${encodeURIComponent(searchTerm)}`);

        if (result.data && result.data.length > 0) {
            // --- بداية التعديل: إضافة رسائل للكونسول ---
            console.log('--- فحص صور الأرشيف ---');
            result.data.forEach(report => {
                if (report.image_urls && report.image_urls.length > 0) {
                    // Log success with the actual data for verification
                    console.log(`✅ تقرير #${report.id}: تم العثور على ${report.image_urls.length} صورة متاحة للمعاينة.`, report.image_urls);
                } else {
                    // Log failure and show the value of image_urls (which should be null or an empty array)
                    console.log(`❌ تقرير #${report.id}: لا توجد صور مرفقة. (قيمة image_urls: ${JSON.stringify(report.image_urls)})`);
                }
            });
            // --- نهاية التعديل ---

            const reportsByType = result.data.reduce((acc, report) => {
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
            archiveGrid.innerHTML = '<p style="text-align: center;">لا توجد نتائج تطابق بحثك.</p>';
        }
    } catch (error) {
        console.error('Failed to fetch archive:', error);
        archiveGrid.innerHTML = `<p>فشل تحميل الأرشيف.</p><p class="error-details">${error.message}</p>`;
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
    mainContent.innerHTML = `
        <h1 class="page-title">أرشيف التقارير</h1>
        <div class="search-container">
            <i class="fas fa-search"></i>
            <input type="text" id="archive-search" class="search-input" placeholder="ابحث في التقارير (رقم حساب، IP، ...)">
        </div>
        <div id="archive-grid" class="archive-grid">
            <div class="spinner"></div>
        </div>
    `;

    const searchInput = document.getElementById('archive-search');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAndRenderArchive(e.target.value);
        }, 500);
    });

    fetchAndRenderArchive();
}