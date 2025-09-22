import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

// Chart instances
let reportTypesChart = null;
let peakHoursChart = null;
let countryStatsChart = null;

// Helper to get chart colors based on theme
function getChartColors() {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        tickColor: isDarkMode ? '#aaa' : '#666',
        gridColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        legendColor: isDarkMode ? '#e0e0e0' : '#333',
    };
}

// Chart rendering functions
function renderReportTypesChart(data) {
    const container = document.getElementById('report-types-chart-container');
    if (!container) return;
    container.innerHTML = '<canvas></canvas>'; // Ensure canvas is fresh
    const ctx = container.querySelector('canvas');

    if (reportTypesChart) reportTypesChart.destroy();

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها.</p>';
        return;
    }

    const labels = data.map(d => d.type);
    const counts = data.map(d => d.report_count);
    const colors = getChartColors();

    reportTypesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد التقارير',
                data: counts,
                backgroundColor: 'rgba(77, 91, 249, 0.7)',
                borderColor: 'var(--accent-color)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bar chart
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: colors.tickColor, precision: 0 },
                    grid: { color: colors.gridColor }
                },
                y: {
                    ticks: { color: colors.tickColor }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderPeakHoursChart(data) {
    const container = document.getElementById('peak-hours-chart-container');
    if (!container) return;
    container.innerHTML = '<canvas></canvas>';
    const ctx = container.querySelector('canvas');

    if (peakHoursChart) peakHoursChart.destroy();

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها.</p>';
        return;
    }
    
    // Create a full 24-hour array initialized to 0
    const hoursData = Array(24).fill(0);
    data.forEach(item => {
        hoursData[item.hour] = item.report_count;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const colors = getChartColors();

    peakHoursChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد التقارير',
                data: hoursData,
                borderColor: 'var(--accent-color)',
                backgroundColor: 'rgba(77, 91, 249, 0.2)',
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: colors.tickColor, precision: 0 },
                    grid: { color: colors.gridColor }
                },
                x: {
                    ticks: { color: colors.tickColor },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderCountryStatsChart(data) {
    const container = document.getElementById('country-stats-chart-container');
    if (!container) return;
    container.innerHTML = '<canvas></canvas>';
    const ctx = container.querySelector('canvas');

    if (countryStatsChart) countryStatsChart.destroy();

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها.</p>';
        return;
    }

    const labels = data.map(d => d.country || 'غير محدد');
    const counts = data.map(d => d.report_count);
    const colors = getChartColors();

    countryStatsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد التقارير',
                data: counts,
                backgroundColor: 'rgba(40, 167, 69, 0.7)',
                borderColor: 'var(--success-color)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: colors.tickColor, precision: 0 },
                    grid: { color: colors.gridColor }
                },
                x: {
                    ticks: { color: colors.tickColor }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderEmployeePerformanceTable(data) {
    const container = document.getElementById('employee-performance-container');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها.</p>';
        return;
    }

    const tableHtml = `
        <table class="employee-performance-table">
            <thead>
                <tr>
                    <th>الموظف</th>
                    <th>عدد التقارير</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(user => `
                    <tr>
                        <td>
                            <div class="user-cell">
                                ${user.avatar_url ? `<img src="${user.avatar_url}" class="user-avatar">` : `<div class="user-avatar-placeholder"><i class="fas fa-user"></i></div>`}
                                <span>${user.username}</span>
                            </div>
                        </td>
                        <td>${user.report_count}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHtml;
}

async function fetchAndRenderAnalytics() {
    const dateRange = document.getElementById('analytics-date-range')?.value || 'last30';
    const containers = document.querySelectorAll('.chart-container, #employee-performance-container');
    containers.forEach(c => c.innerHTML = '<div class="spinner"></div>');

    try {
        const result = await fetchWithAuth(`/api/analytics?dateRange=${dateRange}`);
        const analytics = result.data;

        renderReportTypesChart(analytics.report_types);
        renderPeakHoursChart(analytics.peak_hours);
        renderCountryStatsChart(analytics.country_stats);
        renderEmployeePerformanceTable(analytics.employee_performance);

    } catch (error) {
        showToast(error.message, true);
        containers.forEach(c => c.innerHTML = '<p class="error-details">فشل تحميل البيانات.</p>');
    }
}

export function renderAnalyticsPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="page-header-actions">
            <h1 class="page-title">لوحة التحليلات</h1>
            <div class="filter-item">
                <label for="analytics-date-range">عرض بيانات آخر</label>
                <select id="analytics-date-range">
                    <option value="last7">7 أيام</option>
                    <option value="last30" selected>30 يوم</option>
                    <option value="last90">90 يوم</option>
                    <option value="all">كل الوقت</option>
                </select>
            </div>
        </div>
        <p>تحليل معمق لنشاط النظام وأداء الفريق.</p>
        
        <div class="analytics-grid">
            <div class="chart-card">
                <h3><i class="fas fa-tags"></i> أنواع التقارير الأكثر شيوعاً</h3>
                <div id="report-types-chart-container" class="chart-container">
                    <canvas></canvas>
                </div>
            </div>
            <div class="chart-card">
                <h3><i class="fas fa-clock"></i> أوقات الذروة (UTC)</h3>
                <div id="peak-hours-chart-container" class="chart-container">
                    <canvas></canvas>
                </div>
            </div>
            <div class="chart-card">
                <h3><i class="fas fa-globe-americas"></i> أكثر الدول إرسالاً للتقارير (أعلى 10)</h3>
                <div id="country-stats-chart-container" class="chart-container">
                    <canvas></canvas>
                </div>
            </div>
            <div class="chart-card full-width">
                <h3><i class="fas fa-users"></i> أداء الموظفين</h3>
                <div id="employee-performance-container" class="table-container">
                    <!-- Table will be rendered here -->
                </div>
            </div>
        </div>
    `;
    initAnalyticsPage();
}

function initAnalyticsPage() {
    document.getElementById('analytics-date-range')?.addEventListener('change', fetchAndRenderAnalytics);
    fetchAndRenderAnalytics();
}