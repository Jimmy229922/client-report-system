import { fetchWithAuth } from './api.js';
import { timeAgo, showToast } from './ui.js';

let weeklyChart = null; // To hold the chart instance
let distributionChart = null; // To hold the distribution chart instance
let healthCheckInterval = null;
let IS_ADMIN = false;

function checkAdminStatus() {
    const user = JSON.parse(localStorage.getItem('user'));
    IS_ADMIN = user?.role === 'admin';
}

async function fetchPrimaryData() {
    try {
        // The scope parameter determines if we are fetching global stats (for admin) or user-specific stats.
        const scopeParam = !IS_ADMIN ? '?scope=user' : '';

        const [stats, topContributors] = await Promise.all([
            fetchWithAuth(`/api/stats${scopeParam}`),
            fetchWithAuth(`/api/stats/top-contributor${scopeParam}`)
        ]);
        renderStatCards(stats.data); // Render the main stat cards
        renderTopContributor(topContributors.data); // Render the top contributor/self-stats section
        return stats.data; // Return stats for the secondary fetch
    } catch (error) {
        console.error('Failed to fetch primary home page data:', error);
        showToast('فشل تحميل الإحصائيات الرئيسية.', true);
        // Render error states for primary components
        document.getElementById('stats-grid').innerHTML = '<p class="error-details">فشل تحميل الإحصائيات.</p>';
        document.getElementById('top-contributor-container').innerHTML = '<p class="error-details">فشل تحميل المساهم الأعلى.</p>';
        return null;
    }
}

async function fetchSecondaryData(statsData) {
    try {
        // This scope parameter should also apply to weekly stats and recent reports for non-admins.
        const scopeParam = !IS_ADMIN ? '?scope=user' : '';

        const [weeklyStats, recentReports] = await Promise.all([
            fetchWithAuth(`/api/stats/weekly${scopeParam}`),
            fetchWithAuth(`/api/reports/recent${scopeParam}`)
        ]);

        renderWeeklyChart(weeklyStats.data);
        renderRecentReports(recentReports.data);
        
        // The distribution chart depends on the main stats data fetched earlier
        if (statsData) {
            renderDistributionChart(statsData);
        } else {
            // If primary stats failed, we might need to fetch them again or show an error
            const distContainer = document.getElementById('distribution-chart-container');
            if (distContainer) distContainer.innerHTML = '<p class="chart-placeholder">بيانات التوزيع غير متاحة.</p>';
        }

    } catch (error) {
        console.error('Failed to fetch secondary home page data:', error);
        // Don't show a toast here to avoid being annoying, just log and show placeholders
    }
}

// This function will be called for initial load and for refresh events
export async function refreshHomePageData() {
    checkAdminStatus();
    const statsData = await fetchPrimaryData();
    await fetchSecondaryData(statsData);
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
            renderSystemHealth(true);
        })
        .catch((error) => {
            // The error object from fetchWithAuth might contain more details if needed in the future
            renderSystemHealth(false);
        });
}

