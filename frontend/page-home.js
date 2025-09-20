import { fetchWithAuth } from './api.js';
import { timeAgo } from './ui.js';

let weeklyChart = null; // To hold the chart instance
let healthCheckInterval = null;

export async function fetchAndRenderHomePageData() {
    try {
        // Use Promise.allSettled to allow one to fail without breaking the other
        const results = await Promise.allSettled([
            fetchWithAuth('/api/stats'),
            fetchWithAuth('/api/stats/weekly'),
            fetchWithAuth('/api/reports/recent'),
            fetchWithAuth('/api/stats/top-contributor'),
            fetchWithAuth('/api/health') // Add health check
        ]);

        const statsResult = results[0];
        const weeklyStatsResult = results[1];

        if (statsResult.status === 'fulfilled' && statsResult.value.data) {
            renderStatCards(statsResult.value.data);
        } else {
            console.error('Failed to fetch stats:', statsResult.reason);
            const statsGrid = document.getElementById('stats-grid');
            if (statsGrid) {
                statsGrid.innerHTML = '<p>فشل تحميل الإحصائيات.</p>';
            }
        }

        if (weeklyStatsResult.status === 'fulfilled' && weeklyStatsResult.value.data) {
            renderWeeklyChart(weeklyStatsResult.value.data);
        } else {
            console.error('Failed to fetch weekly stats:', weeklyStatsResult.reason);
            const chartCard = document.querySelector('.chart-card');
            if (chartCard) {
                chartCard.innerHTML = '<h3>النشاط الأسبوعي</h3><p>فشل تحميل بيانات الرسم البياني.</p>';
            }
        }

        const recentReportsResult = results[2];
        if (recentReportsResult.status === 'fulfilled' && recentReportsResult.value.data) {
            renderRecentReports(recentReportsResult.value.data);
        } else {
            console.error('Failed to fetch recent reports:', recentReportsResult.reason);
            const recentReportsContainer = document.getElementById('recent-reports-container');
            if (recentReportsContainer) {
                recentReportsContainer.innerHTML = `<p>فشل تحميل أحدث التقارير.</p><p class="error-details">${recentReportsResult.reason.message}</p>`;
            }
        }

        const topContributorResult = results[3];
        if (topContributorResult.status === 'fulfilled' && topContributorResult.value.data) {
            renderTopContributor(topContributorResult.value.data);
        } else {
            console.error('Failed to fetch top contributor:', topContributorResult.reason);
            const topContributorContainer = document.getElementById('top-contributor-container');
            if (topContributorContainer) {
                topContributorContainer.innerHTML = `<p>فشل تحميل المساهم الأعلى.</p><p class="error-details">${topContributorResult.reason.message}</p>`;
            }
        }
    } catch (error) { // This catch is now for truly unexpected errors
        console.error('An unexpected error occurred on the home page:', error);
    }
}

function updateSystemHealth() {
    const container = document.getElementById('system-health-container');
    if (!container) {
        // If the container isn't on the page, stop checking
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        return;
    };

    fetchWithAuth('/api/health')
        .then(result => {
            if (result.status === 'ok') renderSystemHealth(true);
            else renderSystemHealth(false);
        })
        .catch(() => {
            renderSystemHealth(false);
        });
}

function renderRecentReports(reports) {
    const container = document.getElementById('recent-reports-container');
    if (!container) return;

    if (reports.length === 0) {
        container.innerHTML = '<p>لا توجد تقارير حديثة.</p>';
        return;
    }

    container.innerHTML = reports.map(report => `
        <div class="recent-report-item">
            <div class="recent-report-header">
                <a href="#archive" class="recent-report-title">${report.report_text.split('\n')[0]}</a>
                <span class="recent-report-time">${timeAgo(report.timestamp)}</span>
            </div>
            <div class="recent-report-author">
                بواسطة: ${report.users ? report.users.username : '<em>محذوف</em>'}
            </div>
        </div>
    `).join('');
}

