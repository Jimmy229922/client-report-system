import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

function getReportType(reportText) {
    if (reportText.includes('#suspicious')) return 'تقارير مشبوهة';
    if (reportText.includes('#deposit')) return 'إيداعات';
    if (reportText.includes('#new-position')) return 'صفقات جديدة';
    if (reportText.includes('#credit-out')) return 'سحب رصيد';
    if (reportText.includes('تقرير تحويل الحسابات')) return 'تحويل حسابات'; // No hashtag for this one
    if (reportText.includes('#payouts')) return 'دفعات (PAYOUTS)';
    return 'تقارير أخرى'; // Fallback category
}

async function fetchAndRenderArchive(searchTerm = '') {
    const archiveGrid = document.getElementById('archive-grid');
    if (!archiveGrid) return;
    archiveGrid.innerHTML = `<div class="spinner"></div>`;
    try {
        const response = await fetchWithAuth(`/api/reports?search=${encodeURIComponent(searchTerm)}`);
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            const reportsByType = result.data.reduce((acc, report) => {
                const type = getReportType(report.report_text);
                if (!acc[type]) acc[type] = [];
                acc[type].push(report);
                return acc;
            }, {});

            archiveGrid.innerHTML = Object.keys(reportsByType).sort().map(type => {
                const reportsHtml = reportsByType[type].map(report => {
                    // For admins, show author only if it's not the admin themselves (ID 1)
                    const authorHtml = report.users && report.users.username && report.user_id !== 1
                        ? `<span class="report-author"><i class="fas fa-user-pen"></i> ${report.users.username}</span>`
                        : '';

                    return `
                        <div class="archive-card" id="report-card-${report.id}">
                            <div class="archive-card-header">
                                <strong>${report.report_text.split('\n')[0]}</strong>
                                <div class="header-meta">
                                    ${authorHtml}
                                    <span>${new Date(report.timestamp).toLocaleTimeString('ar-EG')}</span>
                                </div>
                            </div>
                            <div class="archive-card-body">${report.report_text}</div>
                            <div class="archive-card-footer">
                                <div class="archive-image-thumbnails">
                                    ${report.image_count > 0 ? `<i class="fas fa-images"></i> <span>${report.image_count}</span>` : ''}
                                </div>
                                <div class="archive-card-actions">
                                    <button class="archive-btn copy" data-report-text="${report.report_text.replace(/"/g, '&quot;')}"><i class="fas fa-copy"></i></button>
                                    <button class="archive-btn delete" data-id="${report.id}"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="accordion-group">
                        <div class="accordion-header">
                            <span>${type} (${reportsByType[type].length})</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                        <div class="accordion-content">${reportsHtml}</div>
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
        archiveGrid.innerHTML = '<p>فشل تحميل الأرشيف. تأكد من أن السيرفر يعمل.</p>';
    }
}

function setupArchiveInteractions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
            const content = header.nextElementSibling;
            content.style.maxHeight = content.style.maxHeight ? null : `${content.scrollHeight}px`;
        });
    });

    document.querySelectorAll('.archive-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const currentButton = e.currentTarget;
            if (currentButton.classList.contains('copy')) {
                handleCopy(currentButton);
            } else if (currentButton.classList.contains('delete')) {
                handleDelete(currentButton);
            }
        });
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

async function handleDelete(button) {
    const reportId = button.dataset.id;
    if (confirm('هل أنت متأكد من حذف هذا التقرير؟ لا يمكن التراجع عن هذا الإجراء.')) {
        try {
            const deleteResponse = await fetchWithAuth(`/api/reports/${reportId}`, { method: 'DELETE' });
            if (deleteResponse.ok) {
                document.getElementById(`report-card-${reportId}`).remove();
                showToast('تم حذف التقرير بنجاح.');
            } else {
                throw new Error('فشل حذف التقرير.');
            }
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