function renderRecentReports(reports) {
    const container = document.getElementById('recent-reports-container');
    if (!container) return;

    if (reports.length === 0) {
        const isAdmin = JSON.parse(localStorage.getItem('user'))?.role === 'admin';
        container.innerHTML = `<p>${isAdmin ? 'لا توجد تقارير حديثة في النظام.' : 'لم تقم بإرسال أي تقارير بعد.'}</p>`;
        return;
    }

    // Group reports by title to avoid repetition
    const groupedReports = reports.reduce((acc, report) => {
        const title = report.report_text.split('\n')[0];
        const user = JSON.parse(localStorage.getItem('user'));
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
            ${group.author ? `<div class="recent-report-author">بواسطة: ${group.author}</div>` : ''}
        </a>
    `).join('');
}

async function createAvatar(user) {
    if (user.avatar_url) {
        try {
            // Fetch the image with authentication to handle protected routes
            const response = await fetchWithAuth(user.avatar_url, {}, true);
            if (!response.ok) throw new Error('Failed to fetch avatar');
            const imageBlob = await response.blob();
            const blobUrl = URL.createObjectURL(imageBlob);
            return `<img src="${blobUrl}" alt="${user.username}" class="contributor-avatar">`;
        } catch (error) {
            // Fallback to initials if image fetch fails
        }
    }

    // Fallback for users without an avatar_url or if the fetch fails
    const initial = user.username ? user.username.charAt(0).toUpperCase() : '?';
    // Simple hash function to get a color based on username
    let hash = 0;
    for (let i = 0; i < user.username.length; i++) {
        hash = user.username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    const bgColor = `hsl(${h}, 50%, 60%)`;
    return `<div class="contributor-avatar-initials" style="background-color: ${bgColor}">${initial}</div>`;
}

function createAvatarSync(user) {
    if (user.avatar_url) {
        return `<img src="${user.avatar_url}" alt="${user.username}" class="contributor-avatar">`;
    } else {
        const initial = user.username ? user.username.charAt(0).toUpperCase() : '?';
        // Simple hash function to get a color based on username
        let hash = 0;
        for (let i = 0; i < user.username.length; i++) {
            hash = user.username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        const bgColor = `hsl(${h}, 50%, 60%)`;
        return `<div class="contributor-avatar-initials" style="background-color: ${bgColor}">${initial}</div>`;
    }
}

async function renderTopContributor(contributorData) {
    const container = document.getElementById('top-contributor-container');
    const titleEl = document.getElementById('top-contributor-title');
    if (!container || !titleEl) return;

    // Case 1: Data is for the current user (non-admin)
    if (contributorData && contributorData.is_self) {
        // If avatar_url is missing from the response, try to get it from localStorage as a fallback.
        if (!contributorData.avatar_url) {
            try {
                const localUser = JSON.parse(localStorage.getItem('user'));
                if (localUser && localUser.avatar_url) {
                    contributorData.avatar_url = localUser.avatar_url;
                }
            } catch (e) { /* ignore */ }
        }
        console.log('[Home Page] Rendering self stats. User data received:', contributorData);
        const avatarHtml = await createAvatar(contributorData);
        titleEl.innerHTML = `<i class="fas fa-user-chart"></i> إحصائياتك`;

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

        // Build each contributor card asynchronously, then join into a single HTML string
        const itemsHtml = (await Promise.all(contributorData.map(async (user, index) => {
            const avatarHtml = await createAvatar(user);
            return `
                    <div class="contributor-profile-card rank-${index + 1}">
                        <div class="contributor-profile-rank" style="color: ${rankColors[index]};">
                            <i class="fas fa-medal"></i>
                            <span>${rankTexts[index]}</span>
                        </div>
                        <div class="contributor-profile-avatar-wrapper">
                            ${avatarHtml}
                        </div>
                        <div class="contributor-profile-info">
                            <strong class="contributor-profile-name">${user.username}</strong>
                            <span class="contributor-profile-count">${user.report_count} تقارير</span>
                        </div>
                    </div>
            `;
        }))).join('');

        container.innerHTML = `
            <div class="top-contributors-grid">
                ${itemsHtml}
            </div>
        `;
        return;
    }

    // Fallback
    titleEl.innerHTML = `<i class="fas fa-trophy"></i> المساهم الأعلى`;
    container.innerHTML = '<p style="text-align: center; width: 100%;">لا يوجد مساهمين بعد.</p>';
}

function renderSystemHealth(isOverallHealthy) {
    const container = document.getElementById('system-health-container');
    if (!container) return;

    const timeString = new Date().toLocaleTimeString('ar-EG');
    const overallStatusText = isOverallHealthy ? 'النظام يعمل بشكل طبيعي' : 'توجد مشكلة في الاتصال';
    const overallStatusClass = isOverallHealthy ? 'healthy' : 'unhealthy';

    container.innerHTML = `
        <div class="health-main-status ${overallStatusClass}">
            <div class="status-light"></div>
            <span>${overallStatusText}</span>
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
        <a href="#archive?type=suspicious" class="stat-card suspicious">
            <div class="stat-card-icon"><i class="fas fa-user-secret"></i></div>
            <div class="stat-card-info">
                <h3>Suspicious <small>تقارير مشبوهة</small></h3>
                <p>${stats.suspicious || 0}</p>
            </div>
        </a>
        <a href="#archive?type=deposit_percentages" class="stat-card deposit">
            <div class="stat-card-icon"><i class="fas fa-money-bill-wave"></i></div>
            <div class="stat-card-info">
                <h3>Deposit <small>إيداعات</small></h3>
                <p>${stats.deposit || 0}</p>
            </div>
        </a>
        <a href="#archive?type=new-positions" class="stat-card new-position">
            <div class="stat-card-icon"><i class="fas fa-chart-line"></i></div>
            <div class="stat-card-info">
                <h3>New Position <small>صفقات جديدة</small></h3>
                <p>${stats.new_positions || 0}</p>
            </div>
        </a>
        <a href="#archive?type=credit-out" class="stat-card credit-out">
            <div class="stat-card-icon"><i class="fas fa-credit-card"></i></div>
            <div class="stat-card-info">
                <h3>Credit Out <small>سحب رصيد</small></h3>
                <p>${stats.credit_out || 0}</p>
            </div>
        </a>
        <a href="#archive?type=account_transfer" class="stat-card account-transfer">
            <div class="stat-card-icon"><i class="fas fa-exchange-alt"></i></div>
            <div class="stat-card-info">
                <h3>Account Transfer <small>تحويل حسابات</small></h3>
                <p>${stats.account_transfer || 0}</p>
            </div>
        </a>
        <a href="#archive?type=payouts" class="stat-card payouts">
            <div class="stat-card-icon"><i class="fas fa-hand-holding-usd"></i></div>
            <div class="stat-card-info">
                <h3>PAYOUTS <small>دفعات</small></h3>
                <p>${stats.payouts || 0}</p>
            </div>
        </a>
        <a href="#archive?type=profit_watching" class="stat-card profit-watching">
            <div class="stat-card-icon"><i class="fas fa-search-dollar"></i></div>
            <div class="stat-card-info">
                <h3>PROFIT WATCHING <small>مراقبة الأرباح</small></h3>
                <p>${stats.profit_watching || 0}</p>
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

    // --- START: Fix for incomplete employee chart ---
    // 1. Create a map of the data from the API for quick lookup.
    const dataMap = new Map(weeklyData.map(item => {
        const hourKey = new Date(item.hour_timestamp).getHours();
        return [hourKey, item.count];
    }));

    // 2. Generate labels and data for the last 24 hours.
    const chartLabels = [];
    const chartData = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourKey = date.getHours();
        
        chartLabels.push(date.toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true }));
        chartData.push(dataMap.get(hourKey) || 0); // Use 0 if no data for that hour
    }
    // --- END: Fix for incomplete employee chart ---

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
}

