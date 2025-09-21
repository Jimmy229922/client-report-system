import { fetchWithAuth } from './api.js';
import { timeAgo, showToast } from './ui.js';

let weeklyChart = null; // To hold the chart instance
let healthCheckInterval = null;

export async function fetchAndRenderHomePageData() {
    try {
        // Use Promise.allSettled to allow one to fail without breaking the other
        const results = await Promise.allSettled([
            fetchWithAuth('/api/stats'),
            fetchWithAuth('/api/stats/weekly'),
            fetchWithAuth('/api/reports/recent'),
            fetchWithAuth('/api/stats/top-contributor')
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
            renderSystemHealth(true, result.services || { api: 'online', database: 'unknown' });
        })
        .catch((error) => {
            const services = error.data?.services || { api: 'offline', database: 'unknown' };
            renderSystemHealth(false, services);
        });
}

function renderRecentReports(reports) {
    const container = document.getElementById('recent-reports-container');
    if (!container) return;

    if (reports.length === 0) {
        container.innerHTML = '<p>لا توجد تقارير حديثة.</p>';
        return;
    }

    // Group reports by title to avoid repetition
    const groupedReports = reports.reduce((acc, report) => {
        const title = report.report_text.split('\n')[0];
        if (!acc[title]) {
            acc[title] = {
                title: title,
                count: 0,
                latest_timestamp: report.timestamp,
                // Since reports are sorted descending, the first author we see is the latest one.
                author: report.users ? report.users.username : null
            };
        }
        acc[title].count++;
        return acc;
    }, {});

    container.innerHTML = Object.values(groupedReports).map(group => `
        <a href="#archive" class="recent-report-item">
            <div class="recent-report-header">
                <span class="recent-report-title">${group.title} ${group.count > 1 ? `<span class="report-group-count">(${group.count})</span>` : ''}</span>
                <span class="recent-report-time">${timeAgo(group.latest_timestamp)}</span>
            </div>
            ${group.author ? `<div class="recent-report-author">أحدث تقرير بواسطة: ${group.author}</div>` : ''}
        </a>
    `).join('');
}

function renderTopContributor(contributorData) {
    const container = document.getElementById('top-contributor-container');
    const titleEl = document.getElementById('top-contributor-title');
    if (!container || !titleEl) return;

    // Case 1: Data is for the current user (non-admin)
    if (contributorData && contributorData.is_self) {
        titleEl.innerHTML = `<i class="fas fa-user-chart"></i> إحصائياتك`;
        const avatarHtml = contributorData.avatar_url
            ? `<img src="${contributorData.avatar_url}" alt="${contributorData.username}" class="top-contributor-avatar">`
            : `<div class="top-contributor-avatar-placeholder"><i class="fas fa-user"></i></div>`;

        container.innerHTML = `
            <div class="self-stats-container">
                ${avatarHtml}
                <div class="top-contributor-info">
                    <span class="top-contributor-name">${contributorData.username}</span>
                    <span class="top-contributor-count">${contributorData.report_count} تقارير</span>
                </div>
            </div>
        `;
        return;
    }

    // Case 2: Data is an array for the admin (Top 3)
    if (Array.isArray(contributorData)) {
        titleEl.innerHTML = `<i class="fas fa-trophy"></i> المساهمون الأعلى`;
        if (contributorData.length === 0) {
            container.innerHTML = '<p style="text-align: center; width: 100%;">لا يوجد مساهمين بعد.</p>';
            return;
        }

        const rankTexts = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
        const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze

        container.innerHTML = `
            <div class="top-contributors-grid">
                ${contributorData.map((user, index) => `
                    <div class="contributor-profile-card rank-${index + 1}">
                        <div class="contributor-profile-rank" style="color: ${rankColors[index]};">
                            <i class="fas fa-medal"></i>
                            <span>${rankTexts[index]}</span>
                        </div>
                        <div class="contributor-profile-avatar-wrapper">
                            ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${user.username}" class="contributor-profile-avatar">` : `<div class="contributor-profile-avatar-placeholder"><i class="fas fa-user"></i></div>`}
                        </div>
                        <div class="contributor-profile-info">
                            <strong class="contributor-profile-name">${user.username}</strong>
                            <span class="contributor-profile-count">${user.report_count} تقارير</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }

    // Fallback
    titleEl.innerHTML = `<i class="fas fa-trophy"></i> المساهم الأعلى`;
    container.innerHTML = '<p style="text-align: center; width: 100%;">لا يوجد مساهمين بعد.</p>';
}

function renderSystemHealth(isOverallHealthy, services = {}) {
    const container = document.getElementById('system-health-container');
    if (!container) return;

    const timeString = new Date().toLocaleTimeString('ar-EG');

    const renderServiceStatus = (serviceName, status) => {
        const isOnline = status === 'online';
        const icon = isOnline ? 'fa-check-circle' : 'fa-times-circle';
        const colorClass = isOnline ? 'healthy' : 'unhealthy';
        const text = isOnline ? 'متصل' : 'غير متصل';
        return `
            <div class="health-service-item">
                <span>${serviceName}</span>
                <span class="health-service-status ${colorClass}">
                    <i class="fas ${icon}"></i> ${text}
                </span>
            </div>
        `;
    };

    const overallStatusText = isOverallHealthy ? 'جميع الأنظمة تعمل' : 'توجد مشكلة في النظام';
    const overallStatusClass = isOverallHealthy ? 'healthy' : 'unhealthy';

    container.innerHTML = `
        <div class="health-main-status ${overallStatusClass}">
            <div class="status-light"></div>
            <span>${overallStatusText}</span>
        </div>
        <div class="health-services-list">
            ${renderServiceStatus('خدمة API', services.api || 'offline')}
            ${renderServiceStatus('قاعدة البيانات', services.database || 'offline')}
        </div>
        <div class="health-last-checked">
            <i class="fas fa-history"></i> آخر فحص: ${timeString}
        </div>
    `;
}

function renderStatCards(stats) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
        <a href="#archive" class="stat-card total-reports">
            <div class="stat-card-icon"><i class="fas fa-file-alt"></i></div>
            <div class="stat-card-info">
                <h3>Total Reports <small>إجمالي التقارير</small></h3>
                <p>${stats.total || 0}</p>
            </div>
        </a>
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

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weekly-chart');
    if (!ctx || !Array.isArray(weeklyData)) return;

    if (weeklyChart) {
        weeklyChart.destroy();
    }

    // The new SQL function provides a complete, ordered list of the last 24 hours.
    // We can use it directly.
    const chartLabels = weeklyData.map(item => 
        new Date(item.hour_timestamp).toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true })
    );
    const chartData = weeklyData.map(item => item.count);

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
    document.addEventListener('reportSent', () => {
        if (weeklyChart) {
            // Find the current hour's label
            const currentHourLabel = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true });
            const currentHourIndex = weeklyChart.data.labels.indexOf(currentHourLabel);

            if (currentHourIndex > -1) {
                // Increment the count for the current hour
                weeklyChart.data.datasets[0].data[currentHourIndex]++;
            }
            
            weeklyChart.update();
        }
    });
    document.addEventListener('reportSent', () => {
        if (weeklyChart) {
            // Find the current hour's label
            const currentHourLabel = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true });
            const currentHourIndex = weeklyChart.data.labels.indexOf(currentHourLabel);

            if (currentHourIndex > -1) {
                // Increment the count for the current hour
                weeklyChart.data.datasets[0].data[currentHourIndex]++;
            }
            
            weeklyChart.update();
        }
    });
}

