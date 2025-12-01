import { fetchWithAuth } from './api.js';
import { showToast, showConfirmModal } from './ui.js';

let allEvaluations = [];
let sortColumn = 'date';
let sortDirection = 'desc';

export function renderEvaluationsPage() {
    return `
        <div class="container evaluations-page-container">
            <div class="page-header">
                <h1 class="page-title">تقييم الموظفين</h1>
                <a href="#reports/employee-evaluation" class="btn btn-primary"><i class="fas fa-plus"></i> إضافة تقييم جديد</a>
            </div>
            <div class="evaluations-toolbar">
                <div class="search-bar">
                    <i class="fas fa-search"></i>
                    <input type="text" id="evaluation-search" placeholder="ابحث في التقييمات...">
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-hover evaluations-table">
                    <thead>
                        <tr>
                            <th data-sort="employeeId.username">الموظف <i class="fas fa-sort"></i></th>
                            <th data-sort="shiftManagerId.username">مدير الشفت <i class="fas fa-sort"></i></th>
                            <th data-sort="clientEmail">بريد العميل <i class="fas fa-sort"></i></th>
                            <th data-sort="errorLevel">مستوى الخطأ <i class="fas fa-sort"></i></th>
                            <th data-sort="actionTaken">الإجراء المتخذ <i class="fas fa-sort"></i></th>
                            <th data-sort="date">التاريخ <i class="fas fa-sort"></i></th>
                            <th>التفاصيل</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody id="evaluations-tbody">
                    </tbody>
                </table>
            </div>
            <div id="no-results" class="empty-state" style="display: none;">لا توجد نتائج مطابقة للبحث.</div>
        </div>
    `;
}

export async function initEvaluationsPage() {
    const searchInput = document.getElementById('evaluation-search');
    searchInput.addEventListener('input', () => renderTable(allEvaluations));

    const tableHeaders = document.querySelectorAll('.evaluations-table th[data-sort]');
    tableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const newSortColumn = header.dataset.sort;
            if (sortColumn === newSortColumn) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = newSortColumn;
                sortDirection = 'asc';
            }
            updateSortIcons();
            renderTable(allEvaluations);
        });
    });

    await fetchEvaluations();
    updateSortIcons();
}

async function fetchEvaluations() {
    const tbody = document.getElementById('evaluations-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="spinner"></div></td></tr>';

    try {
        const response = await fetchWithAuth('/api/evaluations');
        allEvaluations = response.data;

        if (allEvaluations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">لا توجد تقييمات لعرضها.</td></tr>';
            return;
        }

        renderTable(allEvaluations);
    } catch (error) {
        console.error('Failed to fetch evaluations:', error);
        showToast('فشل تحميل التقييمات.', true);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center error-state">حدث خطأ أثناء تحميل التقييمات.</td></tr>';
    }
}

function renderTable(evaluations) {
    const tbody = document.getElementById('evaluations-tbody');
    const searchInput = document.getElementById('evaluation-search');
    const noResultsDiv = document.getElementById('no-results');
    const filter = searchInput.value.toLowerCase();

    const filteredEvaluations = evaluations.filter(e => 
        (e.employeeId?.username?.toLowerCase().includes(filter) || '') ||
        (e.shiftManagerId?.username?.toLowerCase().includes(filter) || '') ||
        (e.clientEmail?.toLowerCase().includes(filter) || '') ||
        (e.actionTaken?.toLowerCase().includes(filter) || '') ||
        (e.errorLevel?.toLowerCase().includes(filter) || '')
    );

    // Sort data
    const sortedEvaluations = filteredEvaluations.sort((a, b) => {
        const aValue = getNestedValue(a, sortColumn);
        const bValue = getNestedValue(b, sortColumn);

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    if (sortedEvaluations.length === 0) {
        tbody.innerHTML = '';
        noResultsDiv.style.display = 'block';
        return;
    }

    noResultsDiv.style.display = 'none';
    tbody.innerHTML = sortedEvaluations.map(evaluation => {
        const errorLevel = evaluation.errorLevel || 'صغير'; // Set a default value for old data
        const errorLevelClass = {
            'صغير': 'level-low',
            'متوسط': 'level-medium',
            'كبير': 'level-high',
        }[errorLevel] || 'level-low';

        return `
            <tr data-id="${evaluation._id}">
                <td>${evaluation.employeeId?.username || '-'}</td>
                <td>${evaluation.shiftManagerId?.username || '-'}</td>
                <td>${evaluation.clientEmail || '-'}</td>
                <td><span class="badge ${errorLevelClass}">${errorLevel}</span></td>
                <td>${evaluation.actionTaken}</td>
                <td>${new Date(evaluation.date).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                <td>
                    <button class="btn btn-sm btn-info view-details-btn" data-details="${escapeHTML(evaluation.details)}">
                        <i class="fas fa-info-circle"></i> عرض
                    </button>
                </td>
                <td>
                    <button class="btn btn-sm btn-danger delete-evaluation-btn" data-id="${evaluation._id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    addEventListeners();
}

function updateSortIcons() {
    document.querySelectorAll('.evaluations-table th[data-sort]').forEach(header => {
        // Find any <i> tag inside the header, regardless of its specific sort class.
        const icon = header.querySelector('i');
        if (!icon) return; // Safety check

        if (header.dataset.sort === sortColumn) {
            icon.className = `fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`;
        } else {
            icon.className = 'fas fa-sort';
        }
    });
}

function addEventListeners() {
    const tbody = document.getElementById('evaluations-tbody');

    tbody.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-evaluation-btn');
        const detailsBtn = e.target.closest('.view-details-btn');

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const confirmed = await showConfirmModal(
                'تأكيد الحذف',
                'هل أنت متأكد من حذف هذا التقييم؟ لا يمكن التراجع عن هذا الإجراء.',
                {
                    iconClass: 'fas fa-trash-alt',
                    iconColor: 'var(--danger-color)',
                    confirmText: 'نعم، حذف',
                    confirmClass: 'submit-btn danger-btn'
                }
            );
            if (confirmed) {
                try {
                    await fetchWithAuth(`/api/evaluations/${id}`, { method: 'DELETE' });
                    showToast('تم حذف التقييم بنجاح.');
                    allEvaluations = allEvaluations.filter(ev => ev._id !== id);
                    renderTable(allEvaluations);
                } catch (error) {
                    console.error('Failed to delete evaluation:', error);
                    showToast('فشل حذف التقييم.', true);
                }
            }
        }

        if (detailsBtn) {
            const details = detailsBtn.dataset.details;
            const modal = document.getElementById('evaluation-details-modal');
            const content = document.getElementById('evaluation-details-content');
            const closeBtn = document.getElementById('evaluation-details-close-btn');

            content.textContent = details;

            modal.classList.add('show');

            const closeModal = () => modal.classList.remove('show');

            closeBtn.onclick = closeModal;
            modal.onclick = (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            };
        }
    });
}

function getNestedValue(obj, path) {
    // Use optional chaining with reduce for safer nested property access.
    // If at any point a property is null or undefined, it will gracefully return undefined.
    return path.split('.').reduce((acc, part) => {
        // Ensure acc is not null/undefined before trying to access a property on it.
        return acc ? acc[part] : undefined;
    }, obj);
}

function escapeHTML(str) {
    const p = document.createElement("p");
    p.appendChild(document.createTextNode(str));
    return p.innerHTML;
}