function renderTopContributor(contributor) {
    const container = document.getElementById('top-contributor-container');
    if (!container) return;

    if (!contributor || !contributor.username || contributor.report_count === 0) {
        container.innerHTML = '<p>لا يوجد مساهمين بعد.</p>';
        return;
    }

    const avatarHtml = contributor.avatar_url
        ? `<img src="${contributor.avatar_url}" alt="${contributor.username}" class="top-contributor-avatar">`
        : `<div class="top-contributor-avatar-placeholder"><i class="fas fa-user"></i></div>`;

    container.innerHTML = `
        ${avatarHtml}
        <div class="top-contributor-info">
            <span class="top-contributor-name">${contributor.username}</span>
            <span class="top-contributor-count">${contributor.report_count} تقارير</span>
        </div>
    `;
}

function renderSystemHealth(isHealthy) {
    const container = document.getElementById('system-health-container');
    if (!container) return;

    const timeString = new Date().toLocaleTimeString('ar-EG');

    if (isHealthy) {
        container.innerHTML = `
            <div class="health-status">
                <i class="fas fa-check-circle" style="color: var(--success-color);"></i>
                <span>النظام يعمل بشكل طبيعي</span>
            </div>
            <div class="health-last-checked">آخر فحص: ${timeString}</div>
        `;
    } else {
        container.innerHTML = `
            <div class="health-status">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-color);"></i>
                <span>لا يمكن الوصول للسيرفر</span>
            </div>
            <div class="health-last-checked">آخر محاولة: ${timeString}</div>
        `;
    }
}

function renderStatCards(stats) {
    const totalReportsContainer = document.querySelector('.total-reports-container');
    const subStatsGrid = document.querySelector('.sub-stats-grid');

    if (totalReportsContainer) {
        totalReportsContainer.innerHTML = `
            <a href="#archive" class="stat-card total-reports">
                <div class="stat-card-icon"><i class="fas fa-file-alt"></i></div>
                <div class="stat-card-info">
                    <h3>Total Reports <small>إجمالي التقارير</small></h3>
                    <p>${stats.total || 0}</p>
                </div>
            </a>
        `;
    }

    if (subStatsGrid) {
        subStatsGrid.innerHTML = `
            <a href="#archive" class="stat-card reports-today">
                <div class="stat-card-icon"><i class="fas fa-calendar-day"></i></div>
                <div class="stat-card-info">
                    <h3>Reports Today <small>تقارير اليوم</small></h3>
                    <p>${stats.reports_today || 0}</p>
                </div>
            </a>
            <a href="#reports/suspicious" class="stat-card suspicious">
                <div class="stat-card-icon"><i class="fas fa-user-secret"></i></div>
                <div class="stat-card-info">
                    <h3>Suspicious <small>تقارير مشبوهة</small></h3>
                    <p>${stats.suspicious || 0}</p>
                </div>
            </a>
            <a href="#reports/deposit" class="stat-card deposit">
                <div class="stat-card-icon"><i class="fas fa-money-bill-wave"></i></div>
                <div class="stat-card-info">
                    <h3>Deposit <small>إيداعات</small></h3>
                    <p>${stats.deposit || 0}</p>
                </div>
            </a>
            <a href="#reports/new-position" class="stat-card new-position">
                <div class="stat-card-icon"><i class="fas fa-chart-line"></i></div>
                <div class="stat-card-info">
                    <h3>New Position <small>صفقات جديدة</small></h3>
                    <p>${stats.new_positions || 0}</p>
                </div>
            </a>
            <a href="#reports/credit-out" class="stat-card credit-out">
                <div class="stat-card-icon"><i class="fas fa-credit-card"></i></div>
                <div class="stat-card-info">
                    <h3>Credit Out <small>سحب رصيد</small></h3>
                    <p>${stats.credit_out || 0}</p>
                </div>
            </a>
            <a href="#reports/account-transfer" class="stat-card account-transfer">
                <div class="stat-card-icon"><i class="fas fa-exchange-alt"></i></div>
                <div class="stat-card-info">
                    <h3>Account Transfer <small>تحويل حسابات</small></h3>
                    <p>${stats.account_transfer || 0}</p>
                </div>
            </a>
            <a href="#reports/payouts" class="stat-card payouts">
                <div class="stat-card-icon"><i class="fas fa-hand-holding-usd"></i></div>
                <div class="stat-card-info">
                    <h3>PAYOUTS <small>دفعات</small></h3>
                    <p>${stats.payouts || 0}</p>
                </div>
            </a>
        `;
    }
}

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weekly-chart');
    if (!ctx) return;

    if (weeklyChart) {
        weeklyChart.destroy();
    }

    // Prepare data for the last 24 hours
    const last24Hours = [...Array(24)].map((_, i) => {
        const d = new Date();
        d.setHours(d.getHours() - i);
        return date_trunc('hour', d); // Helper function to zero out minutes/seconds
    }).reverse();

    const chartLabels = last24Hours.map(date => date.toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true }));
    const chartData = last24Hours.map(date => {
        const dateStr = date.toISOString();
        const found = weeklyData.find(d => date_trunc('hour', new Date(d.hour_timestamp)).toISOString() === dateStr);
        return found ? found.count : 0;
    });

    weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'التقارير المرسلة',
                data: chartData,
                borderColor: 'var(--accent-color)',
                backgroundColor: 'rgba(77, 91, 249, 0.2)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#fff',
                pointBorderColor: 'var(--accent-color)',
                pointHoverRadius: 7,
                pointHoverBackgroundColor: 'var(--accent-color)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#aaa',
                        stepSize: 1 // Ensure y-axis shows whole numbers
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#aaa'
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Listen for theme changes to update chart colors
    document.addEventListener('themeChanged', () => {
        if (weeklyChart) {
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const tickColor = isDarkMode ? '#aaa' : '#666';
            const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

            weeklyChart.options.scales.y.ticks.color = tickColor;
            weeklyChart.options.scales.x.ticks.color = tickColor;
            weeklyChart.options.scales.y.grid.color = gridColor;
            
            weeklyChart.update();
        }
    });
}