export function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="dashboard-header">
            <h1><i class="fas fa-tachometer-alt"></i> لوحة التحكم</h1>
            <p>نظرة عامة على نشاط النظام والإحصائيات الرئيسية.</p>
        </div>
        <div id="stats-grid" class="stats-grid">
            ${Array(8).fill('<div class="stat-card loading"><div class="spinner"></div></div>').join('')}
        </div>
        <div class="home-layout">
            <div class="home-main-column">
                <div class="chart-card">
                    <h3><i class="fas fa-chart-bar"></i> النشاط اليومي (آخر 24 ساعة)</h3>
                    <div class="chart-container">
                        <canvas id="weekly-chart"></canvas>
                    </div>
                </div>
            </div>
            <div class="home-sidebar-column">
                <div class="sidebar-card">
                    <h2><i class="fas fa-history"></i> أحدث التقارير</h2>
                    <div id="recent-reports-container" class="recent-reports-container">
                        <div class="spinner"></div>
                    </div>
                </div>
                <div class="sidebar-card">
                    <h3 id="top-contributor-title"><i class="fas fa-trophy"></i> المساهم الأعلى</h3>
                    <div id="top-contributor-container" class="top-contributor-container"></div>
                </div>
                <div class="sidebar-card">
                    <h3><i class="fas fa-heart-pulse"></i> حالة النظام</h3>
                    <div id="system-health-container" class="system-health-container">
                        <!-- Content will be rendered by renderSystemHealth -->
                    </div>
                    <div class="system-health-footer">
                        <span id="app-version-health" class="app-version-badge"></span>
                    </div>
                </div>
            </div>
        </div>
    `;
    fetchAndRenderHomePageData();
    loadAndDisplayVersion();

    // Clear any existing interval before setting a new one
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(updateSystemHealth, 30000); // every 30 seconds

    // Listen for the custom event to refresh data in real-time
    document.addEventListener('reportSent', fetchAndRenderHomePageData);
}

async function loadAndDisplayVersion() {
    const versionSpan = document.getElementById('app-version-health');
    if (!versionSpan) return;
    try {
        const response = await fetch('/api/version');
        if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
            const data = await response.json();
            if (data.version) {
                versionSpan.textContent = `v${data.version}`;
            }
        } else {
            console.warn(`Failed to load app version. Status: ${response.status}`);
            versionSpan.textContent = 'v?.?.?';
        }
    } catch (error) {
        console.error('Failed to load app version:', error);
        versionSpan.textContent = 'v?.?.?';
    }
}

export function cleanupHomePage() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
    document.removeEventListener('reportSent', fetchAndRenderHomePageData);
}