function renderDistributionChart(stats) {
    const container = document.getElementById('distribution-chart-container');
    if (!container) return;
    const ctx = document.getElementById('distribution-chart');
    if (!ctx) return;

    if (distributionChart) {
        distributionChart.destroy();
    }

    const reportTypes = {
        suspicious: 'مشبوهة',
        deposit_percentages: 'إيداعات',
        new_positions: 'صفقات جديدة',
        credit_out: 'سحب رصيد',
        account_transfer: 'تحويل حسابات',
        payouts: 'PAYOUTS',
        profit_watching: 'PROFIT WATCHING'
    };

    const chartData = Object.keys(reportTypes)
        .map(key => ({
            label: reportTypes[key],
            count: stats[key] || 0
        }))
        .filter(item => item.count > 0); // Only show types with reports

    if (chartData.length === 0) {
        container.innerHTML = '<p class="chart-placeholder">لا توجد بيانات لعرضها.</p>';
        return;
    }

    const labels = chartData.map(d => d.label);
    const data = chartData.map(d => d.count);
    
    const backgroundColors = [
        '#f44336', '#4CAF50', '#2196F3', '#ff9800', '#9C27B0', '#00BCD4', '#6a1b9a'
    ];

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'توزيع التقارير',
                data: data,
                backgroundColor: backgroundColors.slice(0, chartData.length),
                borderColor: 'var(--card-bg)',
                borderWidth: 3,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#aaa',
                        font: {
                            size: 14,
                            family: 'inherit'
                        },
                        padding: 20
                    }
                }
            }
        }
    });
}

export function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
    <div class="home-page-container">
        <div class="page-header dashboard-header">
            <div class="page-header-info">
                <h1 class="page-title"><i class="fas fa-tachometer-alt"></i> لوحة التحكم</h1>
            </div>
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
                <div class="chart-card">
                    <h3><i class="fas fa-chart-pie"></i> توزيع التقارير</h3>
                    <div class="chart-container" id="distribution-chart-container">
                        <canvas id="distribution-chart"></canvas>
                    </div>
                </div>
            </div>
            <div class="home-sidebar-column">
                <div class="sidebar-card">
                    <h2><i class="fas fa-history"></i> أحدث التقارير</h2>
                    <div id="recent-reports-container" class="recent-reports-container"><div class="spinner"></div></div>
                </div>
                <div class="sidebar-card">
                    <h3 id="top-contributor-title"><i class="fas fa-trophy"></i> المساهم الأعلى</h3>
                    <div id="top-contributor-container" class="top-contributor-container"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    </div>
    `;
    refreshHomePageData();

    // Clear any existing interval before setting a new one
    if (healthCheckInterval) clearInterval(healthCheckInterval); // NOSONAR
    healthCheckInterval = setInterval(updateSystemHealth, 30000);
}

export function cleanupHomePage() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
}