// Helper function to truncate date to the hour
function date_trunc(unit, d) {
    const newDate = new Date(d);
    newDate.setMinutes(0, 0, 0);
    return newDate;
}

export function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="dashboard-header">
            <h1>لوحة التحكم</h1>
            <p>نظرة عامة سريعة على نشاط النظام والإحصائيات الرئيسية.</p>
        </div>
        <div class="home-grid">
            <div class="home-main-column">
                <div id="stats-grid" class="stats-grid">
                    <div class="total-reports-container">
                        <div class="stat-card total-reports loading"><div class="spinner"></div></div>
                    </div>
                    <div class="sub-stats-grid">
                        ${Array(6).fill('<div class="stat-card loading"><div class="spinner"></div></div>').join('')}
                    </div>
                </div>
                <div class="chart-card">
                    <h3><i class="fas fa-chart-bar"></i> النشاط اليومي (آخر 24 ساعة)</h3>
                    <div class="chart-container">
                        <canvas id="weekly-chart"></canvas>
                    </div>
                </div>
            </div>
            <div class="home-sidebar-column">
                <h2><i class="fas fa-history"></i> أحدث التقارير</h2>
                <div id="recent-reports-container" class="recent-reports-container">
                    <div class="spinner"></div>
                </div>
                <div class="top-contributor-card">
                    <h3><i class="fas fa-trophy"></i> المساهم الأعلى</h3>
                    <div id="top-contributor-container" class="top-contributor-container"></div>
                </div>
                <div class="system-health-card">
                    <h3><i class="fas fa-heart-pulse"></i> حالة النظام</h3>
                    <div id="system-health-container" class="system-health-container"></div>
                </div>
            </div>
        </div>
    `;
    fetchAndRenderHomePageData();

    // Clear any existing interval before setting a new one
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(updateSystemHealth, 30000); // every 30 seconds

    // Listen for the custom event to refresh data in real-time
    document.addEventListener('reportSent', fetchAndRenderHomePageData);
}

export function cleanupHomePage() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
    document.removeEventListener('reportSent', fetchAndRenderHomePageData);
}
